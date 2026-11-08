/**
 * Notes, not chords: which pitches (with their octaves) a frame holds, and how
 * they compare with the chord the player is meant to be playing.
 *
 * Note picking is a greedy harmonic sieve over the frame's spectral peaks:
 * score every candidate pitch by the peaks sitting on its harmonics, take the
 * best, subtract the share of each harmonic peak that note explains, and go
 * again until what is left is too weak. A note an octave above one already
 * taken only survives if its peak is much stronger than the lower note's own
 * overtone would be, so doubled notes show up as doubled when they are.
 */
import { CHORD_QUALITIES, chordQuality, mod12, type Chord, type Pitch, type PitchClass } from '@toner/theory';
import type { Peak } from './chroma';

export interface HeardNote {
  pitch: Pitch;
  /** 0 … 1, relative to the strongest note in the frame. */
  strength: number;
}

export interface NoteOptions {
  a4: number;
  /** Lowest and highest fundamentals considered (MIDI). */
  low: Pitch;
  high: Pitch;
  /** Harmonics counted per candidate. */
  harmonics: number;
  /** How far (cents) a peak may sit from a harmonic and still count. */
  tolerance: number;
  /** An octave-up peak this many times stronger than a note's fundamental counts as a doubled note. */
  octaveKeep: number;
  /** Ignore a fundamental quieter than this (square-root scale) relative to the loudest peak. */
  floor: number;
  maxNotes: number;
}

export const DEFAULT_NOTES: NoteOptions = { a4: 440, low: 38, high: 88, harmonics: 16, tolerance: 40, octaveKeep: 1.6, floor: 0.3, maxNotes: 8 };

const hz = (p: number, a4: number) => a4 * 2 ** ((p - 69) / 12);

/** Pick the notes out of a frame's spectral peaks, strongest first. */
export function notesFromPeaks(peaks: Peak[], o: NoteOptions = DEFAULT_NOTES): HeardNote[] {
  if (peaks.length === 0) return [];
  // Linear magnitudes for subtracting overtones; scores use compressed ones, like the chroma,
  // so one loud string does not hide the rest.
  const mags = peaks.map((p) => p.mag);
  const cents = peaks.map((p) => 1200 * Math.log2(p.hz / o.a4));
  const tol = o.tolerance;

  /** Index of the strongest remaining peak within tolerance of a frequency, or -1. */
  const near = (f: number): number => {
    const c = 1200 * Math.log2(f / o.a4);
    let best = -1;
    for (let i = 0; i < peaks.length; i++) {
      if (Math.abs(cents[i]! - c) <= tol && (best < 0 || mags[i]! > mags[best]!)) best = i;
    }
    return best;
  };

  const orig = [...mags];
  const loudest = Math.max(...mags);
  const out: HeardNote[] = [];
  // Bottom up: a low note's overtones are taken out before anything above is considered,
  // so the 2nd and 3rd harmonics of the low strings are not mistaken for notes.
  for (let p = o.low; p <= o.high && out.length < o.maxNotes; p++) {
    const f0 = hz(p, o.a4);
    const i1 = near(f0);
    const i2 = near(2 * f0);
    const i3 = near(3 * f0);
    const rel = (i: number) => (i >= 0 ? Math.sqrt(mags[i]! / loudest) : 0);
    let strength = rel(i1);
    let base = i1 >= 0 ? mags[i1]! : 0;
    if (strength < o.floor) {
      // The low strings' fundamentals can be faint through a small mic while their
      // 2nd and 3rd harmonics are strong. Hear the note from those, or its overtones
      // would be left behind to pose as wrong notes.
      // There must still be some fundamental, or any root with a fifth an octave and a half up would conjure a phantom bass.
      if (p > 52 || strength < o.floor / 3 || rel(i2) < o.floor || rel(i3) < o.floor) continue;
      strength = Math.min(rel(i2), rel(i3));
      base = Math.min(mags[i2]!, mags[i3]!);
    } else {
      // A string is harmonic: insist on at least one overtone, which noise and hum rarely have.
      const support = Math.max(i2 >= 0 ? orig[i2]! : 0, i3 >= 0 ? orig[i3]! : 0);
      if (support < 0.03 * orig[i1]!) continue;
    }
    out.push({ pitch: p, strength });
    if (i1 >= 0) mags[i1] = 0;
    for (let h = 2; h <= o.harmonics; h++) {
      const i = near(h * f0);
      if (i < 0) continue;
      // Overtones belong to this note. Only an octave peak far stronger than the
      // fundamental is taken to be a second string doubling it.
      const octave = (h & (h - 1)) === 0;
      if (!(octave && mags[i]! > o.octaveKeep * base)) mags[i] = 0;
    }
  }
  const top = Math.max(1e-9, ...out.map((n) => n.strength));
  return out.map((n) => ({ pitch: n.pitch, strength: n.strength / top })).sort((a, b) => b.strength - a.strength);
}

// ---------------------------------------------------------------------------
// Memory: notes stay on screen and fade, instead of flickering frame by frame.

export interface Remembered {
  pitch: Pitch;
  /** 0 … 1 now, after fading. */
  level: number;
  /** When it was last heard, seconds. */
  heard: number;
}

export class NoteMemory {
  private notes = new Map<Pitch, { peak: number; at: number }>();
  /** Notes seen in the last frame but not yet confirmed. */
  private pending = new Map<Pitch, number>();

  /**
   * `fade` is the time constant in seconds: after it, a note is at about a
   * third of where it was. A note has to be heard in `confirm` frames in a row
   * before it shows, which keeps the noise of a pick or strum attack off screen.
   */
  constructor(
    public fade = 1.2,
    public confirm = 2,
  ) {}

  /** Add a frame's notes. A strum (`onset`) pushes back what was ringing before so the new chord stands out. */
  push(time: number, notes: HeardNote[], onset = false) {
    if (onset) {
      for (const [p, v] of this.notes) this.notes.set(p, { peak: this.level(v, time) * 0.4, at: time });
    }
    const seen = new Map<Pitch, number>();
    for (const n of notes) {
      const run = (this.pending.get(n.pitch) ?? 0) + 1;
      seen.set(n.pitch, run);
      if (run < this.confirm && !this.notes.has(n.pitch)) continue;
      const old = this.notes.get(n.pitch);
      const now = old ? this.level(old, time) : 0;
      if (n.strength >= now) this.notes.set(n.pitch, { peak: n.strength, at: time });
    }
    this.pending = seen;
  }

  private level(v: { peak: number; at: number }, time: number) {
    return v.peak * Math.exp(-Math.max(0, time - v.at) / this.fade);
  }

  /** Every remembered note above `min`, loudest first. */
  at(time: number, min = 0.03): Remembered[] {
    const out: Remembered[] = [];
    for (const [pitch, v] of this.notes) {
      const level = this.level(v, time);
      if (level < min) {
        if (level < min / 4) this.notes.delete(pitch);
        continue;
      }
      out.push({ pitch, level, heard: v.at });
    }
    return out.sort((a, b) => b.level - a.level);
  }

  clear() {
    this.notes.clear();
    this.pending.clear();
  }
}

// ---------------------------------------------------------------------------
// Comparing with the chord the player should be playing.

/** Richer chords that keep a chord's sound and function: sevenths, sixths and added ninths. */
const COLOUR_QUALITIES = ['dom7', 'maj7', 'min7', 'mMaj7', '6', 'min6', 'add9', 'madd9', '9', 'maj9', 'min9', '6/9', '7sus4'];

/**
 * Notes that would make the chord a richer chord of the same kind (C with B is
 * Cmaj7, C with D is Cadd9). Playing them is a choice, not a wrong note.
 */
export function colourTones(c: Chord): PitchClass[] {
  const own = new Set(chordQuality(c.quality).intervals.map(mod12));
  const out = new Set<PitchClass>();
  for (const q of CHORD_QUALITIES) {
    if (!COLOUR_QUALITIES.includes(q.id)) continue;
    const iv = q.intervals.map(mod12);
    if (![...own].every((i) => iv.includes(i))) continue;
    for (const i of iv) if (!own.has(i)) out.add(mod12(c.root + i));
  }
  return [...out];
}

export type ToneRole = 'chord' | 'colour' | 'foreign';

export interface Check {
  /** Chord tones heard. */
  present: PitchClass[];
  /** Chord tones the chord needs that were not heard. */
  missing: PitchClass[];
  /** Chord tones that may be left out (usually the fifth) and were. */
  dropped: PitchClass[];
  /** Notes that turn it into a richer chord of the same kind. */
  colour: PitchClass[];
  /** Notes that do not belong. */
  foreign: PitchClass[];
  verdict: 'quiet' | 'right' | 'coloured' | 'missing' | 'wrong';
}

export function roleOf(target: Chord, pc: PitchClass): ToneRole {
  const tones = chordQuality(target.quality).intervals.map((i) => mod12(target.root + i));
  if (tones.includes(mod12(pc)) || target.bass === mod12(pc)) return 'chord';
  return colourTones(target).includes(mod12(pc)) ? 'colour' : 'foreign';
}

/** Compare the pitch classes heard with the target chord. */
export function checkChord(target: Chord, heard: Iterable<PitchClass>): Check {
  const q = chordQuality(target.quality);
  const set = new Set([...heard].map(mod12));
  // The fifth can always be left out without changing what the chord is.
  const optional = new Set([...(q.optional ?? []), 7].map((i) => mod12(target.root + i)));
  const tones = [...new Set(q.intervals.map((i) => mod12(target.root + i)))];
  const present = tones.filter((t) => set.has(t));
  const missing = tones.filter((t) => !set.has(t) && !optional.has(t));
  const dropped = tones.filter((t) => !set.has(t) && optional.has(t));
  const extra = [...set].filter((p) => !tones.includes(p));
  const colour = extra.filter((p) => roleOf(target, p) === 'colour');
  const foreign = extra.filter((p) => roleOf(target, p) === 'foreign');
  const verdict = set.size === 0 ? 'quiet' : foreign.length > 0 ? 'wrong' : missing.length > 0 ? 'missing' : colour.length > 0 ? 'coloured' : 'right';
  return { present, missing, dropped, colour, foreign, verdict };
}

export interface ChromaCheckOptions {
  /** Share of the loudest pitch class below which a chord tone counts as not heard. */
  missing: number;
  /** How far (unit-length profile) a pitch class must rise above what the chord's own overtones explain to count as an extra note. */
  extra: number;
}

export const DEFAULT_CHROMA_CHECK: ChromaCheckOptions = { missing: 0.2, extra: 0.28 };

/**
 * Check a pitch-class profile against a target chord, allowing for the
 * chord's own overtones: fit the chord's harmonic template to the profile and
 * call a pitch class extra only when it stands well above that fit. This is
 * more forgiving of overtones than picking notes one by one.
 */
export function checkChroma(target: Chord, chroma: Float64Array, template: Float64Array, o: ChromaCheckOptions = DEFAULT_CHROMA_CHECK): Check {
  const max = Math.max(...chroma);
  if (!(max > 0)) return checkChord(target, []);
  let dot = 0;
  for (let i = 0; i < 12; i++) dot += chroma[i]! * template[i]!;
  const tones = new Set(chordQuality(target.quality).intervals.map((i) => mod12(target.root + i)));
  const heard: PitchClass[] = [];
  for (let pc = 0; pc < 12; pc++) {
    const c = chroma[pc]!;
    if (tones.has(pc)) {
      if (c >= o.missing * max) heard.push(pc);
    } else if (c - dot * template[pc]! > o.extra) heard.push(pc);
  }
  return checkChord(target, heard);
}
