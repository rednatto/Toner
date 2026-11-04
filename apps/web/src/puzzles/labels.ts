import { mod12, Naming, type Chord, type Mode, type PitchClass } from '@toner/theory';
import { useSettings } from '../settings';

/**
 * Labels for the puzzles: always a number with its letter small beside it.
 * The number follows the naming setting (from home, or C = 0); when the
 * setting is letters, the number is counted from home. Letters are spelled
 * with flats in flat keys, judged from the major key that shares the notes
 * (so 0 minor, with 3 as its relative major, writes E♭ rather than D♯).
 */
const FLAT_MAJORS = new Set([5, 10, 3, 8, 1, 6]);

export function useLabels(mode: Mode = 'major') {
  const { settings } = useSettings();
  const numMode = settings.naming === 'absolute' ? 'absolute' : 'home';
  const num = new Naming({ mode: numMode, home: settings.home });
  const flats = FLAT_MAJORS.has(mod12(settings.home + (mode === 'minor' ? 3 : 0)));
  const let_ = new Naming({ mode: 'letters', home: settings.home, flats });
  return {
    home: settings.home,
    num: (pc: PitchClass) => num.pc(pc),
    letter: (pc: PitchClass) => let_.pc(pc),
    chordNum: (c: Chord) => num.chord(c),
    chordLetter: (c: Chord) => let_.chord(c),
    chord: (c: Chord) => `${num.chord(c)} ${let_.chord(c)}`,
  };
}
