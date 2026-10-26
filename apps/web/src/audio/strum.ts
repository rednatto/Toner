import { resumeAudio } from './context';
import { pluck } from './synth';

/** Strum a chord voicing once, low string first, so it can be heard on demand. */
export async function strumPitches(pitches: number[], a4: number): Promise<void> {
  const ctx = await resumeAudio();
  const t = ctx.currentTime + 0.02;
  pitches.forEach((p, i) => pluck(ctx, p, a4, t + i * 0.035, 2));
}
