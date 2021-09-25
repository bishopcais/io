import cislio from '@cisl/io';
import { Io } from '@cisl/io/io';
import { Rabbit } from '@cisl/io/rabbit';
import { RabbitMessage } from '@cisl/io/types';
import Redis from '@cisl/io/redis';

declare module '@cisl/io/io' {
  interface Io {
    transcript: Transcript;
  }
}

type CallbackHandler = (message: RabbitMessage) => void;

export class Transcript {
  private io: Io;

  public rabbit: Rabbit;

  public redis: Redis;

  public constructor(io: Io) {
    if (!io.rabbit) {
      throw new Error('Must initialize RabbitMQ module for Io');
    }
    else if (!io.redis) {
      throw new Error('Must initialize Redis module for Io');
    }
    this.io = io;
    this.rabbit = io.rabbit;
    this.redis = io.redis;
  }

  /**
   * Subscribe only to the final transcriptions.
   * @param  {transcriptSubscriptionCallback} handler - Function to respond the transcription results.
   */
  public onFinal(handler: CallbackHandler): void {
    this.rabbit.onTopic('*.final.transcript', handler);
  }

  /**
   * Subscribe only to the interim transcriptions before a sentence is finalized.
   * @param  {transcriptSubscriptionCallback} handler - Function to respond the transcription results.
   */
  public onInterim(handler: CallbackHandler): void {
    this.rabbit.onTopic('*.interim.transcript', handler);
  }

  /**
   * Subscribe to all transcriptions.
   * @param  {transcriptSubscriptionCallback} handler - Function to respond the transcription results.
   */
  public onAll(handler: CallbackHandler): void {
    this.rabbit.onTopic('*.*.transcript', handler);
  }

  /**
   * Request all transcript workers to switch to a model.
   * @param  {string} model - The name of the model to switch to.
   */
  public switchModel(model: string): void {
    this.rabbit.publishTopic('switchModel.transcript.command', model);
  }

  /**
   * Request a transcript worker to tag a channel with a speaker name
   * @param  {string} workerID - The transcript worker's UUID. Available in transcript messages' workerID field.
   * @param  {number} channelIndex - The channel index number. Available in transcript messages' channelIndex field.
   * @param  {string} speakerName - The speaker name to tag.
   * @returns {Promise} A promise that resolves to {content: Buffer('done')}.
   */
  public tagChannel(workerID: string, channelIndex: number, speakerName: string): Promise<RabbitMessage> {
    return this.rabbit.publishRpc(`rpc-transcript-${workerID}-tagChannel`, { channelIndex, speaker: speakerName });
  }

  /**
   * Add keywords to all transcript worker
   * @param  {Array<string>} words - An array of keywords
   */
  public addKeywords(words: string[]): void {
    this.redis.sadd('transcript:keywords', ...words);
  }

  /**
   * Request all transcript workers to stop publishing. Useful for entering a privacy mode.
   */
  public stopPublishing(): void {
    this.rabbit.publishTopic('stopPublishing.transcript.command');
  }

  /**
   * Publish transcript result on `[near|far|beamform].[final|interim].transcript`
   * @param  {string} micType - The microphone type: near, far, beamform.
   * Far-range mics are disabled when the agent speaker is playing audio.
   * Beamform mics are disabled whenever some other types of mics are functioning.
   * @param  {bool} isFinal - Indicates whether the result is final.
   * @param  {Object} msg - The transcript to publish.
   */
  public publish(micType: string, isFinal: boolean, msg: Record<string, unknown>): void {
    if (!msg.time_captured) {
      msg.time_captured = new Date().getTime();
    }
    msg.messageID = this.io.generateUuid();
    this.rabbit.publishTopic(`${micType}.${isFinal ? 'final' : 'interim'}.transcript`, JSON.stringify(msg));
  }
}

export function registerTranscript(io: Io): void {
  io.transcript = new Transcript(io);
}

cislio.registerPlugins(registerTranscript);
