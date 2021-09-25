@cisl/io-celio-speaker
===================

Plugin for @cisl/io for interfacing with the speaker-worker

Usage
-----

```javascript
const io = require('@cisl/io');
const { registerSpeaker } = require('@cisl/io-celio-speaker');
io.registerPlugins(registerSpeaker);

io.speaker.speak('test');
```

```typescript
import io from '@cisl/io';
import {registerSpeaker} from '@cisl/io-celio-speaker';
io.registerPlugins(registerSpeaker);

io.speaker.speak("test");
```
