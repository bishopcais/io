# @cisl/io-display

Module for `@cisl/io` that wraps the interface for the display-worker to make it easier to work with.

## Installation
```bash
npm install @cisl/io-display
```

## Usage
```javascript
import cislio, { registerPlugins } from '@cisl/io';
import '@cisl/io-display';

const io = cislio();

(async function (): Promise<void> {
  const { displayContext } = await io.display.openDisplayWorker('contextOne', {
    main: {
      displayName: 'main',
      contentGrid: {
        row: 3,
        col: 3,
      },
    },
  });

  const promises = [];

  await io.display.displayUrl('main', 'http://www.google.com', {
    widthFactor: 1,
    heightFactor: 1,
  });

  await new Promise((resolve) => {
    setTimeout(resolve, 8000);
  });
  await displayContext.close();
})()
  .then(() => {
    console.log('done');
    process.exit();
  })
  .catch((err) => {
    console.error(err);
  });
```

You can see additional example usages of this module in the [display-worker/examples](https://github.com/bishopcais/display-worker/tree/master/examples) folder.
