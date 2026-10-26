/**
 * The Toner song format: instrument-neutral JSON describing what to play.
 *
 * Harmony lives in sections of bars of chords; melody and riffs live in parts
 * of timed notes. Times are in beats from the start of the song. The only
 * instrument-specific pieces are optional hints (a suggested tuning, capo, or
 * a string/fret for a note that came from a tab), which a player for another
 * instrument simply ignores.
 */
import { transposeChord, type Chord, CHORD_QUALITIES } from './chords.js';
import type { Mode } from './key.js';
import { mod12, type Pitch, type PitchClass } from './pitch.js';
import type { TimeSignature } from './rhythm.js';

export const SONG_FORMAT = 'toner-song';
export const SONG_VERSION = 1;

export interface ChordEvent {
  /** Beat within the bar, starting at 0. */
  beat: number;
  chord: Chord;
}

export interface Bar {
  chords: ChordEvent[];
  /** Overrides the song's time signature from this bar on within the section. */
  timeSignature?: TimeSignature;
  lyrics?: string;
}

export interface Section {
  id: string;
  name: string;
  bars: Bar[];
}

export interface TimedNote {
  /** Start in beats from the beginning of the arrangement. */
  start: number;
  duration: number;
  pitch: Pitch;
  /** Optional fingering hint from a tab. Ignored by instruments without strings. */
  hint?: { string: number; fret: number };
}

export interface Part {
  name: string;
  notes: TimedNote[];
}

export interface Song {
  format: typeof SONG_FORMAT;
  version: typeof SONG_VERSION;
  title: string;
  artist?: string;
  tempo: number;
  timeSignature: TimeSignature;
  /** Home pitch class (0..11) and mode, if known. */
  home?: PitchClass;
  mode?: Mode;
  sections: Section[];
  /** Order of section ids to play; defaults to the sections in order. */
  arrangement?: string[];
  parts?: Part[];
  /** Optional hints for string instruments. */
  instrument?: { profile?: string; tuning?: Pitch[]; capo?: number };
  source?: string;
}

const QUALITY_IDS = new Set(CHORD_QUALITIES.map((q) => q.id));

/** Check a parsed JSON value against the format. Returns a list of problems; empty means valid. */
export function validateSong(x: unknown): string[] {
  const errs: string[] = [];
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!isObj(x)) return ['song is not an object'];
  if (x.format !== SONG_FORMAT) errs.push(`format must be "${SONG_FORMAT}"`);
  if (x.version !== SONG_VERSION) errs.push(`version must be ${SONG_VERSION}`);
  if (typeof x.title !== 'string' || !x.title) errs.push('title is required');
  if (!isNum(x.tempo) || x.tempo <= 0) errs.push('tempo must be a positive number');
  const ts = x.timeSignature;
  if (!isObj(ts) || !isNum(ts.beats) || !isNum(ts.unit)) errs.push('timeSignature needs beats and unit');
  if (x.home !== undefined && (!isNum(x.home) || x.home < 0 || x.home > 11)) errs.push('home must be 0..11');
  if (!Array.isArray(x.sections)) {
    errs.push('sections must be a list');
    return errs;
  }
  const ids = new Set<string>();
  x.sections.forEach((s, si) => {
    if (!isObj(s)) return errs.push(`sections[${si}] is not an object`);
    if (typeof s.id !== 'string') errs.push(`sections[${si}].id is required`);
    else ids.add(s.id);
    if (!Array.isArray(s.bars)) return errs.push(`sections[${si}].bars must be a list`);
    s.bars.forEach((b, bi) => {
      const where = `sections[${si}].bars[${bi}]`;
      if (!isObj(b) || !Array.isArray(b.chords)) return errs.push(`${where}.chords must be a list`);
      b.chords.forEach((ce, ci) => {
        if (!isObj(ce) || !isNum(ce.beat) || !isObj(ce.chord)) return errs.push(`${where}.chords[${ci}] needs beat and chord`);
        const c = ce.chord;
        if (!isNum(c.root) || c.root < 0 || c.root > 11) errs.push(`${where}.chords[${ci}].root must be 0..11`);
        if (typeof c.quality !== 'string' || !QUALITY_IDS.has(c.quality)) errs.push(`${where}.chords[${ci}].quality "${String(c.quality)}" is unknown`);
      });
      return undefined;
    });
    return undefined;
  });
  if (Array.isArray(x.arrangement)) {
    x.arrangement.forEach((a) => {
      if (typeof a !== 'string' || !ids.has(a)) errs.push(`arrangement refers to unknown section "${String(a)}"`);
    });
  }
  if (x.parts !== undefined) {
    if (!Array.isArray(x.parts)) errs.push('parts must be a list');
    else
      x.parts.forEach((p, pi) => {
        if (!isObj(p) || !Array.isArray(p.notes)) return errs.push(`parts[${pi}].notes must be a list`);
        p.notes.forEach((n, ni) => {
          if (!isObj(n) || !isNum(n.start) || !isNum(n.duration) || !isNum(n.pitch)) errs.push(`parts[${pi}].notes[${ni}] needs start, duration and pitch`);
        });
        return undefined;
      });
  }
  return errs;
}

export function parseSong(json: string): { song: Song } | { errors: string[] } {
  let x: unknown;
  try {
    x = JSON.parse(json);
  } catch (e) {
    return { errors: [`not valid JSON: ${(e as Error).message}`] };
  }
  const errors = validateSong(x);
  return errors.length ? { errors } : { song: x as Song };
}

/** Transpose every chord, note and the home by n semitones. Hints are dropped, since frets no longer apply. */
export function transposeSong(song: Song, n: number): Song {
  const out: Song = {
    ...song,
    sections: song.sections.map((s) => ({
      ...s,
      bars: s.bars.map((b) => ({ ...b, chords: b.chords.map((ce) => ({ ...ce, chord: transposeChord(ce.chord, n) })) })),
    })),
  };
  if (song.home !== undefined) out.home = mod12(song.home + n);
  if (song.parts) {
    out.parts = song.parts.map((p) => ({
      ...p,
      notes: p.notes.map(({ hint: _hint, ...note }) => ({ ...note, pitch: note.pitch + n })),
    }));
  }
  return out;
}

/** Sections in play order. */
export function arrangedSections(song: Song): Section[] {
  if (!song.arrangement) return song.sections;
  const byId = new Map(song.sections.map((s) => [s.id, s]));
  return song.arrangement.map((id) => byId.get(id)).filter((s): s is Section => !!s);
}

/** Every chord in play order with its absolute start beat. */
export function chordTimeline(song: Song): { start: number; chord: Chord; section: string }[] {
  const out: { start: number; chord: Chord; section: string }[] = [];
  let t = 0;
  for (const s of arrangedSections(song)) {
    let ts = song.timeSignature;
    for (const b of s.bars) {
      if (b.timeSignature) ts = b.timeSignature;
      for (const ce of b.chords) out.push({ start: t + ce.beat, chord: ce.chord, section: s.id });
      t += ts.beats;
    }
  }
  return out;
}
