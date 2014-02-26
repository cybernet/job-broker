/*global beforeEach, afterEach, describe, expect, it, spyOn, xdescribe, xit, waitsFor, runs */
"use strict";
var path = require('path');
var fs = require('fs');
var nconf = require('nconf');

var modulePath = path.join( __dirname, "../../src/broker.js");
var brokerModule = require(modulePath);
var broker = new brokerModule.JobBroker(true);

var flag, intime, outime;
var numQueueAlerts;
var numProcessed, numProcessedError;

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

function rc(){
	if(numQueueAlerts === 0 || numProcessed === 0) {
		return false;
	}
	return numQueueAlerts === numProcessed;
}

function rerror(){
	return flag;
}

function brokerinterfacetests(qname, configfile){
	describe("Testing Broker Interface with " + qname, function(){
		it("verifies pushing 1 message into the queue", function(){
			numQueueAlerts = 0;
			numProcessed = 0;
			createTempConfigFile(getTestFilePath(configfile));
			broker.load(getTestFilePath("temp.json"), function(result, brokerObj){
				//File is loaded, we can remove it
				deleteTempConfigFile();
				
				expect(result.errorCode).toBe(0);
				var message = {};
				message.jobType = "sendmsg";
				message.payload = {};
				message.payload.id = 1;
				
				function queueSucessFunction(err, msg){
					numQueueAlerts++;
					expect(numQueueAlerts).toBe(1);
					if(numQueueAlerts === numProcessed) {
						err.queue.deleteQueue();
					}
				}
				
				function workCompletedFunction(err, msg) {
					numProcessed++;
					expect(numProcessed).toBe(1);
					if(numQueueAlerts === numProcessed) {
						err.queue.deleteQueue();
					}
				}
							
				function brokerStartedFunction(){
					brokerObj.push(message);
				}
				
				function queueReadyFunction(info) {
					info.queue.start();
				}
				
				function brokerStoppedFunction(){
					unregister();
				}
								
				function queueErrorFunction(err, msg) {
					console.log("ERROR:");
					console.log(err);
					console.log(msg);
				}
				
				function queueDeletedQueueFunction(worker, queue) {
					brokerObj.stop();
				}
								
				brokerObj.on("queue-success", queueSucessFunction);
				brokerObj.on("work-completed", workCompletedFunction);
				brokerObj.on("broker-started", brokerStartedFunction);
				brokerObj.on("queue-ready", queueReadyFunction);
				brokerObj.on("broker-stopped", brokerStoppedFunction);
				brokerObj.on("queue-error", queueErrorFunction);
				brokerObj.on("queue-deleted-queue", queueDeletedQueueFunction);
				
				brokerObj.connect();
				
				function unregister() {
					brokerObj.removeListener("work-completed", workCompletedFunction);
					brokerObj.removeListener("queue-success", queueSucessFunction);
					brokerObj.removeListener("broker-started", brokerStartedFunction);
					brokerObj.removeListener("queue-ready", queueReadyFunction);
					brokerObj.removeListener("broker-stopped", brokerStoppedFunction);
					brokerObj.removeListener("queue-error", queueErrorFunction);
					brokerObj.removeListener("queue-deleted-queue", queueDeletedQueueFunction);
					
					brokerObj = null;
				}
			});
			waitsFor(rc, 20000);
			runs(function(){
				expect(numProcessed).toBe(numQueueAlerts);
			});
		});
		
		it("checks for error when pushing messages with incompatible jobtypes using pushMany", function(){
			createTempConfigFile(getTestFilePath(configfile));
			var q;
			flag = false;
			numQueueAlerts = 0;
			numProcessed = 0;
			numProcessedError = 0;
			broker.load(getTestFilePath("temp.json"), function(result, brokerObj){
				//File is loaded, we can remove it
				deleteTempConfigFile();
				
				expect(result.errorCode).toBe(0);
				var messages = [];
				for (var i = 0; i< 10; i++) {
					var message = {};
					message.jobType = "jobType1";
					message.payload = {};
					message.payload.id = i+1;
					message.payload.text = "message " + (i+1);
					messages.push(message);
				}
				messages[1].jobType = "jobType2";
				
				function queueSucessFunction(err, msg){
					numQueueAlerts++;
				}
				
				function queueErrorFunction(err, msg){
					numProcessedError++;
					expect(err.errorCode).toBe(err.errorCodes.QUEUE_INCOMPATIBLE_JOB_TYPES.errorCode);
					q.deleteQueue();
				}
				
				function workCompletedFunction(err, msg) {
					numProcessed++;
				}
							
				function brokerStartedFunction(){
					brokerObj.pushMany(messages);
				}
				
				function queueReadyFunction(info) {
					q = info.queue;
					info.queue.start();
				}
				
				function brokerStoppedFunction(){
					unregister();
				}
				
				function queueDeletedQueueFunction(worker, queue) {
					brokerObj.stop();
				}
				
				brokerObj.on("queue-success", queueSucessFunction);
				brokerObj.on("work-completed", workCompletedFunction);
				brokerObj.on("broker-started", brokerStartedFunction);
				brokerObj.on("queue-ready", queueReadyFunction);
				brokerObj.on("broker-stopped", brokerStoppedFunction);
				brokerObj.on("queue-error", queueErrorFunction);
				brokerObj.on("queue-deleted-queue", queueDeletedQueueFunction);
		
				brokerObj.connect();
				
				function unregister() {
					brokerObj.removeListener("work-completed", workCompletedFunction);
					brokerObj.removeListener("queue-success", queueSucessFunction);
					brokerObj.removeListener("broker-started", brokerStartedFunction);
					brokerObj.removeListener("queue-ready", queueReadyFunction);
					brokerObj.removeListener("broker-stopped", brokerStoppedFunction);
					brokerObj.removeListener("queue-error", queueErrorFunction);
					brokerObj.removeListener("queue-deleted-queue", queueDeletedQueueFunction);
					brokerObj = null;
					flag = true;
					
				}
			});
			waitsFor(rerror, 20000);
			runs(function(){
				expect(numQueueAlerts).toBe(0);
				expect(numProcessed).toBe(0);
				expect(numProcessedError).toBe(1);
			});
		});
		
		it("checks for error when pushing messages with invalid jobType", function(){
			createTempConfigFile(getTestFilePath(configfile));
			flag = false;
			var q;
			broker.load(getTestFilePath("temp.json"), function(result, brokerObj){
				//File is loaded, we can remove it
				deleteTempConfigFile();
				
				expect(result.errorCode).toBe(0);
				
				var message = {};
				message.jobType = "thedeepvoid";
				message.payload = {};
				message.payload.id = 1;
				message.payload.text = "dangling message";

				
				function queueErrorFunction(err, msg){
					expect(err.errorCode).toBe(err.errorCodes.QUEUE_INVALID_JOB_TYPE.errorCode);
					q.deleteQueue();
				}
				
				function queueDeletedQueueFunction(worker, queue) {
					unregister();
				}
				
				function queueReadyFunction(info) {
					q = info.queue;
				}
				
				function brokerInitializedFunction() {
					brokerObj.push(message);
				}
				

				brokerObj.on("queue-error", queueErrorFunction);
				brokerObj.on("queue-deleted-queue", queueDeletedQueueFunction);
				brokerObj.on("queue-ready", queueReadyFunction);
				brokerObj.on("broker-initialized", brokerInitializedFunction);
		
				brokerObj.connect();
				
				function unregister() {
					brokerObj.removeListener("queue-error", queueErrorFunction);
					brokerObj.removeListener("queue-deleted-queue", queueDeletedQueueFunction);
					brokerObj.removeListener("queue-ready", queueReadyFunction);
					brokerObj.removeListener("broker-initialized", brokerInitializedFunction);
					brokerObj = null;
					flag = true;
				}
			});
			waitsFor(rerror, 20000);
		});
		
		it("verifies scheduling 1 message into the queue with a delay of 1 minute ", function(){
			createTempConfigFile(getTestFilePath(configfile));
			numQueueAlerts = 0;
			numProcessed = 0;
			broker.load(getTestFilePath("temp.json"), function(result, brokerObj){
				//File is loaded, we can remove it
				deleteTempConfigFile();
				
				expect(result.errorCode).toBe(0);
				var message = {};
				message.jobType = "sendmsg";
				message.payload = {};
				message.payload.id = 1;
				
				intime = Date.now();
				
				function queueSucessFunction(err, msg){
					numQueueAlerts++;
					expect(numQueueAlerts).toBe(1);
					if(numQueueAlerts === numProcessed) {
						err.queue.deleteQueue();
					}
				}
				
				function workCompletedFunction(err, msg) {
					numProcessed++;
					expect(numProcessed).toBe(1);
					outime = Date.now();
					if(numQueueAlerts === numProcessed) {
						err.queue.deleteQueue();
					}
				}
				
				function queueErrorFunction(err, msg) {
					console.log("ERROR:");
					console.log(err);
					console.log(msg);
				}
							
				function queueReadyFunction(info) {
					info.queue.start();
				}
				
				function brokerStoppedFunction(){
					unregister();
					
				}
				
				function brokerStartedFunction() {
					brokerObj.schedule(message, 60);
				}
				
				function queueDeletedQueueFunction(info) {
					brokerObj.stop();
				}
				
				brokerObj.on("queue-success", queueSucessFunction);
				brokerObj.on("work-completed", workCompletedFunction);
				brokerObj.on("queue-ready", queueReadyFunction);
				brokerObj.on("broker-stopped", brokerStoppedFunction);
				brokerObj.on("broker-started", brokerStartedFunction);
				brokerObj.on("queue-error", queueErrorFunction);
				brokerObj.on("queue-deleted-queue", queueDeletedQueueFunction);
				brokerObj.connect();
				
				function unregister() {
					brokerObj.removeListener("queue-success", queueSucessFunction);
					brokerObj.removeListener("work-completed", workCompletedFunction);
					brokerObj.removeListener("queue-ready", queueReadyFunction);
					brokerObj.removeListener("broker-stopped", brokerStoppedFunction);
					brokerObj.removeListener("broker-started", brokerStartedFunction);
					brokerObj.removeListener("queue-error", queueErrorFunction);
					brokerObj.removeListener("queue-deleted-queue", queueDeletedQueueFunction);
					brokerObj = null;
				}
				
				
			});
			//Wait for 70 secs
			waitsFor(rc, 70000);
			runs(function(){
				expect(numProcessed).toBe(numQueueAlerts);
				//The difference in date in milliseconds
				var diff = outime - intime;
				//It should have taken more than 1 minute
				expect(diff).toBeGreaterThan(60000);
			});
		});
		
	});
	
}

brokerinterfacetests("SQS", "good-aws.json");
brokerinterfacetests("Redis Q", "good.json");



