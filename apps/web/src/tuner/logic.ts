/**
 * Tuner logic, kept free of audio and UI so it can be tested: smoothing raw
 * detector output and deciding which note or string the player is aiming at.
 */
import { freqToPitch, type Pitch } from '@toner/theory';
import { nearestString } from '@toner/instrument';

export type TargetMode = { kind: 'auto' } | { kind: 'chromatic' } | { kind: 'string'; string: number };

export interface Reading {
  /** Detected (smoothed) pitch, fractional. */
  pitch: number;
  /** The pitch being aimed at. */
  target: Pitch;
  /** Cents from target; positive is sharp. */
  cents: number;
  /** String index when tuning a string. */
  string?: number;
}

/** Decide the target for a detected pitch. */
export function readPitch(pitch: number, strings: Pitch[], mode: TargetMode): Reading {
  if (mode.kind === 'string') {
    const target = strings[mode.string]!;
    return { pitch, target, cents: (pitch - target) * 100, string: mode.string };
  }
  if (mode.kind === 'auto' && strings.length > 0) {
    const { string, distance } = nearestString(strings, pitch);
    // Only snap to a string when within a few semitones; otherwise behave chromatically.
    if (Math.abs(distance) <= 3) {
      const target = strings[string]!;
      return { pitch, target, cents: (pitch - target) * 100, string };
    }
  }
  const target = Math.round(pitch);
  return { pitch, target, cents: (pitch - target) * 100 };
}

export type TuneState = 'in' | 'close' | 'off';

export function tuneState(cents: number): TuneState {
  const a = Math.abs(cents);
  return a <= 3 ? 'in' : a <= 12 ? 'close' : 'off';
}

/**
 * Smooths detector output: drops low-clarity frames, takes the median of the
 * last few pitches (which removes single-frame octave slips), and forgets
 * everything after a short silence so a new note starts fresh.
 */
export class PitchSmoother {
  private recent: { time: number; pitch: number }[] = [];

  constructor(
    private readonly size = 5,
    private readonly minClarity = 0.85,
    private readonly forgetAfter = 0.3,
  ) {}

  push(time: number, freq: number, clarity: number, a4: number): number | null {
    if (this.recent.length && time - this.recent[this.recent.length - 1]!.time > this.forgetAfter) this.recent = [];
    if (freq <= 0 || clarity < this.minClarity) return this.current(time);
    const pitch = freqToPitch(freq, a4);
    // A jump of more than a semitone from the running median starts a new note.
    const med = this.median();
    if (med !== null && Math.abs(pitch - med) > 1 && this.recent.length >= 2) {
      const last = this.recent[this.recent.length - 1]!.pitch;
      if (Math.abs(pitch - last) <= 1) this.recent = this.recent.slice(-1);
    }
    this.recent.push({ time, pitch });
    if (this.recent.length > this.size) this.recent.shift();
    return this.median();
  }

  private current(time: number): number | null {
    const last = this.recent[this.recent.length - 1];
    return last && time - last.time <= this.forgetAfter ? this.median() : null;
  }

  private median(): number | null {
    if (!this.recent.length) return null;
    const s = this.recent.map((r) => r.pitch).sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)]!;
  }

  reset() {
    this.recent = [];
  }
}
