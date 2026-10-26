import { describe, expect, it } from 'vitest';
import { matchOnsets, summarize } from './measure';

describe('latency measurement', () => {
  it('pairs clicks with the next onset in the window', () => {
    const m = matchOnsets([1, 2, 3, 4], [1.031, 1.5, 2.029, 3.6, 4.033]);
    expect(m.map((x) => Math.round(x.latency * 1000))).toEqual([31, 29, 33]);
  });

  it('ignores onsets before a click', () => {
    expect(matchOnsets([1], [0.99])).toEqual([]);
  });

  it('summarizes', () => {
    const s = summarize([0.03, 0.031, 0.029, 0.05, 0.03])!;
    expect(s.median).toBeCloseTo(0.03);
    expect(s.max).toBeCloseTo(0.05);
    expect(summarize([])).toBeNull();
  });
});
