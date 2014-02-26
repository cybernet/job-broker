var util = require('util');

exports.errors = (function() {
	var debug = false;
	
	//We kep Error code none at 0 as it's convenient to check if(err.errorCode) { }
	var errors = {
		none: { errorCategory: "ALL", errorCode: 0, errorMessage:undefined },
		CONFIG_JSON_PARSE_ERROR: { errorCategory:"CONFIG", errorCode: "JSON_PARSE_ERROR", errorMessage:"Could not load JSON configuration file!" },
		CONFIG_FILE_NOT_FOUND: { errorCategory:"CONFIG", errorCode: "FILE_NOT_FOUND", errorMessage:"The config file [%s] could not be loaded" },
		CONFIG_NO_WORKERS_ARRAY: { errorCategory:"CONFIG", errorCode: "NO_WORKERS_ARRAY", errorMessage:"The workers node could not be loaded" },
		CONFIG_WORKERS_ARRAY_EMPTY: { errorCategory:"CONFIG", errorCode: "WORKERS_ARRAY_EMPTY", errorMessage:"The workers node contains no valid workers" },
		CONFIG_JOB_TYPE_MISSING: { errorCategory:"CONFIG", errorCode: "JOB_TYPE_MISSING", errorMessage:"Worker [%s]: job-type must be set" },
		CONFIG_NO_WORKER_NODE: { errorCategory:"CONFIG", errorCode: "NO_WORKER_NODE", errorMessage:"Worker [%s]: worker must be set" },
		CONFIG_WORKER_MODULE_MISSING: { errorCategory:"CONFIG", errorCode: "WORKER_MODULE_MISSING", errorMessage:"Worker [%s]: worker-module must be set" },
		CONFIG_UNABLE_TO_LOAD_WORKER_MODULE: { errorCategory:"CONFIG", errorCode: "UNABLE_TO_LOAD_WORKER_MODULE", errorMessage:"Worker Module[%s]: worker module could not be loaded" },
		CONFIG_UNABLE_TO_INITIALIZE_WORKER_MODULE: { errorCategory:"CONFIG", errorCode: "UNABLE_TO_INITIALIZE_WORKER_MODULE", errorMessage:"Initialization Error in Worker Module[%s]: Worker module error - %s" },
		CONFIG_QUEUE_NODE_MISSING: { errorCategory:"CONFIG", errorCode: "QUEUE_NODE_MISSING", errorMessage:"Worker [%s]: queue must be set" },
		CONFIG_QUEUE_MODULE_MISSING: { errorCategory:"CONFIG", errorCode: "QUEUE_MODULE_MISSING", errorMessage:"Worker [%s]: queue-module must be set" },
		CONFIG_QUEUE_NAME_MISSING: { errorCategory:"CONFIG", errorCode: "QUEUE_NAME_MISSING", errorMessage:"Worker [%s]: queue-name must be set" },
		CONFIG_UNABLE_TO_LOAD_QUEUE_MODULE: { errorCategory:"CONFIG", errorCode: "UNABLE_TO_LOAD_QUEUE_MODULE", errorMessage:"Worker Module[%s]: queue module could not be loaded" },
		CONFIG_UNABLE_TO_INITIALIZE_QUEUE_MODULE: { errorCategory:"CONFIG", errorCode: "UNABLE_TO_INITIALIZE_QUEUE_MODULE", errorMessage:"Initialization Error in Worker Module[%s]: Queue module error - %s" },
		CONFIG_QUEUE_DEFINED_TWICE: { errorCategory:"CONFIG", errorCode: "QUEUE_DEFINED_TWICE", errorMessage:"Queue with Module[%s] and Name[%s] is defined more than once" },
		CONFIG_INVALID_QUEUE_NAME: { errorCategory:"CONFIG", errorCode: "INVALID_QUEUE_NAME", errorMessage:"Queue name[%s] is invalid. Queue names (case-insensitive) can only be 15 characters and contain only characters A-Z or 1-9" },
		CONFIG_INVALID_THROTTLE_UNIT: { errorCategory:"CONFIG", errorCode: "INVALID_THROTTLE_UNIT", errorMessage:"[%s] is an invalid throttle-unit. throttle-unit can only have the values of second, minute, hour or day" },
		CONFIG_INVALID_THROTTLE_VALUE: { errorCategory:"CONFIG", errorCode: "INVALID_THROTTLE_VALUE", errorMessage:"[%s] is an invalid throttle-value. throttle-value must be an integer greater than 0" },
		CONFIG_UNDEFINED_THROTTLE_VALUE: { errorCategory:"CONFIG", errorCode: "UNDEFINED_THROTTLE_VALUE", errorMessage:"A queue-throttle setting must define a throttle-value" },
		CONFIG_UNDEFINED_THROTTLE_UNIT: { errorCategory:"CONFIG", errorCode: "UNDEFINED_THROTTLE_UNIT", errorMessage:"A queue-throttle setting must define a throttle-unit" },
		CONFIG_UNKNOWN_ERROR: { errorCategory:"CONFIG", errorCode: "UNKNOWN_ERROR", errorMessage:"An unknown error occurred:[%s]" },
		QUEUE_ERROR_LOADING_QUEUE_LIST: { errorCategory:"QUEUE", errorCode: "ERROR_LOADING_QUEUE_LIST", errorMessage:"Could not load list of queues - %s" },
		QUEUE_INVALID_JOB_TYPE: { errorCategory:"QUEUE", errorCode: "INVALID_JOB_TYPE", errorMessage:"Jobtype[%s] - Could not find any queue that accepts the specified jobType" },
		QUEUE_ERROR_CREATING_QUEUE: { errorCategory:"QUEUE", errorCode: "ERROR_CREATING_QUEUE", errorMessage:"Could not create queue[%s] - %s" },
		QUEUE_UNEXPECTED_RESPONSE_FROM_SERVER: { errorCategory:"QUEUE", errorCode: "UNEXPECTED_RESPONSE_FROM_SERVER", errorMessage:"Could not create queue[%s] - Response: %s" },
		QUEUE_ERROR_RECEIVING_MESSAGE: { errorCategory:"QUEUE", errorCode: "ERROR_RECEIVING_MESSAGE", errorMessage:"Could not receive message queue[%s] - Error: %s" },
		QUEUE_PUSH_NOT_INITIALIZED: { errorCategory:"QUEUE", errorCode: "PUSH_NOT_INITIALIZED", errorMessage:"Could not initialize queue" },
		QUEUE_PUSH_ERROR: { errorCategory:"QUEUE", errorCode: "PUSH_ERROR", errorMessage:"Unexpected error: %s" },
		QUEUE_VISIBILITY_TIMEOUT_NOT_INITIALIZED: { errorCategory:"QUEUE", errorCode: "VISIBILITY_TIMEOUT_NOT_INITIALIZED", errorMessage:"Could not initialize queue" },
		QUEUE_VISIBILITY_TIMEOUT_ERROR: { errorCategory:"QUEUE", errorCode: "VISIBILITY_TIMEOUT_ERROR", errorMessage:"Unexpected error: %s" },
		QUEUE_DELETE_NOT_INITIALIZED: { errorCategory:"QUEUE", errorCode: "DELETE_NOT_INITIALIZED", errorMessage:"Could not initialize queue" },
		QUEUE_DELETE_ERROR: { errorCategory:"QUEUE", errorCode: "DELETE_ERROR", errorMessage:"Unexpected error: %s" },
		QUEUE_TOO_MANY_MESSAGES: { errorCategory:"QUEUE", errorCode: "TOO_MANY_MESSAGES", errorMessage:"Too many messages" },
		QUEUE_INCOMPATIBLE_JOB_TYPES: { errorCategory:"QUEUE", errorCode: "INCOMPATIBLE_JOB_TYPES", errorMessage:"pushMany() can only be used to push messages of the same jobType" },
		QUEUE_TOO_MANY_QUEUES: { errorCategory:"QUEUE", errorCode: "TOO_MANY_QUEUES", errorMessage:"pushMany() can only be used for a jobType registered for a single queue" },
		QUEUE_BATCH_SENDING_IN_PROGRESS: { errorCategory:"QUEUE", errorCode: "BATCH_SENDING_IN_PROGRESS", errorMessage:"pushMany() already in progress for jobType[%s]. Please wait for queue-pushmany-completed event before calling pushMany() again." },
		QUEUE_QUEUE_DELETE_NOT_INITIALIZED: { errorCategory:"QUEUE", errorCode: "QUEUE_DELETE_NOT_INITIALIZED", errorMessage:"Could not initialize queue" },
		QUEUE_QUEUE_DELETE_ERROR: { errorCategory:"QUEUE", errorCode: "QUEUE_DELETE_ERROR", errorMessage:"Error trying to delete Queue[%s]: %s" },
		WORKER_UNEXPECTED_ERROR: { errorCategory:"WORKER", errorCode: "UNEXPECTED_ERROR", errorMessage:"Unexpected error occurred while calling worker.work - %s" }
	};
	
	var errorService = {};
	
	//Gets an error object based on its name
	errorService.getError = function(errName) {
		if(errors[errName]) {
			//We don't want anyone messing around with the error object
			//as this is a singleton due to require caching
			var toRet = util._extend({}, errors[errName]);
			//There is no need to pass this big object around
			//all the time
			if(debug) {
				//We don't need this to be terribly efficient since we do this
				//only in debug mode, thus we use JSON.stringify to create
				//a deep copy of the errors object
				
				//We don't want anyone messing around with our errors object 
				//as this is a singleton (due to require caching)
				toRet.errorCodes = JSON.parse(JSON.stringify(errors));
			}
			
			return toRet;
		}
		else {
			throw("Undefined error name:" + errName);
		}
	};
	
	errorService.setDebug = function(val) {
		debug = val;
	};
	
	errorService.isDebug = function() {
		return debug;
	};
	
	return errorService;
})();