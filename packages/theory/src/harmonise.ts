/**
 * Harmonise a melody: choose one chord for each stretch ("span") of a tune.
 *
 * Every route through the grid of spans × chords gets a score, and the best
 * route is found by dynamic programming (Viterbi). The same scoring is used
 * to judge a route someone picked by hand, so a puzzle can compare a
 * player's chords with the solver's on equal terms.
 *
 * A route scores for:
 * - fit: melody notes that are chord tones, most of all on the first note of
 *   a span and on long notes; non-chord notes cost a little, and more when
 *   they sit one fret from a chord tone and rub;
 * - flow: the usual pull of home → away → tension → home, and tension → 0;
 * - hands: small total voice-leading motion between neighbouring chords;
 * - shape: starting and ending on the home chord.
 */
import { chord, chordPcs, type Chord } from './chords.js';
import { analyzeChord, triadFamily, type HarmonicFunction, type Key } from './key.js';
import { intervalClass, mod12, pitchClass, type Pitch, type PitchClass } from './pitch.js';
import { diatonicChords } from './scales.js';
import { voiceLeading } from './voiceLeading.js';

export interface MelodyNote {
  /** Start in beats. */
  start: number;
  duration: number;
  pitch: Pitch;
}

/** How a melody note sits against a chord. */
export type NoteFit = 'chord' | 'passing' | 'rub';

export interface HarmoniseWeights {
  strongChordTone: number;
  weakChordTone: number;
  strongPassing: number;
  weakPassing: number;
  strongRub: number;
  weakRub: number;
  /** Per semitone of total voice-leading motion between neighbouring chords. */
  motion: number;
  /** Keeping the same chord into the next span. */
  repeat: number;
  /** Bonus for opening on the home chord. */
  startHome: number;
  /** Bonus for ending on the home chord, and cost of ending elsewhere. */
  endHome: number;
  endAway: number;
  /** Extra pull from the chord on 7 to the chord on 0. */
  cadence: number;
  /** Diminished and augmented chords are colour, not staples. */
  unstable: number;
}

export const HARMONISE_WEIGHTS: HarmoniseWeights = {
  strongChordTone: 3,
  weakChordTone: 1.5,
  strongPassing: -1.4,
  weakPassing: -0.3,
  strongRub: -2.2,
  weakRub: -0.6,
  motion: 0.15,
  repeat: 0.4,
  startHome: 1.5,
  endHome: 3,
  endAway: 1,
  cadence: 0.5,
  unstable: 0.8,
};

/** Function-to-function pull, keyed by first letters: h(ome) a(way) t(ension) o(utside). */
const FLOW: Record<string, number> = { ha: 0.4, at: 0.6, th: 0.8, ah: 0.2, ht: 0.2, ta: -0.6 };

export interface HarmoniseOptions {
  key: Key;
  /** Length of one span in beats; one chord per span. */
  span: number;
  /** Where the first full span starts, for tunes with a pickup. Notes before it join the first span. */
  offset?: number;
  /** Chords to choose from. Defaults to the key's seven triads. */
  palette?: Chord[];
  /** Fixed choices: span index → palette index. The rest of the route plans around them. */
  pins?: Record<number, number>;
  weights?: Partial<HarmoniseWeights>;
}

export interface SpanNote extends MelodyNote {
  /** First note of its span, or a note landing on the span's start. */
  strong: boolean;
}

export interface HarmonySpan {
  index: number;
  start: number;
  end: number;
  notes: SpanNote[];
}

export interface RouteStep {
  fit: number;
  /** Flow, hand motion and repeat cost coming into this span from the last one (0 for the first). */
  move: number;
  /** Start or end bonus. */
  shape: number;
  /** Total semitones the hands move coming in. */
  motion: number;
}

export interface RouteScore {
  total: number;
  steps: RouteStep[];
}

export interface HarmoniseResult {
  palette: Chord[];
  spans: HarmonySpan[];
  /** Best route: palette index per span. */
  path: number[];
  score: RouteScore;
  /** Best total of any route that passes through each cell [span][chord]. The best route's cells equal score.total. */
  through: number[][];
}

/** The key's diatonic triads, in scale order: on 0, 2, 4, 5, 7, 9, 11 in major. */
export function diatonicPalette(key: Key, sevenths = false): Chord[] {
  const out = diatonicChords({ root: key.home, type: key.mode === 'major' ? 'major' : 'minor' }, sevenths ? 4 : 3)
    .map((d) => d.chord)
    .filter((c): c is Chord => !!c);
  // A minor key borrows its major chord on 7 (from harmonic minor), which is where the pull home comes from.
  if (key.mode === 'minor') out.push(chord(key.home + 7, sevenths ? 'dom7' : 'maj'));
  return out;
}

/** Split a melody into spans of `span` beats. */
export function spansOf(melody: MelodyNote[], span: number, offset = 0): HarmonySpan[] {
  const end = melody.reduce((m, n) => Math.max(m, n.start + n.duration), 0);
  const count = Math.max(1, Math.ceil((end - offset) / span - 1e-9));
  const spans: HarmonySpan[] = Array.from({ length: count }, (_, index) => ({
    index,
    start: index === 0 ? Math.min(0, offset) : offset + index * span,
    end: offset + (index + 1) * span,
    notes: [],
  }));
  for (const n of melody) {
    const i = Math.min(count - 1, Math.max(0, Math.floor((n.start - offset) / span + 1e-9)));
    spans[i]!.notes.push({ ...n, strong: false });
  }
  for (const s of spans) {
    const first = offset + s.index * span;
    s.notes.sort((a, b) => a.start - b.start);
    s.notes.forEach((n) => (n.strong = Math.abs(n.start - first) < 1e-6));
    // A note tied over the span's start still makes the span's first heard note the strong one.
    if (s.notes.length && !s.notes.some((n) => n.strong)) s.notes[0]!.strong = true;
  }
  return spans;
}

/** How a note sits against a chord's pitch classes. */
export function noteFit(pc: PitchClass, pcs: PitchClass[]): NoteFit {
  if (pcs.includes(mod12(pc))) return 'chord';
  return pcs.some((p) => intervalClass(p, pc) === 1) ? 'rub' : 'passing';
}

const fnLetter = (f: HarmonicFunction) => f[0]!;

/** A scoring model for one melody, palette and key; shared by the solver and the judge. */
export function harmonyModel(melody: MelodyNote[], opts: HarmoniseOptions) {
  const w = { ...HARMONISE_WEIGHTS, ...opts.weights };
  const palette = opts.palette ?? diatonicPalette(opts.key);
  const spans = spansOf(melody, opts.span, opts.offset ?? 0);
  const info = palette.map((c) => {
    const a = analyzeChord(c, opts.key);
    const pcs = chordPcs(c);
    const fam = triadFamily(c.quality);
    const unstable = fam === 'diminished' || fam === 'augmented';
    return { pcs, fn: a.function, offset: a.offset, unstable };
  });
  const last = spans.length - 1;

  const fit = (g: number, c: number): number => {
    const ch = info[c]!;
    let v = ch.unstable ? -w.unstable : 0;
    for (const n of spans[g]!.notes) {
      const dur = Math.min(2, Math.max(0.5, n.duration));
      const f = noteFit(pitchClass(n.pitch), ch.pcs);
      if (f === 'chord') v += n.strong ? w.strongChordTone : w.weakChordTone * dur;
      else if (f === 'rub') v += n.strong ? w.strongRub * dur : w.weakRub * dur;
      else v += n.strong ? w.strongPassing * dur : w.weakPassing * dur;
    }
    return v;
  };
  const shape = (g: number, c: number): number => {
    const home = info[c]!.offset === 0 && info[c]!.fn === 'home';
    let v = 0;
    if (g === 0 && home) v += w.startHome;
    if (g === last) v += home ? w.endHome : -w.endAway;
    return v;
  };
  const motionCache = new Map<number, number>();
  const motion = (a: number, b: number): number => {
    const k = a * 1000 + b;
    let m = motionCache.get(k);
    if (m === undefined) motionCache.set(k, (m = voiceLeading(info[a]!.pcs, info[b]!.pcs).distance));
    return m;
  };
  const move = (a: number, b: number): number => {
    if (a === b) return -w.repeat;
    const A = info[a]!;
    const B = info[b]!;
    return -w.motion * motion(a, b) + (FLOW[fnLetter(A.fn) + fnLetter(B.fn)] ?? 0) + (A.offset === 7 && B.offset === 0 ? w.cadence : 0);
  };
  const cell = (g: number, c: number) => fit(g, c) + shape(g, c);

  /** Score any route, e.g. one a player picked. */
  const score = (path: number[]): RouteScore => {
    const steps = path.map((c, g) => ({
      fit: fit(g, c),
      shape: shape(g, c),
      move: g === 0 ? 0 : move(path[g - 1]!, c),
      motion: g === 0 || path[g - 1] === c ? 0 : motion(path[g - 1]!, c),
    }));
    return { total: steps.reduce((t, s) => t + s.fit + s.shape + s.move, 0), steps };
  };

  return { palette, spans, info, fit, shape, move, cell, score, weights: w };
}

/** Find the best chord for every span, with optional pins. */
export function harmonise(melody: MelodyNote[], opts: HarmoniseOptions): HarmoniseResult {
  const M = harmonyModel(melody, opts);
  const n = M.spans.length;
  const m = M.palette.length;
  const pins = opts.pins ?? {};
  const F = M.spans.map((_, g) => M.palette.map((_, c) => (pins[g] !== undefined && pins[g] !== c ? -Infinity : M.cell(g, c))));
  const fw: number[][] = [F[0]!.slice()];
  const back: number[][] = [[]];
  for (let g = 1; g < n; g++) {
    fw.push([]);
    back.push([]);
    for (let c = 0; c < m; c++) {
      let best = -Infinity;
      let arg = 0;
      for (let p = 0; p < m; p++) {
        const v = fw[g - 1]![p]! + M.move(p, c);
        if (v > best) {
          best = v;
          arg = p;
        }
      }
      fw[g]![c] = best + F[g]![c]!;
      back[g]![c] = arg;
    }
  }
  const bw: number[][] = new Array(n);
  bw[n - 1] = M.palette.map(() => 0);
  for (let g = n - 2; g >= 0; g--) {
    bw[g] = M.palette.map((_, c) => Math.max(...M.palette.map((_, x) => M.move(c, x) + F[g + 1]![x]! + bw[g + 1]![x]!)));
  }
  const path = new Array<number>(n);
  const lastRow = fw[n - 1]!;
  path[n - 1] = lastRow.indexOf(Math.max(...lastRow));
  for (let g = n - 1; g > 0; g--) path[g - 1] = back[g]![path[g]!]!;
  const through = M.spans.map((_, g) => M.palette.map((_, c) => fw[g]![c]! + bw[g]![c]!));
  return { palette: M.palette, spans: M.spans, path, score: M.score(path), through };
}
