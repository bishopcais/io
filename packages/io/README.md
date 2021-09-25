<p style="text-align: center"><img src="img/moon.svg" alt="drawing" width="400"/></p>


# @cisl/io

A framework for building distributed applications and the coolest of Jupiter's moons.

If coming from `@cel/io`, please see the [migration guide](migration_guide.md).

## Installation

```bash
npm install @cisl/io
```

## Usage

NodeJS
```js
const io = require('@cisl/io')();
// or through instantation of a new class
const Io = require('@cisl/io/io').Io;
const io = new Io();
```

TypeScript:
```typescript
import io from '@cisl/io';
// or through instantation of a new class
import { Io } from '@cisl/io/io';
const otherIo = new Io();
```

## Configuration

The configuration for applications using `@cisl/io` should be stored in the `cog.json` file. This is then internally stored
as a JSON object at `io.config`.

## API

### Core

The core of `Io`, which is always available consists of the following methods:

#### generateUuid(): string

This function when calls, returns a v4 uuid string with dashes.

### RabbitMQ
RabbitMQ requires the `rabbit` value to be set, where `true` will use the defaults below. Any field not set will use these defaults:
```json
{
  "rabbit": {
    "url": "localhost",
    "username": "guest",
    "password": "guest",
    "exchange": "amq.topic",
    "ca": null
  }
}
```
This configuration object has username and password in it, so please don't share it with others and don't commit it to your
repository. Your applications can only communicate with each other if they use the same configuration.

You can access the RabbitMQ CelIO object by using `io.rabbit`.

#### Usage

```typescript
// where Message is an interface from https://www.squaremobius.net/amqp.node/
interface RabbitMessage extends Omit<Message, 'content'> {
  content: Buffer | string | number | object;
  fields: MessageFields;
  properties: MessageProperties;
}

type ReplyCallback = (content: Error | Buffer | string | number | object) => void;
type RpcReplyCallback = (message: RabbitMessage, reply: ReplyCallback, awkFunc?: () => void) => void;
type PublishCallback = (message: RabbitMessage) => void;

// Publish to a RabbitMQ topic on the configured exchange
io.rabbit.publishTopic(topic: string, content: Buffer | string | number | object, options: amqplib.Options.Publish = {}): Promise<boolean>

// Listen to a topic for any new content
io.rabbit.onTopic(topic: string, handler: PublishCallback, exchange?: string): Promise<Replies.Consume>

// Publish to a RPC queue, expecting a callback through the promise
io.rabbit.publishRpc(queue_name: string, content: Buffer | string | number | object, options: amqplib.Options.Publish = {}): Promise<Response>

// Listen on a RPC queue, sending content back through handler
io.rabbit.onRpc(queue_name: string, handler: RpcReplyCallback, exclusive = true): Promise<void>

// Get a list of all queues
io.rabbit.getQueues(): Promise<unknown>

// Listen for any queue creations
io.rabbit.onQueueCreated(handler: (properties: amqplib.MessageProperties) => void): void
// Listen for any queue deletions
io.rabbit.onQueueDeleted(handler: (properties: amqplib.MessageProperties) => void): void
```

See
[amqplib](http://www.squaremobius.net/amqp.node/channel_api.html#channel_publish) for acceptable
values for the `options` argument.

#### Publishing / Receiving and Content-Types

For `publishTopic` and `publishRpc` allows taking in a variety of types, and internally parses it to
a Buffer and setting the appropriate `content-type` before sending it along RabbitMQ. For example,
calling:
```js
io.rabbit.publishTopic('test', {'test': true});
```

Will encode the JSON array into a Buffer and set the content-type appropriately to `application/json`.

Conversely, for `onTopic` and `onRpc` will attempt to parse the content off RabbitMQ using the `content-type`.
If no `content-type` is available or unrecognized, then it will return a Buffer for the content, whereas if
the `content-type` is `application/json`, then `content` will be a JSON object. See the table below for correspondence
between `content-type` and the expected type of `Response.content`.

Finally, if you wish to override the automatic content-type selection on the `publish` functions, you can pass in one in
the `options` value. Io will still handle automatic conversion
of the value into a Buffer.

| content-type             | value  |
|--------------------------|--------|
| text/string              | string |
| text/number              | number |
| application/json         | JSON   |
| application/octet-stream | Buffer |
| other                    | Buffer |


#### Content-Type

For publishing content, if a content-type is not specified and the content is not a `Buffer`, then
`Io` will assume that it can be run through `JSON.stringify` and will set the content-type to
`application/json` automatically. On receving content, if the content-type is set to `application/json`,
then `Io` will automatically run `JSON.parse` and return that content, else it will return the `Buffer`
object for the user to manually deal with.

#### Queue Names

When subscribing to events, you can include in topic name wildcards `*` and `#`.
`*` substitues one word, and `#` substitues multiple words. For example, `transcript.result.*`
subscribes to `transcript.result.final` and `transcript.result.interim`, whereas `transcript.#` subscribes
to `transcript.result.final`, `transcript.result.interim`, and `transcript.command`.

### Redis

`@cisl/io` provides a shallow wrapper around the [ioredis](https://www.npmjs.com/package/ioredis) library,
such that `io.redis` returns an instantiated and connected to `ioredis.Client` instance. See its
documentation for additional details on using it.

```json
{
  "redis": {
    "host": "localhost",
    "port": 6379,
    "db": 0
  }
}
```
The above are the defaults that will be used if any are missing. See
[ioredis#options](https://github.com/luin/ioredis/blob/HEAD/API.md#new-redisport-host-options) for
the full list of options you can use when connecting the client.

#### Usage

```javascript
io.redis;
console.log(io.redis.getBuiltinCommands());
```

### Mongo

`@cisl/io` provides a shallow wrapper around the [mongoose](https://www.npmjs.com/package/mongoose) library, along
with several useful utility functions for interacting with it.

To configure to the default setup, use `mongo: true`, or you can configure it for your needs using the following settings:
```json
{
  "mongo": {
    "host": "localhost",
    "port": 27017,
    "dbname": "cais"
  }
}
```

#### Usage

```typescript
io.mongo.mongoose: mongoose.Mongoose;
io.mongo.model<T>(name: string, schema: mongoose.Schema): Model<T>;
io.mongo.disconnect();
```

## Registering Plugins

To extend the behavior of `@cisl/io`, you can register plugins. To register a
plugin, you need to only import the file. As part of loading it, it will
register itself with `@cisl/io` and any existing `Io` instances you may have
created.

For example:

```javascript
const io = require('@cisl/io')();
require('@cisl/io-speaker');
require('@cisl/io-transcript');

io.speaker.speak(/* ... */);
io.transcript.tagChannel(/* ... */);
```

## License

[MIT License](LICENSE)

## Icon Attribution

[Moon](https://thenounproject.com/search/?q=moon&i=139166) by MarkieAnn Packer from the Noun Project
