/**
 * Melody through chords: the harmoniser turned around. Given chords and the
 * embellishments allowed, write a melody that walks through them, one note a
 * beat, by dynamic programming over the candidate pitches of each beat.
 *
 * The idea behind embellishments: keep stacking the key's thirds (3s and 4s)
 * above a chord's core and after seven floors the whole home scale is
 * spelled out. Floors four to seven are the 7, the ninth, the eleventh and
 * the thirteenth, so an embellishment is a higher floor of the same chord.
 * A floor one fret above a core tone rubs (the eleventh, +5, over ⟨4 3⟩).
 *
 * The same model judges a melody someone wrote by hand, so a puzzle can
 * compare a player's line with the solver's on equal terms. The solver adds
 * two style terms the judge leaves out: an arch-shaped contour and a seeded
 * bit of noise, so "another melody" gives a different, equally valid line.
 */
import { chordQuality, type Chord } from './chords.js';
import { keySet, type Key } from './key.js';
import { has } from './pcset.js';
import { mod12, pitchClass, type Pitch, type PitchClass } from './pitch.js';
import { scalePcs } from './scales.js';

export type EmbellishmentId = '7' | '9' | '11' | '13';

export const EMBELLISHMENTS: { id: EmbellishmentId; floor: number; name: string }[] = [
  { id: '7', floor: 3, name: 'seventh' },
  { id: '9', floor: 4, name: 'ninth' },
  { id: '11', floor: 5, name: 'eleventh' },
  { id: '13', floor: 6, name: 'thirteenth' },
];

export interface StackFloor {
  /** 0 is the root; 1 and 2 the triad; 3..6 the 7, 9, 11 and 13. */
  floor: number;
  pc: PitchClass;
  /** Semitones above the root, 0..11. */
  step: number;
  /** Part of the chord as written. */
  core: boolean;
  /** Embellishment name for floors 3..6. */
  id?: EmbellishmentId;
  /** One fret above a core tone: it rubs. */
  rub: boolean;
  /** Outside the key. */
  outside: boolean;
}

/**
 * The seven floors of a chord, stacked in the key's thirds. A chord whose root
 * is outside the key stacks the usual steps instead: 7 on +10 (+11 over a
 * major-seventh chord or a plain major triad, +9 over diminished), then +2, +5, +9.
 */
export function chordStack(c: Chord, key: Key): StackFloor[] {
  const iv = [...new Set(chordQuality(c.quality).intervals.map((i) => mod12(i)))];
  const core = new Set(iv.map((i) => mod12(c.root + i)));
  const scale = scalePcs({ root: key.home, type: key.mode === 'major' ? 'major' : 'minor' });
  const ks = keySet(key);
  const at = scale.indexOf(c.root);
  const fixed = (floor: number): number => {
    if (floor === 3) {
      const q = c.quality;
      if (q === 'dim' || q === 'dim7') return 9;
      if (q === 'maj' || q === 'maj7' || q === 'maj9' || q === 'maj13' || q === 'mMaj7' || q === 'augMaj7') return 11;
      return 10;
    }
    return [2, 5, 9][floor - 4]!;
  };
  // Floors 1 and 2 are the chord's own third and fifth when it has them.
  const third = iv.find((i) => i === 3 || i === 4 || i === 2 || i === 5);
  const fifth = iv.find((i) => i === 6 || i === 7 || i === 8);
  const floors: StackFloor[] = [];
  for (let f = 0; f < 7; f++) {
    let step: number;
    if (f === 0) step = 0;
    else if (f === 1 && third !== undefined) step = third;
    else if (f === 2 && fifth !== undefined) step = fifth;
    else if (at >= 0) step = mod12(scale[(at + 2 * f) % scale.length]! - c.root);
    else step = f === 1 ? 4 : f === 2 ? 7 : fixed(f);
    // A seventh chord's written 7 wins over the key's.
    if (f === 3) {
      const seventh = iv.find((i) => i === 9 || i === 10 || i === 11);
      if (seventh !== undefined && iv.length >= 4) step = seventh;
    }
    const pc = mod12(c.root + step);
    const isCore = core.has(pc);
    floors.push({
      floor: f,
      pc,
      step,
      core: isCore,
      ...(f >= 3 ? { id: EMBELLISHMENTS[f - 3]!.id } : {}),
      rub: !isCore && [...core].some((p) => mod12(pc - p) === 1),
      outside: !has(ks, pc),
    });
  }
  return floors;
}

/** The embellishments of a chord that are allowed and not already chord tones. */
export function chordColours(c: Chord, key: Key, allowed: EmbellishmentId[]): StackFloor[] {
  return chordStack(c, key).filter((f) => f.floor >= 3 && !f.core && f.id && allowed.includes(f.id));
}

export type MelodyRole = 'core' | 'colour' | 'passing' | 'outside';

export interface MelodiseChord {
  chord: Chord;
  /** Beats this chord lasts; one melody note per beat. */
  beats: number;
}

export interface MelodiseWeights {
  coreStrong: number;
  coreWeak: number;
  colourStrong: number;
  colourMiddle: number;
  colourWeak: number;
  rub: number;
  passingWeak: number;
  passingStrong: number;
  outside: number;
  repeat: number;
  step: number;
  skip: number;
  leap: number;
  bigLeap: number;
  /** A passing note entered or left by more than a step. */
  passingLeap: number;
  endHome: number;
  /** Opening on anything but a chord tone. */
  openOff: number;
  /** Solver only: pull towards an arch-shaped contour, per semitone. */
  contour: number;
  /** Solver only: size of the seeded noise. */
  noise: number;
}

export const MELODISE_WEIGHTS: MelodiseWeights = {
  coreStrong: 1.6,
  coreWeak: 0.8,
  colourStrong: 0.2,
  colourMiddle: 1.05,
  colourWeak: 0.75,
  rub: 1.4,
  passingWeak: 0.45,
  passingStrong: -0.6,
  outside: -2,
  repeat: -0.9,
  step: 0.7,
  skip: 0.35,
  leap: -0.4,
  bigLeap: -1.6,
  passingLeap: 2.5,
  endHome: 4,
  openOff: 2,
  contour: 0.07,
  noise: 1.2,
};

export interface MelodiseOptions {
  key: Key;
  chords: MelodiseChord[];
  allowed: EmbellishmentId[];
  /** Lowest and highest pitch. Defaults to home near middle C and 19 frets up. */
  range?: [Pitch, Pitch];
  seed?: number;
  /** Fixed notes: beat index → pitch. The rest of the line plans around them. */
  pins?: Record<number, Pitch>;
  weights?: Partial<MelodiseWeights>;
}

export interface BeatSlot {
  index: number;
  chordIndex: number;
  /** Beat within its chord, from 0. */
  beat: number;
}

export interface JudgedNote {
  pitch: Pitch;
  role: MelodyRole;
  rub: boolean;
  /** Embellishment name when role is colour. */
  id?: EmbellishmentId;
  /** This note's own score. */
  value: number;
  /** Score of the move into this note from the last note (0 for the first or after a gap). */
  move: number;
}

export interface MelodyJudgement {
  total: number;
  notes: (JudgedNote | null)[];
  filled: number;
  /** Largest jump between neighbouring notes, in semitones. */
  biggestLeap: number;
  /** Plain-language checks a puzzle can tick off. */
  goals: { id: string; label: string; met: boolean }[];
}

export interface MelodiseResult {
  slots: BeatSlot[];
  range: [Pitch, Pitch];
  pitches: Pitch[];
  judgement: MelodyJudgement;
}

export function defaultMelodyRange(home: PitchClass): [Pitch, Pitch] {
  let lo = 60 + mod12(home);
  if (lo > 65) lo -= 12;
  return [lo, lo + 19];
}

/** Scoring model shared by the solver and the judge. */
export function melodyModel(opts: MelodiseOptions) {
  const w = { ...MELODISE_WEIGHTS, ...opts.weights };
  const range = opts.range ?? defaultMelodyRange(opts.key.home);
  const ks = keySet(opts.key);
  const slots: BeatSlot[] = [];
  opts.chords.forEach((c, chordIndex) => {
    for (let beat = 0; beat < c.beats; beat++) slots.push({ index: slots.length, chordIndex, beat });
  });
  const chordInfo = opts.chords.map((c) => {
    const stack = chordStack(c.chord, opts.key);
    return { core: stack.filter((f) => f.core).map((f) => f.pc), colours: chordColours(c.chord, opts.key, opts.allowed), stack };
  });
  const last = slots.length - 1;

  const classify = (k: number, pitch: Pitch): Omit<JudgedNote, 'value' | 'move'> => {
    const pc = pitchClass(pitch);
    const ch = chordInfo[slots[k]!.chordIndex]!;
    if (ch.core.includes(pc)) return { pitch, role: 'core', rub: false };
    const col = ch.colours.find((f) => f.pc === pc);
    if (col) return { pitch, role: 'colour', rub: col.rub, ...(col.id ? { id: col.id } : {}) };
    if (has(ks, pc)) return { pitch, role: 'passing', rub: false };
    return { pitch, role: 'outside', rub: false };
  };

  const value = (k: number, pitch: Pitch): number => {
    const { beat } = slots[k]!;
    const c = classify(k, pitch);
    let v: number;
    if (c.role === 'core') v = beat === 0 ? w.coreStrong : w.coreWeak;
    else if (c.role === 'colour') v = (beat === 0 ? w.colourStrong : beat === 2 ? w.colourMiddle : w.colourWeak) - (c.rub ? w.rub : 0);
    else if (c.role === 'passing') v = beat % 2 === 1 ? w.passingWeak : w.passingStrong;
    else v = w.outside;
    if (k === last) v += pitchClass(pitch) === mod12(opts.key.home) ? w.endHome : -w.endHome;
    if (k === 0 && c.role !== 'core') v -= w.openOff;
    return v;
  };

  const move = (ka: number, a: Pitch, kb: number, b: Pitch): number => {
    const d = Math.abs(b - a);
    let v = d === 0 ? w.repeat : d <= 2 ? w.step : d <= 4 ? w.skip : d <= 7 ? w.leap : w.bigLeap;
    if ((classify(ka, a).role === 'passing' || classify(kb, b).role === 'passing') && d > 2) v -= w.passingLeap;
    return v;
  };

  /** Judge a line, one pitch (or null for an empty beat) per slot. */
  const judge = (line: (Pitch | null)[]): MelodyJudgement => {
    let total = 0;
    let prev: number | null = null;
    let biggestLeap = 0;
    const notes = slots.map((_, k): JudgedNote | null => {
      const p = line[k];
      if (p === null || p === undefined) {
        prev = null;
        return null;
      }
      const v = value(k, p);
      const m = prev !== null ? move(prev, line[prev]!, k, p) : 0;
      if (prev !== null) biggestLeap = Math.max(biggestLeap, Math.abs(p - line[prev]!));
      prev = k;
      total += v + m;
      return { ...classify(k, p), value: v, move: m };
    });
    const filled = notes.filter(Boolean).length;
    const lastNote = notes[last];
    const goals = [
      { id: 'downbeats', label: 'A chord note on the first beat of every chord', met: slots.every((s, k) => s.beat !== 0 || notes[k]?.role === 'core') },
      { id: 'colour', label: 'At least one embellishment, and none that rub on a first beat', met: notes.some((n) => n?.role === 'colour') && slots.every((s, k) => s.beat !== 0 || !(notes[k]?.role === 'colour' && notes[k]?.rub)) },
      { id: 'steps', label: 'Passing notes go by step, and no jump wider than 7', met: filled > 1 && biggestLeap <= 7 && notes.every((n, k) => n?.role !== 'passing' || [notes[k - 1], notes[k + 1]].every((o) => !o || Math.abs(o.pitch - n.pitch) <= 2)) },
      { id: 'inKey', label: 'Every note is in the chord, its colours or the key', met: filled > 0 && notes.every((n) => n?.role !== 'outside') },
      { id: 'home', label: 'End on 0', met: !!lastNote && pitchClass(lastNote.pitch) === mod12(opts.key.home) },
    ];
    return { total, notes, filled, biggestLeap, goals };
  };

  return { slots, range, chordInfo, classify, value, move, judge, weights: w };
}

/** A small deterministic hash in [0, 1). */
function rnd(a: number, b: number, seed: number): number {
  let h = (a * 374761393 + b * 668265263 + seed * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Write a melody through the chords. */
export function melodise(opts: MelodiseOptions): MelodiseResult {
  const M = melodyModel(opts);
  const { slots, range } = M;
  const w = M.weights;
  const n = slots.length;
  const seed = opts.seed ?? 1;
  const pins = opts.pins ?? {};
  if (n === 0) return { slots, range, pitches: [], judgement: M.judge([]) };
  const [lo, hi] = range;
  const cands = slots.map((s, k) => {
    if (pins[k] !== undefined) return [pins[k]!];
    const out: Pitch[] = [];
    for (let m = lo; m <= hi; m++) {
      const role = M.classify(k, m).role;
      // Generate from chord tones, allowed colours, and scale notes on the weak beats.
      if (role === 'core' || role === 'colour' || (role === 'passing' && s.beat % 2 === 1)) out.push(m);
    }
    return out.length ? out : [lo];
  });
  const style = (k: number, m: Pitch) => {
    const target = lo + 5 + 8 * Math.sin((Math.PI * k) / Math.max(1, n - 1));
    return -w.contour * Math.abs(m - target) + (rnd(k, m, seed) - 0.5) * w.noise;
  };
  const f: number[][] = [cands[0]!.map((m) => M.value(0, m) + style(0, m))];
  const bk: number[][] = [[]];
  for (let k = 1; k < n; k++) {
    f.push([]);
    bk.push([]);
    cands[k]!.forEach((m, j) => {
      let best = -Infinity;
      let arg = 0;
      cands[k - 1]!.forEach((p, i) => {
        const v = f[k - 1]![i]! + M.move(k - 1, p, k, m);
        if (v > best) {
          best = v;
          arg = i;
        }
      });
      f[k]![j] = best + M.value(k, m) + style(k, m);
      bk[k]![j] = arg;
    });
  }
  const lastRow = f[n - 1]!;
  let j = lastRow.indexOf(Math.max(...lastRow));
  const pitches = new Array<Pitch>(n);
  for (let k = n - 1; k >= 0; k--) {
    pitches[k] = cands[k]![j]!;
    if (k) j = bk[k]![j]!;
  }
  return { slots, range, pitches, judgement: M.judge(pitches) };
}
