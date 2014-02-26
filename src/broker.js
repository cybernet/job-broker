var path = require("path");

var JobBroker = function(debug) {
	//We'll load the error codes from the file into this
	var errorCodes = require(path.join(__dirname, "/errors.js")).errors;
	
	//Let's set debug if required
	if(debug) {
		errorCodes.setDebug(debug);
	}
	
	this.load = function(file, callBack) {
		//Create closure and execute it asynchronously
		setTimeout(function() {
			//Keep locally in closure
			var configFile = file;
		
			var callback = callBack;
			
			try
			{
				//Require the nconf module
				var config = require('nconf');
				
				//Require the util module
				var util = require('util');

				//Load the configuration
				var configPath;
				
				//Check if absolute or relative path
				if(
						configFile && configFile.length && (
							//Mac/Linux etc
							configFile.charAt(0) === '/' ||
							//Windows
							(configFile.length>2 && configFile.charAt(1) === ':')
						)
				)
				{
					configPath = configFile;
				}
				else {
					configPath = path.join(__dirname, "../../../" + configFile);
				}
			
				//Load the checker module
				var CheckerClass = require(path.join(__dirname, "/configerrorchecker.js")).checker;
				var checker = new CheckerClass(callBack, configPath);

				//Check for file not found error
				if(checker.checkFileExistsError()) {
					return;
				}

				//Check if we could load the JSON
				if(checker.checkJsonLoadingError(config, configPath)) {
					return;
				}
			
				//The actual broker module
				var broker = require(path.join(__dirname, "brokers/default-broker.js")).broker();
				
				//Let's load the workers
				var workerObjs = config.get("workers");
			
				//Check that there is at least one worker definition
				if(checker.checkWorkersNode(workerObjs)) {
					return;
				}
			
				//Counter to iterate through workers etc.
				var i;
			
				//Variable to keep a loaded worker config
				var workerConfig;
			
				//Go through all the workers
				for(i=0; i<workerObjs.length; i++) {
					workerConfig = workerObjs[i];
				
					//Check that job-type is defined
					if(checker.checkJobType(workerConfig, i)) {
						return;
					}
				
					//Store the job type
					var jobType = workerConfig["job-type"];
				
					//Worker node must exist
					if(checker.checkWorkerNode(workerConfig, i)) {
						return;
					}
				
					//Get the node
					var workerObj = workerConfig.worker;
				
					//worker-module must exist
					if(checker.checkWorkerModule(workerObj, i)) {
						return;
					}
				
					//Get the module name
					var workerModuleName = workerObj["worker-module"];
				
					//Object to load worker in
					var workerCheck = { workerModule:undefined };
				
					//Check if worker module can be loaded and initialized
					if(checker.checkLoadWorkerModule(workerObj, i, workerCheck)) {
						return;
					}
				
					//The module itself
					var workerModule = workerCheck.workerModule;
				
					//Queue node must exist
					if(checker.checkQueueNode(workerConfig, i)) {
						return;
					}
				
					//Store it
					var queueObj = workerConfig.queue;
				
					//It must comtain a queue-module node
					if(checker.checkQueueModule(queueObj, i)) {
						return;
					}
				
					//It must also have a queue name
					if(checker.checkQueueName(queueObj, i)) {
						return;
					}
					
					//If throttling is defined, check its config
					if(checker.checkQueueThrottle(queueObj, i)) {
						return;
					}
				
					//Store the queue name
					var queueName = queueObj["queue-name"];
				
					//Standardise queue names to lower case
					queueName = queueName.toLowerCase().trim();
				
					//Store the queue module name
					var queueModuleName = queueObj["queue-module"];
				
					var checkerq = { queueModule: undefined };
				
					//Check if we can load the queue module
					if(checker.checkLoadQueueModule(queueObj, i, checkerq)) {
						return true;
					}
				
					var queueModule = checkerq.queueModule;
				
					//We now have the worker module and the queuemodule loaded
					//Let's add some meta data:
					
					//This is the index of the (queue, worker) pair in the config file
					workerModule.jobType = jobType;
					queueModule.jobType = jobType;
					
					
					if(checker.checkQueueConstraint(queueModuleName, queueName)) {
						return true;
					}
				
					//Register this stuff with the broker
					broker.register(jobType, workerModule, queueModule);
				}

				//We don't need the checker anymore
				checker = null;
				
				//Success
				var resultObj = errorCodes.getError("none");
				if(callback) {
					callback(resultObj, broker);
				}
			}
			catch(err) {
				var resultObj;
				resultObj = errorCodes.getError("CONFIG_UNKNOWN_ERROR");
				resultObj.errorMessage = util.format(resultObj.errorMessage, err);
				resultObj.configError = err;
				if(callback) {
					callback(resultObj);
				}
			}
		}, 0); //settimeout
	}; //end load function
};

module.exports = {
	JobBroker:JobBroker,
	AbstractQueue:require(path.join(__dirname, "queues/abstractqueue.js")),
	AbstractWorker:require(path.join(__dirname, "workers/abstractworker.js"))
};