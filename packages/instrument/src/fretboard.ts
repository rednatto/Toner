/**
 * Fretboard mapping: where pitches and pitch classes sit on a string instrument.
 * Strings are indexed from 0 = lowest-sounding string.
 */
import { mod12, type Pitch, type PitchClass } from '@toner/theory';

export interface FretPosition {
  string: number;
  fret: number;
  pitch: Pitch;
  pc: PitchClass;
}

/** Open-string pitches with a capo applied. */
export function withCapo(strings: Pitch[], capo: number): Pitch[] {
  return strings.map((p) => p + capo);
}

export function fretPitch(strings: Pitch[], string: number, fret: number): Pitch {
  return strings[string]! + fret;
}

/** Every position (up to `frets`) where any of the given pitch classes can be played. */
export function positionsOf(strings: Pitch[], pcs: Iterable<PitchClass>, frets: number): FretPosition[] {
  const want = new Set([...pcs].map(mod12));
  const out: FretPosition[] = [];
  strings.forEach((open, string) => {
    for (let fret = 0; fret <= frets; fret++) {
      const pitch = open + fret;
      const pc = mod12(pitch);
      if (want.has(pc)) out.push({ string, fret, pitch, pc });
    }
  });
  return out;
}

/** Every place a specific pitch can be played. */
export function placesForPitch(strings: Pitch[], pitch: Pitch, frets: number): FretPosition[] {
  const out: FretPosition[] = [];
  strings.forEach((open, string) => {
    const fret = pitch - open;
    if (fret >= 0 && fret <= frets) out.push({ string, fret, pitch, pc: mod12(pitch) });
  });
  return out;
}

/**
 * The string whose open pitch is nearest to a detected pitch, for the tuner's
 * automatic string mode. Returns the string index and the distance in semitones.
 */
export function nearestString(strings: Pitch[], pitch: number): { string: number; distance: number } {
  let best = 0;
  let bestD = Infinity;
  strings.forEach((p, i) => {
    const d = Math.abs(pitch - p);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return { string: best, distance: pitch - strings[best]! };
}

/** Standard inlay frets, for drawing. Double dots at 12 and 24. */
export const INLAYS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
export const DOUBLE_INLAYS = new Set([12, 24]);
