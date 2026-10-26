/**
 * Pitch-class sets as 12-bit masks.
 *
 * Bit k is set when pitch class k is present. Transposition is rotation of the
 * mask and inversion is reflection, so the dihedral group D12 (all T_n and I_n)
 * acts on sets cheaply. Chords and scales are both just sets with a chosen root.
 */
import { mod12, type PitchClass } from './pitch.js';

export type PcSet = number;

const FULL = 0xfff;

export function fromPcs(pcs: Iterable<number>): PcSet {
  let m = 0;
  for (const p of pcs) m |= 1 << mod12(p);
  return m;
}

/** Members in ascending order 0..11. */
export function toPcs(set: PcSet): PitchClass[] {
  const out: PitchClass[] = [];
  for (let k = 0; k < 12; k++) if (set & (1 << k)) out.push(k);
  return out;
}

export function has(set: PcSet, pc: PitchClass): boolean {
  return (set & (1 << mod12(pc))) !== 0;
}

export function size(set: PcSet): number {
  let n = 0;
  for (let m = set; m; m &= m - 1) n++;
  return n;
}

/** T_n of a whole set: rotate the mask. */
export function transposeSet(set: PcSet, n: number): PcSet {
  const k = mod12(n);
  return ((set << k) | (set >>> (12 - k))) & FULL;
}

/** I_n of a whole set: x ↦ n − x. */
export function invertSet(set: PcSet, n = 0): PcSet {
  return fromPcs(toPcs(set).map((p) => n - p));
}

export function complement(set: PcSet): PcSet {
  return ~set & FULL;
}

/** Intervals above `root`, ascending: the set "seen from" the root. */
export function stepsFrom(set: PcSet, root: PitchClass): number[] {
  return toPcs(transposeSet(set, -root));
}

/**
 * Interval vector: how many pairs at each interval class 1..6.
 * The classic fingerprint of a set's sound (e.g. major triad ⟨001110⟩).
 */
export function intervalVector(set: PcSet): [number, number, number, number, number, number] {
  const v: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
  const pcs = toPcs(set);
  for (let i = 0; i < pcs.length; i++) {
    for (let j = i + 1; j < pcs.length; j++) {
      const d = pcs[j]! - pcs[i]!;
      const ic = Math.min(d, 12 - d);
      v[ic - 1]!++;
    }
  }
  return v;
}

/** Sort key for packing: smallest span first, then packed to the left (Forte's convention). */
function packedKey(steps: number[]): number[] {
  return [steps[steps.length - 1] ?? 0, ...steps];
}

function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i]! !== b[i]!) return a[i]! < b[i]!;
  }
  return a.length < b.length;
}

/**
 * Normal form: the rotation of the set that is most tightly packed,
 * returned as actual pitch classes starting from its first element.
 */
export function normalForm(set: PcSet): PitchClass[] {
  const pcs = toPcs(set);
  if (pcs.length === 0) return [];
  let best: PitchClass[] = pcs;
  let bestKey: number[] | null = null;
  for (let r = 0; r < pcs.length; r++) {
    const rot = [...pcs.slice(r), ...pcs.slice(0, r)];
    const steps = rot.map((p) => mod12(p - rot[0]!));
    const key = packedKey(steps);
    if (bestKey === null || lexLess(key, bestKey)) {
      best = rot;
      bestKey = key;
    }
  }
  return best;
}

/** Prime form: the most packed of normal forms of the set and its inversion, transposed to 0. */
export function primeForm(set: PcSet): number[] {
  if (set === 0) return [];
  const a = normalForm(set);
  const b = normalForm(invertSet(set));
  const sa = a.map((p) => mod12(p - a[0]!));
  const sb = b.map((p) => mod12(p - b[0]!));
  return lexLess(packedKey(sb), packedKey(sa)) ? sb : sa;
}

export interface Symmetry {
  kind: 'T' | 'I';
  n: number;
}

/**
 * Every T_n and I_n that maps the set onto itself (T_0 always does).
 * A set with extra symmetries is "special": e.g. the diminished seventh is
 * fixed by T_3, T_6, T_9, the whole-tone scale by every even T_n.
 */
export function symmetries(set: PcSet): Symmetry[] {
  const out: Symmetry[] = [];
  for (let n = 0; n < 12; n++) if (transposeSet(set, n) === set) out.push({ kind: 'T', n });
  for (let n = 0; n < 12; n++) if (invertSet(set, n) === set) out.push({ kind: 'I', n });
  return out;
}

/** All distinct transpositions of a set; fewer than 12 when the set is symmetric. */
export function transpositions(set: PcSet): PcSet[] {
  const seen = new Set<PcSet>();
  for (let n = 0; n < 12; n++) seen.add(transposeSet(set, n));
  return [...seen];
}

/** Steps between consecutive members, wrapping round: the set as a step pattern, e.g. ⟨2 2 1 2 2 2 1⟩. */
export function stepPattern(set: PcSet, root: PitchClass): number[] {
  const s = stepsFrom(set, root);
  return s.map((x, i) => (s[i + 1] ?? 12) - x);
}
