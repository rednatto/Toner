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

export interface Smoothed {
  pitch: number;
  /** False when nothing is being heard and this is the last note, held for reading. */
  live: boolean;
}

/**
 * Smooths detector output and follows a note as it decays.
 *
 * A new note needs a clear frame to start, but once a note is sounding, weaker
 * frames close to it still count (hysteresis), so the reading keeps updating
 * while the string rings out. Single-frame octave slips are removed by taking
 * the median of the last few pitches. When the sound stops, the last note is
 * held (marked not live) until a new one starts.
 */
export class PitchSmoother {
  private recent: { time: number; pitch: number }[] = [];
  private held: number | null = null;

  constructor(
    private readonly size = 5,
    private readonly startClarity = 0.85,
    private readonly sustainClarity = 0.55,
    private readonly gap = 0.25,
  ) {}

  push(time: number, freq: number, clarity: number, a4: number): Smoothed | null {
    const last = this.recent[this.recent.length - 1];
    if (last && time - last.time > this.gap) {
      this.held = this.median();
      this.recent = [];
    }
    const med = this.median();
    if (freq > 0) {
      const pitch = freqToPitch(freq, a4);
      const continuing = med !== null && Math.abs(pitch - med) <= 0.5;
      if (clarity >= this.startClarity || (continuing && clarity >= this.sustainClarity)) {
        // A clear jump of more than a semitone, confirmed by the previous frame, starts a new note.
        if (med !== null && Math.abs(pitch - med) > 1 && last && Math.abs(pitch - last.pitch) <= 1) this.recent = this.recent.slice(-1);
        this.recent.push({ time, pitch });
        if (this.recent.length > this.size) this.recent.shift();
        return { pitch: this.median()!, live: true };
      }
    }
    if (med !== null) return { pitch: med, live: true };
    return this.held === null ? null : { pitch: this.held, live: false };
  }

  private median(): number | null {
    if (!this.recent.length) return null;
    const s = this.recent.map((r) => r.pitch).sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)]!;
  }

  reset() {
    this.recent = [];
    this.held = null;
  }
}
