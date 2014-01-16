//The path utility
var path = require("path");
//Load the AbstractQueue module
var AbstractQueue = require(path.join(__dirname, "/abstractqueue.js"));
//Load the rsmq module
var RedisSMQ = require("rsmq");
//Used for "cloning" objects
var util = require("util");
//Load the error codes
var errorCodes = require(path.join(__dirname, "../errors.js")).errors;

exports.queue = function() {
	//So that we can use the same object again and again
	var receiveOptions;
	
	//Create an instance of the AbstractQueue
	var queue = new AbstractQueue("RedisQueue");
	
	//Variable for our rsmq instance
	var rsmq;
	
	//If we started to listen, this is the handle to cancel
	//the timers
	var timerHandle;
	
	//Create a queue
	function createQueue(callback) {
		//Create the queue
		rsmq.createQueue({ qname:queue.queueName, vt:queue.invisibilityTimeout }, function (err, resp) {
			var queueError;
			if (resp!==1) {
				//Not what we were expecting
				if(err) {
					queueError = errorCodes.getError("queueInit_ErrorCreatingQueue");
					queueError.errorMessage = util.format(queueError.errorMessage, queue.queueName, err);
					queueError.queueError = err;
					queue.onError(queueError);
					callback(false);
					return;
				}
				else {
					queueError = errorCodes.getError("queueInit_ErrorCreatingQueueUnexpectedResponse");
					queueError.errorMessage = util.format(queueError.errorMessage, queue.queueName, resp);
					queue.onError(queueError);
					callback(false);
					return;
				}
			}
			else
			{
				//Queue is created
				queue.queueInitialized = true;
				callback(true);
				return;
			}
		});
	}
	
	//A function to initialize the queue, creating it if it does not exists
	function initialize(callback) {
		//If we haven't done initialization already
		if(!queue.queueInitialized) {
			//Get a list of existing queues
			rsmq.listQueues(function(err, resp) {
				if(err) {
					//If we have an error, raise it and callback
					var queueError = errorCodes.getError("queueInit_ErrorLoadingQueuesList");
					queueError.errorMessage = util.format(queueError.errorMessage, err);
					queueError.queueError = err;
					queue.onError(queueError);
					callback();
					return;
				}
				//Check if our queue is in the list of queues
				var queueExists = false;
				for(var i=0; i<resp.length; i++) {
					if(resp[i].toLowerCase().trim() === queue.queueName) {
						//We found the queue
						queueExists = true;
						break;
					}
				}
				//If it isn't
				if(!queueExists) {
					createQueue();
				}
				else
				{
					//Queue already exists
					queue.queueInitialized = true;
					callback(true);
					return;
				}
			});
		}
		else {
			//Queue is already initialized
			callback();
		}
	}
	
	//Function to check if all settings are ok
	queue.init = function() {
		//This queue needs settings
		queue.requireSettings();
		
		receiveOptions = {qname:queue.queueName};
		
		//Load queue specific settings
		//The redis host
		if(!queue.settings.host) {
			queue.throwError("This module's settings need a host node");
		}
		//The redis port
		if(!queue.settings.port) {
			queue.throwError("This module's settings need a port node");
		}
		//the queue namespace (specific to RSMQ)
		if(!queue.settings.ns) {
			queue.throwError("This module's settings need a ns node");
		}
		
		//Load the common queue settings that this queue needs
		//This queue requires polling interval so load it
		queue.initPollingInterval();
		
		//This queue required invisibility timeout so load it
		queue.initInvisibilityTimeout();
		
		//This queue uses max dequeue count so load it
		queue.initMaxDequeueCount();
		
		//Ok lets create a new RSMQ object
		rsmq = new RedisSMQ( {host: queue.settings.host, port: queue.settings.port, ns: queue.settings.ns} );
	};
	
	//Initialize the queue and callback
	queue.connect = function() {
		initialize(function() {
			if(queue.queueInitialized) {
				queue.onReady();
			}
		});
	};
	
	//Function called after message is pushed to the queue
	function pushCallback(message, err, resp) {
		if (resp) {
			//Set the id of the message
			message.id = resp;
			//Callback
			queue.pushCallback(errorCodes.getError("none"), message);
			return true;
		}
		else
		{
			//Callback with the error
			var qError = errorCodes.getError("queuePush_PushError");
			qError.errorMessage = util.format(qError.errorMessage, err + ":" + resp);
			qError.queueError = err;
			queue.pushCallback(qError, message);
			qError = null;
			return false;
		}
	}
	
	function myPush(message, when, callback) {
		var messageStorage = {qname:queue.queueName, message:JSON.stringify(message), delay:when};
		rsmq.sendMessage(messageStorage, function(err, resp) {
			messageStorage = null;
			//The default callback is called if a specific callback is not
			//not specified
			if(!callback) {
				pushCallback(message, err, resp);
			}
			else {
				//A specific callback. This is used by pushMany
				callback(message, err, resp);
			}
		});
	}
	
	//Push a message onto the queue
	queue.push = function(message, callback) {
		//If initialization failed
		if(!queue.queueInitialized) {
			//callback with an error
			setTimeout(function() { queue.pushInitializationFailure(message); }, 0);
		}
		else {
			//It is initialized, so we can continue with sending the message
			myPush(message, 0, callback);
		}
	};
	
	//Creates a closure and starts pushing messages one by one
	function startPushMany(messages) {
		//Set the status to pushing
		queue.pushManyInProgress = true;
		
		//The list of messages yet to be pushed
		var pushManyMessages = messages;

		//The list of messages pushed successfully
		var pushedSuccessfullyMessages = [];

		//The list of messages pushed failfully
		var pushedFailfullyMessages = [];

		//Count of number of messages in this pushMany batch
		var pushManyCount = messages.length;
		
		//This is called instead of pushCallback to deal with pushMany
		//specific stuff
		function pushCallbackLocal(message, err, resp) {
			pushManyCount--;
			
			if(pushCallback(message, err, resp)) {
				pushedSuccessfullyMessages.push(message);
			}
			else {
				pushedFailfullyMessages.push({message:message, error:err});
			}
			
			if(pushManyCount === 0) {
				setTimeout(pushManyCallback, 0);
			}
		}
	
		//called once all pushMany messages are pushed
		function pushManyCallback() {
			queue.pushManyInProgress = false;
			queue.pushManyCallback(
				{
					"successes":pushedSuccessfullyMessages,
					"failures":pushedFailfullyMessages
				});
			pushedSuccessfullyMessages = null;
			pushedFailfullyMessages = null;
		}
		
		//Push a single message out of the pushMany messages
		function pushOne() {
			if(!pushManyMessages || !pushManyMessages.length) {
				pushManyMessages = null;
				return;
			}
			var message = pushManyMessages[0];
			
			//We pass a local callback so that we can deal with 
			//pushmany specific stuff
			queue.push(message, pushCallbackLocal);
			pushManyMessages.splice(0, 1);

			//And again
			setTimeout(pushOne, 0);
		}
		
		//Yay! We have a closure. Ok let's start
		pushOne();
	}
	
	//Start pushing the many messages to the queue
	queue.pushMany = function(messages) {
		if(!queue.isPushManyRunning()) {
			startPushMany(messages);
		}
	};
	
	//push a message to the queue with a delay
	queue.schedule = function(message, when) {
		//If initialization failed
		if(!queue.queueInitialized) {
			//callback with an error
			setTimeout(function() { queue.pushInitializationFailure(message); }, 0);
		}
		else {
			//It is initialized, so we can continue with sending the message
			myPush(message, when);
		}
	};
	
	//Function called after message is deleted from the queue
	function deleteCallback(message, err, resp) {
		if (resp) {
			//No error
			queue.deleteCallback(errorCodes.getError("none"), message);
		}
		else {
			//Callback with error
			var qError = errorCodes.getError("queueDelete_DeleteError");
			qError.errorMessage = util.format(qError.errorMessage, err + ":" + resp);
			qError.queueError = err;
			queue.deleteCallback(qError, message);
			qError = null;
		}
	}
	
	//Delete a message from the queue
	queue.deleteMessage = function(message) {
		if(!queue.queueInitialized) {
			//callback with an error
			setTimeout(function() { queue.deleteInitializationFailure(message); }, 0);
		}
		else {
			var deleteOptions = {qname:queue.queueName, id:message.id};
			//It is initialized, so we can continue with deleting the message
			rsmq.deleteMessage(deleteOptions, function(err, resp) {
				deleteOptions = null;
				deleteCallback(message, err, resp);
			});
		}
	};
	
	//Function called after changing message visibility
	function visibilityCallback(message, err, resp) {
		if (resp) {
			//No error
			queue.visibilityCallback(errorCodes.getError("none"), message);
		}
		else {
			//Callback with error
			var qError = errorCodes.getError("queueInvisibilityTimeout_SetError");
			qError.errorMessage = util.format(qError.errorMessage, err + ":" + resp);
			qError.queueError = err;
			queue.visibilityCallback(qError, message);
			qError = null;
		}
	}
	
	//Sets the period a message is invisible from the queue
	queue.setInvisibilityTimeout = function (message, when) {
		if(!queue.queueInitialized) {
			//callback with an error
			setTimeout(function() { queue.visibilityInitializationFailure(message); }, 0);
		}
		else {
			var visibilityOptions = {qname:queue.queueName, id:message.id, vt:when};
			//It is initialized, so we can continue with deleting the message
			rsmq.changeMessageVisibility(visibilityOptions, function(err, resp) {
				visibilityOptions = null;
				visibilityCallback(message, err, resp);
			});
		}
	};
	
	
	
	//This function polls the queue at the specified interval
	function poller() {
		//Poll
		rsmq.receiveMessage(receiveOptions, messageReceived);
	}
	
	//Callback when the receiveMessage call completes
	function messageReceived(err, resp) {
		if(err) {
			//Raise an error
			var queueError = errorCodes.getError("queueReceive_ErrorReceivingMessage");
			queueError.errorMessage = util.format(queueError.errorMessage, queue.queueName, err);
			queueError.queueError = err;
			queue.onError(queueError);
			queueError = null;
			
			//We still continue on error
			if(queue.isStarted) {
				//Try again after polling interval
				timerHandle = setTimeout(poller, queue.pollingInterval);
			}
		}
		else
		{
			//We have a message to process
			if (resp.id)
			{
				//We got a message, raise the received event
				var msg = JSON.parse(resp.message);
				
				//Deserialize it to our message type
				var ourMsgsType = {};
				ourMsgsType.id = resp.id;
				ourMsgsType.payload = msg.payload;
				ourMsgsType.jobType = msg.jobType;
				ourMsgsType.dequeueCount = resp.rc;
				queue.onMessageReceived(ourMsgsType);
				
				//Just in case for GC
				ourMsgsType = null;
				msg = null;
				
				//If we received a message, let's try again (soon)
				if(queue.isStarted) {
					timerHandle = setTimeout(poller, 0);
				}
			}
			else
			{
				//Otherwise revert to polling interval
				if(queue.isStarted) {
					timerHandle = setTimeout(poller, queue.pollingInterval);
				}
			}
		}
	}
	
	//Start listening for messages
	queue.start = function () {
		//If we have already started to listen, then ignore
		if(queue.isStarted) {
			return;
		}
		
		//Initialize if needed
		initialize(function() {
			if(queue.queueInitialized) {
				//Mark that we are now listening
				queue.isStarted = true;
				//Start the polling
				poller();
				//Call the started callback
				queue.startedFunction();
			}
			//Otherwise nothing to do, error is raised already
		});
	};
	
	//Stop listening for messages
	queue.stop = function () {
		//If we are polling
		if(queue.isStarted) {
			//Mark that we are not anymore
			queue.isStarted = false;
			//If we have the timer handle
			if(timerHandle) {
				//Clear the timeout
				clearTimeout(timerHandle);
				//Unset the handle
				timerHandle = undefined;
			}
			//Call the stopped callback
			queue.stoppedFunction();
		}
	};
	
	//This function is only for Unit Testing
	queue.ensureEmpty = function() {
		//Initialize if needed
		if(!queue.queueInitialized) {
			//callback with an error
			setTimeout(function() { queue.ensureEmptyInitializationFailure(); }, 0);
		}
		else {
			rsmq.deleteQueue({qname:queue.queueName}, function(err) {
				if(err) {
					var error = errorCodes.getError("queueEnsureEmpty_QueueDeleteError");
					error.errorMessage = util.format(error.errorMessage, err);
					queue.errorFunction(error);
				}
				else {
					//Create the queue again
					createQueue(function(created) {
						if(created) {
							queue.queueEmptyFunction();
						}
					});
				}
			});
		}
	};
	
	//return the queue object
	return queue;
};