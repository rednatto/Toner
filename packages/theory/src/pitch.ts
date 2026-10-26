/**
 * Pitches and pitch classes.
 *
 * Everything in Toner is a number. A pitch class is an element of Z12 (0..11),
 * a pitch is a semitone count on the MIDI scale (60 = middle C, 69 = A4).
 * Names, letters and colours are renderings layered on top (see notation.ts).
 */

/** An element of Z12: 0..11. */
export type PitchClass = number;

/** A semitone count on the MIDI scale. May be fractional for detected pitches. */
export type Pitch = number;

/** Semitone distance, any integer. Reduce with `mod12` to get a Z12 interval. */
export type Semitones = number;

/** Euclidean modulo: always returns 0..m-1, also for negative input. */
export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** Reduce any integer to Z12. */
export function mod12(n: number): PitchClass {
  return mod(n, 12);
}

/** The pitch class of a (possibly fractional) pitch, rounded to the nearest semitone. */
export function pitchClass(p: Pitch): PitchClass {
  return mod12(Math.round(p));
}

/** Octave number in scientific pitch notation (60 → 4). */
export function octave(p: Pitch): number {
  return Math.floor(Math.round(p) / 12) - 1;
}

/** T_n: transpose by n semitones. Works for pitch classes (reduced) and pitches. */
export function transpose(pc: PitchClass, n: Semitones): PitchClass {
  return mod12(pc + n);
}

/** I_n: invert around n, x ↦ n − x. I_0 mirrors around 0 (and 6). */
export function invert(pc: PitchClass, n: Semitones = 0): PitchClass {
  return mod12(n - pc);
}

/** Directed interval from a to b in Z12: how many semitones up from a to reach b. */
export function interval(a: PitchClass, b: PitchClass): PitchClass {
  return mod12(b - a);
}

/** Interval class: the shorter way round the circle, 0..6. */
export function intervalClass(a: PitchClass, b: PitchClass): number {
  const d = interval(a, b);
  return Math.min(d, 12 - d);
}

/** Signed shortest motion from a to b, in −5..+6. */
export function signedStep(a: PitchClass, b: PitchClass): number {
  const d = interval(a, b);
  return d > 6 ? d - 12 : d;
}

/** A pitch class relative to a home: home itself is 0. */
export function relative(pc: PitchClass, home: PitchClass): PitchClass {
  return mod12(pc - home);
}

export const A4_MIDI = 69;
export const DEFAULT_A4_HZ = 440;

/** Frequency in Hz of a pitch, given the reference for A4. */
export function pitchToFreq(p: Pitch, a4 = DEFAULT_A4_HZ): number {
  return a4 * 2 ** ((p - A4_MIDI) / 12);
}

/** Fractional pitch for a frequency. 440 Hz → 69. */
export function freqToPitch(hz: number, a4 = DEFAULT_A4_HZ): Pitch {
  return A4_MIDI + 12 * Math.log2(hz / a4);
}

/** Cents from `target` to `actual` (positive means sharp). */
export function centsBetween(actualHz: number, targetHz: number): number {
  return 1200 * Math.log2(actualHz / targetHz);
}

/** Nearest whole pitch to a frequency, with the deviation in cents. */
export function nearestPitch(hz: number, a4 = DEFAULT_A4_HZ): { pitch: Pitch; cents: number } {
  const exact = freqToPitch(hz, a4);
  const pitch = Math.round(exact);
  return { pitch, cents: (exact - pitch) * 100 };
}
