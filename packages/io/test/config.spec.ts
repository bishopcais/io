import Config from '../src/config';

test('basic config', () => {
  const config = new Config({foo: true, item: {key: {value: 'hi'}}, bar: false});
  expect(config.get('foo')).toBe(true);
  expect(config.get('item')).toStrictEqual({key: {value: 'hi'}});
  expect(config.get('item:key')).toStrictEqual({value: 'hi'});
  expect(config.get<string>('item:key:value')).toStrictEqual('hi');
  expect(config.get('bar')).toEqual(false);
  expect(config.has('foo')).toBe(true);
  expect(config.has('item:key:value')).toBe(true);
  expect(config.has('invalid')).toBe(false);
  expect(config.has('item:invalid')).toBe(false);
});

test('support legacy mq key', () => {
  const config = new Config({mq: {hostname: 'localhost'}});
  expect(config.get('rabbit')).toStrictEqual({hostname: 'localhost'});
  expect(config.get('mq')).toStrictEqual({hostname: 'localhost'});
});

test('support legacy store key', () => {
  const config = new Config({store: true});
  expect(config.get('redis')).toEqual(true);
  expect(config.get<boolean>('store')).toEqual(true);
});

test('empty key returns empty array key value', () => {
  const config = new Config({'': 'empty'});
  expect(config.get('')).toEqual('empty');
});

test('empty key throws error if no empty array key', () => {
  const config = new Config({});
  expect(() => config.get('')).toThrowError(new Error('Search key cannot be empty'));
});

test('cannot find key top-level', () => {
  const config = new Config({});
  expect(() => config.get('invalid')).toThrowError(new Error('Could not find key: invalid'));
});

test('get key expressly set undefined', () => {
  const config = new Config({test: undefined});
  expect(config.get('test')).toBe(undefined);
});

test('get key with default value', () => {
  const config = new Config({});
  expect(config.get('value', 'test')).toBe('test');
});

describe('defaults', () => {
  test('defaults', () => {
    const config = new Config({});
    config.defaults({
      channels: ['far'],
    });
    expect(config.get('channels')).toStrictEqual(['far']);
  });

  test('defaults over true key', () => {
    const config = new Config({test: true});
    config.defaults({
      test: 'test',
    });
    expect(config.get('test')).toBe('test');
  });

  test('defaults does not overwrite existing value', () => {
    const config = new Config({test: true, bar: 'foo', baz: false});
    config.defaults({
      test: 'test',
      baz: 'value',
    });
    expect(config.get('test')).toBe('test');
    expect(config.get('bar')).toBe('foo');
    expect(config.get('baz')).toBe(false);
    config.defaults({
      test: 'test',
      baz: 'value',
    });
    expect(config.get('test')).toBe('test');
    expect(config.get('bar')).toBe('foo');
    expect(config.get('baz')).toBe(false);
  });

  describe('defaults does not overwrite falsey values', () => {
    test.each([[null], [false], [''], [undefined]])('.defaults for %s', (value) => {
      const config = new Config({test: value});
      config.defaults({test: 'invalid'});
      expect(config.get('test')).toBe(value);
    });
  });

  test('recursive defaults', () => {
    const config = new Config({rabbit: {url: 'localhost'}});
    config.defaults({
      rabbit: {
        exchange: 'amq.topic',
      },
    });
    expect(config.get('rabbit:url')).toBe('localhost');
    expect(config.get('rabbit:exchange')).toBe('amq.topic');
  });
});

test('required exists, no throw', () => {
  const config = new Config({test: true});
  config.required(['test']);
});

test('required top-level missing', () => {
  const config = new Config({});
  expect(() => config.required(['test'])).toThrowError(new Error('Value required for key: test'));
});

test('required nested key missing', () => {
  const config = new Config({test: {foo: true}});
  expect(() => config.required(['test:bar'])).toThrowError(new Error('Value required for key: test:bar'));
});

describe('test falsey required keys', () => {
  test.each([[null], [false], [''], [undefined]])('.required for %s', (value) => {
    const config = new Config({test: value});
    expect(() => config.required(['test'])).toThrowError(new Error('Value required for key: test'));
  });
});

describe('.hasValue', () => {
  test.each([[null, false], [undefined, false], [false, false], [true, true], ['', true]])('.hasValue for %s', (value, expected) => {
    const config = new Config({test: value});
    expect(config.hasValue('test')).toBe(expected);
  });
});
