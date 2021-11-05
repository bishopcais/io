import { Io } from '../src/io';
import { Rabbit } from '../src/rabbit';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

const rabbitCog = join(__dirname, 'data', 'cog.rabbit.json');

describe('rabbit, topic', () => {
  [
    [Buffer.from([1, 2, 3, 4])],
    ['string'],
    [10],
    [{foo: {test: [1, 2, 3]}, bar: false}],
  ].forEach(([value]) => {
    test(`.publishTopic(${JSON.stringify(value)})`, (done) => {
      const io = new Io({cogPath: rabbitCog});
      expect(io.rabbit).toBeInstanceOf(Rabbit);
      const topicName = `test.topic.${uuidv4().replace('-', '')}`;
      if (!io.rabbit) {
        return expect(true).toBe(false);
      }
      io.rabbit.onTopic(topicName, (message, err) => {
        expect(err).toBe(undefined);
        expect(message.content).toStrictEqual(value);
        io.rabbit.close().then(done()).catch(done);
      }).then(() => {
        io.rabbit.publishTopic(topicName, value).catch(done);
      }).catch((err) => {
        done(err);
      });
    });
  });
});

describe('rabbit, rpc', () => {
  [
    [Buffer.from([1, 2, 3, 4]), Buffer.from([4, 3, 2, 1])],
    ['string', 'test'],
    [10, 20],
    [{foo: {test: [1, 2, 3]}, bar: false}, {bar: true}],
  ].forEach(([req, res]) => {
    test('rabbit rpc', (done) => {
      const io = new Io({cogPath: rabbitCog});
      expect(io.rabbit).toBeInstanceOf(Rabbit);
      const queueName = `rpc-test-${uuidv4().replace('-', '')}`;
      io.rabbit.onRpc(queueName, (message, reply, err) => {
        expect(err).toBeUndefined();
        expect(message.content).toStrictEqual(req);
        reply(res);
      }).then(() => {
        io.rabbit.publishRpc(queueName, req).then((msg) => {
          expect(msg.content).toEqual(res);
          io.rabbit.close().then(done).catch(done);
        }).catch(done);
      }).catch(done);
    });
  });
});

test('rpc with replyTo', (done) => {
  const io = new Io({cogPath: rabbitCog});
  expect(io.rabbit).toBeInstanceOf(Rabbit);
  const rpcName = `rpc-test-${uuidv4().replace(/-/g, '')}`;
  const queueName = `queue-test-${uuidv4().replace(/-/g, '')}`;

  io.rabbit.onQueue(queueName, (msg) => {
    expect(msg.content).toStrictEqual('hello');
    io.rabbit.close().then(done).catch(done);
  }).catch(done);

  io.rabbit.onRpc(rpcName, (msg, reply) => {
    expect(msg.content).toStrictEqual('test');
    reply('hello');
  }).catch(done);

  io.rabbit.publishRpc(rpcName, 'test', {replyTo: queueName}).then((msg) => {
    expect(msg.content).toBe(null);
  }).catch(done);
});
