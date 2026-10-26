/** Small synthesised sounds: reference tones for the tuner and metronome clicks. */
import { pitchToFreq, type Pitch } from '@toner/theory';

/** A plucked-string-like reference tone that decays over a few seconds. */
export function pluck(ctx: AudioContext, pitch: Pitch, a4 = 440, when = ctx.currentTime, seconds = 2.5, destination: AudioNode = ctx.destination, level = 0.35): void {
  const f = pitchToFreq(pitch, a4);
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, when);
  out.gain.exponentialRampToValueAtTime(level, when + 0.005);
  out.gain.exponentialRampToValueAtTime(0.0001, when + seconds);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(Math.min(8000, f * 8), when);
  filter.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.5), when + seconds);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = f;
  osc.connect(filter).connect(out).connect(destination);
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

const strokeCache = new WeakMap<AudioContext, Map<string, AudioBuffer>>();

/**
 * Percussive stand-ins for strumming strokes, rendered once per context:
 * strums are a short burst of a few detuned strings (an open E minor shape),
 * down strokes starting from the low strings and up strokes from the high;
 * chucks are a damped noise click, knocks a low woody thump, bass a single
 * low string.
 */
export function strokeBuffer(ctx: AudioContext, stroke: 'D' | 'U' | 'X' | 'x' | 'K' | 'B', accent = false): AudioBuffer {
  let cache = strokeCache.get(ctx);
  if (!cache) strokeCache.set(ctx, (cache = new Map()));
  const key = stroke + (accent ? '!' : '');
  const hit = cache.get(key);
  if (hit) return hit;
  const sr = ctx.sampleRate;
  const gain = accent ? 1 : 0.7;
  const seconds = stroke === 'D' || stroke === 'U' ? 0.35 : stroke === 'B' ? 0.5 : 0.08;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  let seed = 12345;
  const noise = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 2 ** 32) * 2 - 1;
  };
  if (stroke === 'D' || stroke === 'U') {
    // E minor open: E2 B2 E3 G3 B3 E4.
    const freqs = [82.41, 123.47, 164.81, 196.0, 246.94, 329.63];
    const order = stroke === 'D' ? freqs : [...freqs].reverse();
    const strings = stroke === 'D' ? order : order.slice(0, 4);
    strings.forEach((f, i) => {
      const start = Math.floor(i * 0.009 * sr);
      for (let n = start; n < len; n++) {
        const t = (n - start) / sr;
        const env = Math.exp(-t * (stroke === 'D' ? 9 : 14));
        d[n]! += (gain * 0.22 * env * (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(4 * Math.PI * f * t))) as number;
      }
    });
    for (let n = 0; n < Math.floor(0.03 * sr); n++) d[n]! += gain * 0.15 * noise() * Math.exp(-n / (0.006 * sr));
  } else if (stroke === 'X' || stroke === 'x') {
    for (let n = 0; n < len; n++) {
      const t = n / sr;
      d[n] = gain * 0.6 * noise() * Math.exp(-t * 70) + gain * 0.2 * Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t * 60);
    }
  } else if (stroke === 'K') {
    for (let n = 0; n < len; n++) {
      const t = n / sr;
      d[n] = gain * (0.8 * Math.sin(2 * Math.PI * 120 * t * (1 - t * 3)) * Math.exp(-t * 45) + 0.15 * noise() * Math.exp(-t * 200));
    }
  } else {
    for (let n = 0; n < len; n++) {
      const t = n / sr;
      d[n] = gain * 0.5 * Math.exp(-t * 6) * (Math.sin(2 * Math.PI * 82.41 * t) + 0.5 * Math.sin(4 * Math.PI * 82.41 * t) + 0.2 * Math.sin(6 * Math.PI * 82.41 * t));
    }
  }
  cache.set(key, buf);
  return buf;
}
