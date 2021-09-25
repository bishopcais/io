# Changelog

## v1.3.0

* Bump amqplib to ^0.8.0
* Fix rabbit.publishRpc returning void instead of RabbitMessage if replyTo was disabled.
  It now returns an empty RabbitMessage to keep return signature consistent.

## v1.2.1

* Update minimum supported version of mongoose to ^5.11 for builtin typescript definitions

## v1.2.0

* Replace request dependency with node-fetch

## v1.1.0

* Add onQueue method for listening to regular queues
* Make possible to set replyTo field for options to publishRpc

## v1.0.0

* Initial Release
