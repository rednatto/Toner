/**
 * One AudioContext for the whole app, so the tuner, metronome and latency
 * test share a single sample-accurate clock. Browsers only allow audio to
 * start after a user gesture, so call `resumeAudio()` from a click handler.
 */
let ctx: AudioContext | null = null;

export function audioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext({ latencyHint: 'interactive' });
  return ctx;
}

export async function resumeAudio(): Promise<AudioContext> {
  const c = audioContext();
  if (c.state !== 'running') await c.resume();
  return c;
}

/** Best estimate of how far the speaker lags the context clock, in seconds. */
export function outputDelay(c: AudioContext): number {
  return (c.outputLatency || 0) + (c.baseLatency || 0);
}
