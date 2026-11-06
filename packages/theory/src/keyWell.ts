/**
 * The key well: the semitone clock with home at the top, where a note's
 * distance from the centre says how at home it is in the key. This module is
 * the geometry only (which ring, which angle, where a note leans), so every
 * view that draws a well, large or miniature, agrees on it.
 *
 * Layers go from one ring (a plain clock) to four:
 *   1: every note on one ring
 *   2: in the key, then everything else
 *   3: in the key, borrowed from the parallel mode, outside both
 *   4: the home chord's own notes, the rest of the key, borrowed, outside
 *
 * Spacing gives each note a slice of the rim: 1 for notes in the key, w for
 * borrowed notes and w² for outside notes. At w = 1 it is the even clock, where
 * a gap of n semitones is always the same length. As w falls towards 0 the
 * key's seven notes spread to an almost even seven-step clock and the others
 * squeeze into the gaps between them.
 */
import { has } from './pcset.js';
import { mod12, relative, type Pitch, type PitchClass } from './pitch.js';
import { keySet, pcZone, type Key } from './key.js';

export type WellLayers = 1 | 2 | 3 | 4;

export const WELL_RING_NAMES: Record<WellLayers, readonly string[]> = {
  1: ['every note'],
  2: ['in the key', 'outside the key'],
  3: ['in the key', 'borrowed', 'outside'],
  4: ['home chord', 'in the key', 'borrowed', 'outside'],
};

/** The home chord's steps above home: 0 4 7 in major, 0 3 7 in minor. */
export function homeChordSteps(key: Key): number[] {
  return key.mode === 'major' ? [0, 4, 7] : [0, 3, 7];
}

/** Which ring a pitch class sits on, counted from the centre (0 = innermost). */
export function wellTier(pc: PitchClass, key: Key, layers: WellLayers): number {
  if (layers === 1) return 0;
  const zone = pcZone(pc, key);
  if (layers === 2) return zone === 'key' ? 0 : 1;
  const t3 = zone === 'key' ? 0 : zone === 'borrowed' ? 1 : 2;
  if (layers === 3) return t3;
  return homeChordSteps(key).includes(relative(pc, key.home)) ? 0 : t3 + 1;
}

/** Each step above home's share of the rim, before normalising: 1 in the key, w borrowed, w² outside. */
export function wellSlices(key: Key, spacing = 1): number[] {
  const w = Math.max(0, Math.min(1, spacing));
  return Array.from({ length: 12 }, (_, r) => {
    const zone = pcZone(mod12(key.home + r), key);
    return zone === 'key' ? 1 : zone === 'borrowed' ? w : w * w;
  });
}

/**
 * Angle of a pitch class on the rim, in degrees clockwise from the top, so
 * home is always at 0. With spacing 1 this is simply 30 × (steps above home).
 */
export function wellAngle(pc: PitchClass, key: Key, spacing = 1): number {
  const ws = wellSlices(key, spacing);
  const total = ws.reduce((a, b) => a + b, 0);
  const r = relative(pc, key.home);
  let centre = ws[r]! / 2;
  for (let i = 0; i < r; i++) centre += ws[i]!;
  return (360 * (centre - ws[0]! / 2)) / total;
}

/**
 * Where a note outside the key leans: the key note a semitone away, preferring
 * a note of the home chord, otherwise the one below (a borrowed ♭7 falls to 6
 * before it rises to 7). Notes in the key lean nowhere.
 */
export function wellLean(pc: PitchClass, key: Key): PitchClass | null {
  const ks = keySet(key);
  if (has(ks, pc)) return null;
  const home = homeChordSteps(key);
  const down = mod12(pc - 1);
  const up = mod12(pc + 1);
  const cands = [down, up].filter((p) => has(ks, p));
  if (cands.length === 0) return null;
  return cands.find((p) => home.includes(relative(p, key.home))) ?? cands[0]!;
}

/** How many times each pitch class sounds in a voicing, for drawing doublings. */
export function wellCounts(pitches: readonly Pitch[]): Map<PitchClass, number> {
  const counts = new Map<PitchClass, number>();
  for (const p of pitches) counts.set(mod12(p), (counts.get(mod12(p)) ?? 0) + 1);
  return counts;
}
