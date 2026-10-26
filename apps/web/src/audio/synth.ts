/** Small synthesised sounds: reference tones for the tuner and metronome clicks. */
import { pitchToFreq, type Pitch } from '@toner/theory';

/** A plucked-string-like reference tone that decays over a few seconds. */
export function pluck(ctx: AudioContext, pitch: Pitch, a4 = 440, when = ctx.currentTime, seconds = 2.5): void {
  const f = pitchToFreq(pitch, a4);
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, when);
  out.gain.exponentialRampToValueAtTime(0.35, when + 0.005);
  out.gain.exponentialRampToValueAtTime(0.0001, when + seconds);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(Math.min(8000, f * 8), when);
  filter.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.5), when + seconds);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = f;
  osc.connect(filter).connect(out).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + seconds + 0.05);
}

/** A steady drone, for tuning by ear. Returns a stop function. */
export function drone(ctx: AudioContext, pitch: Pitch, a4 = 440): () => void {
  const f = pitchToFreq(pitch, a4);
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, ctx.currentTime);
  out.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.08);
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = f;
  osc.connect(out).connect(ctx.destination);
  osc.start();
  return () => {
    const t = ctx.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(out.gain.value, t);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.stop(t + 0.1);
  };
}

const clickCache = new WeakMap<AudioContext, Map<string, AudioBuffer>>();

/** A short percussive click, rendered once per context and pitch. */
export function clickBuffer(ctx: AudioContext, freq: number, gain: number): AudioBuffer {
  let cache = clickCache.get(ctx);
  if (!cache) clickCache.set(ctx, (cache = new Map()));
  const key = `${freq}:${gain}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const len = Math.floor(ctx.sampleRate * 0.05);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / ctx.sampleRate;
    const env = Math.exp(-t * 90);
    d[i] = gain * env * (Math.sin(2 * Math.PI * freq * t) + 0.3 * Math.sin(2 * Math.PI * freq * 2.01 * t));
  }
  cache.set(key, buf);
  return buf;
}

export function playBuffer(ctx: AudioContext, buf: AudioBuffer, when: number, destination: AudioNode = ctx.destination): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(destination);
  src.start(when);
  return src;
}
