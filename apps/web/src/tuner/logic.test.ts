import { describe, expect, it } from 'vitest';
import { pitchToFreq } from '@toner/theory';
import { PitchSmoother, readPitch, tuneState } from './logic';

const standard = [40, 45, 50, 55, 59, 64];

describe('tuner logic', () => {
  it('snaps to the nearest string in auto mode', () => {
    const r = readPitch(44.8, standard, { kind: 'auto' });
    expect(r.string).toBe(1);
    expect(r.target).toBe(45);
    expect(r.cents).toBeCloseTo(-20);
  });

  it('falls back to chromatic far from any string', () => {
    const r = readPitch(80.1, standard, { kind: 'auto' });
    expect(r.string).toBeUndefined();
    expect(r.target).toBe(80);
  });

  it('tunes a fixed string even when far off', () => {
    const r = readPitch(38, standard, { kind: 'string', string: 0 });
    expect(r.cents).toBeCloseTo(-200);
  });

  it('classifies cents', () => {
    expect(tuneState(2)).toBe('in');
    expect(tuneState(-8)).toBe('close');
    expect(tuneState(30)).toBe('off');
  });

  it('smooths away a single octave slip and forgets after silence', () => {
    const s = new PitchSmoother();
    const f = pitchToFreq(45);
    s.push(0, f, 0.95, 440);
    s.push(0.01, f, 0.95, 440);
    const slip = s.push(0.02, f * 2, 0.95, 440);
    expect(slip).toBeCloseTo(45);
    expect(s.push(0.03, f, 0.95, 440)).toBeCloseTo(45);
    expect(s.push(0.04, 0, 0, 440)).toBeCloseTo(45);
    expect(s.push(1, 0, 0, 440)).toBeNull();
  });

  it('follows a real note change', () => {
    const s = new PitchSmoother();
    for (let i = 0; i < 5; i++) s.push(i * 0.01, pitchToFreq(45), 0.95, 440);
    let out: number | null = null;
    for (let i = 5; i < 9; i++) out = s.push(i * 0.01, pitchToFreq(50), 0.95, 440);
    expect(out).toBeCloseTo(50);
  });
});
