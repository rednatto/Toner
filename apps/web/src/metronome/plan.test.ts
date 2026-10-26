import { describe, expect, it } from 'vitest';
import { barDuration, clicksForBar, isBarMuted, tempoForBar, type MetronomeSettings } from './plan';

const base: MetronomeSettings = {
  bpm: 80,
  timeSignature: { beats: 4, unit: 4 },
  accents: [3, 1, 1, 1],
  subdivision: 1,
  swing: 0,
  trainer: { enabled: false, target: 100, step: 5, everyBars: 2, then: 'hold' },
  gap: { enabled: false, play: 3, mute: 1 },
};

describe('metronome plan', () => {
  it('lays out beats and subdivisions', () => {
    const clicks = clicksForBar({ ...base, subdivision: 2 }, 0);
    expect(clicks).toHaveLength(8);
    expect(clicks[1]).toEqual({ offset: 0.375, beat: 0, sub: 1, level: 'sub' });
    expect(clicks[2]!.level).toBe(1);
    expect(clicks[0]!.level).toBe(3);
    expect(barDuration(base, 0)).toBe(3);
  });

  it('swings the off-beat', () => {
    const clicks = clicksForBar({ ...base, bpm: 60, subdivision: 2, swing: 1 }, 0);
    expect(clicks[1]!.offset).toBeCloseTo(2 / 3);
  });

  it('steps the speed trainer up and holds', () => {
    const s = { ...base, trainer: { ...base.trainer, enabled: true } };
    expect([0, 1, 2, 3, 4, 7, 8, 100].map((b) => tempoForBar(s, b))).toEqual([80, 80, 85, 85, 90, 95, 100, 100]);
  });

  it('restarts the climb', () => {
    const s = { ...base, trainer: { ...base.trainer, enabled: true, then: 'restart' as const } };
    expect([8, 9, 10].map((b) => tempoForBar(s, b))).toEqual([100, 100, 80]);
  });

  it('can train downwards and never overshoots', () => {
    const s = { ...base, bpm: 120, trainer: { ...base.trainer, enabled: true, target: 108, step: 5, everyBars: 1 } };
    expect([0, 1, 2, 3, 4].map((b) => tempoForBar(s, b))).toEqual([120, 115, 110, 108, 108]);
  });

  it('mutes gap bars', () => {
    const s = { ...base, gap: { enabled: true, play: 3, mute: 1 } };
    expect([0, 1, 2, 3, 4, 7].map((b) => isBarMuted(s, b))).toEqual([false, false, false, true, false, true]);
  });
});
