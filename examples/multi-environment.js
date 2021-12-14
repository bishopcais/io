/*
In this example, we open two separate display contexts, and within each
open their own windows and view objects. Then, we communicate to two
separate speaker-workers, each of which would ideally be running on a
separate machine.
*/

const cislio = require('@cisl/io');
require('@cisl/io-display');
require('@cisl/io-speaker');

const io = cislio();

(async function () {
  // Open two separate display contexts, one for each running displayName.
  // Each displayContext acts completely independently of the other.
  const displayContext = await io.display.openDisplayContext('contextOne', {
    main: {
      displayName: 'main',
      contentGrid: {
        row: 3,
        col: 3,
      },
      width: 300,
      height: 400,
    },
    foo: {
      displayName: 'main',
      contentGrid: {
        row: 3,
        col: 3,
      },
      width: 300,
      height: 400,
      x: 1000,
    },
  });

  const displayContext2 = await io.display.openDisplayContext('contextTwo', {
    bar: {
      displayName: 'other',
      contentGrid: {
        row: 3,
        col: 3,
      },
      width: 300,
      height: 400,
      x: 500,
      y: 200,
    },
  });

  const displayPromises = [];

  // We open urls in the two separate contexts.
  displayPromises.push(displayContext.displayUrl('main', 'http://www.google.com', {
    widthFactor: 1,
    heightFactor: 1,
  }));

  displayPromises.push(displayContext.displayUrl('foo', 'https://www.example.com', {
    widthFactor: 1,
    heightFactor: 1,
    position: {
      gridLeft: 2,
      gridTop: 2,
    },
  }));

  displayPromises.push(displayContext2.displayUrl('bar', 'https://acme.com', {
    widthFactor: 1,
    heightFactor: 1,
    position: {
      gridLeft: 3,
      gridTop: 3,
    },
  }));

  await Promise.all(displayPromises);

  // Now we play a sound in two separate speaker-workers, where this corresponds to
  // what is set in the speaker-worker's cog.json file.
  const speakerPromises = [];
  speakerPromises.push(io.speaker.speak('Hello world!'));
  speakerPromises.push(io.speaker.speak('Hello Jeff!', { environment: 'other' }));

  // Wait 8 seconds, and then close everything up
  await new Promise((resolve) => {
    setTimeout(resolve, 8000);
  });
  await displayContext.close();
})()
  .then(() => {
    console.log('done');
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    io.close().catch(() => { /* pass */ });
    process.exit();
  });
