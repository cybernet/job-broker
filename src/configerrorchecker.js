var util = require('util');
var path = require('path');
var fs = require('fs');
var errorCodes = require(path.join(__dirname, "/errors.js")).errors;

exports.checker = function(cb, cp) {
	var callback = cb;
	var configPath = cp;
	
	var checker = {};
	
	//This object will be passed to the callback if callback is defined
	var resultObj;
	
	//We need to check that a queue with particular module and name is defined only once
	//Thus, we maintain a simple hashtable of queuemoduleName + queueName
	var queueMap = {};
	
	//Callback with error result
	function makeCallback() {
		if(callback) {
			callback(resultObj);
		}
	}
	
	checker.setQueueMap = function(map) {
		queueMap = map;
	};
	
	//Check that the config file exists
	checker.checkFileExistsError = function() {
		//Check if file exists
		try {
			// Query the entry
			var stats = fs.lstatSync(configPath);

			// Is it a directory?
			if (stats.isDirectory()) {
				resultObj = errorCodes.getError("CONFIG_FILE_NOT_FOUND");
				resultObj.errorMessage = util.format(resultObj.errorMessage, configPath);
				makeCallback();
				return true;
			}
		}
		catch (e) {
			//It doesn't exist
			resultObj = errorCodes.getError("CONFIG_FILE_NOT_FOUND");
			resultObj.errorMessage = util.format(resultObj.errorMessage, configPath);
			makeCallback();
			return true;
		}
		return false;
	};
	
	//Checks if there is a JSON error while loading config
	checker.checkJsonLoadingError = function(config, configPath) {
		try
		{
			//Try parsing the JSON file
			config.file({ file: configPath });
		}
		catch(err) {
			//Could not parse
			resultObj = errorCodes.getError("CONFIG_JSON_PARSE_ERROR");
			makeCallback();
			return true;
		}
		return false;
	};
	
	//The workers node must be defined in the config
	checker.checkWorkersNode = function(workerObjs) {
		if(!workerObjs) {
			//The workers node is not defined
			resultObj = errorCodes.getError("CONFIG_NO_WORKERS_ARRAY");
			makeCallback();
			return true;
		}
		
		if(!workerObjs.length) {
			//The workers node doesn't have any workers
			resultObj = errorCodes.getError("CONFIG_WORKERS_ARRAY_EMPTY");
			makeCallback();
			return true;
		}
		
		return false;
	};
	
	//The job-type must be specified
	checker.checkJobType = function(workerConfig, i) {
		if(!workerConfig["job-type"]) {
			//The object node doesn't have any job-type
			resultObj = errorCodes.getError("CONFIG_JOB_TYPE_MISSING");
			resultObj.errorMessage = util.format(resultObj.errorMessage, (i + 1));
			makeCallback();
			return true;
		}
		return false;
	};
	
	//A worker must be defined
	checker.checkWorkerNode = function(workerConfig, i) {
		if(!workerConfig.worker) {
			//The object node doesn't define a worker
			resultObj = errorCodes.getError("CONFIG_NO_WORKER_NODE");
			resultObj.errorMessage = util.format(resultObj.errorMessage, (i + 1));
			makeCallback();
			return true;
		}
		return false;
	};
	
	//A worker's module must be defined
	checker.checkWorkerModule = function(workerObj, i) {
		if(!workerObj["worker-module"]) {
			//The worker object node doesn't define a worker-module
			resultObj = errorCodes.getError("CONFIG_WORKER_MODULE_MISSING");
			resultObj.errorMessage = util.format(resultObj.errorMessage, (i + 1));
			makeCallback();
			return true;
		}
		return false;
	};
	
	//Check that the worker module can be loaded
	checker.checkLoadWorkerModule = function(workerObj, i, checkerObj) {
		var workerModuleName = workerObj["worker-module"];
		//Path to the module
		var workerModulePath;
		if(workerModuleName.length > 3 && workerModuleName.substring(workerModuleName.length - 2).toLowerCase() === "js") {
			workerModulePath = path.join(__dirname, "../../../" + workerModuleName);
		}
		else {
			workerModulePath = path.join(__dirname, "workers/" + workerModuleName + ".js");
		}
		
		try
		{
			//Try to load from the files
			checkerObj.workerModule = require(workerModulePath).worker();
		}
		catch(err) {
			//The worker module could not be loaded
			resultObj = errorCodes.getError("CONFIG_UNABLE_TO_LOAD_WORKER_MODULE");
			resultObj.errorMessage = util.format(resultObj.errorMessage, workerModuleName);
			makeCallback();
			return true;
		}
		
		try
		{
			//Try to initialize with settings from the file
			checkerObj.workerModule.settings = workerObj["worker-settings"];
			checkerObj.workerModule.moduleName = workerModuleName;
			checkerObj.workerModule.init();
		}
		catch(err) {
			//The worker module could not be initialized
			resultObj = errorCodes.getError("CONFIG_UNABLE_TO_INITIALIZE_WORKER_MODULE");
			resultObj.errorMessage = util.format(resultObj.errorMessage, workerModuleName, err);
			makeCallback();
			return true;
		}
		return false;
	};
	
	//Check that a queue is specified
	checker.checkQueueNode = function(workerConfig, i) {
		if(!workerConfig.queue) {
			//The object node doesn't define a queue
			resultObj = errorCodes.getError("CONFIG_QUEUE_NODE_MISSING");
			resultObj.errorMessage = util.format(resultObj.errorMessage, (i + 1));
			makeCallback();
			return true;
		}
		return false;
	};
	
	//Check that a queue module is specified
	checker.checkQueueModule = function(queueObj, i) {
		if(!queueObj["queue-module"]) {
			//The queue object node doesn't define a queue-module
			resultObj = errorCodes.getError("CONFIG_QUEUE_MODULE_MISSING");
			resultObj.errorMessage = util.format(resultObj.errorMessage, (i + 1));
			makeCallback();
			return true;
		}
		return false;
	};
	
	//Check that the queue name is specified
	checker.checkQueueName = function(queueObj, i) {
		if(!queueObj["queue-name"]) {
			//The queue object node doesn't define a queue-name
			resultObj = errorCodes.getError("CONFIG_QUEUE_NAME_MISSING");
			resultObj.errorMessage = util.format(resultObj.errorMessage, (i + 1));
			makeCallback();
			return true;
		}
		//Check that it is complaint with our names policy
		var patt1 = /^[a-z0-9]+$/i;
		if(queueObj["queue-name"].length > 15 || !patt1.test(queueObj["queue-name"])) {
			//The queuename is invalid
			resultObj = errorCodes.getError("CONFIG_INVALID_QUEUE_NAME");
			resultObj.errorMessage = util.format(resultObj.errorMessage, queueObj["queue-name"]);
			makeCallback();
			patt1 = null;
			return true;
		}
		
		patt1 = null;
		return false;
	};
	
	//Check the settings for queue-throttle
	checker.checkQueueThrottle = function(queueObj, i) {
		//Since this is an optional setting, if it does not exist
		//there is no error
		if(!queueObj["queue-throttle"]) {
			return false;
		}
		else {
			//If it is defined, so must throttle-unit and throttle-value
			if(!queueObj["queue-throttle"]["throttle-unit"]) {
				resultObj = errorCodes.getError("CONFIG_UNDEFINED_THROTTLE_UNIT");
				makeCallback();
				return true;
			}
			//throttle-unit can only be second, minute, hour or day
			var unit = queueObj["queue-throttle"]["throttle-unit"].trim().toLowerCase();
			if(unit !== 'second' && unit !== 'minute' && unit !== 'hour' && unit !== 'day') {
				resultObj = errorCodes.getError("CONFIG_INVALID_THROTTLE_UNIT");
				resultObj.errorMessage = util.format(resultObj.errorMessage, unit);
				makeCallback();
				return true;
			}
			if(!queueObj["queue-throttle"]["throttle-value"] && queueObj["queue-throttle"]["throttle-value"] !== 0) {
				resultObj = errorCodes.getError("CONFIG_UNDEFINED_THROTTLE_VALUE");
				makeCallback();
				return true;
			}
			//throttle-value must be a positive integer > 0
			var throttleVal = parseInt(queueObj["queue-throttle"]["throttle-value"]);
			if(isNaN(throttleVal) || throttleVal < 1) {
				resultObj = errorCodes.getError("CONFIG_INVALID_THROTTLE_VALUE");
				resultObj.errorMessage = util.format(resultObj.errorMessage, queueObj["queue-throttle"]["throttle-value"]);
				makeCallback();
				return true;
			}
			return false;
		}
	};
	
	//Check that the queue module can be loaded
	checker.checkLoadQueueModule = function(queueObj, i, chk) {
		var queueModuleName = queueObj["queue-module"];
		
		//Path to the module
		var queueModulePath;
		if(queueModuleName.length > 3 && queueModuleName.substring(queueModuleName.length - 2).toLowerCase() === "js") {
			queueModulePath = path.join(__dirname, "../../../" + queueModuleName);
		}
		else {
			queueModulePath = path.join(__dirname, "queues/" + queueModuleName + ".js");
		}
		
		try
		{
			//Try to load the module
			chk.queueModule = require(queueModulePath).queue();
		}
		catch(err) {
			//The queue module could not be loaded
			resultObj = errorCodes.getError("CONFIG_UNABLE_TO_LOAD_QUEUE_MODULE");
			resultObj.errorMessage = util.format(resultObj.errorMessage, queueModuleName);
			makeCallback();
			return true;
		}
		
		try
		{
			chk.queueModule.settings = queueObj["queue-settings"];
			chk.queueModule.moduleName = queueModuleName;
			chk.queueModule.configIndex = (i+1);
			chk.queueModule.queueName = queueObj["queue-name"];
			chk.queueModule.moduleName = queueModuleName;
			if(queueObj["queue-throttle"]) {
				chk.queueModule.setThrottle(queueObj["queue-throttle"]);
			}
			//Try to initialize
			chk.queueModule.init();
		}
		catch(err) {
			//The queue module could not be initialized
			resultObj = errorCodes.getError("CONFIG_UNABLE_TO_INITIALIZE_QUEUE_MODULE");
			resultObj.errorMessage = util.format(resultObj.errorMessage, queueModuleName, err);
			makeCallback();
			return true;
		}
		
		return false;
	};
	
	//A particular queue (with module M and name N) cannot be defined twice
	checker.checkQueueConstraint = function(queueModuleName, queueName) {
		var qm = queueModuleName.toLowerCase();
		var qn = queueName.toLowerCase();
		if(queueMap[qm + "," + qn]) {
			//It's already defined
			resultObj = errorCodes.getError("CONFIG_QUEUE_DEFINED_TWICE");
			resultObj.errorMessage = util.format(resultObj.errorMessage, queueModuleName, queueName);
			makeCallback();
			return true;
		}
		else {
			queueMap[qm + "," + qn] = qm + "," + qn;
		}
		
		return false;
	};
	
	return checker;
};