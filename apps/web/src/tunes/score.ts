/** Laying a parsed tune out for display and playback: bars in play order, with their notes. */
import { arrangedSections, mod12, type Bar, type Song, type TimedNote } from '@toner/theory';

export interface Source {
  id: string;
  name: string;
  description: string;
  file: string;
  tunes: number;
  licence: { id: string; name: string; url: string; file: string };
  attribution: string;
  homepage: string;
  via?: { name: string; url: string };
}

export interface PlacedBar {
  section: string;
  /** Index of the bar within its section. */
  index: number;
  bar: Bar;
  start: number;
  beats: number;
}

/** Every bar in play order with its start and length in beats. */
export function playedBars(song: Song): PlacedBar[] {
  const out: PlacedBar[] = [];
  let t = 0;
  for (const s of arrangedSections(song)) {
    let ts = song.timeSignature;
    s.bars.forEach((bar, index) => {
      if (bar.timeSignature) ts = bar.timeSignature;
      const beats = bar.beats ?? ts.beats;
      out.push({ section: s.id, index, bar, start: t, beats });
      t += beats;
    });
  }
  return out;
}

/** The notes of each written bar, from the first time it is played, with starts relative to the bar. */
export function notesByBar(song: Song): Map<string, TimedNote[]> {
  const notes = song.parts?.[0]?.notes ?? [];
  const out = new Map<string, TimedNote[]>();
  for (const pb of playedBars(song)) {
    const key = `${pb.section}:${pb.index}`;
    if (out.has(key)) continue;
    const end = pb.start + pb.beats - 1e-9;
    out.set(
      key,
      notes.filter((n) => n.start >= pb.start - 1e-9 && n.start < end).map((n) => ({ ...n, start: n.start - pb.start })),
    );
  }
  return out;
}

/** How long each pitch class sounds, as a 12-number histogram. */
export function pcWeights(notes: TimedNote[]): number[] {
  const w = new Array<number>(12).fill(0);
  for (const n of notes) w[mod12(Math.round(n.pitch))]! += n.duration;
  return w;
}

/** Lowest and highest pitch, for scaling the note lanes. */
export function pitchRange(notes: TimedNote[]): [number, number] {
  if (!notes.length) return [60, 72];
  let lo = Infinity;
  let hi = -Infinity;
  for (const n of notes) {
    lo = Math.min(lo, n.pitch);
    hi = Math.max(hi, n.pitch);
  }
  return [lo, Math.max(hi, lo + 7)];
}
