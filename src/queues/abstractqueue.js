//for inheritance stuff
var util = require('util');
//Path stuff
var path = require('path');
//Event emitter stuff
var EventEmitter = require('events').EventEmitter;
//For throttling
var RateLimiter = require('limiter').RateLimiter;

//The class
function AbstractQueue(name) {
	this.name = name;
	
	//Default invisibilityTimeout is 1 minute
	this.invisibilityTimeout = 60;
	this.pushManyInProgress = false;
	
	//Is the queue initialized?
	//Queue initialization makes sure that the queue is created
	//in case it doesn't exist already
	this.queueInitialized = false;
	
	//Have we started to listen for messages from the queue?
	this.isStarted = false;
	
	//We poll the queue for updates at this interval (milliseconds).
	//Default value is 5 secs
	this.pollingInterval = 5000;
	
	//Max dequeue count. If a message is dequed so many times, then
	//it will be deleted straight away without any processing
	//Default value is 5
	this.maxDequeueCount = 5;
	
	
	//This is the object for throttling rate of messages
	var limiter;
	this.setThrottle = function(throttle) {
		limiter = new RateLimiter(parseInt(throttle["throttle-value"]), throttle["throttle-unit"], true);
	};
	
	//Marks that the specified number of messages have been consumed from the queue
	this.markConsumed = function(numConsumed) {
		if(limiter) {
			limiter.removeTokens(numConsumed, function(err, remaining) {
				if(err) {
					console.log(err);
				}
			});
		}
	};
	
	//Returns the number of messages we can consume within the throttle bracket
	this.getConsumable = function() {
		if(limiter) {
			return limiter.getTokensRemaining();
		}
		else {
			return Number.MAX_VALUE;
		}
	};
	
	var queue = this;
	
	EventEmitter.call(this);
	
	var errorCodes = require(path.join(__dirname, "../errors.js")).errors;
	
	//Make sure polling-interval is defined in settings
	this.initPollingInterval = function() {
		if(!queue.settings["polling-interval"]) {
			queue.throwError("This module's settings need a polling-interval node");
		}
		
		queue.pollingInterval = parseInt(queue.settings["polling-interval"], 10);
		
		if(isNaN(queue.pollingInterval)) {
			queue.throwError("This module's settings, polling-interval must be a valid integer");
		}
	};
	
	
	//Make sure invisibility-timeout is defined in settings
	this.initInvisibilityTimeout = function() {
		if(!queue.settings["invisibility-timeout"]) {
			queue.throwError("This module's settings need a invisibility-timeout node");
		}
		
		queue.invisibilityTimeout = parseInt(queue.settings["invisibility-timeout"], 10);
		if(isNaN(queue.invisibilityTimeout)) {
			queue.throwError("This module's settings, invisibility-timeout must be a valid integer");
		}
	};
	
	//Make sure max-dequeue-count is defined in settings
	this.initMaxDequeueCount = function() {
		if(!queue.settings["max-dequeue-count"]) {
			queue.maxDequeueCount = 5;
		}
		else {
			queue.maxDequeueCount = parseInt(queue.settings["max-dequeue-count"], 10);
			if(isNaN(queue.maxDequeueCount)) {
				queue.throwError("This module's settings, max-dequeue-count must be a valid integer");
			}
		}
	};
	
	//Make sure settings element is defined in config
	this.requireSettings = function() {
		if(!queue.settings) {
			queue.throwError("This module requires settings to be defined");
		}
	};
	
	//Has the client already made a call to pushMany and is now making
	//another call before the queue-pushmany-completed event?
	this.isPushManyRunning = function() {
		if(this.pushManyInProgress) {
			var err = errorCodes.getError("QUEUE_BATCH_SENDING_IN_PROGRESS");
			err.errorMessage = util.format(err.errorMessage, this.jobType);
			queue.onError(err);
			return true;
		}
		return false;
	};
	
	//Utility function to throw an error with the queue name prefixed
	this.throwError = function(msg) {
		throw queue.name + ":" + msg;
	};
	
	//Utility function to log error to console with the queue name prefixed
	this.log = function(message) {
		console.log(queue.name + ":" + message);
	};
	
	//Initialize the settings of the queue
	this.init = function() {
		queue.log("init() not implemented");
	};
	
	//Push a message to the queue
	this.push = function(message) {
		queue.log("push() not implemented");
	};
	
	//Push an array of messages to the queue
	this.pushMany = function(messages) {
		queue.log("pushMany() not implemented");
	};
	
	//Push a message setting ts delay in seconds from now when it can be popped
	this.schedule = function(message, when) {
		queue.log("schedule() not implemented");
	};
	
	//Delete a specified message from the queue
	this.deleteMessage = function(message) {
		queue.log("delete() not implemented");
	};
	
	//Sets the messages invisibility timeout
	this.setInvisibilityTimeout = function (message, when) {
		queue.log("setInvisibilityTimeout() not implemented");
	};
	
	//Start listening for messages
	this.start = function () {
		queue.log("start() not implemented");
	};
	
	//Stop listening for messages
	this.stop = function () {
		queue.log("stop() not implemented");
	};
	
	this.deleteQueue = function() {
		queue.log("deleteQueue() not implemented");
	};
	
	//For internal use only
	this.onMessageReceived = function(message)
	{
		this.messageReceivedFunction(message);
	};
	
	//For internal use only
	this.onError = function(err, message)
	{
		this.errorFunction(err, message);
	};
	
	//For internal use only
	this.onReady = function() {
		this.readyFunction();
	};
	
	//For internal use only
	this.pushInitializationFailure = function(message) {
		var queueError = errorCodes.getError("QUEUE_PUSH_ERROR_QUEUE_NOT_INITIALIZED");
		queue.pushCallback(queueError, message);
		queueError = null;
	};
	
	//For internal use only
	this.deleteInitializationFailure = function(message) {
		var queueError = errorCodes.getError("QUEUE_DELETE_NOT_INITIALIZED");
		queue.deleteCallback(queueError, message);
		queueError = null;
	};
	
	//For internal use only
	this.visibilityInitializationFailure = function(message) {
		var queueError = errorCodes.getError("QUEUE_VISIBILITY_TIMEOUT_NOT_INITIALIZED");
		queue.visibilityCallback(queueError, message);
		queueError = null;
	};
	
	//For internal use only
	this.queueDeleteInitializationFailure = function() {
		var queueError = errorCodes.getError("QUEUE_QUEUE_DELETE_NOT_INITIALIZED");
		queue.queueDeleteCallback(queueError);
		queueError = null;
	};
}

util.inherits(AbstractQueue, EventEmitter);

module.exports = AbstractQueue;