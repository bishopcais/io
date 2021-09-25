# Migration Guide

This document serves as an upgrade guide from the older, private `@cel/io` /
`celio` library. The `@cisl/io` library features a large rewrite of the
original codebase, and improving on certain things, and making it overall
a bit more consistent on usage.

Through this document, when giving code examples for migration, we will use
`celio` to refer to an instantiated usage of `@cel/io` and `cislio` to refer
to an instantiated usage of `@cisl/io`.

## Plugins

The biggest thing is that outside of the [core functionality](README.md#Core),
everything else is a "plugin", and accessed via its own key off the primary
object. `@cisl/io` comes with three built-in plugins:

* RabbitMQ (accessed through `io.rabbit`) [README.md#rabbitmq](README.md#rabbitmq)
* Redis (accessed through `io.redis`) [README.md#redis](README.md#redis)
* MongoDB (accessed through `io.mongo`) [README.md#mongo](README.md#mongo)

Adding additional plugins is as easy as installing them through `npm` and then
loading them. See the [README.md#registering-plugins](README.md#registering-plugins)
section on additional details. You will then need to consult the
plugin's README on usage details.

## RabbitMQ

For the following sections, the available content types and what they translate to are:

```text
application/json         - json
text/string              - string
text/number              - number
application/octet-stream - buffer
```

### configuration

For configuring `@cisl/io`, it utilizes similar options as the `@cel/io` however,
you will need to rename the key in the `cog.json` file from `mq` to `rabbit`.
`@cisl/io` will recognize the older `mq` key, but it is suggested to change it. See
the README for full instructions on configuration values.

### celio.onTopic(topic, oldhandler) -> cislio.rabbit.onTopic(topic, [options,] newHandler)

`topic` is a string for the name of the queue to subscribe to and is the same
in both cases.

The `oldHandler` was a callback which had the signature: `(content: Buffer, headers: object)`
where the first argument is the payload and the second is information about the
message (which is a fusion of its fields and properties).


The `newHandler` callback looks like `(message: {content: Buffer|json|string|number, fields: object, properties: object})`.
The `content` field will be returned based on the set `content-type` of the
caller. When receiving content from `celio` then, the `content-type` will not
be set and `content` will be of type `Buffer`. When coming from `cislio`, the
`content-type` is set automatically and so then `content` will correspond to
what to send into rabbit via the `publishTopic` method. You can use the middle 
optional `[options]` argument to set a `content-type` to force, which allows
for interopability between `@cel/io` and `@cisl/io`. Once you are certain that
all incoming information is from something that utilizes `content-type` field, then
you can remove the optional `options` argument and use just `(topic, newHandler)`.
The `fields` and `properties` elements correspond to stuff you would find in
the `headers` parameter originally.

Translation would then therefore be something like this:

```javascript
celio.onTopic('example-queue', (content) => {
    const msg = JSON.parse(content.toString());
});

// translates to

cislio.rabbit.onTopic('example-queue', {contentType: 'application/json'}, (msg) => {
    const msg = message.content;
});
```

### celio.publishTopic(topic, oldContent[, options]) -> cislio.rabbit.publishTopic(topic, newContent[, options])

For both, `topic` is the string name of the queue you wish to use. For
`oldContent`, this had to be either a Buffer object or a string, with any
other value being invalid and would cause an error. `newContent` by
contrast can Buffer, string, number, or JSON object. It will automatically use
the type of `newContent` to automatically set the `contentType` option which is
then used downstream. The optional options argument in both cases is the same,
and it can be viewed at [amqplib.channel.publish](https://www.squaremobius.net/amqp.node/channel_api.html#channel_publish).
Similar to the `onTopic` method, you can force a content-type to be used for
`@cisl/io` library, but should not be necessary for normal usage.

Translation would then therefore be something like this:

```javascript
celio.publishTopic('example-queue', JSON.stringify(obj));

// translate to:

celio.publishTopic('example-queue', obj);
```

### celio.doCall(queue, oldHandler[, noAck = true[, exclusive = true]]) -> cislio.rabbit.onRpc(queue, [options,] newHandler)

Where `queue` is a string and the same in both instances. `noAck` and
`exclusive` are now properties of the `options` object, which is optional, and you
can leave out, which uses the signature of `cislio.rabbit.onRpc(queue, newHandler)`.
The `oldHandler` method had a signature of `({content, headers}, reply, ackFunc)` where
`content` is a Buffer, `reply` is a unary function, and `ackFunc` is a unary function only
defined if the `noAck` value is `false`. The `reply` function can only accept a
Buffer or string. The `newHandler` has the signature of
`({content, fields, properties}, reply, ackFunc)` where it has similar
information as the handler in `onTopic`. Similar to `onTopic`, the `content`
field in the `newReply` utilizes the `content-type` of the sender to determine
how it looks. For example, if the `content-type` is `application/json`, then
`content` will be parsed as a JSON object. You can force a particular parsing
by setting the `contentType` in the options object. Similar to `onTopic`, you
will want to set the `content-type` for maximum interopability.

Translation would then be something like:

```javascript
celio.doCall('rpc-queue', (message) => {
    const msg = JSON.parse(message.content.toString());
});

// translates to:

cislio.rabbit.onRpc('rpc-queue', {contentType: 'application/json'} (message) => {
    const msg = message.content;
})
```

### celio.call(queue, content[, options]): oldPromise -> cislio.rabbit.publishRpc(queue, content[, options]): newPromise

Where `queue` is a string that designates the name of the RPC queue. Content is
the payload where for `celio` it must be a Buffer or string and for `cislio`
it can be a Buffer, string, number, or JSON stringifiable object. Options in
both cases is the same and correspond to
[amqplib.channel.publish](https://www.squaremobius.net/amqp.node/channel_api.html#channel_publish).
The most important one here is `options.expiration` which defaults to 10 seconds,
and designates how long to wait before timing out for the function. Both functions
return a promise which is resolved when the callee of the RPC queue replies using
their `reply` function. `oldPromise` resolves with `{content, headers}` where
`content` is a Buffer and `newPromise` resolves with `{content, properties, fields}`
where `content` is based off if the caller sets an appropriate `content-type`.
Similar to the other methods, you can force a content-type by setting one in
the `options` method, which insures interopability with `@cel/io`.

The translation would be:

```javascript
celio.call('rpc-queue', JSON.stringify(obj)).then((message) => {
    const msg = JSON.parse(message.content.toString());
});

// translates to

cislio.rabbit.publishRpc('rpc-queue', obj, {contentType: 'application-json'}).then((msg) => {
    const msg = message.content;
});
```

## Redis

`@cel/io` and `@cisl/io` differ greatly in their interface to Redis. The former
utilized the `node-redis` client which offered only a callback based interface
to redis functions, and so `@cel/io` surfaced a number of custom functions
that called down to the redis functions and then returns a promise instead of
a callback. `@cisl/io` on the other hand utilizes the `ioredis` library which
natively offers promises, and so acts as a much shallower wrapper over the
redis client. What this means in practice then is that `@cel/io` will utilize
these custom functions which do not use the redis name while `@cisl/io` you do.
This then allow looking up a particular redis function as easy as looking at
the Redis [commands documentation](https://redis.io/commands).

Access to the respective modules is `celio.store` vs `cislio.redis`.

Translation though then ends up fairly straight forward. All methods return
a promise, and that promise should be the same in either case.

### configuration

For configuring `@cisl/io`, it utilizes similar options as the `@cel/io` however,
you will need to rename the key in the `cog.json` file from `store` to `redis`.
`@cisl/io` will recognize the older `store` key, but it is suggested to change it. See
the README for full instructions on configuration values.

### celio.store.addToHash(key, field, value) -> cislio.redis.hset(key, field, value)
### celio.store.getHash(key) -> cislio.redis.hgetall(key)
### celio.store.getHashField(key, field) -> cislio.redis.hget(key, field)
### celio.store.removeFromHash(key, field) -> cislio.redis.hdel(key, field)
### celio.store.addToSet(key, ...values) -> cislio.redis.sadd(key, values)
### celio.store.getSet(key) -> cislio.redis.smembers(key)
### celio.store.removeFromSet(key, val) -> cislio.redis.srem(key, val)
### celio.store.setState(key, value) -> cislio.redis.getset(key, value)
### celio.store.getState(key) -> cislio.redis.get(key)
### celio.store.del(key) -> cislio.redis.del(key)

## speaker-worker plugin

The `speaker-worker` plugin is now in a separate plugin that is installable from
`@cisl/io-speaker`. After installing it via npm, you would then add to your header:

```javascript
require('@cisl/io-speaker');
```

and then usage remains the same through `io.speaker` namespace. See
[@cisl/io-speaker](https://github.com/cislrpi/io-speaker) for more details.

## transcript-worker plugin

The `transcript-worker` plugin is now in a separate plugin that is installable from
`@cisl/io-celio-transcript`. After installing it via npm, you would then add to your header:

```javascript
require('@cisl/io-celio-transcript');
```

and then usage remains the same through `cisl.transcript` namespace. See
[@cisl/io-celio-transcript](https://github.com/cislrpi/io-celio-transcript) for more details.

## display-worker plugin

__NOTE:__ Probably not ready until moving to
[bishopcais/display-worker](https://github.com/bishopcais/display-worker).

The `display-worker` plugin is now a separate plugin that is installable from
`@cisl/io-display`. After installing it via npm, you would then add to your header:

```javascript
require('@cisl/io-display');
```

and then usage remains the same through `io.display` namespace. See
[@cisl/io-display](https://github.com/cislrpi/io-display) for more details.
