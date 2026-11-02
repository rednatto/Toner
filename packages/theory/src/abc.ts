/**
 * ABC notation in: the text format most folk tune collections are written in
 * (https://abcnotation.com/wiki/abc:standard:v2.1). A tune becomes a Toner
 * song: the written strains become sections, repeats and first and second
 * endings become the arrangement, chord symbols become chords, and the melody
 * becomes a part of timed notes in play order.
 *
 * This reads the subset folk collections use: one voice, notes and rests with
 * lengths, accidentals, ties, broken rhythm, tuplets, chords in brackets,
 * chord symbols, repeats, endings and inline key, metre and length changes.
 * Grace notes, ornaments, articulations, bowings, dynamics and slurs are kept
 * on the notes; free text becomes annotations on the bar; road signs (segno,
 * coda, Fine, D.C., D.S.) become bar marks and are followed in the arrangement.
 * Anything it cannot read is skipped with a warning, so a tune with a stray
 * character still comes through.
 */
import type { Chord } from './chords.js';
import type { Mode } from './key.js';
import { parseChordSymbol, parseNoteName } from './notation.js';
import { mod12, type PitchClass } from './pitch.js';
import { parseTimeSignature, type TimeSignature } from './rhythm.js';
import { scaleType } from './scales.js';
import { SONG_FORMAT, SONG_VERSION, type Annotation, type Bar, type BarMark, type Section, type Song, type TimedNote } from './song.js';

/** Decoration names (!name! or +name+) and their mark ids. */
const DECORATIONS: Record<string, string> = {
  trill: 'trill',
  tr: 'trill',
  roll: 'roll',
  '~': 'roll',
  staccato: 'staccato',
  '.': 'staccato',
  tenuto: 'tenuto',
  accent: 'accent',
  emphasis: 'accent',
  '>': 'accent',
  fermata: 'fermata',
  invertedfermata: 'fermata',
  mordent: 'mordent',
  lowermordent: 'mordent',
  uppermordent: 'uppermordent',
  pralltriller: 'uppermordent',
  turn: 'turn',
  invertedturn: 'turn',
  slide: 'slide',
  breath: 'breath',
  upbow: 'upbow',
  downbow: 'downbow',
  ppp: 'ppp',
  pp: 'pp',
  p: 'p',
  mp: 'mp',
  mf: 'mf',
  f: 'f',
  ff: 'ff',
  fff: 'fff',
  sfz: 'sfz',
};
/** The one-character decorations of ABC 2.1, plus J and R as most collections use them. */
const SHORT_DECORATIONS: Record<string, string> = {
  '.': 'staccato',
  '~': 'roll',
  H: 'fermata',
  L: 'accent',
  M: 'mordent',
  P: 'uppermordent',
  T: 'trill',
  u: 'upbow',
  v: 'downbow',
  J: 'slide',
  R: 'roll',
};
/** Quoted text that older collections use in place of decorations. */
const TEXT_MARKS: Record<string, string> = { '~': 'roll', tr: 'trill', '>': 'accent', H: 'fermata', ...Object.fromEntries(['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'sfz'].map((d) => [d, d])) };

/** Road signs written as text or decorations. */
export function barMarkOf(text: string): BarMark | null {
  const t = text
    .trim()
    .replace(/^\(|\)$/g, '')
    .trim()
    .toLowerCase();
  if (/^d\.?\s?c\.?(\s|$)|^da ?capo/.test(t)) return 'dc';
  if (/^d\.?\s?s\.?(\s|$)|^dal ?segno/.test(t)) return 'ds';
  if (/^(fine|end)\.?$/.test(t)) return 'fine';
  if (/^(segno|sign|s)$/.test(t)) return 'segno';
  if (/^(to ?coda|dacoda)$/.test(t)) return 'toCoda';
  if (/^coda$/.test(t)) return 'coda';
  return null;
}
const END_MARKS = new Set<BarMark>(['fine', 'dc', 'ds', 'toCoda']);

/** Header fields kept from the tune, for display and attribution. */
export interface AbcInfo {
  /** Reference number from X:. */
  index?: number;
  titles: string[];
  composer?: string;
  origin?: string;
  rhythm?: string;
  /** Book the tune came from (B:). */
  book?: string;
  /** Where it was collected (S:). */
  source?: string;
  /** Who transcribed or edited it (Z:). */
  transcription?: string;
  notes: string[];
  /** The key as written in K:, such as "Dmix". */
  key: string;
  /** Scale type id of the key's mode, such as 'mixolydian'. */
  scale: string;
}

export interface AbcTune {
  song: Song;
  info: AbcInfo;
  warnings: string[];
}

/** Split a file of tunes into one text per tune, each starting at its X: line. */
export function splitAbcTunes(text: string): string[] {
  const out: string[] = [];
  let cur: string[] | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^X:/.test(line)) {
      if (cur) out.push(cur.join('\n'));
      cur = [line];
    } else if (cur) cur.push(line);
  }
  if (cur) out.push(cur.join('\n'));
  return out.map((t) => t.trim()).filter((t) => t.length > 0);
}

/** Just the X: number, titles, key and rhythm of each tune, without reading the music. For listing a big file quickly. */
export function indexAbc(text: string): { index?: number; title: string; key: string; rhythm?: string; offset: number }[] {
  const out: { index?: number; title: string; key: string; rhythm?: string; offset: number }[] = [];
  const re = /^X:[ \t]*(\d*)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const next = text.indexOf('\nX:', m.index + 1);
    const head = text.slice(m.index, next < 0 ? undefined : next);
    const field = (f: string) => new RegExp(`^${f}:[ \\t]*(.*)$`, 'm').exec(head)?.[1]?.trim();
    const entry: (typeof out)[number] = { title: field('T') || 'Untitled', key: field('K') ?? 'C', offset: m.index };
    if (m[1]) entry.index = Number(m[1]);
    const r = field('R');
    if (r) entry.rhythm = r;
    out.push(entry);
  }
  return out;
}

const MODE_OFFSETS: Record<string, { scale: string; mode: Mode }> = {
  maj: { scale: 'major', mode: 'major' },
  ion: { scale: 'major', mode: 'major' },
  min: { scale: 'minor', mode: 'minor' },
  aeo: { scale: 'minor', mode: 'minor' },
  mix: { scale: 'mixolydian', mode: 'major' },
  dor: { scale: 'dorian', mode: 'minor' },
  phr: { scale: 'phrygian', mode: 'minor' },
  lyd: { scale: 'lydian', mode: 'major' },
  loc: { scale: 'locrian', mode: 'minor' },
};

const LETTERS = 'CDEFGAB';
const NATURAL = [0, 2, 4, 5, 7, 9, 11];

interface KeyInfo {
  home: PitchClass;
  mode: Mode;
  scale: string;
  /** Alteration in semitones for each letter C..B. */
  signature: number[];
}

/** Read a K: value such as "G", "Dmix", "F#m", "Bb dorian", "none" or "Hp". */
export function parseAbcKey(value: string): KeyInfo | null {
  const v = value.trim();
  if (v === '' || /^none\b/i.test(v)) return { home: 0, mode: 'major', scale: 'major', signature: [0, 0, 0, 0, 0, 0, 0] };
  // Highland pipes: A mixolydian, written with F and C sharp ("Hp") or no signature ("HP").
  if (/^Hp\b/.test(v)) return { home: 9, mode: 'major', scale: 'mixolydian', signature: [1, 0, 0, 1, 0, 0, 0] };
  if (/^HP\b/.test(v)) return { home: 9, mode: 'major', scale: 'mixolydian', signature: [0, 0, 0, 0, 0, 0, 0] };
  const m = /^([A-G])([#b♯♭]?)\s*([A-Za-z]*)(.*)$/.exec(v);
  if (!m) return null;
  const home = parseNoteName(m[1]! + m[2]!)!;
  let word = m[3]!.toLowerCase();
  let extra = m[4]!;
  if (word === 'exp') {
    word = '';
    extra = `exp ${extra}`;
  }
  const info = word === '' ? MODE_OFFSETS.maj : word === 'm' ? MODE_OFFSETS.min : MODE_OFFSETS[word.slice(0, 3)];
  if (!info) return null;
  // Spell the scale from the tonic letter, so each letter gets the alteration the key gives it.
  const intervals = scaleType(info.scale).intervals;
  const signature = [0, 0, 0, 0, 0, 0, 0];
  const start = LETTERS.indexOf(m[1]!);
  intervals.forEach((iv, i) => {
    const li = (start + i) % 7;
    let alter = mod12(home + iv - NATURAL[li]!);
    if (alter > 6) alter -= 12;
    signature[li] = alter;
  });
  // Explicit accidentals after the mode, as in "K:D exp ^c" or "K:G ^c".
  for (const acc of extra.matchAll(/(\^\^|\^|__|_|=)([A-Ga-g])/g)) {
    signature[LETTERS.indexOf(acc[2]!.toUpperCase())] = acc[1] === '^' ? 1 : acc[1] === '^^' ? 2 : acc[1] === '_' ? -1 : acc[1] === '__' ? -2 : 0;
  }
  if (/\bexp\b/i.test(extra)) {
    const explicit = new Set([...extra.matchAll(/[\^_=]+([A-Ga-g])/g)].map((a) => a[1]!.toUpperCase()));
    LETTERS.split('').forEach((l, i) => {
      if (!explicit.has(l)) signature[i] = 0;
    });
  }
  return { home, mode: info.mode, scale: info.scale, signature };
}

/** Read an M: value. "C" is 4/4 and "C|" is 2/2; "none" is free time, read as 4/4. */
export function parseAbcMeter(value: string): TimeSignature | null {
  const v = value.trim();
  if (v === 'C') return { beats: 4, unit: 4 };
  if (v === 'C|') return { beats: 2, unit: 2 };
  if (/^none$/i.test(v)) return { beats: 4, unit: 4 };
  // Additive metres such as (2+3)/8 count as their total.
  const add = /^\(?([\d+]+)\)?\s*\/\s*(\d+)$/.exec(v);
  if (add && add[1]!.includes('+')) {
    const beats = add[1]!.split('+').reduce((a, b) => a + Number(b), 0);
    return parseTimeSignature(`${beats}/${add[2]}`);
  }
  return parseTimeSignature(v);
}

/** Read a length such as "1/8" as a fraction of a whole note. */
function parseFraction(value: string): number | null {
  const m = /^\s*(\d+)\s*\/\s*(\d+)/.exec(value);
  return m && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : null;
}

/** Read a Q: value as quarter notes per minute. Accepts "120", "1/4=120", "3/8=80" and "Allegro 1/4=120". */
function parseTempo(value: string): number | null {
  const m = /(?:(\d+)\s*\/\s*(\d+)\s*=\s*)?(\d+(?:\.\d+)?)\s*"?\s*$/.exec(value.replace(/"[^"]*"/g, '').trim());
  if (!m) return null;
  const bpm = Number(m[3]);
  const beat = m[1] ? Number(m[1]) / Number(m[2]) : 0.25;
  return bpm > 0 ? bpm * beat * 4 : null;
}

/** Typical speeds by tune type, in quarter notes per minute, for tunes without a Q: field. */
const RHYTHM_TEMPO: [RegExp, number][] = [
  [/reel|hornpipe|polka|march|strathspey|barndance|fling/i, 200],
  [/slip ?jig|single ?jig|jig|slide/i, 180],
  [/waltz|mazurka|polska/i, 120],
  [/air|slow|lament|song/i, 70],
];

interface WrittenNote {
  /** Offset within the bar, in whole notes. */
  at: number;
  /** Length in whole notes. */
  length: number;
  pitch: number;
  grace?: number[];
  marks?: string[];
  /** Slur number as written; renumbered per pass in play order. */
  slur?: number;
}

interface WrittenBar {
  notes: WrittenNote[];
  chords: { at: number; chord: Chord }[];
  annotations: { at: number; text: string }[];
  marks: BarMark[];
  /** Length in whole notes as written. */
  length: number;
  meter: TimeSignature;
  /** The bar line that closes it. */
  end: string;
}

interface Strain {
  body: WrittenBar[];
  first: WrittenBar[];
  second: WrittenBar[];
  repeat: boolean;
}

/** Parse one tune. Throws only if the text has no K: field to start the music. */
export function parseAbc(text: string): AbcTune {
  const warnings: string[] = [];
  const warn = (w: string) => {
    if (warnings.length < 20 && !warnings.includes(w)) warnings.push(w);
  };
  const info: AbcInfo = { titles: [], notes: [], key: 'C', scale: 'major' };
  let meter: TimeSignature = { beats: 4, unit: 4 };
  let meterSet = false;
  let unitLength: number | null = null;
  let tempo: number | null = null;
  let key: KeyInfo = parseAbcKey('C')!;
  let sawKey = false;

  const lines = text.split(/\r?\n/);
  let i = 0;
  // Header: fields up to and including K:.
  for (; i < lines.length; i++) {
    const line = lines[i]!.replace(/%.*$/, '');
    const f = /^([A-Za-z]):\s*(.*)$/.exec(line);
    if (!f) continue;
    const [, name, value] = f as unknown as [string, string, string];
    // Collections often quote free-text fields; the quotes are not part of the text.
    const v = /^[BNSZ]$/.test(name) ? unquote(value) : value.trim();
    switch (name) {
      case 'X':
        if (/^\d+/.test(v)) info.index = parseInt(v, 10);
        break;
      case 'T':
        if (v) info.titles.push(v);
        break;
      case 'C':
        info.composer = info.composer ? `${info.composer}; ${v}` : v;
        break;
      case 'O':
        info.origin = v;
        break;
      case 'R':
        info.rhythm = v;
        break;
      case 'B':
        info.book = v;
        break;
      case 'S':
        info.source = v;
        break;
      case 'Z':
        if (v) info.transcription = info.transcription ? `${info.transcription}; ${v}` : v;
        break;
      case 'N':
        if (v) info.notes.push(v);
        break;
      case 'M': {
        const ts = parseAbcMeter(v);
        if (ts) {
          meter = ts;
          meterSet = true;
        } else warn(`unreadable metre "${v}"`);
        break;
      }
      case 'L':
        unitLength = parseFraction(v) ?? unitLength;
        break;
      case 'Q':
        tempo = parseTempo(v) ?? tempo;
        break;
      case 'K': {
        const k = parseAbcKey(v);
        if (k) key = k;
        else warn(`unreadable key "${v}"`);
        sawKey = true;
        info.key = v;
        info.scale = key.scale;
        break;
      }
    }
    if (name === 'K') {
      i++;
      break;
    }
  }
  if (!sawKey) throw new Error('no K: field');
  const headerKey = key;
  if (!meterSet) warn('no metre; reading as 4/4');
  // Default unit length: 1/16 for metres under 3/4, otherwise 1/8.
  let unit = unitLength ?? (meter.beats / meter.unit < 0.75 ? 1 / 16 : 1 / 8);
  const songMeter = meter;

  const strains: Strain[] = [];
  let strain: Strain = { body: [], first: [], second: [], repeat: false };
  let ending = 0;
  let bar: WrittenBar = { notes: [], chords: [], annotations: [], marks: [], length: 0, meter, end: '' };
  let barAccidentals = new Map<string, number>();
  let pendingChord = null as Chord | null;
  /** The last note or bracket chord placed, for broken rhythm and ties. */
  // Typed by assertion so the compiler does not narrow it to null; closures below assign it.
  let last = null as { notes: WrittenNote[] } | null;
  let tieFrom: WrittenNote[] = [];
  let broken = 1;
  let tuplet = null as { ratio: number; left: number } | null;
  let stopped = false;
  let pendingGrace: number[] = [];
  let pendingMarks: string[] = [];
  let pendingText: string[] = [];
  const slurs: number[] = [];
  let slurCount = 0;
  let lastBar = null as WrittenBar | null;

  const closeStrain = () => {
    if (strain.body.length || strain.first.length || strain.second.length) strains.push(strain);
    strain = { body: [], first: [], second: [], repeat: false };
    ending = 0;
  };

  const closeBar = (line: string) => {
    bar.end = line;
    const empty = bar.notes.length === 0 && bar.chords.length === 0 && bar.length === 0 && !bar.marks.length && !bar.annotations.length;
    if (!empty) {
      lastBar = bar;
      // A first ending closed by :| with no second ending after it: the strain is over.
      if (ending === -1) closeStrain();
      (ending === 1 ? strain.first : ending === 2 ? strain.second : strain.body).push(bar);
    }
    bar = { notes: [], chords: [], annotations: [], marks: [], length: 0, meter, end: '' };
    barAccidentals = new Map();
    // A chord symbol carries over the bar line until a note claims it.
  };

  /** Apply a bar line token to the strain structure. */
  const barLine = (tok: string) => {
    const t = tok.replace(/\s/g, '');
    const endRepeat = t.startsWith(':');
    const startRepeat = t.endsWith(':');
    const thick = t.includes('||') || t.includes('|]') || t.includes('[|');
    closeBar(t);
    if (endRepeat) strain.repeat = true;
    if (endRepeat && ending === 1 && !startRepeat)
      ending = -1; // waiting for the second ending
    else if (startRepeat && !endRepeat && strain.body.length === 1 && !strain.first.length && strain.body[0]!.length < fullBar(strain.body[0]!.meter) - 1e-6) {
      // A pickup before |: belongs to the strain that follows.
    } else if (endRepeat || thick || startRepeat) closeStrain();
  };

  const startEnding = (n: number) => {
    ending = n === 1 ? 1 : 2;
  };

  const placeNotes = (pitches: number[], lengthUnits: number, accept = true) => {
    let length = lengthUnits * unit * broken;
    broken = 1;
    if (tuplet) {
      length *= tuplet.ratio;
      if (--tuplet.left <= 0) tuplet = null;
    }
    const placed: WrittenNote[] = [];
    for (const text of pendingText) bar.annotations.push({ at: bar.length, text });
    pendingText = [];
    if (accept) {
      for (const pitch of pitches) {
        const tied = tieFrom.find((n) => n.pitch === pitch);
        if (tied) {
          tied.length += length;
          placed.push(tied);
        } else {
          const n: WrittenNote = { at: bar.length, length, pitch };
          if (pendingGrace.length && !placed.length) n.grace = pendingGrace;
          if (pendingMarks.length) n.marks = [...new Set(pendingMarks)];
          if (slurs.length) n.slur = slurs.at(-1)!;
          bar.notes.push(n);
          placed.push(n);
        }
      }
      pendingGrace = [];
      pendingMarks = [];
      if (pendingChord) {
        bar.chords.push({ at: bar.length, chord: pendingChord });
        pendingChord = null;
      }
    }
    tieFrom = [];
    bar.length += length;
    last = { notes: placed };
    return length;
  };

  const meterChange = (v: string) => {
    const ts = parseAbcMeter(v);
    if (ts) {
      meter = ts;
      bar.meter = ts;
      if (unitLength === null) unit = meter.beats / meter.unit < 0.75 ? 1 / 16 : 1 / 8;
    }
  };
  const inlineField = (name: string, v: string) => {
    if (name === 'K') {
      const k = parseAbcKey(v);
      if (k) key = k;
    } else if (name === 'M') meterChange(v);
    else if (name === 'L') unit = parseFraction(v) ?? unit;
    else if (name === 'Q') tempo = parseTempo(v) ?? tempo;
    else if (name === 'V') {
      if (seenVoice && v.split(/\s/)[0] !== firstVoice) stopped = true;
      if (!seenVoice) {
        seenVoice = true;
        firstVoice = v.split(/\s/)[0]!;
      }
    }
  };
  let seenVoice = false;
  let firstVoice = '';

  const pitchOf = (acc: string, letter: string, octaves: string): number => {
    const upper = letter.toUpperCase();
    const li = LETTERS.indexOf(upper);
    let octave = letter === upper ? 4 : 5;
    for (const ch of octaves) octave += ch === "'" ? 1 : -1;
    const k = `${upper}${octave}`;
    let alter: number;
    if (acc) {
      alter = acc === '^' ? 1 : acc === '^^' ? 2 : acc === '_' ? -1 : acc === '__' ? -2 : 0;
      barAccidentals.set(k, alter);
    } else alter = barAccidentals.get(k) ?? key.signature[li]!;
    return (octave + 1) * 12 + NATURAL[li]! + alter;
  };

  /** A road sign, a mark on the next note, or free text, from a quoted string or a decoration. */
  const textOrMark = (text: string, decoration: boolean, lineEnd = false) => {
    const sign = barMarkOf(text);
    if (sign) {
      // Signs that act at the end of a bar, written after its bar line at the end of a line, belong to the bar before.
      const empty = bar.notes.length === 0 && bar.length === 0;
      const target = empty && lineEnd && END_MARKS.has(sign) && lastBar ? lastBar : bar;
      if (!target.marks.includes(sign)) target.marks.push(sign);
      return;
    }
    const mark = decoration ? DECORATIONS[text] : TEXT_MARKS[text.trim()];
    if (mark) pendingMarks.push(mark);
    else if (decoration) {
      // Hairpins and other spans have no note to sit on; keep them as text.
      if (/[()]$/.test(text)) pendingText.push(text.replace(/[()]$/, '').replace(/^</, 'cresc').replace(/^>/, 'dim'));
      else pendingMarks.push(text);
    } else if (text.trim()) pendingText.push(text.trim());
  };

  const readLength = (s: string, at: number): { units: number; next: number } => {
    const m = /^(\d*)(\/*)(\d*)/.exec(s.slice(at))!;
    let units = m[1] ? Number(m[1]) : 1;
    if (m[2]) units /= m[3] ? Number(m[3]) * 2 ** (m[2].length - 1) : 2 ** m[2].length;
    return { units, next: at + m[0].length };
  };

  for (; i < lines.length && !stopped; i++) {
    let line = lines[i]!;
    if (/^%/.test(line)) continue;
    const field = /^([A-Za-z]):\s*(.*)$/.exec(line);
    if (field) {
      const [, name, v] = field as unknown as [string, string, string];
      if (name === 'X') break;
      if ('KMLQV'.includes(name!)) inlineField(name!, v!.replace(/%.*$/, ''));
      if (name === 'T' && v!.trim() && !info.titles.includes(v!.trim())) info.notes.push(`Part: ${v!.trim()}`);
      continue;
    }
    line = line.replace(/%.*$/, '');
    const atLineEnd = (from: number) => /^[\s|\]:\\]*$/.test(line.slice(from));
    let p = 0;
    while (p < line.length && !stopped) {
      const ch = line[p]!;
      const rest = line.slice(p);
      // Bar lines, repeats and endings.
      const bl = /^(:*\|[|\]:]*|:*\[\||::+)\s*(\[?\d[\d,-]*)?/.exec(rest);
      if (bl && !/^\[\|?[A-Za-z]:/.test(rest)) {
        barLine(bl[1]!);
        if (bl[2]) startEnding(Number(/\d/.exec(bl[2])![0]));
        p += bl[0].length;
        continue;
      }
      // Endings written as [1 or [2 without a bar line.
      const en = /^\[(\d)/.exec(rest);
      if (en) {
        startEnding(Number(en[1]));
        p += en[0].length;
        continue;
      }
      // Inline fields such as [K:D] or [M:3/4].
      const inl = /^\[([A-Za-z]):([^\]]*)\]/.exec(rest);
      if (inl) {
        inlineField(inl[1]!, inl[2]!);
        p += inl[0].length;
        continue;
      }
      // Chord symbols and annotations.
      if (ch === '"') {
        const close = line.indexOf('"', p + 1);
        const body = line.slice(p + 1, close < 0 ? undefined : close);
        p = close < 0 ? line.length : close + 1;
        if (TEXT_MARKS[body.trim()] || barMarkOf(body)) {
          textOrMark(body, false, atLineEnd(p));
          continue;
        }
        // A leading ^ _ < > @ places free text; anything else that is not a chord symbol is free text too.
        if (/^[_^<>@]/.test(body)) {
          textOrMark(body.slice(1), false, atLineEnd(p));
          continue;
        }
        const sym = body.replace(/^\(|\)$/g, '').split(/[\s(]/)[0]!;
        const c = parseChordSymbol(sym);
        if (c) pendingChord = c;
        else textOrMark(body, false);
        continue;
      }
      // Decorations.
      if (ch === '!' || ch === '+') {
        const close = line.indexOf(ch, p + 1);
        const name = close < 0 ? '' : line.slice(p + 1, close);
        // Older files use a lone ! as a line break, so only a known decoration or a plain lower-case word counts.
        if (name && name.length <= 24 && (name in DECORATIONS || barMarkOf(name) || /^([a-z][a-zA-Z]*[()]?|[<>][()]|[0-5])$/.test(name))) {
          textOrMark(name, true, atLineEnd(close + 1));
          p = close + 1;
        } else p++;
        continue;
      }
      if (ch in SHORT_DECORATIONS || ch === 'S' || ch === 'O') {
        if (ch === 'S') textOrMark('segno', false);
        else if (ch === 'O') textOrMark('coda', false);
        else pendingMarks.push(SHORT_DECORATIONS[ch]!);
        p++;
        continue;
      }
      // Grace notes, before the note they lead into. A slash (acciaccatura) is read the same.
      if (ch === '{') {
        const close = line.indexOf('}', p);
        const inner = line.slice(p + 1, close < 0 ? undefined : close);
        for (const g of inner.matchAll(/(\^\^|\^|__|_|=)?([A-Ga-g])([',]*)/g)) pendingGrace.push(pitchOf(g[1] ?? '', g[2]!, g[3]!));
        p = close < 0 ? line.length : close + 1;
        continue;
      }
      // Tuplets: (3, (3:2, (3:2:3. A plain ( is a slur.
      const tu = /^\((\d)(?::(\d*))?(?::(\d*))?/.exec(rest);
      if (tu) {
        const n = Number(tu[1]);
        const compound = meter.unit === 8 && meter.beats % 3 === 0 && meter.beats > 3;
        const q = tu[2] ? Number(tu[2]) : n === 2 || n === 4 || n === 8 ? 3 : n === 3 || n === 6 ? 2 : compound ? 3 : 2;
        tuplet = { ratio: q / n, left: tu[3] ? Number(tu[3]) : n };
        p += tu[0].length;
        continue;
      }
      // Broken rhythm: shorten or lengthen the note before and after.
      const br = /^(>+|<+)/.exec(rest);
      if (br) {
        const k = 1 - 0.5 ** br[1]!.length;
        const before = br[1]![0] === '>' ? 1 + k : 1 - k;
        const after = 2 - before;
        if (last) {
          for (const n of last.notes) {
            const old = n.length;
            n.length *= before;
            if (n === last.notes[0]) bar.length += n.length - old;
          }
        }
        broken = after;
        p += br[0].length;
        continue;
      }
      if (ch === '-' && last) {
        tieFrom = last.notes;
        p++;
        continue;
      }
      // Notes, possibly stacked in brackets.
      if (ch === '[') {
        const close = line.indexOf(']', p);
        if (close < 0) {
          p++;
          continue;
        }
        const inner = line.slice(p + 1, close);
        const pitches: number[] = [];
        let firstUnits = 1;
        for (const nm of inner.matchAll(/(\^\^|\^|__|_|=)?([A-Ga-g])([',]*)(\d*\/*\d*)/g)) {
          if (!pitches.length) firstUnits = readLength(nm[4]!, 0).units;
          pitches.push(pitchOf(nm[1] ?? '', nm[2]!, nm[3]!));
        }
        const outer = readLength(line, close + 1);
        const tie = line[outer.next] === '-';
        if (pitches.length) placeNotes(pitches, firstUnits * outer.units);
        if (tie && last) tieFrom = last.notes;
        p = outer.next + (tie ? 1 : 0);
        continue;
      }
      const nt = /^(\^\^|\^|__|_|=)?([A-Ga-g])([',]*)/.exec(rest);
      if (nt) {
        const pitch = pitchOf(nt[1] ?? '', nt[2]!, nt[3]!);
        const len = readLength(line, p + nt[0].length);
        placeNotes([pitch], len.units);
        p = len.next;
        continue;
      }
      const rs = /^([zx])/.exec(rest);
      if (rs) {
        const len = readLength(line, p + 1);
        placeNotes([], len.units, false);
        if (pendingChord) {
          bar.chords.push({ at: bar.length - len.units * unit, chord: pendingChord });
          pendingChord = null;
        }
        p = len.next;
        continue;
      }
      const mr = /^Z(\d*)/.exec(rest);
      if (mr) {
        const bars = mr[1] ? Number(mr[1]) : 1;
        for (let b = 0; b < bars; b++) {
          bar.length = meter.beats / meter.unit;
          if (b < bars - 1) closeBar('|');
        }
        p += mr[0].length;
        continue;
      }
      if (ch === '&') {
        warn('voice overlay (&) skipped');
        const nextBar = line.indexOf('|', p);
        p = nextBar < 0 ? line.length : nextBar;
        continue;
      }
      // Slurs.
      if (ch === '(') {
        slurs.push(++slurCount);
        p++;
        continue;
      }
      if (ch === ')') {
        slurs.pop();
        p++;
        continue;
      }
      if (' \t\\`$*y]'.includes(ch)) {
        p++;
        continue;
      }
      warn(`skipped "${ch}"`);
      p++;
    }
  }
  if (stopped) warn('only the first voice was read');
  // Text with no note after it belongs at the end of the last bar.
  if (pendingText.length) {
    const target = bar.notes.length || bar.length || !lastBar ? bar : lastBar;
    for (const text of pendingText) target.annotations.push({ at: target.length, text });
  }
  closeBar('|]');
  closeStrain();

  // Sections: each strain's body and endings, split where a road sign falls inside one.
  const beatsPer = (wholes: number) => wholes * songMeter.unit;
  const sections: Section[] = [];
  const written = new Map<string, WrittenBar[]>();
  const toBar = (wb: WrittenBar): Bar => {
    const b: Bar = { chords: wb.chords.map((c) => ({ beat: round(beatsPer(c.at)), chord: c.chord })) };
    if (wb.meter.beats !== songMeter.beats || wb.meter.unit !== songMeter.unit) b.timeSignature = wb.meter;
    if (Math.abs(wb.length - fullBar(wb.meter)) > 1e-6 || wb.meter.unit !== songMeter.unit) b.beats = round(beatsPer(wb.length));
    if (wb.annotations.length) b.annotations = wb.annotations.map((a): Annotation => ({ beat: round(beatsPer(a.at)), text: a.text }));
    if (wb.marks.length) b.marks = [...wb.marks];
    return b;
  };
  /** Split a run of bars into sections; returns their ids in order. */
  const chunk = (id: string, name: string, bars: WrittenBar[]): string[] => {
    const parts: WrittenBar[][] = [];
    for (const wb of bars) {
      const cur = parts.at(-1);
      const prev = cur?.at(-1);
      const startNew = !cur || wb.marks.includes('segno') || wb.marks.includes('coda') || (prev && prev.marks.some((x) => END_MARKS.has(x)));
      if (startNew) parts.push([wb]);
      else cur.push(wb);
    }
    return parts.map((bs, i) => {
      const cid = i === 0 ? id : `${id}.${i + 1}`;
      written.set(cid, bs);
      sections.push({ id: cid, name: i === 0 ? name : `${name}, continued`, bars: bs.map(toBar) });
      return cid;
    });
  };
  const firstPass: string[] = [];
  const noRepeats: string[] = [];
  strains.forEach((st, si) => {
    const letter = si < 26 ? String.fromCharCode(65 + si) : `S${si + 1}`;
    const body = chunk(letter, `Part ${letter}`, st.body);
    const first = chunk(`${letter}1`, `Part ${letter}, first ending`, st.first);
    const second = chunk(`${letter}2`, `Part ${letter}, second ending`, st.second);
    if (first.length || second.length) {
      firstPass.push(...body, ...first);
      if (st.repeat) firstPass.push(...body);
      firstPass.push(...second);
    } else {
      firstPass.push(...body);
      if (st.repeat) firstPass.push(...body);
    }
    // After a D.C. or D.S. repeats are not taken again: play through, using the last ending.
    noRepeats.push(...body, ...(second.length ? second : first));
  });
  const endsWith = (id: string, mk: BarMark) => written.get(id)!.at(-1)!.marks.includes(mk);
  const startsWith = (id: string, mk: BarMark) => written.get(id)![0]!.marks.includes(mk);
  // Follow the last D.C. or D.S. in the first pass: back to the start or the segno, then to Fine, or to the coda.
  let arrangement = firstPass;
  let jumpAt = -1;
  firstPass.forEach((id, k) => {
    if (endsWith(id, 'dc') || endsWith(id, 'ds')) jumpAt = k;
  });
  if (jumpAt >= 0) {
    const jumpId = firstPass[jumpAt]!;
    const ds = endsWith(jumpId, 'ds');
    let from = ds ? noRepeats.findIndex((id) => startsWith(id, 'segno')) : 0;
    if (from < 0) {
      warn('D.S. without a segno; going back to the start');
      from = 0;
    }
    arrangement = firstPass.slice(0, jumpAt + 1);
    for (let k = from; k < noRepeats.length; k++) {
      const id = noRepeats[k]!;
      arrangement.push(id);
      if (endsWith(id, 'fine')) break;
      if (endsWith(id, 'toCoda')) {
        const coda = noRepeats.findIndex((c) => startsWith(c, 'coda'));
        if (coda > k) k = coda - 1;
        else warn('to coda without a coda');
        continue;
      }
      // Without Fine or a coda, the jump plays back to the bar that sent it.
      if (id === jumpId) break;
    }
  }

  // The melody in play order. Slurs are numbered afresh on every pass so a repeat is its own phrase.
  const notes: TimedNote[] = [];
  const slurIds = new Map<string, number>();
  let t = 0;
  arrangement.forEach((id, pass) => {
    for (const wb of written.get(id)!) {
      for (const n of wb.notes) {
        const tn: TimedNote = { start: round(t + beatsPer(n.at)), duration: round(beatsPer(n.length)), pitch: n.pitch };
        if (n.grace) tn.grace = [...n.grace];
        if (n.marks) tn.marks = [...n.marks];
        if (n.slur !== undefined) {
          const k = `${pass}:${n.slur}`;
          if (!slurIds.has(k)) slurIds.set(k, slurIds.size + 1);
          tn.slur = slurIds.get(k)!;
        }
        notes.push(tn);
      }
      t += beatsPer(wb.length);
    }
  });
  notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);

  const quarterTempo = tempo ?? RHYTHM_TEMPO.find(([re]) => re.test(info.rhythm ?? ''))?.[1] ?? 120;
  const song: Song = {
    format: SONG_FORMAT,
    version: SONG_VERSION,
    title: info.titles[0] ?? 'Untitled',
    // Tempo counts the time signature's beat, so convert from quarter notes.
    tempo: round((quarterTempo * songMeter.unit) / 4),
    timeSignature: songMeter,
    sections,
    parts: [{ name: 'Melody', notes }],
  };
  if (info.composer) song.artist = info.composer;
  song.home = headerKey.home;
  song.mode = headerKey.mode;
  if (arrangement.join() !== sections.map((sec) => sec.id).join()) song.arrangement = arrangement;
  if (info.book) song.source = info.book;
  if (!notes.length) warn('no notes');
  return { song, info, warnings };
}

/** "a" "b" → a b */
const unquote = (s: string) =>
  s
    .trim()
    .replace(/"([^"]*)"/g, '$1')
    .trim();
const fullBar = (m: TimeSignature) => m.beats / m.unit;
const round = (x: number) => Math.round(x * 1e6) / 1e6;
