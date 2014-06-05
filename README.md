job-broker
==========
[![Build Status](https://travis-ci.org/Sently/job-broker.png?branch=master)](https://travis-ci.org/Sently/job-broker)

A nodejs job broker module that allows [AMQP](http://www.rabbitmq.com/tutorials/amqp-concepts.html) style fanout queuing to Redis or SQS. It also allows you to create workers to process jobs from queues.

```
This branch corresponds to version:
v0.1.4
```

**Note:** If the version shown above ends with -pre, then its a pre-release version, otherwise its a release version.

Opening Project in Eclipse
--------------------------
To open this project in Eclipse, you'll need [Nodeclipse and Enide](http://www.nodeclipse.org/).
```
npm install -g nodeclipse
```

Then go to the directory where you have downloaded this branch and make this an Eclipse project
```
nodeclipse -p
```

After that open your Eclipse workspace (must be a different folder than where you downloaded this branch).

* Go to File > Import > General > Existing Projects into Workspace.
* Click next
* Select this project's directory
* Select the project
* Click Finish

Installation as module in your own project
------------------------------------------
```javascript
npm install job-broker
```

Configuration Based
-------------------
job-broker is configuration based and allows you to load multiple instances of queues and workers associated with a jobType.

Queue Neutral
-------------
Comes bundled with ready-made queue modules for Redis (using RSMQ) and SQS (using AWS SDK). You can also write your own queue modules for other queues such as RabbitMQ or Azure Queue

Customizable Workers
--------------------
It is simple to write your own workers. Workers are nodejs modules and can be configured via a file. 

How to configure
----------------
You need to create a configuration file. The following snippet shows a sample
```javascript
{
	"workers": [
		{
			"job-type":"sendtweet",
			"worker": {
				"worker-module":"yourtweetworker.js",
				"worker-settings": {
					"key1":"value1",
					"key2":100
				}
			},
			"queue" : {
				"queue-module":"redisqueue",
				"queue-name":"yourqueue",
				"queue-throttle": {
					"throttle-unit":"minute",
					"throttle-value":"60"
				},
				"queue-settings": {
					"host":"127.0.0.1",
					"port":"6379",
					"ns":"rsmq",
					"polling-interval":3000,
					"invisibility-timeout":3600,
					"max-dequeue-count":3
				}
			}
		},
		{
			"job-type":"sendemail",
			"worker": {
				"worker-module":"youremailworker.js",
				"worker-settings": {
					"key1":"value1",
					"key2":100
				}
			},
			"queue" : {
				"queue-module":"sqsqueue",
				"queue-name":"yoursqsqueue",
				"queue-settings": {
					"polling-interval":20000,
					"invisibility-timeout":3600,
					"aws-config-file":"aws.json",
					"max-dequeue-count":3,
					"delete-frequency-seconds":5
				}
			}
		}
	]
}
```
The `queue-throttle` setting (optional) if included in the queue definition limits the rate at which messages are consumed from the queue and passed to a worker. This is typically useful if the worker is calling an API that limits the rate at which requests can be made to it. Many public APIs have such a rate defined. The `throttle-unit` must be either `second`, `minute`, `hour` or `day`. The `throttle-value` must be a valid integer. The rate will be limited to `throttle-value`/`throttle-unit`.

The sample above uses an SQS queue for 'sendemail' jobType, which defines an aws-config-file. This file contains your AWS settings. A sample file (aws.json in the example above) is shown below:

```javascript
{ 
	"accessKeyId": "YOUR-ACCESS-KEY-ID", 
	"secretAccessKey": "YOUR-SECRET-ACCESS-KEY-ID", 
	"region": "YOUR-REGION" 
}
```

It is also possible to configure AWS via an environment variable (comma delimited). To do this:
```
export AWS\_CONFIG=YOUR-ACCESS-KEY-ID,YOUR-SECRET-ACCESS-KEY-ID,YOUR-REGION
```
or on Windows(untested please help to verify):
```
SET AWS\_CONFIG=YOUR-ACCESS-KEY-ID,YOUR-SECRET-ACCESS-KEY-ID,YOUR-REGION
```

In the configuration shown, messages with type sendtweet will be pushed to the defined Redis queue. Messages of type sendemail will be pushed to the SQS queue.

A simple worker
---------------
The code below shows a simple asynchronous worker that just writes messages to the console.

```javascript
/* jslint node: true */
"use strict";

//Load the AbstractWorker definition
var AbstractWorker = require("job-broker").AbstractWorker;

exports.worker = function() {
	//Create instance (giving it a friendly name)
	var worker = new AbstractWorker("simpleworker");
	
	//Error codes (you should ideally define them in a module)
	//and share them across your workers for consistency
	var errorCode = {
		none: { errorCategory: "ALL", errorCode:0, errorMessage:undefined  }
	};
	
	//Initialize
	worker.init = function() {
		//the worker-settings object (defined in config)
		//is available as worker.settings.
		//If you need some settings to be defined,
		//You should call worker.requireSettings();
		//You can then access a setting A, using
		//worker.settings.A
	};
	
	//A worker must call worker.processCallback(err, message);
	//once it is done with processing a messages
	function sendCallback(message) {
		console.log("Worker[simpleworker], QueueModule[" + worker.getQueue().moduleName + "], QueueName[" + worker.getQueue().queueName + "] - Message processed:");
		console.log(JSON.stringify(message));
		var error = errorCode.none;
		
		//A custom result can also be returned via the error 
		//It will be availbale as a property of error in the
		//work-completed event.
		error.someCustomObject = { Some Object 1 }
		error.someCustomObject2 = { Some Object 2 }
		
		worker.processCallback(error, message);
	}
	
	//Process the message asynchronously
	worker.work = function(message) {
		//A worker can access the queue it is working on:
		//var queue = worker.getQueue();
		
		//A worker can access the broker it is associated with:
		//var broker = worker.getBroker();
		
		//Errors should follow the format shown above.
			
		console.log("Worker[simpleworker], QueueModule[" + worker.getQueue().moduleName + "], QueueName[" + worker.getQueue().queueName + "] - Work called for message:");
		console.log(JSON.stringify(message));
		//You would invoke you asynchronous function here
		setTimeout(function() { sendCallback(message) }, 0);
	};
	
	return worker;
};
```

Configuration Constraints
-------------------------
- One job type can be pushed to multiple queues (SQS or Redis), just add same jobType in the array more than once.
  * `JobType1`, `Worker-Any`, `Q1`
  * `JobType1`, `Worker-Any`, `Q2`

In the example above, message with job-type `JobType1` will be pushed to both `Q1` and `Q2`. `Q1` and `Q2` can be either Redis or SQS queues.
- A particular queue (with specified type Redis/SQS and name queue-name) can only be associated with one `jobType`. The reason why this is disallowed is because if `W1` already processed the message from `Q1`, `W2` would never get the message. Similarly if `W2` processed the message, `W1` would never get the message. Since Node is not multi-threaded, such a configuration does not make sense.
i.e.
  * `JobType-Any`, `Worker-Any`, `Q1`
  * `JobType-Any`, `Worker-Any`, `Q1`

is not allowed
- Queue names can be 1-15 characters in length and must only consist of `[a-z0-9]` case insensitive.

Flow of message processing
--------------------------
1. Broker registers to be notified when the queue has messages to process.
2. When broker gets notified of a new message, then:
  * Broker sets the visibility timeout of the message as specified in the config
  * During invisibility timeout, the same message will not be notified to any queue listener
  * The broker passes the message to a worker
  * Once the workers callback that the message is processed, broker deletes the message
  * If workers fail, the message will be notified to the broker again after the invisibility timeout

Structure of a message
----------------------
```javascript
{
	id: String
	jobType: String
	payload: Object
}
```

The `id` of the message is not specified when it is pushed to the queue. After the object is successfully pushed to the queue, the message returned in the `queue-success` event will have the `id` populated.

The `id` will also be populated when messages are read from the queue and processed by workers.

Broker Interface
----------------
The broker provides the following functions:

1. `push(message)` - This pushes the message to one or more queues depending on `jobType` specified in the message.
2. `pushMany(messages)` - This pushes an array of messages to a single queue. All the messages in the array must have one `jobType` and that `jobType` must correspond to a single queue. This method can only be invoked once. The invoker must listen for the `queue-pushmany-completed` event before pushing the next set of messages.
3. `schedule(message, when)` - This pushes a message to one or more queues, but messages will only be processed after the delay (in seconds) specified by `when`. The delay is counted from the present time.
4. `connect(doNotCreateMissingQueue)` - This is the first function that should be called by a script using the broker. This call will result in a `queue-ready` event once a particular queue is ready. The optional parameter `doNotCreateMissingQueue` if set to true will result in avoiding the creation of any queue that does not already exist (normally queues are created if they don't exist). A result object is passed as an argument for the `queue-ready` event. The object contains worker and queue as properties. A script using the broker can then ask the queue to start listening for messages by calling `result.queue.start()`. If called with `doNotCreateMissingQueue` set to true, when a queue is not found, the `queue-deleted-queue` event will be emitted for that queue (instead of `queue-ready`).
5. `stop()` - This stops the message processing cycle for all queues.
6. `hasQueue(jobType)` - This function synchronously returns true if there exists a queue registered with the broker for the specified jobType 

Queue Interface
---------------
Since the broker usually pushes messages to a queue, the queue interface is very similar to the Broker Interface. The only functions that are present in the queue and not in the Broker Interface are:

1. `setInvisibilityTimeout(message, when)` - This function tells the queue that the specified message should not be made available to any other worker until `when` seconds have elapsed.
2. `deleteQueue()` - Assuming a queue is initialised, a call to this function will delete the queue. If the queue was being polled (by using `queue.start()`), the polling will stop. If all queues are stopped, the broker will stop too (`broker-stopped` wil be emitted). Calling any function on a deleted queue will result in an error.

Broker Events
-------------
A script using the broker can register for certain events. The following is a list of events raised by the broker:
* `queue-ready` - This event is raised when the queue is ready to start processing messages. The `worker` and `queue` are passed in this event (in that order), thus the script using the broker can call `queue.start()` to start listening for messages.
* `queue-started` - This event is raised when the queue has started listening for messages. The `worker` and `queue` are passed as arguments (in that order).
* `queue-stopped` - This event is raised when a queue has stopped listening for messages. The `worker` and the `queue` are passed as arguments (in that order).
* `queue-error` - This event is raised when there is an error as a result of a queue operation
* `queue-success` - This event is raised when a message was successfully queued. Please note that if a `jobType` has multiple queues registered, then this event will be raised multiple times (one time per queue)
* `work-completed` - This event is raised when a consumer signals that it is done processing the message
* `work-error` - This event is raised when a consumer signals that it failed in processing the message
* `queue-deleted` - This event is raised after a message is deleted
* `queue-deleted-queue` - After a call to `queue.deleteQueue()`. This event is raised when the queue is successfully deleted
* `queue-poison` - This event is raised when a message that has been dequeued too many times is automatically deleted
* `queue-pushmany-completed` - This event signals that the `pushMany` call has completed and the script that is using the broker can now push another batch of messages. A report on the messages that were pushed to the queue is passed through this event. The structure of the report is documented next.
* `broker-initialized` - After a call to `broker.connect()`. This event is raised when all the queues registered with the broker initialised.
* `broker-started` - This event is raised when all the queues that are registered with the broker are now listening for messages. Queues should be started when the `queue-ready` event is raised.
* `broker-stopped` - After a call to `broker.stop()`. This event is raised when all the queues that were listening for messages are no longer listening for messages.
* `config-loaded` - When the broker is loaded without a config file (with dynamic configuration), this event is emitted after the config has been loaded.


Structure of a broker event notification
----------------------------------------
```javascript
{
	"worker":{ The worker object },
	"queue":{ The queue object },
	"error": {
		"errorCode":"ERRORCODE",
		"errorCategory":"CATEGORY"
		"errorMessage":"There was an error queuing the message"
		"queueError":{ Object with a queue specific error if any, if category is "QUEUE" }
		"workerError":{ Object with a worker specific error if any, if category is "WORKER" }
	}
	"report"://Only for push-many-completed
}
```

Example:
--------
```
broker.on("queue-received", function(notification, message) {
	//Notification contains the structure shown above
	//Message is the message being processed (if available)
	//The events queue-ready, queue-started, queue-deleted-queue and 
	//queue-pushmany-completed do not pass a message and pass only
	//The notification structure shown above. For queue-pushmany-completed
	//An additional report parameter is passed which is documented
	//below
});
```

This does not apply to these events: `broker-initialized`, `broker-started`, `broker-stopped` and `config-loaded` as these events are aggregate events and do not correspond to any particular (worker, queue) pair.

Structure of the report object resulting from a pushMany call
-------------------------------------------------------------
After a pushMany call finishes, the `queue-pushmany-completed` event is raised which passes a `report` object indicating the status of individual messages. The structure of the `report` object is shown below:
```javascript
{
	successes:[
		{
			id:"id of the first message pushed",
			jobType:"sendemail",
			payload:{ your fancy payload object }
		},
		{
			id:"id of the second message pushed",
			jobType:"sendemail",
			payload:{ your fancy payload object }
		}
	],
	failures:[
		{
			message: {
				jobType:"sendemail",
				payload:{ your fancy payload object of the third message that failed }
			},
			error: {
				errorCode:"PUSH_ERROR",
				errorCategory:"QUEUE",
				errorMessage:"Unexpected error: Some error message",
				queueError: { Queue specific error. See sqsqueue.js and redisqueue.js }
			}
		}
	]
}
```

Sample code that listens for messages
-------------------------------------
Please see the file:
`test/spec/brokerinterface.spec.js`

Pushing messages in batches
---------------------------
Please see the file:
`test/spec/producerconsumer.spec.js`

Dynamic Configuration
---------------------
Please see the file:
`test/spec/dynamic.spec.js`

Producer only configuration
---------------------------
It is a common use case for a Nodejs webapp or REST API to be producing messages and another Nodejs app to be consuming and processing them. In such a case, a worker definition is not required for the API/Web app since it will not be consuming messages. For example, in the configuration defined in the examples so far, if the sendemail message was being produced by a web app, then the web app should define the worker module as noworker. This configuration is shown below:
```javascript
{
	"workers": [
		{
			"job-type":"sendtweet",
			"worker": {
				"worker-module":"noworker"
			},
			"queue" : {
				"queue-module":"redisqueue",
				"queue-name":"yourqueue",
				"queue-settings": {
					"host":"127.0.0.1",
					"port":"6379",
					"ns":"rsmq",
					"polling-interval":3000,
					"invisibility-timeout":3600,
					"max-dequeue-count":3
				}
			}
		},
		{
			"job-type":"sendemail",
			"worker": {
				"worker-module":"noworker"
			},
			"queue" : {
				"queue-module":"sqsqueue",
				"queue-name":"yoursqsqueue",
				"queue-settings": {
					"polling-interval":20000,
					"invisibility-timeout":3600,
					"aws-config-file":"aws.json",
					"max-dequeue-count":3,
					"delete-frequency-seconds":5
				}
			}
		}
	]
}
```

Thus, the web app/REST API shall only produce the messages and push them to the appropriate queues. The consumer Nodejs app will have the full configuration with a proper worker module defined which will do the actual work.


Unit Tests
----------
The project defines some unit tests (jasmine) that can be executed via grunt (linting, tests related to configuration errors, basic tests for broker using Redis and SQS).

For SQS, the tests will only work on Travis. This is because, we use an encrypted environment variable for the settings and there is no settings file for AWS in github. To run the tests locally, create a local aws.json file and add its absolute path to tests/files/badconfig/good-aws.json. When you do this, the SQS tests will run locally too.

Please help improve this module by adding more unit tests.

Release Process (from master)
-----------------------------
- Change the version in this README.md file (removing the -pre part)
- Change the version in package.json
- Add any changes in the release to CHANGELOG.md
- Commit your changes with a message PRE-RELEASE:v0.0.7
- After build is complete (and is a success), create a new branch (from master) with release version example v0.0.7
- Clone the version branch, example v0.0.7 to your local computer (in a separate directory)
- In the cloned branch, add the last build log as release-build-log.txt, and remove the build status indicator from README.md
- Commit changes to the cloned branch with the message RELEASE:v0.0.7 and push to remote v0.0.7
- Go back to you master branch (in your original folder)
- Change README.md and package.json to new version v0.0.8-pre (with pre tag)
- Commit your master changes with a message START-RELEASE:v0.0.8
- Push your changes up to master

Performance
-----------
This code has been tested using Elasticache and SQS.
- Elasticache (Redis): Same zone on AWS with a memory optimized instance. 100k messages which result in a worker making an HTTP call to a server were processed in under 5 mins.
- SQS: Same zone on AWS with a memory optimized instance. 100k messages which result in a worker making an HTTP call to a server were processed in under 20 mins.
- Memory footprint is under 150MB for processing 100k messages.