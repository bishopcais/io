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
  private rabbit: Rabbit;

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
   * @param  {string} [options.environment] - Name of environment to use
   * @param  {number} [options.duration] - The max non-stop speak duration. Defaults to (20s or 500ms per word (whichever is greater)) + 4 seconds.
   * @param  {string} [options.voice] - The voice to use. The default depends on the setting of speaker-worker.
   * For English (US), there are en-US_AllisonVoice, en-US_LisaVoice, and en-US_MichaelVoice.
   * For a full list of voice you can use, check [Watson TTS website](http://www.ibm.com/watson/developercloud/doc/text-to-speech/http.shtml#voices).
   * @returns {Promise<Object>} Resolves to "succeeded" or "interrupted".
   */
  public speak(text: string, options: {duration?: number, environment?: string, voice?: string} = {}): Promise<RabbitMessage> {
    if (!options.duration) {
      // We assume a minimum of 500 milliseconds taken per word, with an added buffer of 4 seconds. This seems to work well from empirical tests.
      options.duration = (Math.max((text.match(/[ ]+/g)||[]).length * 500, 20 * 1000) + 4000);
    }

    return this.rabbit.publishRpc(
      `rpc-speaker-${options.environment ? `${options.environment}-` : ''}speakText`,
      Object.assign({}, options, {text}),
      { expiration: options.duration },
    );
  }

  /**
   * Clear the speaker-worker cache
   */
  public clearCache(): void {
    this.rabbit.publishTopic('speaker.command.cache.clear', '').catch(() => { /* pass */ });
  }

  /**
   * Change the speaker volume by some percentage.
   * @param {number} [change] - The change percentage amount.
   */
  public changeVolume(change: number): void {
    this.rabbit.publishTopic('speaker.command.volume.change', { change }).catch(() => { /* pass */ });
  }

  /**
   * Increase speaker volume by some percentage.
   * @param  {number} [change=20] - The change percentage amount.
   */
  public increaseVolume(change = 20): void {
    this.changeVolume(change);
  }

  /**
   * Reduce speaker volume by some percentage.
   * @param  {number} [change=20] - The change percentage amount.
   */
  public reduceVolume(change = 20): void {
    this.changeVolume(-change);
  }

  /**
   * Stop the speaker.
   * @returns {Promise} Resolves to content "done".
   */
  public stop(options?: { environment?: string }): Promise<RabbitMessage> {
    return this.rabbit.publishRpc(`rpc-speaker${options.environment ? `${options.environment}-` : ''}-stop`, '');
  }

  public beginSpeak(msg: Record<string, unknown>): void {
    this.rabbit.publishTopic('speaker.speak.begin', msg).catch(() => { /* pass */ });
  }

  public endSpeak(msg: Record<string, unknown>): void {
    this.rabbit.publishTopic('speaker.speak.end', msg).catch(() => { /* pass */ });
  }

  /**
   * Subscribe to begin-speak events.
   * @param  {speakSubscriptionCallback} handler - The callback for handling the speaking events.
   */
  public onBeginSpeak(handler: SpeakSubscriptionCallback): void {
    this.rabbit.onTopic('speaker.speak.begin', (message): void => {
      handler(message);
    }).catch(() => { /* pass */ });
  }

  /**
   * Subscribe to end-speak events.
   * @param  {speakSubscriptionCallback} handler - The callback for handling the speaking events.
   */
  public onEndSpeak(handler: SpeakSubscriptionCallback): void {
    this.rabbit.onTopic('speaker.speak.end', (message): void => {
      handler(message);
    }).catch(() => { /* pass */ });
  }
}

export function registerSpeaker(io: Io): void {
  io.speaker = new Speaker(io);
}

cislio.registerPlugins(registerSpeaker);
