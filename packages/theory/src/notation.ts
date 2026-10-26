/**
 * Notation: how numbers are shown to people. This is the swappable layer.
 *
 * The engine only knows Z12. A `Naming` turns pitch classes, chords and
 * scales into labels, so the app can switch between "numbers from home"
 * (home = 0), "numbers with C = 0" and letter names without touching the
 * engine. New visual languages plug in here (and in the app's colour schemes).
 */
import { chordQuality, chordSteps, type Chord } from './chords.js';
import { mod12, octave, relative, type Pitch, type PitchClass } from './pitch.js';
import { scaleSteps, scaleType, type Scale } from './scales.js';

export type NamingMode = 'home' | 'absolute' | 'letters';

export const NAMING_MODES: { id: NamingMode; label: string }[] = [
  { id: 'home', label: 'Numbers from home (home = 0)' },
  { id: 'absolute', label: 'Numbers, C = 0' },
  { id: 'letters', label: 'Letters' },
];

const SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
/** Major homes conventionally written with flats: F, B♭, E♭, A♭, D♭, G♭. */
const FLAT_HOMES = new Set([5, 10, 3, 8, 1, 6]);

export function letterName(pc: PitchClass, preferFlats = false): string {
  return (preferFlats ? FLAT : SHARP)[mod12(pc)]!;
}

/** Plain ASCII letter names, for parsing and file formats. */
export const ASCII_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export interface NamingOptions {
  mode: NamingMode;
  /** Home pitch class; numbers in 'home' mode count from here. */
  home: PitchClass;
  /** Force flats or sharps for letters; by default chosen from the home. */
  flats?: boolean;
}

export class Naming {
  constructor(readonly opts: NamingOptions) {}

  private get flats(): boolean {
    return this.opts.flats ?? FLAT_HOMES.has(mod12(this.opts.home));
  }

  /** Label for a pitch class. */
  pc(pc: PitchClass): string {
    switch (this.opts.mode) {
      case 'home':
        return String(relative(pc, this.opts.home));
      case 'absolute':
        return String(mod12(pc));
      case 'letters':
        return letterName(pc, this.flats);
    }
  }

  /** Label for a pitch with its octave, e.g. "E2", or "4·2" in number modes. */
  pitch(p: Pitch): string {
    const o = octave(p);
    return this.opts.mode === 'letters' ? `${this.pc(p)}${o}` : `${this.pc(p)}·${o}`;
  }

  /** Chord label: letters use conventional symbols, numbers use root⟨steps⟩. */
  chord(c: Chord): string {
    if (this.opts.mode === 'letters') {
      const base = this.pc(c.root) + chordQuality(c.quality).symbol;
      return c.bass === undefined ? base : `${base}/${this.pc(c.bass)}`;
    }
    const base = `${this.pc(c.root)}⟨${chordSteps(c.quality).join(' ')}⟩`;
    return c.bass === undefined ? base : `${base}/${this.pc(c.bass)}`;
  }

  scale(sc: Scale): string {
    const t = scaleType(sc.type);
    if (this.opts.mode === 'letters') return `${this.pc(sc.root)} ${t.name.toLowerCase()}`;
    return `${this.pc(sc.root)}⟨${scaleSteps(sc.type).join(' ')}⟩`;
  }

  /** An interval in semitones; numbers modes keep it a number, letters use conventional names. */
  interval(semitones: number): string {
    return this.opts.mode === 'letters' ? intervalName(semitones) : String(semitones);
  }
}

const INTERVAL_NAMES = ['P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7'];
const EXTENDED: Record<number, string> = { 13: '♭9', 14: '9', 15: '♯9', 17: '11', 18: '♯11', 20: '♭13', 21: '13' };

export function intervalName(semitones: number): string {
  if (semitones === 12) return 'P8';
  return EXTENDED[semitones] ?? INTERVAL_NAMES[mod12(semitones)]!;
}

/** Parse a letter note name such as "C", "f#", "Bb", "E♭". */
export function parseNoteName(s: string): PitchClass | null {
  const m = /^\s*([A-Ga-g])([#♯b♭]*)\s*$/.exec(s);
  if (!m) return null;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]!.toUpperCase() as 'C']!;
  let acc = 0;
  for (const ch of m[2]!) acc += ch === '#' || ch === '♯' ? 1 : -1;
  return mod12(base + acc);
}

/** Parse "E2", "A4", "Bb3" into a pitch. Accidentals do not change the octave: B#3 = C4. */
export function parsePitchName(s: string): Pitch | null {
  const m = /^\s*([A-Ga-g])([#♯b♭]*)(-?\d+)\s*$/.exec(s);
  if (!m) return null;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]!.toUpperCase() as 'C']!;
  let acc = 0;
  for (const ch of m[2]!) acc += ch === '#' || ch === '♯' ? 1 : -1;
  return (Number(m[3]) + 1) * 12 + base + acc;
}

/** Symbols accepted when reading chord sheets, mapped to quality ids. Longest match wins. */
const SYMBOL_ALIASES: Record<string, string> = {
  '': 'maj', M: 'maj', maj: 'maj', m: 'min', min: 'min', '-': 'min',
  '7': 'dom7', maj7: 'maj7', M7: 'maj7', 'Δ': 'maj7', 'Δ7': 'maj7', m7: 'min7', min7: 'min7', '-7': 'min7',
  dim: 'dim', '°': 'dim', o: 'dim', aug: 'aug', '+': 'aug', dim7: 'dim7', '°7': 'dim7', o7: 'dim7',
  m7b5: 'm7b5', 'ø': 'm7b5', 'ø7': 'm7b5', mMaj7: 'mMaj7', mM7: 'mMaj7', 'm(maj7)': 'mMaj7',
  '6': '6', m6: 'min6', add9: 'add9', add2: 'add9', madd9: 'madd9', '9': '9', maj9: 'maj9', m9: 'min9',
  '6/9': '6/9', '69': '6/9', '11': '11', m11: 'min11', '13': '13', maj13: 'maj13', m13: 'min13',
  sus: 'sus4', sus4: 'sus4', sus2: 'sus2', '7sus4': '7sus4', '7sus': '7sus4', '5': '5',
  aug7: 'aug7', '7#5': 'aug7', '+7': 'aug7', augMaj7: 'augMaj7', '7b5': '7b5', '7b9': '7b9', '7#9': '7#9', '7#11': '7#11',
};

/** Parse a conventional chord symbol such as "Am7", "F#maj7/C" or "Bb". */
export function parseChordSymbol(s: string): Chord | null {
  const m = /^\s*([A-Ga-g][#♯b♭]?)([^/\s]*)(?:\/([A-Ga-g][#♯b♭]?))?\s*$/.exec(s);
  if (!m) return null;
  const root = parseNoteName(m[1]!);
  const quality = SYMBOL_ALIASES[m[2]!.replace('♯', '#').replace('♭', 'b')];
  if (root === null || quality === undefined) return null;
  const bass = m[3] ? parseNoteName(m[3]) : null;
  const c: Chord = { root, quality };
  if (bass !== null && bass !== root) c.bass = bass;
  return c;
}
