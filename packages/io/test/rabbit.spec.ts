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
        return expect(true).toBeFalsy;
      }
      io.rabbit.onTopic(topicName, (message, err) => {
        expect(err).toBeUndefined;
        expect(message.content).toStrictEqual(value);
        (io.rabbit ).close().then(done());
      }).then(() => {
        if (!io.rabbit) {
          expect(false).toBeTruthy;
          return;
        }
        io.rabbit.publishTopic(topicName, value);
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
      if (!io.rabbit) {
        return expect(true).toBeFalsy;
      }
      const queueName = `rpc-test-${uuidv4().replace('-', '')}`;
      io.rabbit.onRpc(queueName, (message, reply, err) => {
        expect(err).toBeUndefined;
        expect(message.content).toStrictEqual(req);
        reply(res);
      }).then(() => {
        if (!io.rabbit) {
          expect(false).toBeTruthy;
          return;
        }
        io.rabbit.publishRpc(queueName, req).then((msg) => {
          expect(msg.content).toEqual(res);
          (io.rabbit ).close().then(() => done());
        });
      });
    });
  });
});

test('rpc with replyTo', (done) => {
  const io = new Io({cogPath: rabbitCog});
  expect(io.rabbit).toBeInstanceOf(Rabbit);
  if (!io.rabbit) {
    return expect(true).toBeFalsy;
  }

  const rpcName = `rpc-test${uuidv4().replace('-', '')}`;
  const queueName = `queue-test${uuidv4().replace('-', '')}`;
  io.rabbit.onQueue(queueName, (msg) => {
    expect(msg.content).toStrictEqual('hello');
    (io.rabbit ).close().then(() => done());
  });

  io.rabbit.onRpc(rpcName, (msg, reply) => {
    expect(msg.content).toStrictEqual('test');
    reply('hello');
  });

  io.rabbit.publishRpc(rpcName, 'test', {replyTo: queueName}).then((msg) => {
    expect(msg).toBeNull;
  });
});
