import { v1 as uuid } from 'uuid';
import loadCogFile from '@cisl/cog-loader';

import { IoCog, IoOptions } from './types';
import Rabbit from './rabbit';
import Redis from './redis';
import Mongo from './mongo';
import Config from './config';

const registeredFunctions: ((io: Io) => void)[] = [];

/**
 * Class representing the Io object.
 *
 * Note, we must export this as a regular class to allow for module
 * augmentation in plugins.
 */
export class Io {
  public config: Config;

  public _mongo?: Mongo;

  public _rabbit?: Rabbit;

  public _redis?: Redis;

  public plugins: {[key: string]: Plugin} = {};

  /**
   * Create the Io object, and establish connections to the central message broker and store
   * @param  {string|object} [config] - string pointing to a file to use or an object containing settings
   *                  to override the default loaded file
   */
  public constructor(options?: IoOptions) {
    this.config = new Config((loadCogFile(options) as IoCog));

    if (this.config.hasValue('mongo')) {
      this._mongo = new Mongo(this);
    }

    if (this.config.hasValue('rabbit')) {
      this._rabbit = new Rabbit(this);
    }

    if (this.config.hasValue('redis')) {
      this._redis = new Redis(this);
    }

    runRegisterFunctions(this, registeredFunctions);
  }

  public get rabbit(): Rabbit {
    if (!this._rabbit) {
      throw new Error('Rabbit has not been initialized');
    }
    return this._rabbit;
  }

  public get mongo(): Mongo {
    if (!this._mongo) {
      throw new Error('Mongo has not been initialized');
    }
    return this._mongo;
  }

  public get redis(): Redis {
    if (!this._redis) {
      throw new Error('Redis has not been initialized');
    }
    return this._redis;
  }

  /**
   * Generate UUIDv1.
   * @returns {string} The unique ID.
   */
  public generateUuid(): string {
    return uuid();
  }
}

export function runRegisterFunctions(io: Io, registerFunctions: ((io: Io) => void)[]): void {
  for (const registerFunction of registerFunctions) {
    registerFunction(io);
  }

}

export function registerPlugins(...registerFunctions: ((io: Io) => void)[]): void {
  registeredFunctions.push(...registerFunctions);
}

export default Io;
