/**
 * Microphone analysis on the audio thread.
 *
 * Keeps a ring buffer of the last `frameSize` samples. Every `hop` samples it
 * copies the frame into the Rust detector's memory and runs YIN; every block
 * it also checks for sharp attacks (onsets) with sample-accurate timestamps.
 * Results go to the main thread as plain messages on the AudioContext clock.
 */
import { DEFAULT_INPUT_CONFIG, type InputConfig, type WorkletIn, type WorkletOut } from './messages';

// Minimal typings for the AudioWorklet global scope.
declare const sampleRate: number;
declare const currentTime: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}

interface DspExports {
  memory: WebAssembly.Memory;
  toner_detector_new(capacity: number): number;
  toner_detector_input(d: number): number;
  toner_detector_run(d: number, len: number, sr: number, minHz: number, maxHz: number, threshold: number, gate: number): number;
  toner_detector_clarity(d: number): number;
  toner_detector_rms(d: number): number;
}

class InputProcessor extends AudioWorkletProcessor {
  private cfg: InputConfig;
  private dsp: DspExports | null = null;
  private det = 0;
  private ring: Float32Array;
  private write = 0;
  private sinceHop = 0;
  private lastOnset = -Infinity;
  private quietBlocks = 0;

  constructor(options: { processorOptions: { module: WebAssembly.Module; config?: Partial<InputConfig> } }) {
    super();
    this.cfg = { ...DEFAULT_INPUT_CONFIG, ...options.processorOptions.config };
    this.ring = new Float32Array(this.cfg.frameSize);
    try {
      const inst = new WebAssembly.Instance(options.processorOptions.module, {});
      this.dsp = inst.exports as unknown as DspExports;
      this.det = this.dsp.toner_detector_new(8192);
    } catch (e) {
      this.post({ type: 'error', message: `DSP failed to start: ${String(e)}` });
    }
    this.port.onmessage = (ev: MessageEvent<WorkletIn>) => {
      if (ev.data.type === 'config') {
        const size = this.cfg.frameSize;
        this.cfg = { ...this.cfg, ...ev.data.config };
        if (this.cfg.frameSize !== size) {
          this.ring = new Float32Array(this.cfg.frameSize);
          this.write = 0;
        }
      }
    };
  }

  private post(m: WorkletOut) {
    this.port.postMessage(m);
  }

  process(inputs: Float32Array[][]): boolean {
    const ch = inputs[0]?.[0];
    if (!ch) return true;
    this.detectOnset(ch);
    const ring = this.ring;
    for (let i = 0; i < ch.length; i++) {
      ring[this.write] = ch[i]!;
      this.write = (this.write + 1) % ring.length;
    }
    this.sinceHop += ch.length;
    if (this.sinceHop >= this.cfg.hop && this.dsp) {
      this.sinceHop = 0;
      this.analyse();
    }
    return true;
  }

  private analyse() {
    const dsp = this.dsp!;
    const n = this.ring.length;
    // Memory may have grown since the last call, so take a fresh view each time.
    const input = new Float32Array(dsp.memory.buffer, dsp.toner_detector_input(this.det), n);
    const tail = n - this.write;
    input.set(this.ring.subarray(this.write), 0);
    input.set(this.ring.subarray(0, this.write), tail);
    const c = this.cfg;
    const freq = dsp.toner_detector_run(this.det, n, sampleRate, c.minHz, c.maxHz, c.threshold, c.gate);
    // Timestamp the middle of the analysed frame.
    const time = currentTime - n / 2 / sampleRate;
    this.post({ type: 'pitch', time, freq, clarity: dsp.toner_detector_clarity(this.det), level: dsp.toner_detector_rms(this.det) });
  }

  private detectOnset(ch: Float32Array) {
    let peak = 0;
    let first = -1;
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]!);
      if (a > peak) peak = a;
      if (first < 0 && a >= this.cfg.onsetLevel) first = i;
    }
    const time = currentTime + (first < 0 ? 0 : first / sampleRate);
    // An onset is a loud block after at least one quiet block, outside the holdoff.
    if (first >= 0 && this.quietBlocks > 0 && time - this.lastOnset > this.cfg.onsetHoldoff) {
      this.lastOnset = time;
      this.post({ type: 'onset', time, strength: Math.min(1, peak) });
    }
    this.quietBlocks = peak < this.cfg.onsetLevel * 0.5 ? this.quietBlocks + 1 : 0;
  }
}

registerProcessor('toner-input', InputProcessor);
