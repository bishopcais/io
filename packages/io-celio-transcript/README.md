# @cisl/io-celio-transcript

Plugin for @cisl/io for interfacing with the transcript-worker

## Usage

```javascript
const io = require('@cisl/io')();
require('@cisl/io-celio-transcript');

io.transcript.onFinal((msg) => {
  console.log(msg.content);
});
```

```typescript
import io from '@cisl/io';
import '@cisl/io-celio-transcript';

io.transcript.onFinal((msg) => {
  console.log(msg.content);
});
```
