/**
 * Raw microphone capture on the audio thread: batches the input into blocks
 * and posts each one to the main thread, stamped with the AudioContext time
 * of its first sample. Used where the page wants the samples themselves
 * (chord listening, recording labelled takes) rather than pitch estimates.
 */
declare const currentTime: number;
declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}

const BLOCK = 1024;

class CaptureProcessor extends AudioWorkletProcessor {
  private buf = new Float32Array(BLOCK);
  private fill = 0;
  private start = 0;

  process(inputs: Float32Array[][]): boolean {
    const ch = inputs[0]?.[0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      if (this.fill === 0) this.start = currentTime + i / sampleRate;
      this.buf[this.fill++] = ch[i]!;
      if (this.fill === BLOCK) {
        this.port.postMessage({ time: this.start, samples: this.buf }, [this.buf.buffer]);
        this.buf = new Float32Array(BLOCK);
        this.fill = 0;
      }
    }
    return true;
  }
}

registerProcessor('toner-capture', CaptureProcessor);
