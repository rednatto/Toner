/**
 * Rhythm: time signatures, beat groupings and accent patterns. Shared by the
 * metronome, the song format and (later) the play-along guide.
 */

export interface TimeSignature {
  /** Beats per bar (the top number). */
  beats: number;
  /** Note value of one beat (the bottom number): 4 = quarter, 8 = eighth. */
  unit: number;
}

/** Accent levels: 0 silent, 1 normal, 2 medium accent, 3 bar downbeat. */
export type Accent = 0 | 1 | 2 | 3;

export const COMMON_TIME_SIGNATURES: TimeSignature[] = [
  { beats: 4, unit: 4 },
  { beats: 3, unit: 4 },
  { beats: 2, unit: 4 },
  { beats: 6, unit: 8 },
  { beats: 12, unit: 8 },
  { beats: 9, unit: 8 },
  { beats: 5, unit: 4 },
  { beats: 7, unit: 8 },
  { beats: 5, unit: 8 },
  { beats: 7, unit: 4 },
];

export function formatTimeSignature(ts: TimeSignature): string {
  return `${ts.beats}/${ts.unit}`;
}

export function parseTimeSignature(s: string): TimeSignature | null {
  const m = /^\s*(\d{1,2})\s*\/\s*(1|2|4|8|16|32)\s*$/.exec(s);
  if (!m) return null;
  const beats = Number(m[1]);
  return beats > 0 ? { beats, unit: Number(m[2]) } : null;
}

/**
 * Default grouping of beats into pulses. Compound meters (6/8, 9/8, 12/8)
 * group in threes; odd meters split into twos with a three at the end
 * (7/8 → 2+2+3, 5/8 → 2+3). Simple meters are one beat per group.
 */
export function defaultGrouping(ts: TimeSignature): number[] {
  const { beats, unit } = ts;
  if (unit >= 8 && beats % 3 === 0 && beats > 3) return Array<number>(beats / 3).fill(3);
  if (unit >= 8 && beats >= 5 && beats % 2 === 1) {
    const twos = (beats - 3) / 2;
    return [...Array<number>(twos).fill(2), 3];
  }
  return Array<number>(beats).fill(1);
}

/** Parse a grouping like "2+2+3"; must add up to the bar length. */
export function parseGrouping(s: string, beats: number): number[] | null {
  const parts = s.split('+').map((x) => Number(x.trim()));
  if (parts.some((x) => !Number.isInteger(x) || x <= 0)) return null;
  return parts.reduce((a, b) => a + b, 0) === beats ? parts : null;
}

/** Accent pattern from a grouping: downbeat 3, start of each group 2, the rest 1. */
export function accentsFromGrouping(grouping: number[]): Accent[] {
  const out: Accent[] = [];
  grouping.forEach((g, gi) => {
    for (let k = 0; k < g; k++) out.push(k === 0 ? (gi === 0 ? 3 : 2) : 1);
  });
  // Simple meters (all groups of 1): only the downbeat stands out.
  if (grouping.every((g) => g === 1)) return out.map((_, i) => (i === 0 ? 3 : 1));
  return out;
}

export function defaultAccents(ts: TimeSignature): Accent[] {
  return accentsFromGrouping(defaultGrouping(ts));
}

/** Seconds per beat at a tempo. Tempo counts the beat unit of the time signature. */
export function secondsPerBeat(bpm: number): number {
  return 60 / bpm;
}

/** Tempo from a series of tap times (seconds), using the median gap. */
export function tapTempo(times: number[]): number | null {
  if (times.length < 2) return null;
  const gaps = times.slice(1).map((t, i) => t - times[i]!).filter((g) => g > 0.15 && g < 3);
  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);
  const mid = gaps[Math.floor(gaps.length / 2)]!;
  return 60 / mid;
}

export const TEMPO_MARKINGS: { name: string; min: number; max: number }[] = [
  { name: 'Largo', min: 40, max: 60 },
  { name: 'Adagio', min: 60, max: 76 },
  { name: 'Andante', min: 76, max: 108 },
  { name: 'Moderato', min: 108, max: 120 },
  { name: 'Allegro', min: 120, max: 168 },
  { name: 'Presto', min: 168, max: 200 },
  { name: 'Prestissimo', min: 200, max: 400 },
];

export function tempoMarking(bpm: number): string {
  return TEMPO_MARKINGS.find((m) => bpm >= m.min && bpm < m.max)?.name ?? (bpm < 40 ? 'Grave' : 'Prestissimo');
}
