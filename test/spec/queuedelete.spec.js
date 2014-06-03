/*global beforeEach, afterEach, describe, expect, it, spyOn, xdescribe, xit, waitsFor */
"use strict";

var path = require('path');
var fs = require('fs');
var nconf = require("nconf");

var modulePath = path.join(__dirname, "../../src/broker.js");
var brokerModule = require(modulePath);
//Create object in debug mode
var broker = new brokerModule.JobBroker(true);
var callResult;

function getTestFilePath(filename) {
	if(filename.charAt(0) === '/') {
		filename = filename.substring(1);
	}
	return path.join(__dirname, "../files/badconfig/" + filename);
}

function createTempConfigFile(filename){
    
    var tempConfigFile = "temp.json";
    nconf.file({file: filename});
    var workerObjs = nconf.get("workers");
    var workerConfig = workerObjs[0];
    var qConfig = workerConfig.queue;
    qConfig["queue-name"] = "q" + Date.now();
    var data = "{ \"workers\": " + JSON.stringify(workerObjs) + " }";
    fs.writeFileSync(getTestFilePath(tempConfigFile), data);
      
}

function deleteTempConfigFile() {
	fs.unlinkSync(getTestFilePath("temp.json"));
}

function resultCheck() {
	return callResult !== undefined;
}
function producerconsumer(qname, configfile){
	
	describe("Testing of broker to handle queue delete cases - " + qname, function () {
	
		it("tests if broker stops when the only queue being polled is deleted " + qname, function () {
			callResult = undefined;
			createTempConfigFile(getTestFilePath(configfile));
			
		
			broker.load(getTestFilePath("temp.json"), function(result, brokerObj) {
				//File is loaded, we can remove it
				deleteTempConfigFile();
				
				//Should be no error
				expect(result.errorCode).toBe(result.errorCodes.none.errorCode);
				
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
				
				//The unregister function
				function unregister() {
					brokerObj.removeListener("work-completed", workCompletedFunction);
					brokerObj.removeListener("queue-error", queueErrorFunction);
					brokerObj.removeListener("broker-started", brokerStartedFunction);
					brokerObj.removeListener("queue-ready", queueReadyFunction);
					brokerObj.removeListener("broker-stopped", brokerStoppedFunction);
					brokerObj.removeListener("queue-deleted-queue", queueDeletedQueueFunction);
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
		
				brokerObj.connect();
				
			});
			//Wait for 140 secs (emptying a queue takes 80 sec - hypothesis, plus 60 secs for pushing 
			//and consuming 5 messages, assuming worst case)
			waitsFor(resultCheck, 60000);
		});
		
		it("tests if pushing to broker after queue has been deleted results in correct error " + qname, function () {
			callResult = undefined;
			createTempConfigFile(getTestFilePath(configfile));
		
			broker.load(getTestFilePath("temp.json"), function(result, brokerObj) {
				//File is loaded, we can remove it
				deleteTempConfigFile();
				
				//Should be no error
				expect(result.errorCode).toBe(result.errorCodes.none.errorCode);
				
				var queue;
				
				//The event callback functions
				function queueErrorFunction(err, msg) {
					expect(err.error.errorCode).toBe(err.error.errorCodes.QUEUE_INVALID_JOB_TYPE.errorCode);
					unregister();
				}
				
				function workCompletedFunction(err, msg) {
				}
				
				function brokerStartedFunction() {
					queue.deleteQueue();
				}
				
				function brokerStoppedFunction() {
					//Queue is already deleted, thus should result in invalid job type
					brokerObj.push({
						jobType:"sendmsg",
						payload:{
							id:1,
							text:"Junk"
						}
					});
				}
				
				function queueReadyFunction(info) {
					//Start listening
					queue = info.queue;
					info.queue.start();
				}
				
				function queueDeletedQueueFunction(worker, queue) {
				}
				
				//The unregister function
				function unregister() {
					brokerObj.removeListener("work-completed", workCompletedFunction);
					brokerObj.removeListener("queue-error", queueErrorFunction);
					brokerObj.removeListener("broker-started", brokerStartedFunction);
					brokerObj.removeListener("queue-ready", queueReadyFunction);
					brokerObj.removeListener("broker-stopped", brokerStoppedFunction);
					brokerObj.removeListener("queue-deleted-queue", queueDeletedQueueFunction);
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
		
				brokerObj.connect();
				
			});
			//Wait for 140 secs (emptying a queue takes 80 sec - hypothesis, plus 60 secs for pushing 
			//and consuming 5 messages, assuming worst case)
			waitsFor(resultCheck, 60000);
		});
		
		it("simulates push to a queue from a different server and tests if pushing directly to queue (not through broker) after queue has been deleted results in correct error " + qname, function () {
			callResult = undefined;
			createTempConfigFile(getTestFilePath(configfile));
		
			broker.load(getTestFilePath("temp.json"), function(result, brokerObj) {
				//File is loaded, we can remove it
				deleteTempConfigFile();
				
				//Should be no error
				expect(result.errorCode).toBe(result.errorCodes.none.errorCode);
				
				var queue;
				
				//The event callback functions
				function queueErrorFunction(err, msg) {
					expect(err.error.errorCode).toBe(err.error.errorCodes.QUEUE_PUSH_ERROR.errorCode);
					unregister();
				}
				
				function workCompletedFunction(err, msg) {
				}
				
				function brokerStartedFunction() {
					queue.deleteQueue();
				}
				
				function brokerStoppedFunction() {
					//Queue is already deleted, but a broker on another machine may not know about this
					//This case is simulating pushing to the broker on another machine before the queue
					//poll has realised that the queue is dead
					queue.push({
						jobType:"sendmsg",
						payload:{
							id:1,
							text:"Junk"
						}
					});
				}
				
				function queueReadyFunction(info) {
					//Start listening
					queue = info.queue;
					info.queue.start();
				}
				
				function queueDeletedQueueFunction(worker, queue) {
				}
				
				//The unregister function
				function unregister() {
					brokerObj.removeListener("work-completed", workCompletedFunction);
					brokerObj.removeListener("queue-error", queueErrorFunction);
					brokerObj.removeListener("broker-started", brokerStartedFunction);
					brokerObj.removeListener("queue-ready", queueReadyFunction);
					brokerObj.removeListener("broker-stopped", brokerStoppedFunction);
					brokerObj.removeListener("queue-deleted-queue", queueDeletedQueueFunction);
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
		
				brokerObj.connect();
				
			});
			//Wait for 140 secs (emptying a queue takes 80 sec - hypothesis, plus 60 secs for pushing 
			//and consuming 5 messages, assuming worst case)
			waitsFor(resultCheck, 60000);
		});
	
		it("simulates pushMany to a queue from a different server and tests if pushing directly to queue (not through broker) after queue has been deleted results in correct error " + qname, function () {
			callResult = undefined;
			createTempConfigFile(getTestFilePath(configfile));
		
			broker.load(getTestFilePath("temp.json"), function(result, brokerObj) {
				//File is loaded, we can remove it
				deleteTempConfigFile();
				
				//Should be no error
				expect(result.errorCode).toBe(result.errorCodes.none.errorCode);
				
				var queue;
				
				var errorCount = 0;
				
				//The event callback functions
				function queueErrorFunction(err, msg) {
					errorCount++;
				}
				
				function workCompletedFunction(err, msg) {
				}
				
				function brokerStartedFunction() {
					queue.deleteQueue();
				}
				
				var messages = [];
				for(var f=0; f<5; f++) {
					var msg = {
						jobType:"sendmsg",
						payload:{
							id:f,
							text:"Junk"
						}
					};
					messages.push(msg);
				}
				
				function brokerStoppedFunction() {
					//Queue is already deleted, but a broker on another machine may not know about this
					//This case is simulating pushing to the broker on another machine before the queue
					//poll has realised that the queue is dead
					queue.pushMany(messages);
				}
				
				function queueReadyFunction(info) {
					//Start listening
					queue = info.queue;
					info.queue.start();
				}
				
				function queueDeletedQueueFunction(worker, queue) {
				}
				
				function pushManyCompleted(info) {
					expect(info.report.failures.length).toBe(5);
					expect(errorCount).toBe(5);
					unregister();
				}
				
				//The unregister function
				function unregister() {
					brokerObj.removeListener("work-completed", workCompletedFunction);
					brokerObj.removeListener("queue-error", queueErrorFunction);
					brokerObj.removeListener("broker-started", brokerStartedFunction);
					brokerObj.removeListener("queue-ready", queueReadyFunction);
					brokerObj.removeListener("broker-stopped", brokerStoppedFunction);
					brokerObj.removeListener("queue-deleted-queue", queueDeletedQueueFunction);
					brokerObj.removeListener("queue-pushmany-completed", queueDeletedQueueFunction);
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
				brokerObj.on("queue-pushmany-completed", pushManyCompleted);
		
				brokerObj.connect();
				
			});
			//Wait for 140 secs (emptying a queue takes 80 sec - hypothesis, plus 60 secs for pushing 
			//and consuming 5 messages, assuming worst case)
			waitsFor(resultCheck, 60000);
		});
	
	});
	
	
}

producerconsumer("SQS", "good-aws.json");
producerconsumer("Redis Q", "good.json");

