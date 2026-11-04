/**
 * Playback for the puzzles: schedule melody and chord notes on the shared
 * audio clock and report which beat is sounding, so the board can follow.
 */
import { useEffect, useRef, useState } from 'react';
import { chordPcs, mod12, type Chord, type Pitch } from '@toner/theory';
import { resumeAudio } from '../audio/context';
import { pluck } from '../audio/synth';

export interface PlayNote {
  /** Start in beats. */
  start: number;
  duration: number;
  pitch: Pitch;
  level?: number;
}

/** A close voicing of a chord below middle C: root in the bass, the rest stacked above it. */
export function chordVoicing(c: Chord): Pitch[] {
  const bass = 48 + mod12(c.root - 0) - (mod12(c.root) > 6 ? 12 : 0);
  return chordPcs(c).map((pc, i) => (i === 0 ? bass : bass + 12 + mod12(pc - c.root)));
}

export function chordNotes(c: Chord, start: number, duration: number): PlayNote[] {
  return chordVoicing(c).map((pitch, i) => ({ start: start + i * 0.03, duration: duration + 0.2, pitch, level: i === 0 ? 0.12 : 0.07 }));
}

export function usePlayer(bpm: number, a4: number) {
  const [beat, setBeat] = useState<number | null>(null);
  const run = useRef<{ t0: number; end: number; ctx: AudioContext; raf: number } | null>(null);

  const stop = () => {
    if (run.current) cancelAnimationFrame(run.current.raf);
    run.current = null;
    setBeat(null);
  };

  useEffect(() => stop, []);

  async function play(notes: PlayNote[]) {
    stop();
    const ctx = await resumeAudio();
    const spb = 60 / bpm;
    const t0 = ctx.currentTime + 0.08;
    let end = 0;
    for (const n of notes) {
      pluck(ctx, n.pitch, a4, t0 + n.start * spb, Math.max(0.4, n.duration * spb + 0.3), ctx.destination, n.level ?? 0.22);
      end = Math.max(end, n.start + n.duration);
    }
    const tick = () => {
      const r = run.current;
      if (!r) return;
      const b = (r.ctx.currentTime - r.t0) / spb;
      if (b > r.end + 0.5) return stop();
      setBeat(b);
      r.raf = requestAnimationFrame(tick);
    };
    run.current = { t0, end, ctx, raf: requestAnimationFrame(tick) };
  }

  return { beat, play, stop, playing: beat !== null };
}
