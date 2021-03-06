v0.0.8
------
- Added new feature to throttle processing messages from a queue
- Added unit tests for throttling
- Added unit test for calling broker.push for an undefined jobType

v0.0.7
------
- Added more unit tests that test both SQS and Redis
- Standardised error names
- Unit tests cleanup (delete the random queue created) on exit
- Refactored worker and queue interfaces to be similar
- Documented the module a little more

v0.1.0
------
- Options for redis initialization can be specified in the config file see: https://github.com/mranney/node_redis#rediscreateclientport-host-options

v0.1.1
------
- Proper handling of deleted queues. If a queue is deleted, its polling will automatically shutdown on all servers where the queue was being polled
- Added support for programmatically configuring the broker

v0.1.2
------
- More unit tests
- Ability to attempt to initialise a queue without creating a new one if it doesn't exist
- Method to check if a queue exists for a particular jobType

v0.1.3, v0.1.4, v0.1.5
----------------------
- Maintainence Releases (contain some bug fixes related to v0.1.1 and v0.1.2 after manual testing) 

v0.1.6
------
- Close Redis connections on queue stop (for Redis Queue)

v0.1.7
------
- Maintainence Releases (close Redis connection on queue delete) 

v0.1.8
------
- Ability to define an external throttling object