/**
 * Scales as step patterns. A scale is a root plus a set; modes are rotations
 * of the same set, so "Dorian" is the major set seen from its second note.
 */
import { identifyChord, type Chord } from './chords.js';
import { fromPcs, stepPattern, type PcSet } from './pcset.js';
import { mod12, type PitchClass } from './pitch.js';

export interface ScaleType {
  id: string;
  name: string;
  /** Semitones above the root, ascending, starting with 0. */
  intervals: number[];
  /** Other names people use. */
  aliases?: string[];
  family: 'diatonic' | 'minor' | 'pentatonic' | 'blues' | 'symmetric' | 'other';
}

const s = (
  id: string,
  name: string,
  intervals: number[],
  family: ScaleType['family'],
  aliases?: string[],
): ScaleType => ({ id, name, intervals, family, ...(aliases ? { aliases } : {}) });

export const SCALE_TYPES: readonly ScaleType[] = [
  s('major', 'Major', [0, 2, 4, 5, 7, 9, 11], 'diatonic', ['Ionian']),
  s('dorian', 'Dorian', [0, 2, 3, 5, 7, 9, 10], 'diatonic'),
  s('phrygian', 'Phrygian', [0, 1, 3, 5, 7, 8, 10], 'diatonic'),
  s('lydian', 'Lydian', [0, 2, 4, 6, 7, 9, 11], 'diatonic'),
  s('mixolydian', 'Mixolydian', [0, 2, 4, 5, 7, 9, 10], 'diatonic'),
  s('minor', 'Natural minor', [0, 2, 3, 5, 7, 8, 10], 'diatonic', ['Aeolian']),
  s('locrian', 'Locrian', [0, 1, 3, 5, 6, 8, 10], 'diatonic'),
  s('harmonicMinor', 'Harmonic minor', [0, 2, 3, 5, 7, 8, 11], 'minor'),
  s('melodicMinor', 'Melodic minor', [0, 2, 3, 5, 7, 9, 11], 'minor', ['Jazz minor']),
  s('phrygianDominant', 'Phrygian dominant', [0, 1, 4, 5, 7, 8, 10], 'minor', ['Spanish', 'Freygish']),
  s('harmonicMajor', 'Harmonic major', [0, 2, 4, 5, 7, 8, 11], 'other'),
  s('majorPentatonic', 'Major pentatonic', [0, 2, 4, 7, 9], 'pentatonic'),
  s('minorPentatonic', 'Minor pentatonic', [0, 3, 5, 7, 10], 'pentatonic'),
  s('blues', 'Blues', [0, 3, 5, 6, 7, 10], 'blues', ['Minor blues']),
  s('majorBlues', 'Major blues', [0, 2, 3, 4, 7, 9], 'blues'),
  s('wholeTone', 'Whole tone', [0, 2, 4, 6, 8, 10], 'symmetric'),
  s('diminishedHW', 'Diminished (half-whole)', [0, 1, 3, 4, 6, 7, 9, 10], 'symmetric', ['Octatonic']),
  s('diminishedWH', 'Diminished (whole-half)', [0, 2, 3, 5, 6, 8, 9, 11], 'symmetric'),
  s('augmented', 'Augmented', [0, 3, 4, 7, 8, 11], 'symmetric'),
  s('hungarianMinor', 'Hungarian minor', [0, 2, 3, 6, 7, 8, 11], 'other'),
  s('chromatic', 'Chromatic', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 'symmetric'),
];

const BY_ID = new Map(SCALE_TYPES.map((x) => [x.id, x]));

export function scaleType(id: string): ScaleType {
  const t = BY_ID.get(id);
  if (!t) throw new Error(`Unknown scale: ${id}`);
  return t;
}

export interface Scale {
  root: PitchClass;
  type: string;
}

export function scale(root: PitchClass, type: string): Scale {
  return { root: mod12(root), type };
}

export function scalePcs(sc: Scale): PitchClass[] {
  return scaleType(sc.type).intervals.map((i) => mod12(sc.root + i));
}

export function scaleSet(sc: Scale): PcSet {
  return fromPcs(scalePcs(sc));
}

/** Steps between consecutive notes, e.g. major → [2, 2, 1, 2, 2, 2, 1]. */
export function scaleSteps(type: string): number[] {
  const t = scaleType(type);
  return stepPattern(fromPcs(t.intervals), 0);
}

/**
 * The modes of a scale: the same set seen from each of its notes.
 * Each mode is named when it matches a known scale type.
 */
export function modes(sc: Scale): { root: PitchClass; intervals: number[]; type?: string }[] {
  const pcs = scalePcs(sc);
  return pcs.map((root) => {
    const intervals = pcs.map((p) => mod12(p - root)).sort((a, b) => a - b);
    const match = SCALE_TYPES.find(
      (t) => t.intervals.length === intervals.length && t.intervals.every((v, i) => v === intervals[i]),
    );
    return match ? { root, intervals, type: match.id } : { root, intervals };
  });
}

/**
 * Chords built by stacking every other scale note on each degree.
 * `size` 3 gives triads, 4 gives sevenths.
 */
export function diatonicChords(sc: Scale, chordSize: 3 | 4 = 3): { degree: number; root: PitchClass; pcs: PitchClass[]; chord?: Chord }[] {
  const pcs = scalePcs(sc);
  const n = pcs.length;
  return pcs.map((root, degree) => {
    const tones = Array.from({ length: chordSize }, (_, k) => pcs[(degree + 2 * k) % n]!);
    const named = identifyChord(tones).find((m) => m.chord.root === root && m.missing.length === 0);
    return named ? { degree, root, pcs: tones, chord: named.chord } : { degree, root, pcs: tones };
  });
}

/**
 * Scales that contain every given note, smallest first. Pass `root` to rank
 * scales starting on that note first (the same notes from C are minor
 * pentatonic, from E♭ major pentatonic).
 */
export function scalesContaining(notes: Iterable<PitchClass>, root?: PitchClass): Scale[] {
  const want = fromPcs(notes);
  const out: Scale[] = [];
  for (const t of SCALE_TYPES) {
    if (t.id === 'chromatic') continue;
    for (let root = 0; root < 12; root++) {
      const set = fromPcs(t.intervals.map((i) => root + i));
      if ((set & want) === want) out.push({ root, type: t.id });
    }
  }
  const rank = (x: Scale) => scaleType(x.type).intervals.length + (root !== undefined && x.root !== mod12(root) ? 100 : 0);
  return out.sort((a, b) => rank(a) - rank(b));
}

