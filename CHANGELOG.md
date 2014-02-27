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