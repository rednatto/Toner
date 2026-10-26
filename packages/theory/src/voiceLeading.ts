/**
 * Voice leading between pitch-class sets: the smallest total motion that
 * carries one chord into the next, counting each voice's shortest way round
 * the Z12 circle.
 */
import { signedStep, type PitchClass } from './pitch.js';

export interface VoiceLeading {
  /** Pairs of (from, to) pitch classes. */
  moves: { from: PitchClass; to: PitchClass; step: number }[];
  /** Sum of absolute steps in semitones. */
  distance: number;
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  const out: T[][] = [];
  xs.forEach((x, i) => {
    for (const rest of permutations([...xs.slice(0, i), ...xs.slice(i + 1)])) out.push([x, ...rest]);
  });
  return out;
}

/**
 * Minimal voice leading from `a` to `b`. When the sets differ in size, the
 * smaller one has notes doubled so every voice has somewhere to go.
 * Brute force is fine: chords here have at most about 7 distinct notes.
 */
export function voiceLeading(a: PitchClass[], b: PitchClass[]): VoiceLeading {
  const A = [...new Set(a)];
  const B = [...new Set(b)];
  if (A.length === 0 || B.length === 0) return { moves: [], distance: 0 };
  let best: VoiceLeading | null = null;
  const n = Math.max(A.length, B.length);
  const pad = (xs: PitchClass[]): PitchClass[][] => {
    if (xs.length === n) return [xs];
    // Try every way of doubling notes to reach n voices.
    const out: PitchClass[][] = [];
    const extend = (cur: PitchClass[]) => {
      if (cur.length === n) out.push(cur);
      else for (const x of xs) if (cur.length === xs.length || x >= cur[cur.length - 1]!) extend([...cur, x]);
    };
    extend(xs);
    return out;
  };
  for (const pa of pad(A)) {
    for (const pb of pad(B)) {
      for (const perm of permutations(pb)) {
        const moves = pa.map((from, i) => ({ from, to: perm[i]!, step: signedStep(from, perm[i]!) }));
        const distance = moves.reduce((s, m) => s + Math.abs(m.step), 0);
        if (!best || distance < best.distance) best = { moves, distance };
      }
    }
  }
  return best!;
}
