/**
 * Short public-domain melodies for the harmonising puzzle, written in
 * semitones from home (home = 0) with durations in beats, so they play in
 * whatever home is chosen.
 */
import { mod12, type Mode, type PitchClass } from '@toner/theory';
import type { MelodyNote } from '@toner/theory';

export interface PuzzleMelody {
  id: string;
  name: string;
  mode: Mode;
  beatsPerBar: number;
  /** Beats before the first full bar (a pickup). */
  pickup: number;
  notes: [number, number][];
  about: string;
}

export const MELODIES: PuzzleMelody[] = [
  {
    id: 'twinkle',
    name: 'Twinkle, twinkle',
    mode: 'major',
    beatsPerBar: 4,
    pickup: 0,
    notes: [[0, 1], [0, 1], [7, 1], [7, 1], [9, 1], [9, 1], [7, 2], [5, 1], [5, 1], [4, 1], [4, 1], [2, 1], [2, 1], [0, 2]],
    about: 'A warm-up: nearly every stretch has one obvious chord.',
  },
  {
    id: 'ode',
    name: 'Ode to Joy',
    mode: 'major',
    beatsPerBar: 4,
    pickup: 0,
    notes: [
      [4, 1], [4, 1], [5, 1], [7, 1], [7, 1], [5, 1], [4, 1], [2, 1], [0, 1], [0, 1], [2, 1], [4, 1], [4, 1.5], [2, 0.5], [2, 2],
      [4, 1], [4, 1], [5, 1], [7, 1], [7, 1], [5, 1], [4, 1], [2, 1], [0, 1], [0, 1], [2, 1], [4, 1], [2, 1.5], [0, 0.5], [0, 2],
    ],
    about: 'The same phrase twice: the first ends open on 2, the second closes on 0. Can your chords tell them apart?',
  },
  {
    id: 'grace',
    name: 'Amazing Grace',
    mode: 'major',
    beatsPerBar: 3,
    pickup: 1,
    notes: [[-5, 1], [0, 2], [4, 0.5], [0, 0.5], [4, 2], [2, 1], [0, 2], [-3, 1], [-5, 2], [-5, 1], [0, 2], [4, 0.5], [0, 0.5], [4, 2], [2, 1], [7, 3]],
    about: 'Three beats to a bar, with a pickup into the first one. Long notes carry more weight.',
  },
  {
    id: 'sailor',
    name: 'Drunken Sailor',
    mode: 'minor',
    beatsPerBar: 2,
    pickup: 0,
    notes: [
      [7, 0.5], [7, 0.5], [7, 0.5], [7, 0.5], [7, 0.5], [0, 0.5], [3, 0.5], [7, 0.5],
      [5, 0.5], [5, 0.5], [5, 0.5], [5, 0.5], [5, 0.5], [-2, 0.5], [2, 0.5], [5, 0.5],
      [7, 0.5], [7, 0.5], [7, 0.5], [7, 0.5], [7, 0.5], [9, 0.5], [10, 0.5], [12, 0.5],
      [10, 0.5], [7, 0.5], [5, 0.5], [2, 0.5], [0, 1], [0, 1],
    ],
    about: 'A minor-home sea shanty that swings between two chords a whole step apart.',
  },
];

/** The melody as timed notes in a given home, placed near middle C. */
export function melodyNotes(m: PuzzleMelody, home: PitchClass): MelodyNote[] {
  const base = 60 + mod12(home) - (mod12(home) > 6 ? 12 : 0);
  let t = 0;
  return m.notes.map(([p, d]) => {
    const n = { start: t, duration: d, pitch: base + p };
    t += d;
    return n;
  });
}
