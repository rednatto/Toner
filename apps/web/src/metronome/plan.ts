/**
 * What the metronome plays, as pure functions: the tempo for each bar (speed
 * trainer), which bars are silent (gap practice), and the clicks in a bar.
 */
import type { Accent, TimeSignature } from '@toner/theory';
import { patternBars, stepAt, type Step, type StrumPattern } from '@toner/instrument';

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
  /** Strumming pattern to practise. Its grid should match the time signature and subdivision. */
  strum: StrumPattern | null;
  /** Play stroke sounds for the pattern instead of plain subdivision ticks. */
  strumSounds: boolean;
  /** A chord progression to practise changes against, if any. */
  chords: ChordTrack | null;
}

export interface ChordTrack {
  /** Chords in the progression; it loops. */
  count: number;
  /** One change per bar, or two (the second on the middle beat). */
  perBar: 1 | 2;
  /** Chord to start from (0-based), so practice can begin anywhere in the progression. */
  start?: number;
  /** Pitches to sound for each chord (a voicing on the current instrument), or null for silent changes. */
  voices: number[][] | null;
  a4: number;
}

export interface Click {
  /** Seconds from the start of the bar. */
  offset: number;
  beat: number;
  /** 0 for the beat itself, 1.. for subdivisions. */
  sub: number;
  /** Accent for a beat; subdivisions are 'sub'. */
  level: Accent | 'sub';
  /** The strumming step on this click, when practising a pattern. */
  step?: Step;
  /** Position of that step in the whole (possibly multi-bar) pattern. */
  stepIndex?: number;
  /** Which chord of the progression is sounding, when practising one. */
  chord?: number;
  /** True on the first click of each chord. */
  change?: boolean;
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

/** The beat (0-based) where the second chord of a two-chord bar starts. */
export const halfBar = (beats: number) => Math.ceil(beats / 2);

/** Index into the progression for a beat of a bar. */
export function chordAt(track: ChordTrack, beats: number, bar: number, beat: number): number {
  const slot = (track.start ?? 0) + bar * track.perBar + (track.perBar === 2 && beat >= halfBar(beats) ? 1 : 0);
  return slot % track.count;
}

export function clicksForBar(s: MetronomeSettings, bar: number): Click[] {
  const beat = 60 / tempoForBar(s, bar);
  const out: Click[] = [];
  const perBar = s.timeSignature.beats * s.subdivision;
  const barStep = s.strum ? (bar % patternBars(s.strum)) * perBar : 0;
  const track = s.chords && s.chords.count > 0 ? s.chords : null;
  const withStep = (c: Click): Click => {
    if (track) {
      const change = c.sub === 0 && (c.beat === 0 || (track.perBar === 2 && c.beat === halfBar(s.timeSignature.beats)));
      c = { ...c, chord: chordAt(track, s.timeSignature.beats, bar, c.beat), change };
    }
    if (!s.strum) return c;
    const stepIndex = (barStep + c.beat * s.subdivision + c.sub) % s.strum.steps.length;
    return { ...c, step: stepAt(s.strum, stepIndex), stepIndex };
  };
  for (let b = 0; b < s.timeSignature.beats; b++) {
    out.push(withStep({ offset: b * beat, beat: b, sub: 0, level: s.accents[b] ?? 1 }));
    for (let k = 1; k < s.subdivision; k++) {
      let frac = k / s.subdivision;
      if (s.subdivision === 2) frac = 0.5 + s.swing * (2 / 3 - 0.5);
      out.push(withStep({ offset: b * beat + frac * beat, beat: b, sub: k, level: 'sub' }));
    }
  }
  return out;
}
