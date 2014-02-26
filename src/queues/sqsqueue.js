//The path utility
var path = require("path");
//Load the AbstractQueue module
var AbstractQueue = require(path.join(__dirname, "/abstractqueue.js"));
//Load the AWS module
var AWS = require('aws-sdk');
//Util module for cloning objects etc
var util = require("util");
//UUID Module for generating unique id for messages in pushMany
var uuid = require('node-uuid');
//Load the error codes
var errorCodes = require(path.join(__dirname, "../errors.js")).errors;


exports.queue = function() {
	//Create an instance of the AbstractQueue
	var queue = new AbstractQueue("SQSQueue");
	
	//The variable for our sqs object
	var sqs;
	
	//A variable to hold the URL to our queue
	var queueUrl;
	
	//Batch size. This indicates how many messages are retrieved in one go
	var batchSize = 10;
	
	//A variable that will hold the queue receive options for the messages
	//used in calls to retrieve messages from SQS. Use same object again and
	//again to save memory
	var receiveOptions;
	
	//Messages will be deleted in batches
	var deleteFrequencySeconds;
	
	//The delete service which accumulates deletes and executes them in batches
	var deleteService;
	
	//The receive service which retrieves messages in batches and processes them
	//one by one
	var receiveService;
	
	//Function to create the queue
	function createQueue(callback) {
		sqs.createQueue(
				{
					QueueName:queue.queueName,
					Attributes: {
						VisibilityTimeout: '' + queue.invisibilityTimeout
					}
				}, function(err, data) {
					if(err) {
						var queueError = errorCodes.getError("QUEUE_ERROR_CREATING_QUEUE");
						queueError.errorMessage = util.format(queueError.errorMessage, queue.queueName, err);
						queueError.queueError = err;
						queue.onError(queueError);
						callback(false);
						return;
					}
					else {
						//Queue is created
						queue.queueInitialized = true;
						queueUrl = data.QueueUrl;
						receiveService = getReceiveService();
						deleteService = getDeleteService();
						callback(true);
						return;
					}
				});
	}
	
	//A function to initialize the queue, creating it if it does not exists
	function initialize(callback) {
		//If we haven't done initialization already
		if(!queue.queueInitialized) {
			createQueue(callback);
		}
		else {
			//Queue is already initialized
			callback();
		}
	}
	
	//Function to check if all settings are ok
	queue.init = function() {
		//This queue requires settings	
		queue.requireSettings();
		
		//Load the common queue settings that this queue needs
		//This queue requires polling interval so load it
		queue.initPollingInterval();
		
		//This queue required invisibility timeout so load it
		queue.initInvisibilityTimeout();
		
		//This queue uses max dequeue count so load it
		queue.initMaxDequeueCount();
		
		//SQS specific settings
		if(!queue.settings["delete-frequency-seconds"]) {
			deleteFrequencySeconds = 10;
		}
		else {
			deleteFrequencySeconds = parseInt(queue.settings["delete-frequency-seconds"], 10);
			if(isNaN(deleteFrequencySeconds)) {
				queue.throwError("This module's settings, delete-frequency-seconds must be a valid integer.");
			}
		}
		queue.batchSize = batchSize;
		
		try
		{
			//If specified in environment, this will always override any file specified
			if(process.env.AWS_CONFIG) {
				//We load it from environment
				var awsConfigCommaDelimited = process.env.AWS_CONFIG;
				var parts = awsConfigCommaDelimited.split(",");
				if(parts.length < 3) {
					queue.throwError("AWS_CONFIG environment variable must be (comma-delimited) of the form: accessKeyId,secretAccessKey,region");
				}
				var awsConfigJson = {};
				awsConfigJson.accessKeyId = parts[0];
				awsConfigJson.secretAccessKey = parts[1];
				awsConfigJson.region = parts[2];
				var config = new AWS.Config(awsConfigJson);
				AWS.config = config;
			}
			else {
				//It must be specified in a file
				if(!queue.settings["aws-config-file"]) {
					queue.throwError("This module's settings, aws-config-file must be specified or AWS_CONFIG environment variable must be defined");
				}
				
				//We load it from a specified file
				var awsFile = queue.settings["aws-config-file"];
				if(awsFile && awsFile.length && (
						//Mac/Linux etc
						awsFile.charAt(0) === '/' ||
						//Windows
						(awsFile.length>2 && awsFile.charAt(1) === ':')
					)) {
					//Absolute path
					AWS.config.loadFromPath(awsFile);
				}
				else {
					//Path relative to module installation
					AWS.config.loadFromPath(path.join(__dirname,  '../../../../' + awsFile));
				}
			}
			
			sqs = new AWS.SQS();
		}
		catch(err) {
			queue.throwError("Error initialising AWS from '" + queue.settings["aws-config-file"] + "'");
		}
	};
	
	//Initialize and raise event when ready
	queue.connect = function() {
		initialize(function() {
			if(queue.queueInitialized) {
				queue.onReady();
			}
		});
	};
	
	//Function called after message is pushed to the queue
	function pushCallback(message, err, data) {
		if(err) {
			//Callback with the error
			var qError = errorCodes.getError("QUEUE_PUSH_ERROR");
			qError.errorMessage = util.format(qError.errorMessage, err);
			qError.queueError = err;
			queue.pushCallback(qError, message);
			qError = null;
		}
		else {
			//Set the id of the message
			message.id = data.MessageId;
			//Callback
			queue.pushCallback(errorCodes.getError("none"), message);
		}
	}
	
	//Local function that takes a delay param which both push and schedule 
	//can call
	function mypush(message, when) {
		//If initialization failed
		if(!queue.queueInitialized) {
			//callback with an error
			setTimeout(function() { queue.pushInitializationFailure(message); }, 0);
		}
		else {
			var messageStorage = {};
			messageStorage.id = message.id;
			messageStorage.payload = message.payload;
			messageStorage.jobType = message.jobType;
			
			var sendOptions = {
				QueueUrl: queueUrl,
				MessageBody:JSON.stringify(messageStorage),
				DelaySeconds: when
			};
			
			messageStorage = null;
			
			sqs.sendMessage(
				sendOptions,
				function(err, data) {
					sendOptions = null;
					pushCallback(message, err, data);
				}
			);
		}
	}
	
	//Push a message onto the queue
	queue.push = function(message) {
		mypush(message, 0);
	};
	
	//Starts the push many batch processing
	function startPushMany(messages) {
		//The list of messages in the pushMany call
		var pushManyMessages;

		//The list of messages pushed successfully
		var pushedSuccessfullyMessages;

		//The list of messages pushed failfully
		var pushedFailfullyMessages;

		//The result of the pushMany call from SQS
		var pushManyResult;
		
		queue.pushManyInProgress = true;
		pushManyMessages = messages;
		pushedSuccessfullyMessages = [];
		pushedFailfullyMessages = [];
		pushManyResult = null;
		
		//Get the error if any for a particular message (from the result received
		//after sending a batch of messages to SQS)
		function getPushedMessageError(message) {
			var i;
			for(i=0; i<pushManyResult.Successful.length; i++) {
				if(pushManyResult.Successful[i].Id === message.id) {
					message.id = pushManyResult.Successful[i].MessageId;
					return errorCodes.getError("none");
				}
			}
			for(i=0; i<pushManyResult.Failed.length; i++) {
				if(pushManyResult.Failed[i].Id === message.id) {
					var qError = errorCodes.getError("QUEUE_PUSH_ERROR");
					qError.errorMessage = util.format(qError.errorMessage, pushManyResult.Failed[i].Message);
					
					//Detect a batch failure
					if(pushManyResult.Failed[i].queueError) {
						qError.queueError = pushManyResult.Failed[i].queueError;
					}
					else {
						qError.queueError = {};
						qError.queueError.Id = pushManyResult.Failed[i].Id;
						qError.queueError.SenderFault = pushManyResult.Failed[i].SenderFault;
						qError.queueError.Code = pushManyResult.Failed[i].Code;
						qError.queueError.Message = pushManyResult.Failed[i].Message;
					}
					
					return qError;
				}
			}
			return null;
		}
		
		//From the response received as a result of sending a batch of messages
		//process the response one message at a time
		function processPushOne() {
			//If we are done, let's reset
			if(!pushManyMessages || !pushManyMessages.length) {
				//We are done with the callbacks
				//Let's construct the report object
				var report = {};
				report.successes = pushedSuccessfullyMessages;
				report.failures = pushedFailfullyMessages;
				queue.pushManyInProgress = false;
				queue.pushManyCallback(report);
				report = null;

				//Reset to null so that GC can pick them up if needed
				pushedSuccessfullyMessages = null;
				pushedFailfullyMessages = null;
				pushManyMessages = null;
				pushManyResult = null;

				return;
			}
			else {
				//Let's process the next message (FIFO)
				var message = pushManyMessages[0];
				var pushErr = getPushedMessageError(message);

				//If there was an error,add to failed list else add to success list
				if(pushErr !== null) {
					if(pushErr.errorCode !== 0) {
						message.id = undefined;
						pushedFailfullyMessages.push({ message:message, error:pushErr });
					}
					else {
						pushedSuccessfullyMessages.push(message);
					}

					queue.pushCallback(pushErr, message);
				}
				pushErr = null;
				//Let's remove the message
				pushManyMessages.splice(0, 1);
				//And let's go again
				setTimeout(processPushOne, 0);
			}
		}
		
		//The callback after the batch of messages was pushed to SQS
		function pushManyFinished(err, data) {
			//If there was an error, we simulate a response
			//with all the messages in the failed list
			if(err) {
				//Simulate a result
				var simulated = {};
				//No successes
				simulated.Successful = [];
				//Initialize failures
				simulated.Failed = [];
				for(var i=0; i<pushManyMessages.length; i++) {
					var simulatedItem = {};
					simulatedItem.queueError = err;
					simulatedItem.Id = pushManyMessages[i].id;
					simulatedItem.SenderFault = false;
					simulatedItem.Code = -1;
					simulatedItem.Message = "Delete batch failed";
					simulated.Failed.push(simulatedItem);
				}
				pushManyResult = simulated;
			}
			else {
				//Otherwise, we store the result
				pushManyResult = data;
			}
			//And start processing the result one message at a time
			processPushOne();
		}
		
		//Let's generate the messages and start
		var request = {};
		request.QueueUrl = queueUrl;
		request.Entries = [];
		for(var i=0; i<pushManyMessages.length; i++) {
			var message = pushManyMessages[i];
			message.id = uuid.v4();
			
			var messageStorage = {};
			messageStorage.payload = message.payload;
			messageStorage.jobType = message.jobType;
			
			var entry = {};
			entry.Id = message.id;
			entry.MessageBody = JSON.stringify(messageStorage);
			entry.DelaySeconds = 0;
			
			request.Entries.push(entry);
		}
		
		sqs.sendMessageBatch(request, pushManyFinished);
	}
	
	//Sends a batch of messages to SQS
	queue.pushMany = function(messages) {
		if(!queue.isPushManyRunning()) {
			startPushMany(messages);
		}
	};
	
	//Schedule a message for later sending
	queue.schedule = function(message, when, callback) {
		mypush(message, when);
	};
	
	//Function called after changing message visibility
	function visibilityCallback(message, err, resp) {
		if(err) {
			//Callback with error
			var qError = errorCodes.getError("QUEUE_VISIBILITY_TIMEOUT_ERROR");
			qError.errorMessage = util.format(qError.errorMessage, err);
			qError.queueError = err;
			queue.visibilityCallback(qError, message);
			qError = null;
		}
		else {
			//No error
			queue.visibilityCallback(errorCodes.getError("none"), message);
		}
	}
	
	//Sets the period a message is invisible from the queue
	queue.setInvisibilityTimeout = function (message, when, callback) {
		if(!queue.queueInitialized) {
			//callback with an error
			setTimeout(function() { queue.visibilityInitializationFailure(message); }, 0);
		}
		else {
			var visibilityOptions = {
				QueueUrl:queueUrl,
				ReceiptHandle: message.receiptHandle,
				VisibilityTimeout:when
			};
			
			sqs.changeMessageVisibility(
				visibilityOptions,
				function(err, data) {
					visibilityOptions = null;
					visibilityCallback(message, err, data);
				}
			);
		}
	};
	
	//Return the delete service object
	function getDeleteService() {
		//The service object to return
		var deleteService = {};
		
		//A queue to hold the messages to be deleted
		var deleteQueue = [];
		
		//Push the message to our queue
		deleteService.push = function(message) {
			deleteQueue.push(message);
		};
		
		//Request object for re-use
		var batchRequest = { QueueUrl:queueUrl };
		
		//The response from the delete batch call
		var deleteCallbackBatch;
		
		//The messages being currently delted in the batch delete operation
		var deleteBatchMessages;
		
		//Get the error if any for a particular message
		function getDeletedMessageError(message) {
			var i;
			for(i=0; i<deleteCallbackBatch.Successful.length; i++) {
				if(deleteCallbackBatch.Successful[i].Id === message.id) {
					return errorCodes.getError("none");
				}
			}
			for(i=0; i<deleteCallbackBatch.Failed.length; i++) {
				if(deleteCallbackBatch.Failed[i].Id === message.id) {
					var qError = errorCodes.getError("QUEUE_DELETE_ERROR");
					qError.errorMessage = util.format(qError.errorMessage, deleteCallbackBatch.Failed[i].Message);
					
					//Detect a batch failed error
					if(deleteCallbackBatch.Failed[i].queueError) {
						qError.queueError = deleteCallbackBatch.Failed[i].queueError;
					}
					else {
						qError.queueError = {};
						qError.queueError.Id = deleteCallbackBatch.Failed[i].Id;
						qError.queueError.SenderFault = deleteCallbackBatch.Failed[i].SenderFault;
						qError.queueError.Code = deleteCallbackBatch.Failed[i].Code;
						qError.queueError.Message = deleteCallbackBatch.Failed[i].Message;
					}
					
					return qError;
				}
			}
			return null;
		}
		
		function processDeletedOne() {
			//If we are done, let's reset
			if(!deleteBatchMessages || !deleteBatchMessages.length) {
				//We are done with the callbacks
				deleteCallbackBatch = null;
				deleteBatchMessages = null;
				//Let's poll for next batch
				setTimeout(check, 0);
			}
			else {
				//Let's process the next message (FIFO)
				var message = deleteBatchMessages[0];
				var deleteErr = getDeletedMessageError(message);
				if(deleteErr !== null) {
					queue.deleteCallback(deleteErr, message);
				}
				deleteErr = null;
				//Let's remove the message
				deleteBatchMessages.splice(0, 1);
				//And let's go again
				setTimeout(processDeletedOne, 0);
			}
		}
		
		//Result of delete batch
		function deleteBatchCallback(err, data) {
			//We don't need the entries array anymore
			batchRequest.Entries = null;
			
			if(err) {
				//we need to notify observer that all messages deletion have failed
				//create a simulated response adding all messages to Failed list
				var simulated = {};
				//No successes
				simulated.Successful = [];
				//Initialize failures
				simulated.Failed = [];
				for(var i=0; i<deleteBatchMessages; i++) {
					var simulatedItem = {};
					simulatedItem.queueError = err;
					simulatedItem.Id = deleteBatchMessages[i].id;
					simulatedItem.SenderFault = false;
					simulatedItem.Code = -1;
					simulatedItem.Message = "Delete batch failed";
					simulated.Failed.push(simulatedItem);
				}
				deleteCallbackBatch = simulated;
			}
			else {
				deleteCallbackBatch = data;
			}
			//Start the callbacks for deleted messages
			processDeletedOne();
		}
		
		//Perform a delete batch operation 
		//when we have 10 messages or deleteFrequencySeconds
		//have elapsed whichever is earlier
		var numChecks = 0;
		function check() {
			if(deleteQueue.length && (deleteQueue.length >= 10 || numChecks >= deleteFrequencySeconds)) {
				numChecks = 0;
				batchRequest.Entries = [];
				deleteBatchMessages = [];
				
				var i;
				
				//Add 10 entries or all if less 
				for(i=0; i<deleteQueue.length;i++) {
					if(i===9) {
						break;
					}
					var item = {};
					item.Id = deleteQueue[i].id;
					item.ReceiptHandle = deleteQueue[i].receiptHandle;
					batchRequest.Entries.push(item);
					
					deleteBatchMessages.push(deleteQueue[i]);
				}
				
				//Let's remove the messages in our delete batch from the queue
				for(i=0; i<deleteBatchMessages.length; i++) {
					deleteQueue.splice(0, 1);
				}
				
				//We need to start the delete batch call
				sqs.deleteMessageBatch(batchRequest, deleteBatchCallback);
			}
			else {
				numChecks++;
				setTimeout(check, 1000);
			}
		}
		
		check();
		
		return deleteService;
	}
	
	//Return the receive service object
	function getReceiveService() {
		//Service
		var service = {};
		
		//Start polling for new messages
		service.start = function() {
			poller();
		};
		
		//This variable holds the batch of messages that are retrieved from SQS
		//in a retrieve operation
		var messageBatch;
		
		//Get a batch of messages
		function poller() {
			if(queue.isStarted) {
				//Initialize receiveOptions for the first time
				var maxReceivable = queue.getConsumable();
				if(maxReceivable) {
					if(maxReceivable > batchSize) {
						maxReceivable = batchSize;
					}
					receiveOptions = {
						QueueUrl: queueUrl,
						WaitTimeSeconds:queue.pollingInterval / 1000,
						MaxNumberOfMessages: maxReceivable,
						AttributeNames:["ApproximateReceiveCount"]
					};
					sqs.receiveMessage(receiveOptions, messageReceived);
				}
				else {
					if(queue.isStarted) {
						setTimeout(poller, queue.pollingInterval);
					}
				}
			}
		}

		function processReceivedOne() {
			//Are we done yet?
			if(!messageBatch || !messageBatch.length) {
				messageBatch = null;
				setTimeout(poller, 0);
				return;
			}

			//Get the first message (FIFO)
			var message = messageBatch[0];

			//Make the callback to notify our observer
			var msg = JSON.parse(message.Body);
			msg.id = message.MessageId;
			msg.receiptHandle = message.ReceiptHandle;
			msg.dequeueCount = parseInt(message.Attributes.ApproximateReceiveCount, 10);
			queue.onMessageReceived(msg);
			message = null;
			msg = null;

			//Let's remove the message
			messageBatch.splice(0, 1);

			//And let's go again
			setTimeout(processReceivedOne, 0);
		}

		//Called when a batch of messages is retrieved from SQS
		function messageReceived(err, data) {
			if(err) {
				//Raise an error
				var queueError = errorCodes.getError("QUEUE_ERROR_RECEIVING_MESSAGE");
				queueError.errorMessage = util.format(queueError.errorMessage, queue.queueName, err);
				queueError.queueError = err;
				queue.onError(queueError);
				queueError = null;
				//We still continue on error
				if(queue.isStarted) {
					//Try again
					setTimeout(poller, 0);
				}
			}
			else {
				//All is well
				if (data.Messages && data.Messages.length > 0) {
					//Mark them as consumed
					queue.markConsumed(data.Messages.length);
					messageBatch = data.Messages;
					processReceivedOne();
				}
				else {
					if(queue.isStarted) {
						setTimeout(poller, 0);
					}
				}
			}
		}
		return service;
	}
	
	//Store the message to be deleted in deleteBatch
	queue.deleteMessage = function(message) {
		deleteService.push(message);
	};
	
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
				receiveService.start();
				//Notify that we have started
				queue.startedFunction();
			}
		});
	};
	
	//Stop listening for messages
	queue.stop = function () {
		//If we are polling
		if(queue.isStarted) {
			//Mark that we are not anymore
			queue.isStarted = false;
			//Call the stopped function
			queue.stoppedFunction();
		}
	};
	
	//This function is only for Unit Testing
	queue.deleteQueue = function(){
		if(!queue.queueInitialized) {
			//callback with an error
			setTimeout(function() { queue.queueDeleteInitializationFailure(); }, 0);
		}
		else {
			sqs.deleteQueue({QueueUrl:queueUrl}, function(err) {
				if (!err) {
					queue.queueDeleteCallback();
				}
				else {
					//Raise an error
					var queueError = errorCodes.getError("QUEUE_QUEUE_DELETE_ERROR");
					queueError.errorMessage = util.format(queueError.errorMessage, queue.queueName, err);
					queueError.queueError = err;
					queue.queueDeleteCallback(queueError);
					queueError = null;
				}
			});
		}
	};
	//return the queue object
	return queue;
};