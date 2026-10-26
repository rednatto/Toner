/**
 * Chord progressions, written relative to home so they work in any key.
 *
 * Progressions are text in roman numerals measured on the major scale from
 * home, with explicit accidentals for everything else: I ii iii IV V vi vii°,
 * ♭III, ♭VI, ♭VII and so on. Case gives the triad (upper major, lower minor),
 * and a suffix adds the rest: 7 (dominant on upper case, minor seventh on
 * lower), maj7, ø7, °, °7, +, sus2, sus4, 6, 9, add9. `b` and `#` work too.
 */
import { chordQuality, type Chord } from './chords.js';
import type { Mode } from './key.js';
import { mod12, type PitchClass } from './pitch.js';

/** One chord of a progression: where its root sits from home, and its quality. */
export interface Degree {
  offset: number;
  quality: string;
}

const NUMERALS: [string, number][] = [
  ['VII', 11],
  ['VI', 9],
  ['IV', 5],
  ['V', 7],
  ['III', 4],
  ['II', 2],
  ['I', 0],
];

const UPPER_SUFFIX: Record<string, string> = {
  '': 'maj', '7': 'dom7', maj7: 'maj7', M7: 'maj7', '6': '6', '9': '9', add9: 'add9', sus2: 'sus2', sus4: 'sus4', sus: 'sus4',
  '7sus4': '7sus4', '+': 'aug', '+7': 'aug7', '5': '5', maj9: 'maj9', '13': '13', '7b9': '7b9', '7#9': '7#9',
};
const LOWER_SUFFIX: Record<string, string> = {
  '': 'min', '7': 'min7', '6': 'min6', '9': 'min9', '11': 'min11', maj7: 'mMaj7', '°': 'dim', o: 'dim', dim: 'dim',
  '°7': 'dim7', o7: 'dim7', dim7: 'dim7', 'ø': 'm7b5', 'ø7': 'm7b5', m7b5: 'm7b5', add9: 'madd9',
};

/** Parse one roman-numeral token such as "♭VII", "ii7", "V7", "viiø7". */
export function parseRoman(token: string): Degree | null {
  const m = /^([♭b#♯]*)([ivIV]+)(.*)$/.exec(token.trim());
  if (!m) return null;
  const numeral = m[2]!;
  const upper = numeral === numeral.toUpperCase();
  if (!upper && numeral !== numeral.toLowerCase()) return null;
  const hit = NUMERALS.find(([n]) => n === numeral.toUpperCase());
  if (!hit) return null;
  let acc = 0;
  for (const ch of m[1]!) acc += ch === '#' || ch === '♯' ? 1 : -1;
  const quality = (upper ? UPPER_SUFFIX : LOWER_SUFFIX)[m[3]!];
  if (!quality) return null;
  return { offset: mod12(hit[1] + acc), quality };
}

/** Parse a whole progression; `|` and commas are separators only. */
export function parseProgression(text: string): { degrees: Degree[] } | { error: string } {
  const tokens = text.replace(/[|,–—-]/g, ' ').split(/\s+/).filter(Boolean);
  const degrees: Degree[] = [];
  for (const tok of tokens) {
    const d = parseRoman(tok);
    if (!d) return { error: `Can't read "${tok}". Use roman numerals like I ii7 V7 ♭VII.` };
    degrees.push(d);
  }
  return degrees.length ? { degrees } : { error: 'Write at least one chord.' };
}

export function degreeChord(d: Degree, home: PitchClass): Chord {
  return { root: mod12(home + d.offset), quality: d.quality };
}

const ROMAN = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♯IV', 'V', '♭VI', 'VI', '♭VII', 'VII'];
const UPPER_TEXT: Record<string, string> = Object.fromEntries(Object.entries(UPPER_SUFFIX).reverse().map(([k, v]) => [v, k]));
const LOWER_TEXT: Record<string, string> = { min: '', min7: '7', min6: '6', min9: '9', min11: '11', mMaj7: 'maj7', dim: '°', dim7: '°7', m7b5: 'ø7', madd9: 'add9' };

/** Roman numeral text for a degree, measured on the major scale from home (the inverse of parseRoman). */
export function degreeName(d: Degree): string {
  const lower = d.quality in LOWER_TEXT;
  const base = ROMAN[mod12(d.offset)]!;
  if (lower) return base.toLowerCase() + LOWER_TEXT[d.quality];
  const suffix = UPPER_TEXT[d.quality];
  return base + (suffix ?? chordQuality(d.quality).symbol);
}

export interface Progression {
  id: string;
  name: string;
  style: string;
  /** Whether home is heard as major or minor; picks the key for analysis. */
  mode: Mode;
  degrees: Degree[];
  /** Chords per bar when practising; most progressions change once a bar. */
  chordsPerBar: 1 | 2;
  notes?: string;
}

function prog(id: string, name: string, style: string, mode: Mode, text: string, notes?: string, chordsPerBar: 1 | 2 = 1): Progression {
  const r = parseProgression(text);
  if ('error' in r) throw new Error(`${id}: ${r.error}`);
  return { id, name, style, mode, degrees: r.degrees, chordsPerBar, ...(notes ? { notes } : {}) };
}

export const PROGRESSIONS: Progression[] = [
  prog('axis', 'Four-chord pop', 'Pop and rock', 'major', 'I V vi IV', 'The most used loop in pop: home, tension, the relative minor, away.'),
  prog('sensitive', 'Sensitive four', 'Pop and rock', 'major', 'vi IV I V', 'The same four chords starting on the minor: sounds sadder.'),
  prog('fifties', "'50s doo-wop", 'Pop and rock', 'major', 'I vi IV V'),
  prog('threeChord', 'Three-chord rock', 'Pop and rock', 'major', 'I IV V IV'),
  prog('pachelbel', 'Canon', 'Pop and rock', 'major', 'I V vi iii IV I IV V', 'Pachelbel’s bass line; each chord is a step down.', 2),
  prog('royalRoad', 'Royal road', 'Pop and rock', 'major', 'IV V iii vi', 'Very common in J-pop.'),
  prog('mixoRock', 'Mixolydian rock', 'Pop and rock', 'major', 'I ♭VII IV I', 'The ♭VII is borrowed from the minor side.'),
  prog('aeolianRock', 'Minor rock', 'Pop and rock', 'minor', 'i ♭VI ♭VII i'),
  prog('epic', 'Epic minor', 'Pop and rock', 'minor', 'i ♭VI ♭III ♭VII', 'Film-score feel.'),
  prog('creepish', 'Major to minor four', 'Pop and rock', 'major', 'I III IV iv', 'The minor iv at the end is a borrowed, bittersweet colour.'),
  prog('twelveBar', '12-bar blues', 'Blues', 'major', 'I7 I7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7'),
  prog('quickChange', '12-bar, quick change', 'Blues', 'major', 'I7 IV7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7'),
  prog('minorBlues', 'Minor blues', 'Blues', 'minor', 'i7 i7 i7 i7 iv7 iv7 i7 i7 ♭VI7 V7 i7 V7'),
  prog('eightBar', '8-bar blues', 'Blues', 'major', 'I7 V7 IV7 IV7 I7 V7 I7 V7'),
  prog('twoFiveOne', 'ii–V–I', 'Jazz', 'major', 'ii7 V7 Imaj7 Imaj7', 'The core jazz cadence: away, tension, home.'),
  prog('minorTwoFive', 'Minor ii–V–i', 'Jazz', 'minor', 'iiø7 V7 i7 i7'),
  prog('turnaround', 'Turnaround', 'Jazz', 'major', 'Imaj7 vi7 ii7 V7', 'Rhythm-changes style loop back to the top.'),
  prog('circle', 'Circle of fifths', 'Jazz', 'major', 'iii7 vi7 ii7 V7 Imaj7 Imaj7', 'Each root falls a fifth to the next.'),
  prog('andalusian', 'Andalusian cadence', 'Flamenco and Spanish', 'minor', 'i ♭VII ♭VI V', 'Four steps down to the major V; the heart of flamenco and much Spanish music.'),
  prog('phrygian', 'Flamenco Phrygian', 'Flamenco and Spanish', 'major', 'I ♭II ♭III ♭II I', 'Played as E F G F E: home is a major chord in the Phrygian mode.'),
  prog('sevillanas', 'Sevillanas loop', 'Flamenco and Spanish', 'major', 'I ♭II I ♭II ♭III ♭II I I', undefined, 2),
  prog('rumba', 'Rumba flamenca', 'Flamenco and Spanish', 'minor', 'i iv ♭VII ♭III ♭VI ♭II V V', 'A full descent around the circle ending on the Phrygian ♭II.'),
  prog('irishReel', 'Irish reel', 'Irish and Celtic', 'major', 'I I IV V I I IV V', undefined, 2),
  prog('irishDorian', 'Dorian session tune', 'Irish and Celtic', 'minor', 'i ♭VII i ♭VII i ♭VII ♭III ♭VII', 'Modal minor (Dorian or Aeolian) tunes such as many jigs move between i and ♭VII.', 2),
  prog('irishMixo', 'Mixolydian session tune', 'Irish and Celtic', 'major', 'I ♭VII I ♭VII I IV ♭VII I', undefined, 2),
  prog('celticBallad', 'Celtic ballad', 'Irish and Celtic', 'major', 'I V vi IV I IV I V'),
  prog('folkThree', 'Three-chord folk', 'Folk', 'major', 'I IV I V I IV V I'),
  prog('hymn', 'Hymn cadence', 'Folk', 'major', 'I IV I V', 'The plagal (IV–I) and authentic (V–I) cadences in one loop.'),
  prog('bluegrass', 'Bluegrass', 'Folk', 'major', 'I I IV I I V V I'),
  prog('nordicMinor', 'Nordic minor (polska)', 'Folk', 'minor', 'i iv V i i iv V i', 'Harmonic-minor V with a raised leading note, as in many Swedish polskas.'),
  prog('folkMinor', 'Modal folk minor', 'Folk', 'minor', 'i ♭III ♭VII i'),
  prog('americana', 'Americana', 'Folk', 'major', 'I iii IV I'),
  prog('ragtime', 'Ragtime', 'Folk', 'major', 'III7 VI7 II7 V7', 'Secondary dominants chaining down to V; resolves to I.'),
];

export function progression(id: string): Progression | undefined {
  return PROGRESSIONS.find((p) => p.id === id);
}
