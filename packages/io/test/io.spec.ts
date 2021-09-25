import { join } from 'path';
import Io from '../src/io';

test('blank io object', () => {
  const io = new Io({cogPath: join(__dirname, 'data', 'cog.json')});
  expect(io.rabbit).toBeUndefined;
  expect(io.redis).toBeUndefined;
  expect(io.mongo).toBeUndefined;
});

test('Io.generateUuid', () => {
  const io = new Io({cogPath: join(__dirname, 'data', 'cog.json')});
  expect(io.generateUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});
