import { describe, expect, it } from 'vitest';
import { chord, chordStack, chordColours, diatonicPalette, harmonise, harmonyModel, melodise, melodyModel, noteFit, spansOf, type MelodyNote } from './index.js';

const C = { home: 0, mode: 'major' as const };
const mel = (xs: [number, number][], base = 60): MelodyNote[] => {
  let t = 0;
  return xs.map(([p, d]) => {
    const n = { start: t, duration: d, pitch: base + p };
    t += d;
    return n;
  });
};
// Twinkle, twinkle: 0 0 7 7 9 9 7 · 5 5 4 4 2 2 0
const twinkle = mel([[0, 1], [0, 1], [7, 1], [7, 1], [9, 1], [9, 1], [7, 2], [5, 1], [5, 1], [4, 1], [4, 1], [2, 1], [2, 1], [0, 2]]);

describe('harmonise', () => {
  it('builds the seven triads of the key, plus the major chord on 7 in minor', () => {
    expect(diatonicPalette(C).map((c) => `${c.root}${c.quality}`)).toEqual(['0maj', '2min', '4min', '5maj', '7maj', '9min', '11dim']);
    const minor = diatonicPalette({ home: 9, mode: 'minor' });
    expect(minor).toHaveLength(8);
    expect(minor[7]).toEqual({ root: 4, quality: 'maj' });
  });

  it('splits a melody into spans and marks the strong notes', () => {
    const s = spansOf(twinkle, 2);
    expect(s).toHaveLength(8);
    expect(s[3]!.notes.map((n) => n.strong)).toEqual([true]);
    expect(s[0]!.notes.map((n) => n.strong)).toEqual([true, false]);
  });

  it('puts a pickup note into the first span', () => {
    const s = spansOf(mel([[-5, 1], [0, 2], [4, 1]]), 3, 1);
    expect(s).toHaveLength(1);
    expect(s[0]!.notes.map((n) => n.strong)).toEqual([false, true, false]);
  });

  it('classifies notes against a chord', () => {
    expect(noteFit(4, [0, 4, 7])).toBe('chord');
    expect(noteFit(5, [0, 4, 7])).toBe('rub');
    expect(noteFit(2, [0, 4, 7])).toBe('passing');
  });

  it('harmonises Twinkle with home at both ends and 7 before the last 0', () => {
    const r = harmonise(twinkle, { key: C, span: 2 });
    const roots = r.path.map((c) => r.palette[c]!.root);
    expect(roots[0]).toBe(0);
    expect(roots[7]).toBe(0);
    expect(roots[6]).toBe(7);
    // Every strong note is a chord tone.
    r.spans.forEach((s, g) => {
      const pcs = [r.palette[r.path[g]!]!.root];
      expect(s.notes.filter((n) => n.strong).every((n) => noteFit(n.pitch, harmonyModel(twinkle, { key: C, span: 2 }).info[r.path[g]!]!.pcs) === 'chord')).toBe(true);
      expect(pcs).toBeDefined();
    });
  });

  it('scores its own route as well as or better than any hand-picked route', () => {
    const r = harmonise(twinkle, { key: C, span: 2 });
    const M = harmonyModel(twinkle, { key: C, span: 2 });
    expect(M.score(r.path).total).toBeCloseTo(r.score.total);
    const allHome = r.spans.map(() => 0);
    expect(M.score(allHome).total).toBeLessThan(r.score.total);
    // The best through-score of every span equals the best route.
    r.through.forEach((row) => expect(Math.max(...row)).toBeCloseTo(r.score.total));
  });

  it('replans around a pin', () => {
    const r = harmonise(twinkle, { key: C, span: 2, pins: { 3: 3 } });
    expect(r.path[3]).toBe(3);
    const free = harmonise(twinkle, { key: C, span: 2 });
    expect(r.score.total).toBeLessThanOrEqual(free.score.total + 1e-9);
  });

  it('works in another home: everything is relative', () => {
    const up = twinkle.map((n) => ({ ...n, pitch: n.pitch + 7 }));
    const a = harmonise(twinkle, { key: C, span: 2 });
    const b = harmonise(up, { key: { home: 7, mode: 'major' }, span: 2 });
    expect(b.path).toEqual(a.path);
  });
});

describe('chord stack and embellishments', () => {
  it('stacks the key\'s thirds above a chord', () => {
    expect(chordStack(chord(0, 'maj'), C).map((f) => f.step)).toEqual([0, 4, 7, 11, 2, 5, 9]);
    expect(chordStack(chord(7, 'maj'), C).map((f) => f.step)).toEqual([0, 4, 7, 10, 2, 5, 9]);
    expect(chordStack(chord(2, 'min'), C).map((f) => f.step)).toEqual([0, 3, 7, 10, 2, 5, 9]);
  });

  it('marks the eleventh over a major chord as a rub', () => {
    const c = chordColours(chord(0, 'maj'), C, ['7', '9', '11', '13']);
    expect(c.find((f) => f.id === '11')!.rub).toBe(true);
    expect(c.find((f) => f.id === '9')!.rub).toBe(false);
  });

  it('leaves out an embellishment that is already a chord tone', () => {
    const c = chordColours(chord(7, 'dom7'), C, ['7', '9']);
    expect(c.map((f) => f.id)).toEqual(['9']);
  });

  it('stacks fixed steps over a chord whose root is outside the key', () => {
    expect(chordStack(chord(10, 'maj'), C).map((f) => f.step)).toEqual([0, 4, 7, 11, 2, 5, 9]);
  });
});

describe('melodise', () => {
  const chords = [chord(0, 'maj'), chord(7, 'maj'), chord(9, 'min'), chord(5, 'maj')].map((c) => ({ chord: c, beats: 4 }));

  it('writes a line that meets every goal', () => {
    const r = melodise({ key: C, chords, allowed: ['7', '9'], seed: 1 });
    expect(r.pitches).toHaveLength(16);
    expect(r.judgement.goals.filter((g) => !g.met).map((g) => g.id)).toEqual([]);
    expect(r.pitches[15]! % 12).toBe(0);
  });

  it('gives a different line for a different seed, within range', () => {
    const a = melodise({ key: C, chords, allowed: ['9'], seed: 1 }).pitches;
    const b = melodise({ key: C, chords, allowed: ['9'], seed: 7 }).pitches;
    expect(a).not.toEqual(b);
    const [lo, hi] = melodyModel({ key: C, chords, allowed: [] }).range;
    for (const p of [...a, ...b]) expect(p >= lo && p <= hi).toBe(true);
  });

  it('keeps pinned notes and judges a hand-made line', () => {
    const r = melodise({ key: C, chords, allowed: [], pins: { 0: 67, 5: 71 } });
    expect(r.pitches[0]).toBe(67);
    expect(r.pitches[5]).toBe(71);
    const M = melodyModel({ key: C, chords, allowed: ['9'] });
    const line = Array(16).fill(null);
    line[0] = 61;
    const j = M.judge(line);
    expect(j.filled).toBe(1);
    expect(j.notes[0]!.role).toBe('outside');
    expect(j.goals.find((g) => g.id === 'inKey')!.met).toBe(false);
  });
});
