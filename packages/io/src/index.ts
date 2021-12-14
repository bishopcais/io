import { CogLoaderOptions } from '@cisl/cog-loader';
import { createHash } from 'crypto';
import { registerPlugins, runRegisterFunctions, Io } from './io';

let instances: { [key: string]: Io } = {};
const emptyHash = createHash('md5').update('').digest('hex');

/**
 * Create a new Io instance to use in your application.
 *
 * Each created instance is a singleton for the given options. As such,
 * repeated calls with the same options will return the same instance.
 *
 * Usage:
 * ```typescript
 * import cislio from '@cisl/io';
 * const io = cislio();
 * ```
 *
 * See [cog-loader#options](https://github.com/bishopcais/cog-loader#usage) for details on options,
 * however the defaults should usually suffice in most cases.
 */
function io(options?: CogLoaderOptions): Io {
  const hash = createHash('md5')
    .update(JSON.stringify(options || ''))
    .digest('hex');
  if (instances[hash]) {
    return instances[hash];
  }

  instances[hash] = new Io(options);
  if (!instances[emptyHash]) {
    instances[emptyHash] = instances[hash];
  }
  return instances[hash];
}

/**
 * @internal
 */
io.clearInstances = (): void => {
  instances = {};
};

/**
 * Register plugins with Io.
 *
 * This function will add the plugin to any existing instantiated Io instance,
 * as well as any future created Io instances.
 */
io.registerPlugins = (...registerFunctions: ((io: Io) => void)[]): void => {
  registerPlugins(...registerFunctions);
  for (const hash in instances) {
    runRegisterFunctions(instances[hash], registerFunctions);
  }
};

export = io;
