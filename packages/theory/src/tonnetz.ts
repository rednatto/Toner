/**
 * Tonnetz geometry and neo-Riemannian moves.
 *
 * The Tonnetz lays pitch classes on a triangular lattice: one step right is
 * +7 (a fifth), one step up-right is +4 (a major third), so one step down-right
 * is +3 (a minor third). Every major and minor triad is a triangle, and the
 * three moves P, L and R flip a triangle across one of its edges, changing a
 * single note by one or two semitones.
 */
import { mod12, type PitchClass } from './pitch.js';

export interface Triad {
  root: PitchClass;
  minor: boolean;
}

export function triadPcs(t: Triad): [PitchClass, PitchClass, PitchClass] {
  return [t.root, mod12(t.root + (t.minor ? 3 : 4)), mod12(t.root + 7)];
}

/** Lattice coordinates (fifths, major thirds) → pitch class, relative to `origin`. */
export function latticePc(i: number, j: number, origin: PitchClass = 0): PitchClass {
  return mod12(origin + 7 * i + 4 * j);
}

/** Axis steps on the Tonnetz, in semitones. */
export const TONNETZ_AXES = { fifth: 7, majorThird: 4, minorThird: 3 } as const;

/** The six lattice neighbours of a pitch class: ±7, ±4, ±3. */
export function noteNeighbours(pc: PitchClass): PitchClass[] {
  return [7, -7, 4, -4, 3, -3].map((d) => mod12(pc + d));
}

export type PLR = 'P' | 'L' | 'R';

/** Parallel: same root, swap major ↔ minor (moves the third by one semitone). */
export function P(t: Triad): Triad {
  return { root: t.root, minor: !t.minor };
}

/** Leading-tone exchange: major root drops a semitone, minor fifth rises one. */
export function L(t: Triad): Triad {
  return t.minor ? { root: mod12(t.root + 8), minor: false } : { root: mod12(t.root + 4), minor: true };
}

/** Relative: major fifth rises a whole tone, minor root drops one. */
export function R(t: Triad): Triad {
  return t.minor ? { root: mod12(t.root + 3), minor: false } : { root: mod12(t.root + 9), minor: true };
}

export const PLR_MOVES: Record<PLR, (t: Triad) => Triad> = { P, L, R };

export const PLR_INFO: Record<PLR, string> = {
  P: 'parallel: same root, the third moves one semitone',
  L: 'leading-tone exchange: one note moves one semitone',
  R: 'relative: one note moves a whole tone',
};

/** The three triads one move away. */
export function triadNeighbours(t: Triad): { move: PLR; triad: Triad }[] {
  return (['P', 'L', 'R'] as const).map((move) => ({ move, triad: PLR_MOVES[move](t) }));
}

/** Apply a word of moves left to right, e.g. 'LP' or 'RLRL'. */
export function applyMoves(t: Triad, word: string): Triad {
  let cur = t;
  for (const ch of word) {
    const f = PLR_MOVES[ch as PLR];
    if (!f) throw new Error(`Unknown move: ${ch}`);
    cur = f(cur);
  }
  return cur;
}

const triadKey = (t: Triad) => t.root * 2 + (t.minor ? 1 : 0);

/** Shortest PLR path between two triads (breadth-first over the 24 triads). */
export function plrPath(from: Triad, to: Triad): PLR[] {
  const prev = new Map<number, { k: number; move: PLR } | null>([[triadKey(from), null]]);
  const queue: Triad[] = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (triadKey(cur) === triadKey(to)) break;
    for (const { move, triad } of triadNeighbours(cur)) {
      const k = triadKey(triad);
      if (!prev.has(k)) {
        prev.set(k, { k: triadKey(cur), move });
        queue.push(triad);
      }
    }
  }
  const path: PLR[] = [];
  let k = triadKey(to);
  for (let step = prev.get(k); step; step = prev.get(k)) {
    path.unshift(step.move);
    k = step.k;
  }
  return path;
}
