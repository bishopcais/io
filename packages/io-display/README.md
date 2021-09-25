# @cisl/io-display

Module for `@cisl/io` that wraps the interface for the display-worker to make it easier to work with.

## Installation
```bash
npm install @cisl/io-display
```

## Usage
```js
const io = require('@cisl/io');
const { registerDisplayWorker } = require('@cisl/io-display');

io.registerPlugins(registerDisplayWorker);
io.display.openDisplayWorker('main', 'test', content_grid).then((response) => {
  io.display.displayUrl('https://example.com', {
    position: {
      gridLeft: 1,
      gridTop: 1
    },
    widthFactor: 2,
    heightFactor: 2
  });
});
```
