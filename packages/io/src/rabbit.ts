import fs from 'fs';
import fetch from 'node-fetch';
import amqplib, { Replies } from 'amqplib';
import { Options as ConnectOptions } from 'amqplib/properties';

import Io from './io';
import { TLSSocketOptions } from 'tls';

import { RabbitMessage, RabbitOptions, RabbitOnTopicOptions, RabbitOnRpcOptions, RabbitOnQueueOptions, RabbitContentType } from './types';

import type Bluebird from 'bluebird';

interface Subscription extends amqplib.Replies.Consume {
  unsubscribe: () => void;
}

type ReplyCallback = (content: Error | RabbitContentType) => void;
type RpcReplyCallback = (message: RabbitMessage, reply: ReplyCallback, awkFunc: (() => void) | undefined | Error, err?: Error | undefined) => void;
type PublishCallback = (message: RabbitMessage, err: Error | undefined) => void;
type QueueCallback = (message: RabbitMessage, err?: Error | undefined) => void;

interface QueueState {
  name: string;
  state: string;
}

/**
 * Class representing the RabbitManager object.
 */
export class Rabbit {
  public options: RabbitOptions;

  private conn: amqplib.Connection | null;

  private pch: Bluebird<amqplib.Channel>;

  private mgmturl: string;

  private vhost: string;

  private prefix?: string;

  private exchange: string;

  private io: Io;

  public constructor(io: Io) {
    io.config.defaults({
      rabbit: {
        username: 'guest',
        password: 'guest',
        exchange: 'amq.topic',
        vhost: '/',
        hostname: 'localhost',
      },
    });

    this.options = io.config.get<RabbitOptions>('rabbit');

    if (this.options.url) {
      let url = this.options.url.replace(/^amqps?:\/\//, '');
      const sepPos = url.lastIndexOf('/');
      if (sepPos > -1) {
        this.options.vhost = url.substring(sepPos + 1);
        url = url.substring(0, sepPos);
      }
      const [hostname, port] = url.split(':', 2);
      this.options.hostname = hostname;
      if (port) {
        this.options.port = parseInt(port);
      }
    }

    const connect_obj: ConnectOptions.Connect = {
      protocol: 'amqp',
      hostname: this.options.hostname,
      username: this.options.username,
      password: this.options.password,
      vhost: this.options.vhost,
    };

    if (this.options.port) {
      connect_obj.port = this.options.port;
    }

    const connect_options: TLSSocketOptions = {};
    if (this.options.tls === true || this.options.ssl === true) {
      if (!this.options.cert && !this.options.key && !this.options.ca) {
        throw new Error('Missing arguments for using SSL for RabbitMQ');
      }

      connect_obj.protocol = 'amqps';
      if (this.options.cert) {
        connect_options.cert = fs.readFileSync(this.options.cert);
      }
      if (this.options.key) {
        connect_options.key = fs.readFileSync(this.options.key);
      }
      if (this.options.ca) {
        connect_options.ca = [fs.readFileSync(this.options.ca)];
      }

      if (this.options.passphrase) {
        connect_options.passphrase = this.options.passphrase;
      }
    }

    this.conn = null;
    const pconn = amqplib.connect(connect_obj, connect_options);
    pconn.then((conn) => {
      this.conn = conn;
    });
    pconn.catch((err): void => {
      console.error(`RabbitMQ error: ${err}`);
      console.error(`Connection to the rabbitmq root vhost failed. Please make sure that your user ${this.options.username} can access the root vhost!`);
      process.exit(1);
    });

    // Make a shared channel for publishing and subscribe
    this.pch = pconn.then((conn: amqplib.Connection) => conn.createChannel());
    this.mgmturl = `http://${this.options.username}:${this.options.password}@${this.options.hostname}:15672/api`;
    this.vhost = this.options.vhost === '/' ? '%2f' : (this.options.vhost || '');
    this.prefix = this.options.prefix;
    this.exchange = io.config.get<string>('rabbit:exchange');
    this.io = io;
  }

  public close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.conn) {
        return resolve();
      }
      this.conn.close().then(() => {
        resolve();
      });
    });
  }

  private resolveTopicName(topic_name: string): string {
    if (this.prefix) {
      topic_name = `${this.prefix}.${topic_name}`;
    }
    return topic_name;
  }

  private parseContent(content: Buffer, content_type?: string): RabbitContentType {
    let final_content: RabbitContentType = content;
    if (content_type === 'application/json') {
      final_content = JSON.parse(content.toString());
    }
    else if (content_type === 'text/string') {
      final_content = content.toString();
    }
    else if (content_type === 'text/number') {
      final_content = parseFloat(content.toString());
    }
    return final_content;
  }

  private getContentType(content: RabbitContentType): string {
    if (Buffer.isBuffer(content)) {
      return 'application/octet-stream';
    }
    else if (typeof content === 'number') {
      return 'text/number';
    }
    else if (typeof content === 'string') {
      return 'text/string';
    }

    return 'application/json';

  }

  private encodeContent(content: RabbitContentType): Buffer {
    if (Buffer.isBuffer(content)) {
      return content;
    }

    let string_content = '';
    if (typeof content === 'string') {
      string_content = content;
    }
    else if (typeof content === 'number') {
      string_content = content.toString();
    }
    else {
      string_content = JSON.stringify(content);
    }
    return Buffer.from(string_content);
  }

  /**
   * Publish a message to the specified topic.
   * @param  {string} topic - The routing key for the message.
   * @param  {Buffer | String} content - The message to publish.
   * @param  {Object} [options] - Publishing options. Leaving it undefined is fine.
   * @return {void}
   */
  public async publishTopic(topic: string, content: RabbitContentType = Buffer.from(''), options: amqplib.Options.Publish = {}): Promise<boolean> {
    const encodedContent = this.encodeContent(content);
    options.contentType = options.contentType || this.getContentType(content);
    const channel = await this.pch;
    await channel.checkExchange(this.exchange);
    return channel.publish(this.exchange, topic, encodedContent, options);
  }

  public async onTopic(topic: string, handler: PublishCallback): Promise<Replies.Consume>;
  public async onTopic(topic: string, options: RabbitOnTopicOptions, handler: PublishCallback): Promise<Replies.Consume>;
  /**
   * Subscribe to a topic.
   * @param  {string} topic - The topic to subscribe to. Should be of a form 'tag1.tag2...'. Supports wildcard.
   * For more information, refer to the [Rabbitmq tutorial](https://www.rabbitmq.com/tutorials/tutorial-five-javascript.html).
   * @param {subscriptionCallback} handler - The callback function to process the messages from the topic.
   * @param {object} options options to use for the channel
   * @return {Promise} A subscription object which can be used to unsubscribe by calling
   * promise.then(subscription=>subscription.unsubscribe())
   */
  public onTopic(topic: string, options: RabbitOnTopicOptions|PublishCallback, handler?: PublishCallback): Promise<Replies.Consume> {
    if (!handler && typeof options === 'function') {
      return this._onTopic(topic, {}, options);
    }
    else if (handler) {
      return this._onTopic(topic, options as RabbitOnTopicOptions, handler);
    }
    throw new Error('Invalid type signature');
  }

  private async _onTopic(topic: string, options: RabbitOnTopicOptions, handler: PublishCallback): Promise<Replies.Consume> {
    topic = this.resolveTopicName(topic);

    const channel_options = {exclusive: true, autoDelete: true};
    const channel = await this.pch;
    await channel.checkExchange(this.exchange);
    const queue = await channel.assertQueue('', channel_options);
    await channel.bindQueue(queue.queue, options.exchange || this.exchange, topic);
    return channel.consume(queue.queue, (msg): void => {
      if (msg !== null) {
        let err;
        try {
          (msg as RabbitMessage).content = this.parseContent(msg.content, options.contentType || msg.properties.contentType);
        }
        catch (exc) {
          err = exc as Error;
        }
        handler((msg as RabbitMessage), err);
      }
    }, {noAck: true}).then((consume: amqplib.Replies.Consume): Subscription => {
      return Object.assign(
        consume,
        {
          unsubscribe: () => {
            return channel.cancel(consume.consumerTag);
          },
        },
      );
    });
  }

  /**
   * Make remote procedural call (RPC).
   *
   * If options.replyTo is defined, then the promise here will return void immediately after the call is dispatched. This function will also
   * not issue a timeout error under any conditions.
   */
  public async publishRpc(queueName: string, content: RabbitContentType = Buffer.from(''), options: amqplib.Options.Publish = {}): Promise<RabbitMessage> {
    let consumerTag: string;
    const channel = await this.pch;
    const replyTo = options.replyTo;
    const contentType = options.contentType || null;

    options.correlationId = options.correlationId || this.io.generateUuid();
    options.expiration = options.expiration || 3000;
    options.contentType = options.contentType || this.getContentType(content);

    // not defining this queue, even if we don't use it causes the replyTo field to not
    // receive anything, todo: figure out why
    const queue = await channel.assertQueue('', {exclusive: true, autoDelete: true});
    if (!options.replyTo) {
      options.replyTo = queue.queue;
    }

    return new Promise((resolve, reject): void => {
      let timeoutId: NodeJS.Timeout;
      // Time out the response when the caller has been waiting for too long
      if (!replyTo) {
        if (typeof options.expiration === 'number') {
          timeoutId = setTimeout((): void => {
            if (consumerTag) {
              channel.cancel(consumerTag);
            }
            reject(new Error(`Request timed out after ${options.expiration} ms.`));
          }, options.expiration + 100);
        }

        channel.consume((options.replyTo as string), async (msg) => {
          if (msg !== null) {
            if (msg.properties.correlationId === options.correlationId) {
              clearTimeout(timeoutId);
              if (consumerTag) {
                await channel.cancel(consumerTag);
              }

              if (msg.properties.headers.error) {
                reject(new Error(msg.properties.headers.error));
              }
              else {
                (msg as RabbitMessage).content = this.parseContent(msg.content, contentType || msg.properties.contentType);
                resolve((msg as RabbitMessage));
              }
            }
            else {
              reject(new Error('null response for call'));
            }
          }
        }, { noAck: true}).then((reply) => {
          consumerTag = reply.consumerTag;
        });
      }

      channel.sendToQueue(queueName, this.encodeContent(content), options);
      if (replyTo) {
        resolve({
          content: null,
          fields: {
            deliveryTag: 0,
            redelivered: false,
            exchange: this.exchange,
            routingKey: queue.queue,
          },
          properties: {
            contentType: null,
            contentEncoding: null,
            headers: {},
            deliveryMode: null,
            priority: 0,
            correlationId: options.correlationId,
            replyTo: options.replyTo,
            expiration: 0,
            timestamp: 0,
            messageId: null,
            type: null,
            userId: null,
            appId: null,
            clusterId: null,
          },
        });
      }
    });
  }

  public async onRpc(queueName: string, handler: RpcReplyCallback): Promise<void>;
  public async onRpc(queueName: string, options: RabbitOnRpcOptions, handler: RpcReplyCallback): Promise<void>;
  public onRpc(queueName: string, options: RabbitOnRpcOptions|RpcReplyCallback, handler?: RpcReplyCallback): Promise<void> {
    if (!handler && typeof options === 'function') {
      return this._onRpc(queueName, {}, options);
    }
    else if (handler) {
      return this._onRpc(queueName, options as RabbitOnRpcOptions, handler);
    }
    throw new Error('Invalid type signature');
  }

  /**
   * Receive RPCs from a queue and handle them.
   */
  public async _onRpc(queueName: string, options: RabbitOnRpcOptions, handler: RpcReplyCallback): Promise<void> {
    const channel = await this.pch;
    const noAck = handler.length < 3;
    channel.prefetch(1);
    const queue = await channel.assertQueue(queueName, {exclusive: options.exclusive || true, autoDelete: true});
    await channel.consume(queue.queue, (msg: amqplib.ConsumeMessage | null) => {
      let replyCount = 0;
      if (msg === null) {
        throw new Error('Request for onRpc was null');
      }

      const reply: ReplyCallback = (response: Error | RabbitContentType): void => {
        if (replyCount >= 1) {
          throw new Error('Replied more than once.');
        }
        replyCount++;
        if (msg !== null) {
          if (response instanceof Error) {
            channel.sendToQueue(
              msg.properties.replyTo,
              Buffer.from(response.message),
              {
                correlationId: msg.properties.correlationId,
                headers: { error: response.message },
              },
            );
          }
          else {
            const publishOptions: amqplib.Options.Publish = {
              correlationId: msg.properties.correlationId,
            };
            const encodedContent = this.encodeContent(response);
            publishOptions.contentType = options.contentType || this.getContentType(response);
            channel.sendToQueue(msg.properties.replyTo, encodedContent, publishOptions);
          }
        }
      };

      const ackFunc = noAck ? undefined : (): void => {
        channel.ack(msg);
      };
      let err;
      try {
        (msg as RabbitMessage).content = this.parseContent(msg.content, options.contentType || msg.properties.contentType);
      }
      catch (exc) {
        err = exc as Error;
      }

      if (ackFunc) {
        handler((msg as RabbitMessage), reply, ackFunc, err);
      }
      else {
        handler((msg as RabbitMessage), reply, err);
      }
    }, { noAck });
  }

  public onQueue(queueName: string, handler: QueueCallback): Promise<void>;
  public onQueue(queueName: string, options: RabbitOnQueueOptions, handler: QueueCallback): Promise<void>;
  public onQueue(queueName: string, options: RabbitOnQueueOptions|QueueCallback, handler?: QueueCallback): Promise<void> {
    if (!handler && typeof options === 'function') {
      return this._onQueue(queueName, {}, options);
    }
    else if (handler) {
      return this._onQueue(queueName, options as RabbitOnQueueOptions, handler);
    }
    throw new Error('Invalid type signature');
  }

  public async _onQueue(queueName: string, options: RabbitOnQueueOptions, handler: QueueCallback): Promise<void> {
    const channel = await this.pch;
    options.durable = options.durable || false;
    await channel.assertQueue(queueName, options);
    channel.consume(queueName, (msg): void => {
      if (msg === null) {
        throw new Error('msg in onQueue is null');
      }
      let err;
      try {
        (msg as RabbitMessage).content = this.parseContent(msg.content, options.contentType || msg.properties.contentType);
      }
      catch (exc) {
        err = exc as Error;
      }
      handler(msg, err);
    }, {noAck: true});
  }

  /**
   * Get a list of queues declared in the rabbitmq server.
   * @return {Promise}
   */
  public async getQueues(): Promise<QueueState[]> {
    const req = await fetch(`${this.mgmturl}/queues/${this.vhost}?columns=state,name`);
    const json = await req.json();
    return json;
  }

  /**
   * Subscribe to queue creation events
   * @param  {queueEventCallback} handler - Callback to handle the event.
   */
  public onQueueCreated(handler: (queue_name: string, properties: amqplib.MessageProperties) => void): void {
    this.onTopic('queue.created', {exchange: 'amq.rabbitmq.event'}, (message): void => {
      handler(message.properties.headers.name, message.properties);
    });
  }

  /**
   * Subscribe to queue deletion events
   * @param  {queueEventCallback} handler - Callback to handle the event.
   */
  public onQueueDeleted(handler: (queue_name: string, properties: amqplib.MessageProperties) => void): void {
    this.onTopic('queue.deleted', {exchange: 'amq.rabbitmq.event'}, (message): void => {
      handler(message.properties.headers.name, message.properties);
    });
  }
}

export default Rabbit;
