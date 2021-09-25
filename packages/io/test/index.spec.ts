import { join } from 'path';

import loadIo from '../src/index';
import { Io } from '../src/io';

const spy = jest.spyOn(process, 'cwd');
spy.mockReturnValue(join(__dirname, 'data'));

afterEach(() => {
  loadIo.clearInstances();
});

test('calling twice with no options returns same instance', () => {
  const io = loadIo();
  expect(io).toBeInstanceOf(Io);
  expect(loadIo()).toBe(io);
});

test('calling with different options returns different instances', () => {
  const io = loadIo();
  const io2 = loadIo({override: false});
  expect(io).toBeInstanceOf(Io);
  expect(io).toBeInstanceOf(Io);
  expect(io2).not.toBe(io);
});

test('calling with options then no options returns same instance', () => {
  const io = loadIo({override: false});
  const io2 = loadIo();
  expect(io).toBeInstanceOf(Io);
  expect(io2).toBeInstanceOf(Io);
  expect(io).toStrictEqual(io2);
});

test('registerPlugin', () => {
  let registerFuncIo: Io | null = null;
  const registerFunction = (io: Io) => {
    registerFuncIo = io;
  };

  loadIo.registerPlugins(registerFunction);
  const io = loadIo();
  expect(registerFuncIo).toStrictEqual(io);
});
