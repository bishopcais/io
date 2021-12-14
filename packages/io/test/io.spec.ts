import { join } from 'path';
import { Io } from '../src/io';

test('blank io object throws on core properties', () => {
  const io = new Io({ cogPath: join(__dirname, 'data', 'cog.json') });
  expect(() => io.rabbit).toThrowError();
  expect(() => io.redis).toThrowError();
  expect(() => io.mongo).toThrowError();
});

test('Io.generateUuid', () => {
  const io = new Io({ cogPath: join(__dirname, 'data', 'cog.json') });
  expect(io.generateUuid()).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});
