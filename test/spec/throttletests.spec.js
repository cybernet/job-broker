/*global beforeEach, afterEach, describe, expect, it, spyOn, xdescribe, xit, waitsFor, runs */
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
	describe("Testing of broker throttling pushing 21 messages - then consuming @ 11/minute " + qname, function () {
		it("tests pushMany functionality producing and consuming 21 messages with " + qname, function () {
			createTempConfigFile(getTestFilePath(configfile));
			callResult = undefined;
			var messagesConsumed = 0;
			var messagesToProduce = 21;
			var intime, outtime;
			intime = Date.now();
			
			broker.load(getTestFilePath("temp.json"), function(result, brokerObj) {
				//File is loaded, we can remove it
				deleteTempConfigFile();
				
				//Should be no error
				expect(result.errorCode).toBe(result.errorCodes.none.errorCode);
				
				var messages = [];
		
				//batch size for AWS is max 10
				for(var i=0; i<messagesToProduce; i++) {
					var message = {};
					message.jobType = "sendmsg";
					message.payload = {};
					message.payload.from = "me@sent.ly";
					message.payload.to = "you@gmail.com";
					message.payload.emailId = "Message " + (i + 1);
					message.payload.text = "Message " + (i + 1) + " intime: " + (new Date()).toTimeString().split(' ')[0];
					messages.push(message);
				}
				
				//The event callback functions
				function queueErrorFunction(err, msg) {
					console.log("ERROR:");
					console.log(err);
					console.log(msg);
					messagesConsumed++;
					if(messagesConsumed === messagesToProduce) {
						err.queue.deleteQueue();
					}
				}
				
				function workCompletedFunction(err, msg) {
					messagesConsumed++;
					if(messagesConsumed === messagesToProduce) {
						err.queue.deleteQueue();
					}
				}
				
				function brokerStartedFunction() {
					brokerObj.pushMany(messages);
				}
				
				function brokerStoppedFunction() {
					unregister();
				}
				
				function queueReadyFunction(info) {
					//Start listening
					info.queue.start();
				}
				
				function queueDeletedQueueFunction(worker, queue) {
					brokerObj.stop();
				}
				
				function queuePushManyCompletedFunction(report) {
					//console.log(JSON.stringify(report));
				}
				
				//The unregister function
				function unregister() {
					brokerObj.removeListener("work-completed", workCompletedFunction);
					brokerObj.removeListener("queue-error", queueErrorFunction);
					brokerObj.removeListener("broker-started", brokerStartedFunction);
					brokerObj.removeListener("queue-ready", queueReadyFunction);
					brokerObj.removeListener("broker-stopped", brokerStoppedFunction);
					brokerObj.removeListener("queue-deleted-queue", queueDeletedQueueFunction);
					brokerObj.removeListener("queue-pushmany-completed", queuePushManyCompletedFunction);
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
				brokerObj.on("queue-pushmany-completed", queuePushManyCompletedFunction);
		
				brokerObj.connect();
				
			});
			//Wait for 130
			waitsFor(resultCheck, 140000);
			runs(function(){
				outtime = Date.now();
				//The difference in date in milliseconds
				var diff = outtime - intime;
				//It should have taken more than 1 minute
				expect(diff).toBeGreaterThan(60000);
			});
		});
	});
}

//producerconsumer("Redis Q", "throttle.json");
producerconsumer("SQS", "throttle-aws.json");

