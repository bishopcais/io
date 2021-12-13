import cislio from '@cisl/io';
import { Io } from '@cisl/io/io';
import { Rabbit } from '@cisl/io/rabbit';
import { RabbitMessage } from '@cisl/io/types';


declare module '@cisl/io/io' {
  interface Io {
    speaker: Speaker;
  }
}

type SpeakSubscriptionCallback = (message: RabbitMessage) => void;

export class Speaker {
  // Default of 20 seconds
  public maxSpeakerDuration: number = 1000 * 20;

  public rabbit: Rabbit;

  public constructor(io: Io) {
    if (!io.rabbit) {
      throw new Error('Must initialize RabbitMQ module for Io');
    }
    this.rabbit = io.rabbit;
  }

  /**
   * Speak text.
   * @param  {string} text - The text to speak out.
   * You can also use SSML. See [Watson TTS website](http://www.ibm.com/watson/developercloud/doc/text-to-speech/http.shtml#input).
   * @param  {Object} [options] - Speak options.
   * @param  {number} [options.duration=20000] - The max non-stop speak duration. Defaults to 20 seconds.
   * @param  {string} [options.voice] - The voice to use. The default depends on the setting of speaker-worker.
   * For English (US), there are en-US_AllisonVoice, en-US_LisaVoice, and en-US_MichaelVoice.
   * For a full list of voice you can use, check [Watson TTS website](http://www.ibm.com/watson/developercloud/doc/text-to-speech/http.shtml#voices).
   * @returns {Promise<Object>} Resolves to "succeeded" or "interrupted".
   */
  public speak(text: string, options: {duration?: number, voice?: string} = {}): Promise<RabbitMessage> {
    if (!options.duration) {
      options.duration = this.maxSpeakerDuration;
    }

    return this.rabbit.publishRpc('rpc-speaker-speakText', Object.assign({}, options, {text}), { expiration: options.duration });
  }

  /**
   * Change the speaker volume by some percentage.
   * @param {number} [change] - The change percentage amount.
   */
  public changeVolume(change: number): Promise<RabbitMessage> {
    return this.rabbit.publishRpc('rpc-speaker-changeVolume', { change });
  }

  /**
   * Increase speaker volume by some percentage.
   * @param  {number} [change=20] - The change percentage amount.
   */
  public increaseVolume(change = 20): Promise<RabbitMessage> {
    return this.changeVolume(change);
  }

  /**
   * Reduce speaker volume by some percentage.
   * @param  {number} [change=20] - The change percentage amount.
   */
  public reduceVolume(change = 20): Promise<RabbitMessage> {
    return this.changeVolume(-change);
  }

  /**
   * Stop the speaker.
   * @returns {Promise} Resolves to content "done".
   */
  public stop(): Promise<RabbitMessage> {
    return this.rabbit.publishRpc('rpc-speaker-stop', '');
  }

  public beginSpeak(msg: Record<string, unknown>): void {
    this.rabbit.publishTopic('begin.speak', msg).catch(() => { /* pass */ });
  }

  public endSpeak(msg: Record<string, unknown>): void {
    this.rabbit.publishTopic('end.speak', msg).catch(() => { /* pass */ });
  }

  /**
   * Subscribe to begin-speak events.
   * @param  {speakSubscriptionCallback} handler - The callback for handling the speaking events.
   */
  public onBeginSpeak(handler: SpeakSubscriptionCallback): void {
    this.rabbit.onTopic('begin.speak', (message): void => {
      handler(message);
    }).catch(() => { /* pass */ });
  }

  /**
   * Subscribe to end-speak events.
   * @param  {speakSubscriptionCallback} handler - The callback for handling the speaking events.
   */
  public onEndSpeak(handler: SpeakSubscriptionCallback): void {
    this.rabbit.onTopic('end.speak', (message): void => {
      handler(message);
    }).catch(() => { /* pass */ });
  }
}

export function registerSpeaker(io: Io): void {
  io.speaker = new Speaker(io);
}

cislio.registerPlugins(registerSpeaker);
