/**
 * Chords: a root pitch class plus a quality, where a quality is a list of
 * semitone steps above the root. Toner writes a chord as root⟨stacked steps⟩,
 * e.g. 7⟨4 3 3⟩ for a dominant seventh on 7, with conventional symbols kept
 * alongside for when letter names are wanted.
 */
import { fromPcs, has, size, toPcs, type PcSet } from './pcset.js';
import { mod12, type PitchClass } from './pitch.js';

export interface ChordQuality {
  id: string;
  /** Conventional suffix after the root letter: '', 'm', '7', 'maj7', … */
  symbol: string;
  name: string;
  /** Semitones above the root, ascending, starting with 0. May exceed 11 for extensions. */
  intervals: number[];
  /** Tones that can be left out of a voicing without changing the chord's identity. */
  optional?: number[];
  /** Rough family used for grouping in the library. */
  family: 'triad' | 'sixth' | 'seventh' | 'extended' | 'suspended' | 'altered' | 'other';
}

const q = (
  id: string,
  symbol: string,
  name: string,
  intervals: number[],
  family: ChordQuality['family'],
  optional?: number[],
): ChordQuality => ({ id, symbol, name, intervals, family, ...(optional ? { optional } : {}) });

/** The chord vocabulary, roughly ordered from most to least common. */
export const CHORD_QUALITIES: readonly ChordQuality[] = [
  q('maj', '', 'major', [0, 4, 7], 'triad'),
  q('min', 'm', 'minor', [0, 3, 7], 'triad'),
  q('5', '5', 'power chord', [0, 7], 'other'),
  q('dom7', '7', 'dominant seventh', [0, 4, 7, 10], 'seventh', [7]),
  q('maj7', 'maj7', 'major seventh', [0, 4, 7, 11], 'seventh', [7]),
  q('min7', 'm7', 'minor seventh', [0, 3, 7, 10], 'seventh', [7]),
  q('sus2', 'sus2', 'suspended second', [0, 2, 7], 'suspended'),
  q('sus4', 'sus4', 'suspended fourth', [0, 5, 7], 'suspended'),
  q('dim', 'dim', 'diminished', [0, 3, 6], 'triad'),
  q('aug', 'aug', 'augmented', [0, 4, 8], 'triad'),
  q('6', '6', 'major sixth', [0, 4, 7, 9], 'sixth', [7]),
  q('min6', 'm6', 'minor sixth', [0, 3, 7, 9], 'sixth', [7]),
  q('add9', 'add9', 'added ninth', [0, 4, 7, 14], 'extended'),
  q('madd9', 'madd9', 'minor added ninth', [0, 3, 7, 14], 'extended'),
  q('7sus4', '7sus4', 'dominant seventh suspended fourth', [0, 5, 7, 10], 'suspended', [7]),
  q('m7b5', 'm7b5', 'half-diminished seventh', [0, 3, 6, 10], 'seventh'),
  q('dim7', 'dim7', 'diminished seventh', [0, 3, 6, 9], 'seventh'),
  q('mMaj7', 'mMaj7', 'minor major seventh', [0, 3, 7, 11], 'seventh', [7]),
  q('9', '9', 'dominant ninth', [0, 4, 7, 10, 14], 'extended', [7]),
  q('maj9', 'maj9', 'major ninth', [0, 4, 7, 11, 14], 'extended', [7]),
  q('min9', 'm9', 'minor ninth', [0, 3, 7, 10, 14], 'extended', [7]),
  q('6/9', '6/9', 'six-nine', [0, 4, 7, 9, 14], 'extended', [7]),
  q('11', '11', 'dominant eleventh', [0, 4, 7, 10, 14, 17], 'extended', [4, 7, 14]),
  q('min11', 'm11', 'minor eleventh', [0, 3, 7, 10, 14, 17], 'extended', [7, 14]),
  q('13', '13', 'dominant thirteenth', [0, 4, 7, 10, 14, 17, 21], 'extended', [7, 14, 17]),
  q('maj13', 'maj13', 'major thirteenth', [0, 4, 7, 11, 14, 21], 'extended', [7, 14]),
  q('min13', 'm13', 'minor thirteenth', [0, 3, 7, 10, 14, 21], 'extended', [7, 14]),
  q('aug7', 'aug7', 'augmented seventh', [0, 4, 8, 10], 'seventh'),
  q('augMaj7', 'augMaj7', 'augmented major seventh', [0, 4, 8, 11], 'seventh'),
  q('7b5', '7b5', 'dominant seventh flat five', [0, 4, 6, 10], 'altered'),
  q('7b9', '7b9', 'dominant seventh flat nine', [0, 4, 7, 10, 13], 'altered', [7]),
  q('7#9', '7#9', 'dominant seventh sharp nine', [0, 4, 7, 10, 15], 'altered', [7]),
  q('7#11', '7#11', 'dominant seventh sharp eleven', [0, 4, 7, 10, 18], 'altered', [7]),
];

const BY_ID = new Map(CHORD_QUALITIES.map((c) => [c.id, c]));

export function chordQuality(id: string): ChordQuality {
  const c = BY_ID.get(id);
  if (!c) throw new Error(`Unknown chord quality: ${id}`);
  return c;
}

export interface Chord {
  root: PitchClass;
  quality: string;
  /** Bass pitch class when it is not the root (slash chord / inversion). */
  bass?: PitchClass;
}

export function chord(root: PitchClass, quality: string, bass?: PitchClass): Chord {
  const c: Chord = { root: mod12(root), quality };
  if (bass !== undefined && mod12(bass) !== mod12(root)) c.bass = mod12(bass);
  return c;
}

/** The pitch classes of a chord, root first, in stacking order. */
export function chordPcs(c: Chord): PitchClass[] {
  const pcs = chordQuality(c.quality).intervals.map((i) => mod12(c.root + i));
  const out = [...new Set(pcs)];
  if (c.bass !== undefined && !out.includes(c.bass)) out.push(c.bass);
  return out;
}

export function chordSet(c: Chord): PcSet {
  return fromPcs(chordPcs(c));
}

/** Stacked steps between consecutive chord tones, e.g. dominant seventh → [4, 3, 3]. */
export function chordSteps(quality: string): number[] {
  const iv = chordQuality(quality).intervals;
  return iv.slice(1).map((x, i) => x - iv[i]!);
}

export function transposeChord(c: Chord, n: number): Chord {
  return chord(c.root + n, c.quality, c.bass === undefined ? undefined : c.bass + n);
}

export interface ChordMatch {
  chord: Chord;
  /** Lower is better. 0 means the notes are exactly the chord. */
  score: number;
  /** Chord tones that were not played. */
  missing: PitchClass[];
  /** Played notes that are not chord tones. */
  extra: PitchClass[];
}

/**
 * Name a set of notes. Tries every root and quality, allowing optional tones
 * to be missing, and ranks the matches. `bass` (the lowest note heard) favours
 * root-position readings and otherwise produces a slash chord.
 */
export function identifyChord(notes: Iterable<PitchClass>, bass?: PitchClass): ChordMatch[] {
  const set = fromPcs(notes);
  const n = size(set);
  if (n === 0) return [];
  const out: ChordMatch[] = [];
  CHORD_QUALITIES.forEach((qual, rank) => {
    const required = qual.intervals.filter((i) => !qual.optional?.includes(i));
    for (const root of toPcs(set)) {
      const tones = qual.intervals.map((i) => mod12(root + i));
      const toneSet = fromPcs(tones);
      const missing = [...new Set(tones.filter((t) => !has(set, t)))];
      const missingRequired = required.some((i) => !has(set, root + i));
      const extra = toPcs(set).filter((p) => !has(toneSet, p));
      if (missingRequired || extra.length > 0) continue;
      let score = missing.length * 2 + rank * 0.01;
      const c = chord(root, qual.id);
      if (bass !== undefined && mod12(bass) !== root) {
        score += 1;
        c.bass = mod12(bass);
      }
      out.push({ chord: c, score, missing, extra });
    }
  });
  return out.sort((a, b) => a.score - b.score);
}
