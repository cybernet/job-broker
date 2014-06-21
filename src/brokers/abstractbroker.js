//Required to set prototype of our AbstractBroker
var util = require('util');
//Path utils
var path = require('path');
//The event emiter
var EventEmitter = require('events').EventEmitter;
 
//Our abstract broker
function AbstractBroker(name) {
	//Make this an event emitter
	EventEmitter.call(this);
	
	//Function to remove an element
	if(!Array.prototype.remove) {
		Array.prototype.remove = function() {
			var what, a = arguments, L = a.length, ax;
			while (L && this.length) {
				what = a[--L];
				while ((ax = this.indexOf(what)) !== -1) {
					this.splice(ax, 1);
				}
			}
			return this;
		};
	}
	
	
	//Load the error codes
	var errorCodes = require(path.join(__dirname, "../errors.js")).errors;
	
	//Record our name
	this.name = name;
	
	//Record self reference (for thinking convenience)
	var broker = this;
	
	//Event map to map a jobType to a queue
	var eventMap = {};
	
	//Number of queues that are started
	var queuesStarted = 0;
	
	//Total number of queues
	var queuesNumber = 0;
	
	//Total number of queues in ready state
	var queuesReady = 0;
	
	//We need to check that a queue with particular module and name is defined only once
	//Thus, we maintain a simple hashtable of queuemoduleName + queueName
	var queueMap = {};
	
	//Utility function to return the error meta info
	function getError(myWorker, myQueue, err) {
		var errorInfo = {};
		errorInfo.worker = myWorker;
		errorInfo.queue = myQueue;
		errorInfo.error = err;
		return errorInfo;
	}
	
	this.addModules = function(config, callback) {
		//Load the checker module
		var CheckerClass = require(path.join(__dirname, "../configerrorchecker.js")).checker;
		var checker = new CheckerClass(function(err) {
			if(callback) {
				callback(err);
			}
			else {
				broker.emit("config-error", err);
			}
		}, undefined);
		
		checker.setQueueMap(queueMap);
		
		//Let's load the workers
		var workerObjs = config.workers;
	
		//Check that there is at least one worker definition
		if(checker.checkWorkersNode(workerObjs)) {
			return;
		}
		
		//Counter to iterate through workers etc.
		var i;
	
		//Variable to keep a loaded worker config
		var workerConfig;
	
		//Go through all the workers
		for(i=0; i<workerObjs.length; i++) {
			workerConfig = workerObjs[i];
		
			//Check that job-type is defined
			if(checker.checkJobType(workerConfig, i)) {
				return;
			}
		
			//Store the job type
			var jobType = workerConfig["job-type"];
		
			//Worker node must exist
			if(checker.checkWorkerNode(workerConfig, i)) {
				return;
			}
		
			//Get the node
			var workerObj = workerConfig.worker;
		
			//worker-module must exist
			if(checker.checkWorkerModule(workerObj, i)) {
				return;
			}
		
			//Get the module name
			var workerModuleName = workerObj["worker-module"];
		
			//Object to load worker in
			var workerCheck = { workerModule:undefined };
		
			//Check if worker module can be loaded and initialized
			if(checker.checkLoadWorkerModule(workerObj, i, workerCheck)) {
				return;
			}
		
			//The module itself
			var workerModule = workerCheck.workerModule;
		
			//Queue node must exist
			if(checker.checkQueueNode(workerConfig, i)) {
				return;
			}
		
			//Store it
			var queueObj = workerConfig.queue;
		
			//It must comtain a queue-module node
			if(checker.checkQueueModule(queueObj, i)) {
				return;
			}
		
			//It must also have a queue name
			if(checker.checkQueueName(queueObj, i)) {
				return;
			}
			
			//If throttling is defined, check its config
			if(checker.checkQueueThrottle(queueObj, i)) {
				return;
			}
		
			//Store the queue name
			var queueName = queueObj["queue-name"];
		
			//Standardise queue names to lower case
			queueName = queueName.toLowerCase().trim();
		
			//Store the queue module name
			var queueModuleName = queueObj["queue-module"];
		
			var checkerq = { queueModule: undefined };
		
			//Check if we can load the queue module
			if(checker.checkLoadQueueModule(queueObj, i, checkerq)) {
				return;
			}
		
			var queueModule = checkerq.queueModule;
		
			//We now have the worker module and the queuemodule loaded
			//Let's add some meta data:
			
			//This is the index of the (queue, worker) pair in the config file
			workerModule.jobType = jobType;
			queueModule.jobType = jobType;
			
			
			if(checker.checkQueueConstraint(queueModuleName, queueName)) {
				return;
			}
		
			//Register this stuff with the broker
			register(jobType, workerModule, queueModule);
		}
		
		//We don't need the checker anymore
		checker = null;
		
		//Success
		var resultObj = errorCodes.getError("none");
		if(callback) {
			callback(resultObj, this);
		}
		else {
			broker.emit("config-loaded", resultObj);
		}
	};
	
	function register(jobType, workerModule, queueModule) {
		//We use only lowercase for jobType
		jobType = jobType.toLowerCase().trim();
		
		if(!eventMap[jobType]) {
			eventMap[jobType] = [];
		}
		
		eventMap[jobType].push(queueModule);
		
		//Let the worker have access to its queue in case it needs
		//to extend visibility timeout etc.
		workerModule.setQueue(queueModule);
		
		//Provide the worker with access to the broker in case it
		//needs to push other jobTypes 
		workerModule.setBroker(broker);
		
		//After the worker has completed processing the message
		workerModule.processCallback = function(werr, message) {
			var myWorker = workerModule;
			var myQueue = queueModule;
			var myBroker = broker;
			
			var metaError = getError(myWorker, myQueue, werr);
			
			//Did the worker module succeed?
			if(werr.errorCode === 0) {
				//Yes it did, let's emit a work-completed event
				myBroker.emit("work-completed", metaError, message);
				//Try to delete the message
				myQueue.deleteMessage(message);
			}
			else {
				//Error while workin, emit it
				//Since message is not deleted,
				//It should become visible for
				//processing after some time
				myQueue.markFailed(message); //This is for connection closing, if queue stop is called
				myBroker.emit("work-error", metaError, message);
			}
		};
		
		//After a message is pushed to the queue
		queueModule.pushCallback = function (err, msg) {
			var errorInfo;
			var myWorker = workerModule;
			var myQueue = queueModule;
			var myBroker = broker;
			
			if(err && err.errorCode !== 0) {
				//Record error meta-info and emit the error
				errorInfo = getError(myWorker, myQueue, err);
				myBroker.emit("queue-error", errorInfo, msg);
			}
			else {
				//Record success meta-info and emit success
				errorInfo = getError(myWorker, myQueue, errorCodes.getError("none"));
				myBroker.emit("queue-success", errorInfo, msg);
			}
		};
		
		//After all messages in pushMany call have been pushed to the queue
		//Structure of report is:
		/*
		{
			"successes":[message1, message2...],
			"failures":[
				{
					"message":message1,
					"error": customErrorObjectDependentOnQueueModule
				},
				etc.
			]
		}
		*/
		queueModule.pushManyCallback = function(report) {
			var myWorker = workerModule;
			var myQueue = queueModule;
			var myBroker = broker;
			
			var messageInfo = getError(myWorker, myQueue, errorCodes.getError("none"));
			messageInfo.report = report;
			myBroker.emit("queue-pushmany-completed", messageInfo);
		};
		
		//After message message is deleted
		queueModule.deleteCallback = function(derr, message) {
			var myWorker = workerModule;
			var myQueue = queueModule;
			var myBroker = broker;
			
			var messageInfo = getError(myWorker, myQueue, errorCodes.getError("none"));
			messageInfo.error = derr;
			//If we had a delete error, then emit it
			//Warning this can cause duplicate processing
			//since message will become visible again after
			//the timeout
			if(derr && derr.errorCode !== 0) {
				myBroker.emit("queue-error", messageInfo, message);
			}
			else {
				myBroker.emit("queue-deleted", messageInfo, message);
			}
		};
		
		//When a message is received
		queueModule.messageReceivedFunction = function(message) {
			var myBroker = broker;
			var myJobType = jobType;
			var myWorker = workerModule;
			var myQueue = queueModule;
			
			var messageInfo = getError(myWorker, myQueue, errorCodes.getError("none"));
			
			//If the message has been dequeued too many times, just delete it straight away
			//as it is a "poison" message
			if(myQueue.maxDequeueCount && message.dequeueCount > myQueue.maxDequeueCount) {
				myBroker.emit("queue-poison", messageInfo, message);
				myQueue.deleteMessage(message);
				return;
			}
			
			//Emit the event in case someone wants to watch
			myBroker.emit("queue-received", messageInfo, message);
			
			//We make sure that the message has the right job type
			if(message.jobType.toLowerCase() === myJobType) {
				
				/* Without setting invisibility timeout */
				//We've made the message invisible for others for
				//our required amount of time, let's work on the message
				workerModule.process(message);
			} //end if for correct jobType
		};
		
		//If queue raised an error
		queueModule.errorFunction = function(err, msg) {
			//If the queue module raises an error,
			//Attach meta-info and emit it as a 
			//queue-error
			var myWorker = workerModule;
			var myQueue = queueModule;
			var myBroker = broker;
			
			var errorInfo = getError(myWorker, myQueue, err);
			myBroker.emit("queue-error", errorInfo, msg);
		};
		
		//Raised when queue is initialized and ready
		queueModule.readyFunction = function() {
			var myWorker = workerModule;
			var myQueue = queueModule;
			var myBroker = broker;
			
			//One more queue is ready
			queuesReady++;
			
			myQueue.isReady = true;
			
			var messageInfo = getError(myWorker, myQueue, errorCodes.getError("none"));
			
			myBroker.emit("queue-ready", messageInfo);
			
			if(queuesReady === queuesNumber) {
				//All queues are initialized
				myBroker.emit("broker-initialized");
			}
		};
		
		//Called when a queue closes its underlying connection
		queueModule.closedFunction = function() {
			var myWorker = workerModule;
			var myQueue = queueModule;
			var myBroker = broker;
			
			queuesStarted++;
			
			var messageInfo = getError(myWorker, myQueue, errorCodes.getError("none"));
			
			myBroker.emit("queue-closed", messageInfo);
		};
		
		//Called when a queue is listening for new messages
		queueModule.startedFunction = function() {
			var myWorker = workerModule;
			var myQueue = queueModule;
			var myBroker = broker;
			
			queuesStarted++;
			
			var messageInfo = getError(myWorker, myQueue, errorCodes.getError("none"));
			
			myBroker.emit("queue-started", messageInfo);
			
			if(queuesStarted === queuesNumber) {
				//All queues are initialized
				myBroker.emit("broker-started");
			}
		};
		
		//Called when a queue has stopped listening for new messages
		queueModule.stoppedFunction = function(isDeleted) {
			var myWorker = workerModule;
			var myQueue = queueModule;
			var myBroker = broker;
			
			queuesStarted--;
			
			var messageInfo = getError(myWorker, myQueue, errorCodes.getError("none"));
			
			myBroker.emit("queue-stopped", messageInfo);
			
			if(isDeleted) {
				queueModule.queueDeleteCallback(0);
			}
			
			if(queuesStarted === 0) {
				myBroker.emit("broker-stopped");
			}
		};
		
			
		queueModule.queueDeleteCallback = function(derr) {
			var myWorker = workerModule;
			var myQueue = queueModule;
			var myBroker = broker;
			
			var messageInfo = getError(myWorker, myQueue, errorCodes.getError("none"));
			
			if(derr) {
				messageInfo.error = derr;
			}
			
			//If we had a delete error, then emit it
			if(derr && derr.errorCode !== 0) {
				myBroker.emit("queue-error", messageInfo);
			}
			else {
				//Only decrease queue count if queue was actually removed
				var numQueuesCurrent = 0;
				var newLength = 0;
				
				if(eventMap[jobType]) {
					numQueuesCurrent = eventMap[jobType].length;
					eventMap[jobType].remove(queueModule);
					newLength = eventMap[jobType].length;
				}
				
				if(newLength !== numQueuesCurrent) {
					if(newLength === 0) {
						delete eventMap[jobType];
					}
					queuesNumber--;
					delete queueMap[myQueue.moduleName + "," + myQueue.queueName];
					
					if(myQueue.isReady) {
						queuesReady--;
					}
				}
				
				myBroker.emit("queue-deleted-queue", messageInfo);
				
				if(queuesReady === queuesNumber && newLength !== numQueuesCurrent) {
					//All queues are initialized
					myBroker.emit("broker-initialized");
				}
			}
		};
		
		
		//Record the number of queues
		queuesNumber++;
	}
	
	/*********************************************************************************************
	 *                                     Broker API                                            *
	 *********************************************************************************************/
	
	//Pushes the message to all queues registered
	//for this type of message
	this.push = function(msg) {
		var err;
		var errorInfo;
		if(!msg.jobType) {
			err = errorCodes.getError("QUEUE_INVALID_JOB_TYPE");
			err.errorMessage = util.format(err.errorMessage, msg.jobType);
			errorInfo = getError(undefined, undefined, err);
			broker.emit("queue-error", errorInfo, msg);
			return;
		}
		var queues = eventMap[msg.jobType.toLowerCase().trim()];
		if(!queues || !queues.length) {
			err = errorCodes.getError("QUEUE_INVALID_JOB_TYPE");
			err.errorMessage = util.format(err.errorMessage, msg.jobType);
			errorInfo = getError(undefined, undefined, err);
			broker.emit("queue-error", errorInfo, msg);
			return;
		}
		for(var i=0; i<queues.length; i++) {
			var queueModule = queues[i];
			queueModule.push(msg);
		}
	};
	
	//Pushes many messages to the queue asynchronously
	this.pushMany = function(messages) {
		var err;
		var errorInfo;
		
		if(!messages || !messages.length) {
			return;
		}
		
		//TODO:Hard coded message limit for now
		if(messages.length > 1000) {
			err = errorCodes.getError("QUEUE_TOO_MANY_MESSAGES");
			errorInfo = getError(undefined, undefined, err);
			broker.emit("queue-error", errorInfo, messages);
			return;
		}
		
		var i;
		var jobType = messages[0].jobType.toLowerCase().trim();
		//Let's check for multiple job types in here
		for(i=0; i<messages.length; i++) {
			var jobTypeCheck = messages[i].jobType.toLowerCase().trim();
			if(jobType !== jobTypeCheck) {
				err = errorCodes.getError("QUEUE_INCOMPATIBLE_JOB_TYPES");
				errorInfo = getError(undefined, undefined, err);
				broker.emit("queue-error", errorInfo, messages);
				return;
			}
		}
		
		var queues = eventMap[jobType];
		if(!queues) {
			err = errorCodes.getError("QUEUE_INVALID_JOB_TYPE");
			err.errorMessage = util.format(err.errorMessage, messages[0].jobType);
			errorInfo = getError(undefined, undefined, err);
			broker.emit("queue-error", errorInfo, messages);
			return;
		}
		
		//jobType can only be registered for one queue
		if(queues.length !== 1) {
			err = errorCodes.getError("QUEUE_TOO_MANY_QUEUES");
			errorInfo = getError(undefined, undefined, err);
			broker.emit("queue-error", errorInfo, messages);
			return;
		}
		
		//All is well
		setTimeout(function() { queues[0].pushMany(messages); }, 0);
	};
	
	//Pushes the message to all queues registered
	//for this type of message
	this.schedule = function(msg, when) {
		var err;
		var errorInfo;
		
		if(!msg.jobType) {
			err = errorCodes.getError("QUEUE_INVALID_JOB_TYPE");
			err.errorMessage = util.format(err.errorMessage, msg.jobType);
			errorInfo = getError(undefined, undefined, err);
			broker.emit("queue-error", errorInfo, msg);
			return;
		}
		var queues = eventMap[msg.jobType.toLowerCase().trim()];
		if(!queues || !queues.length) {
			err = errorCodes.getError("QUEUE_INVALID_JOB_TYPE");
			err.errorMessage = util.format(err.errorMessage, msg.jobType);
			errorInfo = getError(undefined, undefined, err);
			broker.emit("queue-error", errorInfo, msg);
			return;
		}
		for(var i=0; i<queues.length; i++) {
			var queueModule = queues[i];
			queueModule.schedule(msg, when);
		}
	};
	
	
	this.connect = function (doNotCreateIfNotExisting) {
		for(var propt in eventMap) {
			if (eventMap.hasOwnProperty(propt)) {
				var queues = eventMap[propt];
				if(queues) {
					for(var i=0; i<queues.length; i++) {
						var queueModule = queues[i];
						queueModule.connect(doNotCreateIfNotExisting);
					}
				}
			}
		}
	};
	
	//All queues stop listening
	//for messages
	this.stop = function () {
		if(queuesStarted === 0) {
			this.emit("broker-stopped");
			return;
		}
		
		for(var propt in eventMap) {
			if(eventMap.hasOwnProperty(propt)) {
				var queues = eventMap[propt];
				if(queues) {
					for(var i=0; i<queues.length; i++) {
						var queueModule = queues[i];
						queueModule.stop();
					}
				}
			}
		}
	};
	
	//Closes the underlying connection for all queues
	//No queue operation should be called after this
	this.close = function () {
		for(var propt in eventMap) {
			if(eventMap.hasOwnProperty(propt)) {
				var queues = eventMap[propt];
				if(queues) {
					for(var i=0; i<queues.length; i++) {
						var queueModule = queues[i];
						queueModule.terminate();
					}
				}
			}
		}
	};
	
	//Check if a queue exists for a particular jobType
	this.hasQueue = function(jobType) {
		var queues = eventMap[jobType.toLowerCase().trim()];
		if(!queues || !queues.length) {
			return false;
		}
		return true;
	};
	
	//Utility method to throw an error with tag
	this.throwError = function(msg) {
		throw name + ":" + msg;
	};
	
	//Utility method to log line to console with tag
	this.log = function(message) {
		console.log(name + ":" + message);
	};
}

util.inherits(AbstractBroker, EventEmitter);
module.exports = AbstractBroker;