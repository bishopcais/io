import RedisClient from 'ioredis';
import { Io } from './io';
import { RedisOptions } from './types';

/**
 * Redis module. This module provides a shallow wrapper around the [ioredis](https://github.com/luin/ioredis)
 * library. See [ioredis#Redis](https://github.com/luin/ioredis/blob/master/API.md#new-redisport-host-options) for
 * allowed options.
 *
 * ioredis itself then makes available all [redis commands](https://redis.io/commands) through a Promise-based API.
 * Please consult the redis docs for specific commands you can use, with basic usage looking like:
 *
 * ```js
 * const result = await io.redis.get('foo');
 * await io.redis.set('foo', 'bar');
 * ```
 */
export class Redis extends RedisClient {
  public options: RedisOptions;

  public constructor(io: Io) {
    io.config.defaults({
      redis: {
        host: 'localhost',
        port: 6379,
        db: 0,
      },
    });

    super(io.config.get('redis'));
    this.options = io.config.get<RedisOptions>('redis');
  }

  /**
   * Subscribe to changes on a key.
   * @param  {string} key - The key.
   * @param  {function} handler - Callback function to handle the change event
   * @returns {any} - The subscriber. Use subsriber.unsubscribe((err, result)=>{}) to unsubscribe.
   */
  public onChange(
    key: string,
    handler: (event: unknown) => void,
  ): RedisClient.Redis {
    const keyChannel = `__keyspace@${this.options.db}__:${key}`;

    const subscriber = this.duplicate();
    subscriber.subscribe(keyChannel).catch(() => {
      /* pass */
    });
    subscriber.on('message', (channel, event): void => {
      if (channel === keyChannel) {
        handler(event);
      }
    });
    return subscriber;
  }
}
