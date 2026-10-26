/**
 * Instrument profiles and tunings. This is the only place (with the fretboard
 * and fingering code) that knows about strings. A profile is a list of open
 * string pitches, low to high, plus a fret count, so a bass or ukulele is just
 * another profile.
 */
import { parsePitchName, type Pitch } from '@toner/theory';

export interface Tuning {
  id: string;
  name: string;
  /** Open-string pitches, lowest-sounding string first. */
  strings: Pitch[];
  /** Style or genre this tuning is associated with, for grouping in the tuner. */
  style: string;
  notes?: string;
}

export interface InstrumentProfile {
  id: string;
  name: string;
  frets: number;
  tunings: Tuning[];
  /** Lowest and highest expected fundamentals, for the pitch detector. */
  range: { minHz: number; maxHz: number };
}

const t = (id: string, name: string, notes: string, style: string, extra?: string): Tuning => ({
  id,
  name,
  strings: notes.split(/\s+/).map((n) => {
    const p = parsePitchName(n);
    if (p === null) throw new Error(`Bad pitch ${n} in tuning ${id}`);
    return p;
  }),
  style,
  ...(extra ? { notes: extra } : {}),
});

export const GUITAR: InstrumentProfile = {
  id: 'guitar',
  name: 'Guitar (6 string)',
  frets: 22,
  range: { minHz: 55, maxHz: 1400 },
  tunings: [
    t('standard', 'Standard', 'E2 A2 D3 G3 B3 E4', 'Standard'),
    t('halfDown', 'Half step down', 'Eb2 Ab2 Db3 Gb3 Bb3 Eb4', 'Rock and blues', 'Hendrix, SRV, Guns N’ Roses, Van Halen'),
    t('wholeDown', 'Whole step down', 'D2 G2 C3 F3 A3 D4', 'Rock and blues'),
    t('dropD', 'Drop D', 'D2 A2 D3 G3 B3 E4', 'Rock and metal', 'Power chords with one finger; low D drones'),
    t('dropCs', 'Drop C♯', 'C#2 G#2 C#3 F#3 A#3 D#4', 'Rock and metal'),
    t('dropC', 'Drop C', 'C2 G2 C3 F3 A3 D4', 'Rock and metal'),
    t('openG', 'Open G', 'D2 G2 D3 G3 B3 D4', 'Slide and blues', 'Keith Richards (often without the low string), Delta slide'),
    t('openD', 'Open D', 'D2 A2 D3 F#3 A3 D4', 'Slide and blues', 'Slide and folk'),
    t('openE', 'Open E', 'E2 B2 E3 G#3 B3 E4', 'Slide and blues', 'Slide; same shape as open D, a tone higher'),
    t('openA', 'Open A', 'E2 A2 E3 A3 C#4 E4', 'Slide and blues'),
    t('openC', 'Open C', 'C2 G2 C3 G3 C4 E4', 'Folk and fingerstyle'),
    t('dadgad', 'DADGAD', 'D2 A2 D3 G3 A3 D4', 'Folk and fingerstyle', 'Celtic and modal folk; a suspended open sound'),
    t('openDm', 'Open D minor', 'D2 A2 D3 F3 A3 D4', 'Folk and fingerstyle', 'Skip James style Delta blues'),
    t('doubleDropD', 'Double drop D', 'D2 A2 D3 G3 B3 D4', 'Folk and fingerstyle', 'Neil Young'),
    t('allFourths', 'All fourths', 'E2 A2 D3 G3 C4 F4', 'Jazz and experimental', 'Same shapes on every string pair'),
    t('nst', 'New standard (Fripp)', 'C2 G2 D3 A3 E4 G4', 'Jazz and experimental', 'Fifths plus a minor third on top'),
  ],
};

export const BASS: InstrumentProfile = {
  id: 'bass',
  name: 'Bass (4 string)',
  frets: 20,
  range: { minHz: 28, maxHz: 400 },
  tunings: [t('standard', 'Standard', 'E1 A1 D2 G2', 'Standard'), t('dropD', 'Drop D', 'D1 A1 D2 G2', 'Rock and metal')],
};

export const UKULELE: InstrumentProfile = {
  id: 'ukulele',
  name: 'Ukulele',
  frets: 15,
  range: { minHz: 180, maxHz: 1200 },
  tunings: [
    t('standard', 'Standard (re-entrant)', 'G4 C4 E4 A4', 'Standard'),
    t('lowG', 'Low G', 'G3 C4 E4 A4', 'Standard'),
    t('baritone', 'Baritone', 'D3 G3 B3 E4', 'Standard'),
  ],
};

export const INSTRUMENTS: InstrumentProfile[] = [GUITAR, BASS, UKULELE];

export function instrument(id: string): InstrumentProfile {
  const p = INSTRUMENTS.find((i) => i.id === id);
  if (!p) throw new Error(`Unknown instrument ${id}`);
  return p;
}

/**
 * Parse a custom tuning such as "D A D G A D" or "D2 A2 D3 G3 A3 D4".
 * Bare letters are placed so each string is the nearest pitch above the one
 * below it, starting from the octave of `lowest` (default around E2).
 */
export function parseTuning(s: string, lowest: Pitch = 40): Pitch[] | null {
  const parts = s.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length < 1 || parts.length > 12) return null;
  const out: Pitch[] = [];
  for (const part of parts) {
    const withOctave = parsePitchName(part);
    if (withOctave !== null) {
      out.push(withOctave);
      continue;
    }
    const pc = parsePitchName(`${part}4`);
    if (pc === null) return null;
    if (out.length === 0) {
      // Nearest to `lowest`, within a fifth below or a fourth/tritone above.
      let p = pc;
      while (p - lowest > 6) p -= 12;
      while (lowest - p > 5) p += 12;
      out.push(p);
    } else {
      const prev = out[out.length - 1]!;
      let p = pc;
      while (p <= prev) p += 12;
      while (p - prev > 12) p -= 12;
      out.push(p);
    }
  }
  return out;
}

/** Shift a tuning by a number of semitones (e.g. −1 for "everything down a half step"). */
export function shiftTuning(strings: Pitch[], n: number): Pitch[] {
  return strings.map((p) => p + n);
}
