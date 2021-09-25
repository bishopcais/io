import { Cog, CogLoaderOptions } from '@cisl/cog-loader';
import { Message, Options } from 'amqplib';

import { RedisOptions } from 'ioredis';
export { RedisOptions } from 'ioredis';

export interface MongoOptions {
  host: string;
  port: number;
  db: string;
  user?: string;
  pass?: string;
}

// eslint-disable-next-line
export interface IoOptions extends CogLoaderOptions {}

export interface IoCog extends Cog {
  mq?: boolean | RabbitOptions;
  rabbit?: boolean | RabbitOptions;
  mongo?: boolean | MongoOptions;
  redis?: boolean | RedisOptions;
  store?: boolean | RedisOptions;

  [key: string]: unknown;
}

export type RabbitContentType = Buffer | string | number | unknown;

export interface RabbitMessage extends Omit<Message, 'content'> {
  content: RabbitContentType;
}

interface RabbitBaseOnOptions {
  contentType?: string;
}

export interface RabbitOnTopicOptions extends RabbitBaseOnOptions {
  exchange?: string;
}

export interface RabbitOnRpcOptions extends RabbitBaseOnOptions {
  /** set whether RPC queue is exclusive. Defaults to true. */
  exclusive?: boolean;
}

export type RabbitOnQueueOptions = RabbitBaseOnOptions & Options.AssertQueue;

export interface RabbitOptions {
  url?: string;
  port?: number;
  hostname?: string;
  username?: string;
  password?: string;
  exchange?: string;
  vhost?: string;
  prefix?: string;
  ssl?: boolean;
  tls?: boolean;
  cert?: string;
  key?: string;
  ca?: string;
  passphrase?: string;
}
