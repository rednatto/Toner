import { describe, expect, it } from 'vitest';
import { parseAbc } from '@toner/theory';
import { marksUsed, notesByBar, pcWeights, pitchRange, playedBars } from './score';

const { song } = parseAbc(`X:1
T:Test
M:3/4
L:1/8
K:G
D2|:G2 B2 d2|1 g4 D2:|2 g6||`);

describe('tune layout', () => {
  it('places bars in play order, pickup included', () => {
    expect(playedBars(song).map((b) => [`${b.section}:${b.index}`, b.start, b.beats])).toEqual([
      ['A:0', 0, 1],
      ['A:1', 1, 3],
      ['A1:0', 4, 3],
      ['A:0', 7, 1],
      ['A:1', 8, 3],
      ['A2:0', 11, 3],
    ]);
  });

  it('gives each written bar its notes once, relative to the bar', () => {
    const bars = notesByBar(song);
    expect(bars.get('A:1')!.map((n) => [n.start, n.pitch])).toEqual([
      [0, 67],
      [1, 71],
      [2, 74],
    ]);
    expect(bars.get('A2:0')!.map((n) => [n.start, n.duration])).toEqual([[0, 3]]);
  });

  it('weighs pitch classes by duration', () => {
    const w = pcWeights(song.parts![0]!.notes);
    expect(w[7]).toBe(1 + 1 + 2 + 3); // G2 in the strain played twice, then g4 and g6 in the endings
    expect(pitchRange(song.parts![0]!.notes)).toEqual([62, 79]);
  });
});

describe('marks used', () => {
  it('counts marks and grace notes, most used first', () => {
    const { song: s } = parseAbc('X:1\nT:T\nM:4/4\nL:1/8\nK:G\n~A ~B .c {g}d |');
    expect(marksUsed(s.parts![0]!.notes)).toEqual([
      { id: 'roll', count: 2 },
      { id: 'staccato', count: 1 },
      { id: 'grace', count: 1 },
    ]);
  });
});
