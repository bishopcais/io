import fs from 'fs';
import fetch from 'node-fetch';
import amqplib, { Replies } from 'amqplib';
import { Options as ConnectOptions } from 'amqplib/properties';

import { Io } from './io';
import { TLSSocketOptions } from 'tls';

import {
  RabbitMessage,
  RabbitOptions,
  RabbitOnTopicOptions,
  RabbitOnRpcOptions,
  RabbitOnQueueOptions,
  RabbitContentType,
} from './types';

import type Bluebird from 'bluebird';

export interface Subscription extends amqplib.Replies.Consume {
  unsubscribe: () => void;
}

export type ReplyCallback<T = RabbitContentType> = (content: Error | T) => void;
export type RpcReplyCallback<T> = (
  message: RabbitMessage<T>,
  reply: ReplyCallback,
  awkFunc: (() => void) | undefined | Error,
  err?: Error | undefined,
) => void;
export type PublishCallback<T> = (
  message: RabbitMessage<T>,
  err: Error | undefined,
) => void;
export type QueueCallback = (
  message: RabbitMessage,
  err?: Error | undefined,
) => void;

export interface QueueState {
  name: string;
  state: string;
}

/**
 * Class representing the Rabbit module
 */
export class Rabbit {
  /**
   * Options that RabbitMQ connection was instantiated with.
   */
  public options: RabbitOptions;

  private conn: amqplib.Connection | null;

  private pch: Bluebird<amqplib.Channel>;

  private mgmturl: string;

  private vhost: string;

  private prefix?: string;

  private exchange: string;

  private io: Io;

  private timeout = 30000;

  /**
   * Rabbit constructor.
   *
   * This will be automatically called as part of the Io constructor if rabbit is enabled.
   * The following options may be configured for Rabbit, as defined within the cog.json. The
   * default values are shown below:
   *
   * ```json
   * {
   *   "url": "localhost",
   *   "username": "guest",
   *   "password": "guest",
   *   "exchange": "amq.topic",
   *   "vhost": "/",
   * }
   * ```
   *
   * If you wish to enable SSL for communication, you will need to set `ssl` to true, and then point
   * the following keys at the appropriate file paths:
   *
   * * ca
   * * cert
   * * key
   *
   * and optionally define a `passphrase` for the key file.
   */
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

    const connectObj: ConnectOptions.Connect = {
      protocol: 'amqp',
      hostname: this.options.hostname,
      username: this.options.username,
      password: this.options.password,
      vhost: this.options.vhost,
    };

    if (this.options.port) {
      connectObj.port = this.options.port;
    }

    const connectionOptions: TLSSocketOptions = {};
    if (this.options.tls === true || this.options.ssl === true) {
      if (!this.options.cert && !this.options.key && !this.options.ca) {
        throw new Error('Missing arguments for using SSL for RabbitMQ');
      }

      connectObj.protocol = 'amqps';
      if (this.options.cert) {
        connectionOptions.cert = fs.readFileSync(this.options.cert);
      }
      if (this.options.key) {
        connectionOptions.key = fs.readFileSync(this.options.key);
      }
      if (this.options.ca) {
        connectionOptions.ca = [fs.readFileSync(this.options.ca)];
      }

      if (this.options.passphrase) {
        connectionOptions.passphrase = this.options.passphrase;
      }
    }

    this.conn = null;
    const pconn = amqplib.connect(connectObj, connectionOptions);
    pconn
      .then((conn) => {
        this.conn = conn;
      })
      .catch(() => {
        // pass
      });
    pconn.catch((err): void => {
      console.error(`RabbitMQ error: ${err as string}`);
      console.error(
        `Connection to the rabbitmq root vhost failed. Please make sure that your user ${this.options.username} can access the root vhost!`,
      );
      process.exit(1);
    });

    // Make a shared channel for publishing and subscribe
    this.pch = pconn.then((conn: amqplib.Connection) => conn.createChannel());
    this.mgmturl = `http://${this.options.username}:${this.options.password}@${this.options.hostname}:15672/api`;
    this.vhost = this.options.vhost === '/' ? '%2f' : this.options.vhost || '';
    this.prefix = this.options.prefix;
    this.exchange = io.config.get<string>('rabbit:exchange');
    this.io = io;
  }

  /**
   * Set the timeout in ms to use for the {@link publishRpc} method.
   *
   * The default is 3000ms, which should be sufficient for most cases.
   *
   * @param timeout The new timeout in ms
   */
  public setTimeout(timeout: number): void {
    this.timeout = timeout;
  }

  /**
   * Close the RabbitMQ connection. The connection is closed automatically when the Io instance
   * is destroyed.
   */
  public async close(): Promise<void> {
    if (!this.conn) {
      return;
    }
    await this.conn.close();
  }

  private resolveTopicName(topicName: string): string {
    if (this.prefix) {
      topicName = `${this.prefix}.${topicName}`;
    }
    return topicName;
  }

  private parseContent(
    content: Buffer,
    contentType?: string,
  ): RabbitContentType {
    let finalContent: RabbitContentType = content;
    if (contentType === 'application/json') {
      finalContent = JSON.parse(content.toString());
    } else if (contentType === 'text/string') {
      finalContent = content.toString();
    } else if (contentType === 'text/number') {
      finalContent = parseFloat(content.toString());
    }
    return finalContent;
  }

  private getContentType(content: RabbitContentType): string {
    if (Buffer.isBuffer(content)) {
      return 'application/octet-stream';
    } else if (typeof content === 'number') {
      return 'text/number';
    } else if (typeof content === 'string') {
      return 'text/string';
    }

    return 'application/json';
  }

  private encodeContent(content: RabbitContentType): Buffer {
    if (Buffer.isBuffer(content)) {
      return content;
    }

    let stringContent = '';
    if (typeof content === 'string') {
      stringContent = content;
    } else if (typeof content === 'number') {
      stringContent = content.toString();
    } else {
      stringContent = JSON.stringify(content);
    }
    return Buffer.from(stringContent);
  }

  /**
   * Publish a message to a [RabbitMQ topic](https://www.rabbitmq.com/tutorials/tutorial-five-javascript.html).
   *
   * This method allows for passing content to the specified topic. The content can be a string, number, object, or buffer,
   * and in the case of the first three, will be implicitly converted to a buffer before sending to RabbitMQ. In these cases,
   * the content type will be automatically determined based on type and set as follows:
   *
   * * `Buffer` - `application/octet-stream`
   * * `number` - `text/number`
   * * `string` - `text/string`
   * * `object` - `application/json`
   *
   * If you wish to override the content type, you can pass `options.contentType` to the method.
   *
   * @param  topic - The routing key for the message.
   * @param  content - The message to publish. If left blank, will default to an empty buffer.
   * @param  options - Publishing options. See [amqplib#publish](https://www.squaremobius.net/amqp.node/channel_api.html#channelpublish) for details on options.
   */
  public async publishTopic(
    topic: string,
    content: RabbitContentType = Buffer.from(''),
    options: amqplib.Options.Publish = {},
  ): Promise<boolean> {
    const encodedContent = this.encodeContent(content);
    options.contentType = options.contentType || this.getContentType(content);
    const channel = await this.pch;
    await channel.checkExchange(this.exchange);
    return channel.publish(this.exchange, topic, encodedContent, options);
  }

  public async onTopic<T = RabbitContentType>(
    topic: string,
    handler: PublishCallback<T>,
  ): Promise<Replies.Consume>;
  public async onTopic<T = RabbitContentType>(
    topic: string,
    options: RabbitOnTopicOptions,
    handler: PublishCallback<T>,
  ): Promise<Replies.Consume>;
  /**
   * Subscribe to a [RabbitMQ topic](https://www.rabbitmq.com/tutorials/tutorial-five-javascript.html).
   *
   * For each method that is recieved for a topic, the callback will be called with the RabbitMQ message. On receiving the message,
   * the `content` property will be automatically converted to an appropriate type based on the content type of the message. The content type
   * to be used can be overriden by setting the `options.contentType` field. You should only need to set the content type if interfacing
   * with the legacy `@cisl/io` package.
   *
   * @template T - The expected type of the content is in the message. If not specified, defaults to `string | numer | object | Buffer`.
   * @param topic - The routing key for the message.
   * @param options - The options to use. You can use this to specify a non-default exchange to listen to, as well as contentType to expect.
   * @param handler
   */
  public onTopic<T = RabbitContentType>(
    topic: string,
    options: RabbitOnTopicOptions | PublishCallback<T>,
    handler?: PublishCallback<T>,
  ): Promise<Replies.Consume> {
    if (!handler && typeof options === 'function') {
      return this._onTopic<T>(topic, {}, options);
    } else if (handler) {
      return this._onTopic<T>(topic, options as RabbitOnTopicOptions, handler);
    }
    throw new Error('Invalid type signature');
  }

  private async _onTopic<T = RabbitContentType>(
    topic: string,
    options: RabbitOnTopicOptions,
    handler: PublishCallback<T>,
  ): Promise<Replies.Consume> {
    topic = this.resolveTopicName(topic);

    const channelOptions = { exclusive: true, autoDelete: true };
    const channel = await this.pch;
    await channel.checkExchange(this.exchange);
    const queue = await channel.assertQueue('', channelOptions);
    await channel.bindQueue(
      queue.queue,
      options.exchange || this.exchange,
      topic,
    );
    return channel
      .consume(
        queue.queue,
        (msg): void => {
          if (msg !== null) {
            let err;
            try {
              (msg as RabbitMessage).content = this.parseContent(
                msg.content,
                options.contentType || msg.properties.contentType,
              );
            } catch (exc) {
              err = exc as Error;
            }
            handler(
              {
                ...msg,
                content: msg.content as unknown as T,
              },
              err,
            );
          }
        },
        { noAck: true },
      )
      .then((consume: amqplib.Replies.Consume): Subscription => {
        return Object.assign(consume, {
          unsubscribe: () => {
            return channel.cancel(consume.consumerTag);
          },
        });
      });
  }

  /**
   * Make a [RabbitMQ remote procedural call (RPC)](https://www.rabbitmq.com/tutorials/tutorial-six-javascript.html).
   *
   * The promise returned by this method is resolved when the response is received from the callee. The response will be
   * automatically parsed to the appropriate type based on the content type. You can override this behavior by setting
   * options.contentType. You may leave both content and options blank.
   *
   * @template T - The type of the content of the response. Defaults to `string | number | object | Buffer`.
   * @param queueName - The name of the queue to use for the RPC.
   * @param content - The content to send to the callee. If left blank, will default to an empty buffer.
   * @param options - The options to use.
   */
  public async publishRpc<T = RabbitContentType>(
    queueName: string,
    content: RabbitContentType = Buffer.from(''),
    options: amqplib.Options.Publish = {},
  ): Promise<RabbitMessage<T>> {
    let consumerTag: string;
    const channel = await this.pch;
    const replyTo = options.replyTo;
    const contentType = options.contentType || null;

    options.correlationId = options.correlationId || this.io.generateUuid();
    options.expiration = options.expiration || this.timeout;
    options.contentType = options.contentType || this.getContentType(content);

    // not defining this queue, even if we don't use it causes the replyTo field to not
    // receive anything, todo: figure out why
    const queue = await channel.assertQueue('', {
      exclusive: true,
      autoDelete: true,
    });
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
              void channel.cancel(consumerTag);
            }
            reject(
              new Error(`Request timed out after ${options.expiration} ms.`),
            );
          }, options.expiration + 100);
        }

        channel
          .consume(
            options.replyTo,
            (msg) => {
              if (msg !== null) {
                if (msg.properties.correlationId === options.correlationId) {
                  clearTimeout(timeoutId);
                  const promise = consumerTag
                    ? (channel.cancel(consumerTag) as unknown as Promise<void>)
                    : Promise.resolve();

                  promise
                    .then(() => {
                      if (msg.properties.headers.error) {
                        reject(new Error(msg.properties.headers.error));
                      } else {
                        resolve({
                          ...msg,
                          content: this.parseContent(
                            msg.content,
                            contentType || msg.properties.contentType,
                          ) as T,
                        });
                      }
                    })
                    .catch((err) => {
                      reject(err);
                    });
                } else {
                  reject(new Error('null response for call'));
                }
              }
            },
            { noAck: true },
          )
          .then((reply) => {
            consumerTag = reply.consumerTag;
          })
          .catch(() => {
            /* pass */
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

  public async onRpc<T>(
    queueName: string,
    handler: RpcReplyCallback<T>,
  ): Promise<void>;
  public async onRpc<T>(
    queueName: string,
    options: RabbitOnRpcOptions,
    handler: RpcReplyCallback<T>,
  ): Promise<void>;
  /**
   * Listen for [RabbitMQ remote procedure calls (RPC)](https://www.rabbitmq.com/tutorials/tutorial-six-javascript.html).
   *
   * When a message is received on the given queue, the handler will be called with the message. The content of the message
   * is automatically parsed to the appropriate type based on the content type. You can override this behavior by setting the
   * `options.contentType` setting.
   *
   * @template T - The type of the content of the response. Defaults to `string | number | object | Buffer`.
   * @param queueName - The name of the queue to use for the RPC.
   * @param options - The options to use.
   * @param handler - The handler to use.
   */
  public onRpc<T>(
    queueName: string,
    options: RabbitOnRpcOptions | RpcReplyCallback<T>,
    handler?: RpcReplyCallback<T>,
  ): Promise<void> {
    if (!handler && typeof options === 'function') {
      return this._onRpc<T>(queueName, {}, options);
    } else if (handler) {
      return this._onRpc<T>(queueName, options as RabbitOnRpcOptions, handler);
    }
    throw new Error('Invalid type signature');
  }

  private async _onRpc<T>(
    queueName: string,
    options: RabbitOnRpcOptions,
    handler: RpcReplyCallback<T>,
  ): Promise<void> {
    const channel = await this.pch;
    const noAck = handler.length < 4;
    channel.prefetch(1).catch(() => {
      /* pass */
    });
    const queue = await channel.assertQueue(queueName, {
      exclusive: options.exclusive || true,
      autoDelete: true,
    });
    await channel.consume(
      queue.queue,
      (msg: amqplib.ConsumeMessage | null) => {
        let replyCount = 0;
        if (msg === null) {
          throw new Error('Request for onRpc was null');
        }

        const reply: ReplyCallback = (
          response: Error | RabbitContentType,
        ): void => {
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
                  correlationId: msg.properties.correlationId as string,
                  headers: { error: response.message },
                },
              );
            } else {
              const publishOptions: amqplib.Options.Publish = {
                correlationId: msg.properties.correlationId as string,
              };
              const encodedContent = this.encodeContent(response);
              publishOptions.contentType =
                options.contentType || this.getContentType(response);
              channel.sendToQueue(
                msg.properties.replyTo,
                encodedContent,
                publishOptions,
              );
            }
          }
        };

        const ackFunc = noAck
          ? undefined
          : (): void => {
              channel.ack(msg);
            };

        try {
          const handledMessage: RabbitMessage<T> = {
            ...msg,
            content: this.parseContent(
              msg.content,
              options.contentType || msg.properties.contentType,
            ) as T,
          };
          handler(handledMessage, reply, ackFunc);
        } catch (err) {
          handler(
            msg as unknown as RabbitMessage<T>,
            reply,
            ackFunc || err,
            ackFunc ? err : undefined,
          );
        }
      },
      { noAck },
    );
  }

  public onQueue(queueName: string, handler: QueueCallback): Promise<void>;
  public onQueue(
    queueName: string,
    options: RabbitOnQueueOptions,
    handler: QueueCallback,
  ): Promise<void>;
  /**
   * Listen to a [RabbitMQ queue](https://www.rabbitmq.com/tutorials/tutorial-one-javascript.html).
   *
   * When a message is received on the given queue, the handler will be called with the message. The content of the message
   * is automatically parsed to the appropriate type based on the content type. You can override this behavior by setting the
   * `options.contentType` setting.
   *
   * The full allowed properties for options can be viwed at [amqplib#assertQueue](https://www.squaremobius.net/amqp.node/channel_api.html#channel_assertQueue).
   *
   * @param queueName - Queue name to listen to.
   * @param options - Options to use.
   * @param handler - Handler to use.
   */
  public onQueue(
    queueName: string,
    options: RabbitOnQueueOptions | QueueCallback,
    handler?: QueueCallback,
  ): Promise<void> {
    if (!handler && typeof options === 'function') {
      return this._onQueue(queueName, {}, options);
    } else if (handler) {
      return this._onQueue(queueName, options as RabbitOnQueueOptions, handler);
    }
    throw new Error('Invalid type signature');
  }

  private async _onQueue(
    queueName: string,
    options: RabbitOnQueueOptions,
    handler: QueueCallback,
  ): Promise<void> {
    const channel = await this.pch;
    options.durable = options.durable || false;
    await channel.assertQueue(queueName, options);
    channel
      .consume(
        queueName,
        (msg): void => {
          if (msg === null) {
            throw new Error('msg in onQueue is null');
          }
          let err;
          try {
            (msg as RabbitMessage).content = this.parseContent(
              msg.content,
              options.contentType || msg.properties.contentType,
            );
          } catch (exc) {
            err = exc as Error;
          }
          handler(msg, err);
        },
        { noAck: true },
      )
      .catch(() => {
        /* pass */
      });
  }

  /**
   * Get a list of queues declared in the rabbitmq server.
   * @return {Promise}
   */
  public async getQueues(): Promise<QueueState[]> {
    const json = (await fetch(
      `${this.mgmturl}/queues/${this.vhost}?columns=state,name`,
    ).then((res) => res.json())) as QueueState[];
    return json;
  }

  /**
   * Subscribe to queue creation events
   * @param  {queueEventCallback} handler - Callback to handle the event.
   */
  public onQueueCreated(
    handler: (queueName: string, properties: amqplib.MessageProperties) => void,
  ): void {
    this.onTopic(
      'queue.created',
      { exchange: 'amq.rabbitmq.event' },
      (message): void => {
        handler(message.properties.headers.name, message.properties);
      },
    ).catch(() => {
      /* pass */
    });
  }

  /**
   * Subscribe to queue deletion events
   * @param  {queueEventCallback} handler - Callback to handle the event.
   */
  public onQueueDeleted(
    handler: (queueName: string, properties: amqplib.MessageProperties) => void,
  ): void {
    this.onTopic(
      'queue.deleted',
      { exchange: 'amq.rabbitmq.event' },
      (message): void => {
        handler(message.properties.headers.name, message.properties);
      },
    ).catch(() => {
      /* pass */
    });
  }
}
