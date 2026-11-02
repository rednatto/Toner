import { describe, expect, it } from 'vitest';
import { markInfo, performNotes, scaleNeighbour, scalePcs, type TimedNote } from './index.js';

const G_MAJOR = scalePcs({ root: 7, type: 'major' });
const note = (start: number, duration: number, pitch: number, extra: Partial<TimedNote> = {}): TimedNote => ({ start, duration, pitch, ...extra });

describe('ornaments', () => {
  it('finds neighbours in the scale', () => {
    expect(scaleNeighbour(71, G_MAJOR, 1)).toBe(72); // B up to C
    expect(scaleNeighbour(71, G_MAJOR, -1)).toBe(69); // B down to A
    expect(scaleNeighbour(66, G_MAJOR, 1)).toBe(67); // F♯ up to G
  });

  it('plays grace notes before the beat', () => {
    const s = performNotes([note(1, 1, 69, { grace: [79, 81] })], G_MAJOR, 0.1);
    expect(s.map((x) => [x.start, x.pitch, !!x.ornament])).toEqual([
      [0.8, 79, true],
      [0.9, 81, true],
      [1, 69, false],
    ]);
  });

  it('plays a roll as cut and tap', () => {
    const s = performNotes([note(0, 1.5, 71, { marks: ['roll'] })], G_MAJOR, 0.1);
    expect(s.map((x) => [Math.round(x.start * 100) / 100, x.pitch])).toEqual([
      [0, 71],
      [0.5, 72],
      [0.6, 71],
      [1, 69],
      [1.1, 71],
    ]);
    const end = Math.max(...s.map((x) => x.start + x.duration));
    expect(end).toBeCloseTo(1.5);
  });

  it('trills with the note above and ends on the note', () => {
    const s = performNotes([note(0, 1, 67, { marks: ['trill'] })], G_MAJOR, 0.1);
    expect(s[0]!.pitch).toBe(69);
    expect(s.at(-1)!.pitch).toBe(67);
    expect(new Set(s.map((x) => x.pitch))).toEqual(new Set([67, 69]));
  });

  it('shapes length and loudness', () => {
    const s = performNotes([note(0, 1, 60, { marks: ['p'] }), note(1, 1, 62, { marks: ['staccato'] }), note(2, 1, 64, { marks: ['accent', 'f'] })], [], 0.1);
    expect(s.map((x) => [x.duration, x.level])).toEqual([
      [1, 0.7],
      [0.5, 0.7],
      [1, 1.2 * 1.4],
    ]);
  });

  it('describes known and unknown marks', () => {
    expect(markInfo('roll').symbol).toBe('~');
    expect(markInfo('wedge')).toMatchObject({ name: 'wedge', kind: 'other' });
  });
});
