/*global beforeEach, afterEach, describe, expect, it, spyOn, xdescribe, xit, waitsFor */
"use strict";

var path = require('path');

var modulePath = path.join(__dirname, "../../src/broker.js");
var brokerModule = require(modulePath);
//Create object in debug mode
var broker = new brokerModule.JobBroker(true);
var callResult;

var awsConf = {
	"workers": [
		{
			"job-type":"sendmsg",
			"worker": {
				"worker-module":"noworker"
			},
			"queue" : {
				"queue-module":"sqsqueue",
				"queue-name":"buildtest",
				"queue-settings": {
					"polling-interval":20000,
					"invisibility-timeout":3600,
					"aws-config-file":"/Users/varun/Development/github/job-broker/test/files/badconfig/aws.json",
					"max-dequeue-count":3,
					"delete-frequency-seconds":5
				}
			}
		}
	]
};

var redisConf = {
	"workers": [
		{
			"job-type":"sendmsg",
			"worker": {
				"worker-module":"noworker"
			},
			"queue" : {
				"queue-module":"redisqueue",
				"queue-name":"testpushmany",
				"queue-settings": {
					"host":"127.0.0.1",
					"port":"6379",
					"ns":"rsmq",
					"polling-interval":3000,
					"invisibility-timeout":3600,
					"max-dequeue-count":3
				}
			}
		}
	]
};

function randomizeQueue(config) {
    var workerObjs = config.workers;
    var workerConfig = workerObjs[0];
    var qConfig = workerConfig.queue;
    qConfig["queue-name"] = "q" + Date.now();
}

function resultCheck() {
	return callResult !== undefined;
}
function producerconsumer(qname, config){
	
	describe("Testing of broker to handle dynamic configuration and queue initiation with do not create set to true (no new queue is created) - " + qname, function () {
	
		it("tests loading a dynamic configuration " + qname, function () {
			callResult = undefined;
			
			broker.load(function(brokerObj) {
				//Randomize the queue name
				randomizeQueue(config);
				
				//Should be no error
				expect(brokerObj).toBeDefined();
				
				var queue;
				
				//The event callback functions
				function queueErrorFunction(err, msg) {
					console.log("ERROR:");
					console.log(err);
					console.log(msg);
				}
				
				function workCompletedFunction(err, msg) {
				}
				
				function brokerStartedFunction() {
					expect(brokerObj.hasQueue("sendmsg")).toBe(true);
					queue.deleteQueue();
				}
				
				function brokerStoppedFunction() {
					unregister();
				}
				
				function queueReadyFunction(info) {
					//Start listening
					queue = info.queue;
					info.queue.start();
				}
				
				function queueDeletedQueueFunction(worker, queue) {
				}
				
				function configLoaded() {
					brokerObj.connect();
				}
				
				//The unregister function
				function unregister() {
					brokerObj.removeListener("work-completed", workCompletedFunction);
					brokerObj.removeListener("queue-error", queueErrorFunction);
					brokerObj.removeListener("broker-started", brokerStartedFunction);
					brokerObj.removeListener("queue-ready", queueReadyFunction);
					brokerObj.removeListener("broker-stopped", brokerStoppedFunction);
					brokerObj.removeListener("queue-deleted-queue", queueDeletedQueueFunction);
					brokerObj.removeListener("config-loaded", configLoaded);
					//We don't need the broker stuff any more
					brokerObj = null;
					callResult = true;
				}
				
				//Register for the events
				brokerObj.on("work-completed", workCompletedFunction);
				brokerObj.on("queue-error", queueErrorFunction);
				brokerObj.on("queue-ready", queueReadyFunction);
				brokerObj.on("broker-started", brokerStartedFunction);
				brokerObj.on("broker-stopped", brokerStoppedFunction);
				brokerObj.on("queue-deleted-queue", queueDeletedQueueFunction);
				brokerObj.on("config-loaded", configLoaded);
				
				brokerObj.addModules(config);
			});
			//Wait for 140 secs (emptying a queue takes 80 sec - hypothesis, plus 60 secs for pushing 
			//and consuming 5 messages, assuming worst case)
			waitsFor(resultCheck, 60000);
		});
		
		it("tests loading a dynamic configuration with non-existent queue with queue creation turned off - " + qname, function () {
			callResult = undefined;
			
			broker.load(function(brokerObj) {
				//Randomize the queue name
				randomizeQueue(config);
				
				var qcount = 0;
				
				//Should be no error
				expect(brokerObj).toBeDefined();
				
				
				//The event callback functions
				function queueErrorFunction(err, msg) {
					console.log("ERROR:");
					console.log(err);
					console.log(msg);
				}
				
				function workCompletedFunction(err, msg) {
				}
				
				function brokerInitializedFunction() {
					expect(qcount).toBe(1);
					unregister();
				}
				
				function brokerStoppedFunction() {
					console.log("--------- NEVER STOPPED SINCE NO QUEUES STARTED -----------");
				}
				
				function queueReadyFunction(info) {
					//Start listening
					console.log("--------- QUEUE SHOULD NEVER BE READY -----------");
				}
				
				function queueDeletedQueueFunction(worker, queue) {
					qcount++;
				}
				
				function configLoaded() {
					brokerObj.connect(true);
				}
				
				//The unregister function
				function unregister() {
					brokerObj.removeListener("work-completed", workCompletedFunction);
					brokerObj.removeListener("queue-error", queueErrorFunction);
					brokerObj.removeListener("broker-initialized", brokerInitializedFunction);
					brokerObj.removeListener("queue-ready", queueReadyFunction);
					brokerObj.removeListener("broker-stopped", brokerStoppedFunction);
					brokerObj.removeListener("queue-deleted-queue", queueDeletedQueueFunction);
					brokerObj.removeListener("config-loaded", configLoaded);
					//We don't need the broker stuff any more
					brokerObj = null;
					callResult = true;
				}
				
				//Register for the events
				brokerObj.on("work-completed", workCompletedFunction);
				brokerObj.on("queue-error", queueErrorFunction);
				brokerObj.on("queue-ready", queueReadyFunction);
				brokerObj.on("broker-initialized", brokerInitializedFunction);
				brokerObj.on("broker-stopped", brokerStoppedFunction);
				brokerObj.on("queue-deleted-queue", queueDeletedQueueFunction);
				brokerObj.on("config-loaded", configLoaded);
				
				brokerObj.addModules(config);
			});
			//Wait for 140 secs (emptying a queue takes 80 sec - hypothesis, plus 60 secs for pushing 
			//and consuming 5 messages, assuming worst case)
			waitsFor(resultCheck, 60000);
		});
	});
}

producerconsumer("SQS", awsConf);
producerconsumer("Redis Q", redisConf);

