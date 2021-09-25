# @cisl/io-speaker

Plugin for @cisl/io for interfacing with the speaker-worker

## Installation

```bash
npm install @cisl/io-speaker
```

## Usage

```javascript
const io = require('@cisl/io')();
require('@cisl/io-speaker');

io.speaker.speak('test');
```

```typescript
import  cislio from '@cisl/io';
import '@cisl/io-speaker';

const io = cislio();
io.speaker.speak("test");
```

## API

### speak

* `speak(text: string, options: {duration?: number, voice?: string} = {}): Promise<RabbitMessage>`
* `clearCache(): void`
* `changeVolume(change: number): void`
* `increaseVolume(change: number = 20): void`
* `reduceVolume(change: number = 20): void`
* `stop(): Promise<RabbitMessage>`
* `beginSpeak(msg: Record<string, unknown>): void`
* `endSpeak(msg: Record<string, unknown>): void`
* `onBeginSpeak(handler: SpeakSubscriptionCallback): void`
* `onEndSpeak(handler: SpeakSubscriptionCallback): void`
