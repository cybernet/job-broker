var path = require("path");

var JobBroker = function(debug) {
	//We'll load the error codes from the file into this
	var errorCodes = require(path.join(__dirname, "/errors.js")).errors;
	
	//Let's set debug if required
	if(debug) {
		errorCodes.setDebug(debug);
	}
	
	function isFunction(functionToCheck) {
		var getType = {};
		return functionToCheck && getType.toString.call(functionToCheck) === '[object Function]';
	}
	
	this.load = function(file, callBack) {
		//Create closure and execute it asynchronously
		setTimeout(function() {
			//The actual broker module
			var broker = require(path.join(__dirname, "brokers/default-broker.js")).broker();
			
			if(isFunction(file) && !callBack) {
				//Someone wants the naked broker
				var resultObj = errorCodes.getError("none");
				file(resultObj, broker);
				return;
			}
			
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
				
				//Let's load the workers
				var workerObjs = config.get("workers");
			
				broker.addModules({ workers:workerObjs }, callBack);
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