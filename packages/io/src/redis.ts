import RedisClient from 'ioredis';
import Io from './io';
import { RedisOptions } from './types';

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
  public onChange(key: string, handler: (event: unknown) => void): RedisClient.Redis {
    const keyChannel = `__keyspace@${this.options.db}__:${key}`;

    const subscriber = this.duplicate();
    subscriber.subscribe(keyChannel);
    subscriber.on('message', (channel, event): void => {
      if (channel === keyChannel) {
        handler(event);
      }
    });
    return subscriber;
  }
}

export default Redis;
