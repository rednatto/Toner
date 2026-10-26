/**
 * What the metronome plays, as pure functions: the tempo for each bar (speed
 * trainer), which bars are silent (gap practice), and the clicks in a bar.
 */
import type { Accent, TimeSignature } from '@toner/theory';

export interface TrainerSettings {
  enabled: boolean;
  /** Tempo to reach. */
  target: number;
  /** BPM added each step. */
  step: number;
  /** Bars played at each tempo before stepping up. */
  everyBars: number;
  /** After reaching the target: keep going at the target, or start the climb again. */
  then: 'hold' | 'restart';
}

export interface GapSettings {
  enabled: boolean;
  /** Bars with sound. */
  play: number;
  /** Silent bars that follow, to test your own time. */
  mute: number;
}

export interface MetronomeSettings {
  bpm: number;
  timeSignature: TimeSignature;
  /** One accent per beat. */
  accents: Accent[];
  /** Clicks per beat: 1 none, 2 eighths, 3 triplets, 4 sixteenths. */
  subdivision: 1 | 2 | 3 | 4;
  /** 0..1: delays the off-beat eighth from straight (0) to triplet swing (1); only with subdivision 2. */
  swing: number;
  trainer: TrainerSettings;
  gap: GapSettings;
}

export interface Click {
  /** Seconds from the start of the bar. */
  offset: number;
  beat: number;
  /** 0 for the beat itself, 1.. for subdivisions. */
  sub: number;
  /** Accent for a beat; subdivisions are 'sub'. */
  level: Accent | 'sub';
}

/** Tempo for a bar (0-based) under the speed trainer. */
export function tempoForBar(s: MetronomeSettings, bar: number): number {
  const t = s.trainer;
  if (!t.enabled || t.step <= 0 || t.everyBars <= 0) return s.bpm;
  const up = t.target >= s.bpm;
  const steps = Math.ceil(Math.abs(t.target - s.bpm) / t.step);
  let stage = Math.floor(bar / t.everyBars);
  if (t.then === 'restart') stage %= steps + 1;
  const bpm = s.bpm + (up ? 1 : -1) * t.step * Math.min(stage, steps);
  return up ? Math.min(bpm, t.target) : Math.max(bpm, t.target);
}

export function isBarMuted(s: MetronomeSettings, bar: number): boolean {
  const g = s.gap;
  if (!g.enabled || g.mute <= 0 || g.play <= 0) return false;
  return bar % (g.play + g.mute) >= g.play;
}

export function barDuration(s: MetronomeSettings, bar: number): number {
  return (60 / tempoForBar(s, bar)) * s.timeSignature.beats;
}

export function clicksForBar(s: MetronomeSettings, bar: number): Click[] {
  const beat = 60 / tempoForBar(s, bar);
  const out: Click[] = [];
  for (let b = 0; b < s.timeSignature.beats; b++) {
    out.push({ offset: b * beat, beat: b, sub: 0, level: s.accents[b] ?? 1 });
    for (let k = 1; k < s.subdivision; k++) {
      let frac = k / s.subdivision;
      if (s.subdivision === 2) frac = 0.5 + s.swing * (2 / 3 - 0.5);
      out.push({ offset: b * beat + frac * beat, beat: b, sub: k, level: 'sub' });
    }
  }
  return out;
}
