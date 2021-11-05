import { v1 as uuidv1 } from 'uuid';
import loadCogFile, { CogLoaderOptions } from '@cisl/cog-loader';

import { IoCog } from './types';
import { Rabbit } from './rabbit';
import { Redis } from './redis';
import { Mongo } from './mongo';
import { Config } from './config';

const registeredFunctions: ((io: Io) => void)[] = [];

/**
 * The Io class. You should usually not be directly instantiating this class,
 * rather calling the {@link export=} function instead.
 */
export class Io {
  public config: Config;

  private _mongo?: Mongo;

  private _rabbit?: Rabbit;

  private _redis?: Redis;

  /**
   * Io constructor.
   *
   * See [cog-loader#options](https://github.com/bishopcais/cog-loader#usage) for details on options,
   * however the defaults should usually suffice in most cases.
   */
  public constructor(options?: CogLoaderOptions) {
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

  /**
   * Close all open connections that Io has made. While the connections
   * should close automatically when the process exits, it's still recommended
   * to call this function to avoid "unexpected closures".
   */
  close(): Promise<void[]> {
    const promises = [
      this._rabbit?.close(),
      this._mongo?.disconnect(),
      this._redis?.disconnect(),
    ].filter((p) => !!p);
    return Promise.all(promises);
  }

  /**
   * Get the instantiated rabbit module.
   *
   * If rabbit has not been activated, throw an error.
   */
  public get rabbit(): Rabbit {
    if (!this._rabbit) {
      throw new Error('Rabbit has not been initialized');
    }
    return this._rabbit;
  }

  /**
   * Get the instantiated mongo module.
   *
   * If mongo has not been activated, throw an error.
   */
  public get mongo(): Mongo {
    if (!this._mongo) {
      throw new Error('Mongo has not been initialized');
    }
    return this._mongo;
  }

  /**
   * Get the instantiated redis module.
   *
   * If redis has not been activated, throw an error.
   */
  public get redis(): Redis {
    if (!this._redis) {
      throw new Error('Redis has not been initialized');
    }
    return this._redis;
  }

  /**
   * Utility function to generate UUIDv1
   */
  public generateUuid(): string {
    return uuidv1();
  }
}

/**
 * @internal
 */
export function runRegisterFunctions(io: Io, registerFunctions: ((io: Io) => void)[]): void {
  for (const registerFunction of registerFunctions) {
    registerFunction(io);
  }
}

/**
 * @internal
 */
export function registerPlugins(...registerFunctions: ((io: Io) => void)[]): void {
  registeredFunctions.push(...registerFunctions);
}
