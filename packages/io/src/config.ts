import { IoCog } from './types';

export class Config {
  private _config: IoCog;

  constructor(config: IoCog) {
    if (config.mq && !config.rabbit) {
      config.rabbit = config.mq;
    }

    if (config.store && !config.redis) {
      config.redis = config.store;
    }

    this._config = config;
  }

  public get<T>(key: string, defaultValue?: unknown): T {
    if (this._config[key]) {
      return this._config[key] as T;
    }
    const pieces = key.split(':');
    if (pieces.length === 1 && pieces[0] === '') {
      throw new Error('Search key cannot be empty');
    }
    let value = this._config as {[key: string]: unknown};

    while (pieces.length > 0) {
      let i = 0;
      while (!(pieces.slice(0, pieces.length - i).join(':') in value) && i < pieces.length) {
        i++;
      }
      if (i >= pieces.length) {
        if (defaultValue !== undefined) {
          (value as unknown) = defaultValue;
          break;
        }
        throw new Error(`Could not find key: ${key}`);
      }
      value = value[pieces.splice(0, pieces.length - i).join(':')] as {[key: string]: unknown};
    }

    return ((value as unknown) as T);
  }

  public has(key: string): boolean {
    try {
      this.get(key);
      return true;
    }
    catch {
      return false;
    }
  }

  public hasValue(key: string): boolean {
    const value = this.get(key, false);
    return value !== false && value !== null && value !== undefined;
  }

  public defaults(defaults: {[key: string]: unknown}): void {
    this._config = Config.recursiveDefaults(this._config, defaults);
  }

  private static recursiveDefaults(config: {[key: string]: unknown}, defaults: {[key: string]: unknown}) {
    for (const key in defaults) {
      if (!(key in config) || config[key] === true) {
        config[key] = defaults[key];
      }
      else if (typeof config[key] === 'object' && typeof defaults[key] === 'object') {
        config[key] = this.recursiveDefaults(
          (config[key] as {[key: string]: unknown}),
          (defaults[key] as {[key: string]: unknown}),
        );
      }
    }
    return config;
  }

  public required(keys: string[]): void {
    for (const key of keys) {
      try {
        if (!this.get(key)) {
          throw new Error();
        }
      }
      catch {
        throw new Error(`Value required for key: ${key}`);
      }
    }
  }
}

export default Config;
