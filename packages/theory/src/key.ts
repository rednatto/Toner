/**
 * Keys and harmonic function. A key is a home pitch class plus a mode; every
 * chord is described by where its root sits relative to home (home = 0) and
 * by the job it does: staying home, moving away, building tension, or
 * borrowing colour from outside.
 */
import { chordPcs, chordQuality, type Chord } from './chords.js';
import { has } from './pcset.js';
import { relative, type PitchClass } from './pitch.js';
import { scaleSet } from './scales.js';

export type Mode = 'major' | 'minor';

export interface Key {
  home: PitchClass;
  mode: Mode;
}

export type HarmonicFunction = 'home' | 'away' | 'tension' | 'outside';

export const FUNCTION_INFO: Record<HarmonicFunction, { name: string; conventional: string; description: string }> = {
  home: { name: 'home', conventional: 'tonic', description: 'at rest, at home' },
  away: { name: 'away', conventional: 'subdominant', description: 'moving away from home' },
  tension: { name: 'tension', conventional: 'dominant', description: 'leaning back towards home' },
  outside: { name: 'outside', conventional: 'chromatic', description: 'colour from outside the key' },
};

/** Chord-root offsets from home, by mode and broad quality, with the function they usually carry. */
const FUNCTION_TABLE: Record<Mode, Record<string, HarmonicFunction>> = {
  major: {
    '0:major': 'home', '9:minor': 'home', '4:minor': 'home',
    '5:major': 'away', '2:minor': 'away',
    '7:major': 'tension', '11:diminished': 'tension',
  },
  minor: {
    '0:minor': 'home', '3:major': 'home',
    '5:minor': 'away', '8:major': 'away', '2:diminished': 'away',
    '7:major': 'tension', '7:minor': 'tension', '10:major': 'tension', '11:diminished': 'tension',
  },
};

/** Collapse a quality to the triad that defines its function. */
export function triadFamily(quality: string): 'major' | 'minor' | 'diminished' | 'augmented' | 'other' {
  const iv = new Set(chordQuality(quality).intervals.map((i) => i % 12));
  if (iv.has(4) && iv.has(8) && !iv.has(7)) return 'augmented';
  if (iv.has(3) && iv.has(6) && !iv.has(7)) return 'diminished';
  if (iv.has(4)) return 'major';
  if (iv.has(3)) return 'minor';
  return 'other';
}

const ROMAN = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♯IV', 'V', '♭VI', 'VI', '♭VII', 'VII'];

/** Conventional roman numeral, kept as an alternative label to the Z12 offset. */
export function romanNumeral(c: Chord, key: Key): string {
  const offset = relative(c.root, key.home);
  let base = ROMAN[offset]!;
  // In minor, ♭III, ♭VI and ♭VII are the diatonic degrees, so name relative to the minor scale.
  if (key.mode === 'minor') {
    const minorNames: Record<number, string> = { 3: 'III', 8: 'VI', 10: 'VII', 4: '♯III', 9: '♯VI', 11: '♯VII' };
    base = minorNames[offset] ?? base;
  }
  const fam = triadFamily(c.quality);
  const lower = fam === 'minor' || fam === 'diminished';
  if (c.quality === 'm7b5') return base.toLowerCase() + 'ø7';
  let numeral = lower ? base.toLowerCase() : base;
  if (fam === 'diminished') numeral += '°';
  if (fam === 'augmented') numeral += '+';
  const sym = chordQuality(c.quality).symbol;
  const ext = sym.replace(/^m(?!aj)/, '').replace(/^(dim|aug)/, '');
  return numeral + ext;
}

export function keySet(key: Key) {
  return scaleSet({ root: key.home, type: key.mode === 'major' ? 'major' : 'minor' });
}

export interface ChordAnalysis {
  /** Root relative to home: home = 0. */
  offset: number;
  function: HarmonicFunction;
  /** All chord tones are in the key's scale. */
  diatonic: boolean;
  /** Not diatonic, but every tone belongs to the parallel mode (same home, other mode). */
  borrowed: boolean;
  /** Chord tones outside the key. */
  outsideTones: PitchClass[];
  roman: string;
}

export function analyzeChord(c: Chord, key: Key): ChordAnalysis {
  const pcs = chordPcs(c);
  const ks = keySet(key);
  const outsideTones = pcs.filter((p) => !has(ks, p));
  const diatonic = outsideTones.length === 0;
  const parallel = keySet({ home: key.home, mode: key.mode === 'major' ? 'minor' : 'major' });
  const borrowed = !diatonic && pcs.every((p) => has(parallel, p));
  const offset = relative(c.root, key.home);
  const fam = triadFamily(c.quality);
  let fn: HarmonicFunction = FUNCTION_TABLE[key.mode][`${offset}:${fam}`] ?? 'outside';
  // Chromatic chords are 'outside', except those the table already reads as tension (e.g. major V in minor).
  if (!diatonic && fn !== 'tension') fn = 'outside';
  return { offset, function: fn, diatonic, borrowed, outsideTones, roman: romanNumeral(c, key) };
}

/** Krumhansl–Kessler key profiles (major, minor), index 0 = tonic. */
const PROFILE: Record<Mode, number[]> = {
  major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  minor: [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
};

function correlation(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]! - ma;
    const y = b[i]! - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

/**
 * Guess the key from how much each pitch class is used (a 12-number histogram,
 * e.g. note durations). Returns all 24 keys, best first.
 */
export function detectKey(weights: number[]): { key: Key; score: number }[] {
  const out: { key: Key; score: number }[] = [];
  for (const mode of ['major', 'minor'] as const) {
    for (let home = 0; home < 12; home++) {
      const rotated = Array.from({ length: 12 }, (_, i) => weights[(home + i) % 12] ?? 0);
      out.push({ key: { home, mode }, score: correlation(rotated, PROFILE[mode]) });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Convenience: key guess from a list of chords, each weighted equally. */
export function detectKeyFromChords(chords: Chord[]): { key: Key; score: number }[] {
  const w = new Array<number>(12).fill(0);
  for (const c of chords) for (const p of chordPcs(c)) w[p]! += p === c.root ? 1.5 : 1;
  return detectKey(w);
}

