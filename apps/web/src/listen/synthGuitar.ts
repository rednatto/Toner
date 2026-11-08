/**
 * Offline plucked-string synthesis (Karplus–Strong with a fractional delay),
 * used to test the chord detector on strums of real fingerings. It is cleaner
 * than a real guitar through a real mic (no body resonance, room or noise
 * floor beyond what is added), so accuracy on it is an upper bound.
 */
import { pitchToFreq, type Pitch } from '@toner/theory';

/** Small deterministic PRNG so tests are repeatable. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export interface StrumOptions {
  sampleRate: number;
  seconds: number;
  /** Seconds between strings in the strum. */
  spread: number;
  /** Random detune per string, in cents (±). */
  detuneCents: number;
  /** White noise level added to the mix. */
  noise: number;
  /** Per-sample loop gain; lower decays faster. */
  decay: number;
  /** Down strum (low to high) or up. */
  down: boolean;
  seed: number;
}

export const DEFAULT_STRUM: StrumOptions = { sampleRate: 48000, seconds: 1.5, spread: 0.012, detuneCents: 6, noise: 0.002, decay: 0.996, down: true, seed: 1 };

export function pluckString(out: Float64Array, start: number, freq: number, sampleRate: number, amp: number, decay: number, rand: () => number) {
  const period = sampleRate / freq;
  const len = Math.floor(period);
  const frac = period - len;
  const buf = new Float64Array(len + 2);
  // Pluck: noise burst, lightly low-passed so it is less buzzy.
  let prev = 0;
  for (let i = 0; i < buf.length; i++) {
    const r = rand() * 2 - 1;
    buf[i] = (r + prev) * 0.5;
    prev = r;
  }
  let p = 0;
  for (let i = start; i < out.length; i++) {
    const a = buf[p]!;
    const b = buf[(p + 1) % buf.length]!;
    const y = a + (b - a) * frac;
    out[i]! += y * amp;
    buf[p] = decay * 0.5 * (a + b);
    p = (p + 1) % (len + (frac > 0 ? 1 : 0));
  }
}

/** Strum a set of pitches (low to high) into a new buffer. */
export function strum(pitches: Pitch[], opts: Partial<StrumOptions> = {}): Float64Array {
  const o = { ...DEFAULT_STRUM, ...opts };
  const rand = rng(o.seed);
  const out = new Float64Array(Math.round(o.seconds * o.sampleRate));
  const order = o.down ? pitches : [...pitches].reverse();
  order.forEach((p, i) => {
    const cents = (rand() * 2 - 1) * o.detuneCents;
    const f = pitchToFreq(p) * 2 ** (cents / 1200);
    const start = Math.round((0.02 + i * o.spread) * o.sampleRate);
    pluckString(out, start, f, o.sampleRate, 0.25 * (0.7 + 0.6 * rand()), o.decay, rand);
  });
  for (let i = 0; i < out.length; i++) out[i]! += (rand() * 2 - 1) * o.noise;
  return out;
}
