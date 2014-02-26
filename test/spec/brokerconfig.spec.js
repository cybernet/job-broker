/*global beforeEach, afterEach, describe, expect, it, spyOn, xdescribe, xit, waitsFor */
"use strict";

var path = require('path');
var fs = require('fs');

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

function resultCheck() {
	return callResult !== undefined;
}

describe("Testing of the broker configuration module", function () {
  it("checks for error when config file is empty", function () {
	callResult = undefined;
	broker.load(getTestFilePath("empty.json"), function(result) {
		//Could not load JSON
		expect(result.errorCode).toBe(result.errorCodes.CONFIG_JSON_PARSE_ERROR.errorCode);
		callResult = result;
	});
	waitsFor(resultCheck);
  });

  it("checks for error when config file has no nodes", function () {
	callResult = undefined;
	broker.load(getTestFilePath("nonodes.json"), function(result) {
		//Worker module undefined
		expect(result.errorCode).toBe(result.errorCodes.CONFIG_NO_WORKERS_ARRAY.errorCode);
		callResult = result;
	});
	waitsFor(resultCheck);
  });

  it("checks for error when config file does not exist", function () {
	callResult = undefined;
	broker.load("randon", function(result) {
		//File not found
		expect(result.errorCode).toBe(result.errorCodes.CONFIG_FILE_NOT_FOUND.errorCode);
		callResult = result;
	});
	waitsFor(resultCheck);
  });

  it("checks for error when workers node contains no workers", function () {
	callResult = undefined;
	broker.load(getTestFilePath("zeroworkers.json"), function(result) {
		//Workers node not defined
		expect(result.errorCode).toBe(result.errorCodes.CONFIG_WORKERS_ARRAY_EMPTY.errorCode);
		callResult = result;
	});
	waitsFor(resultCheck);
  });

  it("checks for error when a worker definition has no job-type", function () {
	callResult = undefined;
	broker.load(getTestFilePath("validbroker-jobtype-missing.json"), function(result) {
		//Workers node not defined
		expect(result.errorCode).toBe(result.errorCodes.CONFIG_JOB_TYPE_MISSING.errorCode);
		callResult = result;
	});
	waitsFor(resultCheck);
  });

  it("checks for error when a worker definition has no worker", function () {
	callResult = undefined;
	broker.load(getTestFilePath("workernodemissing.json"), function(result) {
		//Workers node not defined
		expect(result.errorCode).toBe(result.errorCodes.CONFIG_NO_WORKER_NODE.errorCode);
		callResult = result;
	});
	waitsFor(resultCheck);
  });

  it("checks for error when a worker definition's worker node has no worker-module", function () {
	callResult = undefined;
	broker.load(getTestFilePath("workernomodule.json"), function(result) {
		//Workers node not defined
		expect(result.errorCode).toBe(result.errorCodes.CONFIG_WORKER_MODULE_MISSING.errorCode);
		callResult = result;
	});
	waitsFor(resultCheck);
  });

  it("checks for error when a worker node's worker-module does not exist", function () {
	callResult = undefined;
	broker.load(getTestFilePath("workerbadmodulename.json"), function(result) {
		//Workers node not defined
		expect(result.errorCode).toBe(result.errorCodes.CONFIG_UNABLE_TO_LOAD_WORKER_MODULE.errorCode);
		callResult = result;
	});
	waitsFor(resultCheck);
  });

  it("checks for error during worker module initialization", function () {
	callResult = undefined;
	broker.load(getTestFilePath("workerinitializeerror.json"), function(result) {
		//Workers node not defined
		expect(result.errorCode).toBe(result.errorCodes.CONFIG_UNABLE_TO_INITIALIZE_WORKER_MODULE.errorCode);
		callResult = result;
	});
	waitsFor(resultCheck);
  });

  it("checks for error when a worker definition has no queue", function () {
	callResult = undefined;
	broker.load(getTestFilePath("noqueue.json"), function(result) {
		//Workers node not defined
		expect(result.errorCode).toBe(result.errorCodes.CONFIG_QUEUE_NODE_MISSING.errorCode);
		callResult = result;
	});
	waitsFor(resultCheck);
  });

  it("checks for error when a worker definition's queue node has no queue-module", function () {
	callResult = undefined;
	broker.load(getTestFilePath("noqueuemodule.json"), function(result) {
		//Workers node not defined
		expect(result.errorCode).toBe(result.errorCodes.CONFIG_QUEUE_MODULE_MISSING.errorCode);
		callResult = result;
	});
	waitsFor(resultCheck);
  });

  it("checks for error when a queue node's queue-name does not exist", function () {
	callResult = undefined;
	broker.load(getTestFilePath("queuenoqueuename.json"), function(result) {
		//Workers node not defined
		expect(result.errorCode).toBe(result.errorCodes.CONFIG_QUEUE_NAME_MISSING.errorCode);
		callResult = result;
	});
	waitsFor(resultCheck);
  });

  it("checks for error when a queue node's queue-name is invalid", function () {
	callResult = undefined;
	broker.load(getTestFilePath("badqueuename.json"), function(result) {
		//Workers node not defined
		expect(result.errorCode).toBe(result.errorCodes.CONFIG_INVALID_QUEUE_NAME.errorCode);
		callResult = result;
	});
	waitsFor(resultCheck);
  });

  it("checks for error when a queue node's queue-module does not exist", function () {
	callResult = undefined;
	broker.load(getTestFilePath("queuebadmodule.json"), function(result) {
		//Workers node not defined
		expect(result.errorCode).toBe(result.errorCodes.CONFIG_UNABLE_TO_LOAD_QUEUE_MODULE.errorCode);
		callResult = result;
	});
	waitsFor(resultCheck);
  });

  it("checks for error during queue module initialization", function () {
	callResult = undefined;
	broker.load(getTestFilePath("queuebadinitialization.json"), function(result) {
		//Workers node not defined
		expect(result.errorCode).toBe(result.errorCodes.CONFIG_UNABLE_TO_INITIALIZE_QUEUE_MODULE.errorCode);
		callResult = result;
	});
	waitsFor(resultCheck);
  });

  it("checks that for a queue with module M and name N (M,N) occurs only once in config", function () {
	callResult = undefined;
	broker.load(getTestFilePath("dupequeues.json"), function(result) {
		//Workers node not defined
		expect(result.errorCode).toBe(result.errorCodes.CONFIG_QUEUE_DEFINED_TWICE.errorCode);
		callResult = result;
	});
	waitsFor(resultCheck);
  });
  
  it("checks for a the case when throttle-unit is not defined", function () {
	callResult = undefined;
	broker.load(getTestFilePath("nothrottleunit.json"), function(result, brokerObj) {
		//Workers node not defined
		expect(result.errorCode).toBe(result.errorCodes.CONFIG_UNDEFINED_THROTTLE_UNIT.errorCode);
		callResult = result;
	});
	waitsFor(resultCheck);
  });
  
  it("checks for a the case when throttle-unit is invalid", function () {
	callResult = undefined;
	broker.load(getTestFilePath("invalidthrottleunit.json"), function(result, brokerObj) {
		//Workers node not defined
		expect(result.errorCode).toBe(result.errorCodes.CONFIG_INVALID_THROTTLE_UNIT.errorCode);
		callResult = result;
	});
	waitsFor(resultCheck);
  });
  
  it("checks for a the case when throttle-value is not defined", function () {
	callResult = undefined;
	broker.load(getTestFilePath("nothrottlevalue.json"), function(result, brokerObj) {
		//Workers node not defined
		expect(result.errorCode).toBe(result.errorCodes.CONFIG_UNDEFINED_THROTTLE_VALUE.errorCode);
		callResult = result;
	});
	waitsFor(resultCheck);
  });
  
  it("checks for a the case when throttle-value is invalid", function () {
	callResult = undefined;
	broker.load(getTestFilePath("invalidthrottlevalue.json"), function(result, brokerObj) {
		//Workers node not defined
		expect(result.errorCode).toBe(result.errorCodes.CONFIG_INVALID_THROTTLE_VALUE.errorCode);
		callResult = result;
	});
	waitsFor(resultCheck);
  });

  it("checks for a valid configuration", function () {
	callResult = undefined;
	broker.load(getTestFilePath("good.json"), function(result, brokerObj) {
		//Workers node not defined
		expect(result.errorCode).toBe(result.errorCodes.none.errorCode);
		callResult = result;
	});
	waitsFor(resultCheck);
  });
});