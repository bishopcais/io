import { createHash } from 'crypto';
import Io, { registerPlugins, runRegisterFunctions } from './io';
import { IoOptions } from './types';

let instances: {[key: string]: Io} = {};
const emptyHash = createHash('md5').update('').digest('hex');

function io(options?: IoOptions): Io {
  const hash = createHash('md5').update(JSON.stringify(options || '')).digest('hex');
  if (instances[hash]) {
    return instances[hash];
  }

  instances[hash] = new Io(options);
  if (!instances[emptyHash]) {
    instances[emptyHash] = instances[hash];
  }
  return instances[hash];
}

// utility function, should really be used just for testing
io.clearInstances = (): void => {
  instances = {};
};

io.registerPlugins = (...registerFunctions: ((io: Io) => void)[]): void => {
  registerPlugins(...registerFunctions);
  for (const hash in instances) {
    runRegisterFunctions(instances[hash], registerFunctions);
  }
};

export = io;
