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

  it('smooths away a single octave slip', () => {
    const s = new PitchSmoother();
    const f = pitchToFreq(45);
    s.push(0, f, 0.95, 440);
    s.push(0.01, f, 0.95, 440);
    expect(s.push(0.02, f * 2, 0.95, 440)!.pitch).toBeCloseTo(45);
    expect(s.push(0.03, f, 0.95, 440)!.pitch).toBeCloseTo(45);
  });

  it('keeps following a decaying note with weaker frames', () => {
    const s = new PitchSmoother();
    s.push(0, pitchToFreq(45), 0.95, 440);
    // Clarity drops as the string rings out, and the note drifts flat.
    let r = null;
    for (let i = 1; i <= 10; i++) r = s.push(i * 0.02, pitchToFreq(45 - i * 0.01), 0.65, 440);
    expect(r!.live).toBe(true);
    expect(r!.pitch).toBeCloseTo(44.92, 1);
    // A weak frame far away does not start a note.
    expect(s.push(0.23, pitchToFreq(52), 0.65, 440)!.pitch).toBeCloseTo(44.92, 1);
  });

  it('holds the last note after silence until a new one starts', () => {
    const s = new PitchSmoother();
    for (let i = 0; i < 4; i++) s.push(i * 0.01, pitchToFreq(45), 0.95, 440);
    expect(s.push(1, 0, 0, 440)).toEqual({ pitch: expect.closeTo(45), live: false });
    expect(s.push(5, 0, 0, 440)!.live).toBe(false);
    expect(s.push(5.01, pitchToFreq(50), 0.95, 440)).toEqual({ pitch: expect.closeTo(50), live: true });
  });

  it('follows a real note change', () => {
    const s = new PitchSmoother();
    for (let i = 0; i < 5; i++) s.push(i * 0.01, pitchToFreq(45), 0.95, 440);
    let out = null;
    for (let i = 5; i < 9; i++) out = s.push(i * 0.01, pitchToFreq(50), 0.95, 440);
    expect(out!.pitch).toBeCloseTo(50);
  });
});
