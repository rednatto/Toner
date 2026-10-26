/**
 * Round-trip latency: the app schedules clicks at known clock times, the mic
 * hears them, and the gap between each scheduled time and the detected onset
 * is the full output-plus-input delay of this device.
 */

export interface Match {
  scheduled: number;
  heard: number;
  latency: number;
}

/** Pair each scheduled click with the first onset inside its window. */
export function matchOnsets(scheduled: number[], onsets: number[], window = 0.4): Match[] {
  const out: Match[] = [];
  const sorted = [...onsets].sort((a, b) => a - b);
  let k = 0;
  for (const t of scheduled) {
    while (k < sorted.length && sorted[k]! < t) k++;
    const o = sorted[k];
    if (o !== undefined && o - t <= window) {
      out.push({ scheduled: t, heard: o, latency: o - t });
      k++;
    }
  }
  return out;
}

export interface Summary {
  count: number;
  median: number;
  min: number;
  max: number;
  /** Spread between the 25th and 75th percentile. */
  iqr: number;
}

export function summarize(latencies: number[]): Summary | null {
  if (latencies.length === 0) return null;
  const s = [...latencies].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]!;
  return { count: s.length, median: q(0.5), min: s[0]!, max: s[s.length - 1]!, iqr: q(0.75) - q(0.25) };
}

export function verdict(medianMs: number): string {
  if (medianMs < 20) return 'Excellent: feels instant.';
  if (medianMs < 35) return 'Good: fine for play-along feedback.';
  if (medianMs < 50) return 'Usable, but timing feedback will need calibrating.';
  return 'Too slow for real-time feedback; try wired headphones or a native build.';
}
