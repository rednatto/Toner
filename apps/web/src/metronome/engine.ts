/**
 * Metronome engine: a look-ahead scheduler on the AudioContext clock.
 *
 * A timer wakes every 25 ms and schedules any clicks due in the next 120 ms
 * at exact context times, so timer jitter never reaches the audio. Settings
 * are read at each bar line, so changes land on the next downbeat. Each
 * scheduled click is also queued for the display, which shows it when the
 * output clock reaches it (so the light matches what you hear).
 */
import { clickBuffer, playBuffer, pluck, strokeBuffer } from '../audio/synth';
import { barDuration, clicksForBar, isBarMuted, tempoForBar, type Click, type MetronomeSettings } from './plan';

export interface ScheduledClick extends Click {
  time: number;
  bar: number;
  bpm: number;
  muted: boolean;
}

const SOUND: Record<string, [number, number]> = { '3': [1760, 0.9], '2': [1320, 0.7], '1': [880, 0.55], sub: [660, 0.3] };

const LOOKAHEAD = 0.12;
const INTERVAL_MS = 25;

export class MetronomeEngine {
  private timer: ReturnType<typeof setInterval> | null = null;
  private bar = 0;
  private barStart = 0;
  private clicks: Click[] = [];
  private index = 0;
  private queue: ScheduledClick[] = [];
  private output: GainNode;
  /** Chord tones go through their own bus so stopping can silence notes already scheduled. */
  private chordBus: GainNode;
  private sources = new Set<AudioBufferSourceNode>();

  constructor(
    private readonly ctx: AudioContext,
    private readonly settings: () => MetronomeSettings,
  ) {
    this.output = ctx.createGain();
    this.output.connect(ctx.destination);
    this.chordBus = this.newChordBus();
  }

  private newChordBus(): GainNode {
    const bus = this.ctx.createGain();
    bus.connect(this.output);
    return bus;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  set volume(v: number) {
    this.output.gain.value = v;
  }

  start(): void {
    if (this.timer) return;
    this.bar = 0;
    this.barStart = this.ctx.currentTime + 0.1;
    this.clicks = clicksForBar(this.settings(), 0);
    this.index = 0;
    this.queue = [];
    this.tick();
    this.timer = setInterval(() => this.tick(), INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const s of this.sources) s.stop();
    this.sources.clear();
    this.queue = [];
    this.chordBus.disconnect();
    this.chordBus = this.newChordBus();
  }

  private tick(): void {
    const s = this.settings();
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    for (;;) {
      const click = this.clicks[this.index];
      if (!click) {
        this.barStart += barDuration(s, this.bar);
        this.bar++;
        this.clicks = clicksForBar(s, this.bar);
        this.index = 0;
        continue;
      }
      const time = this.barStart + click.offset;
      if (time >= horizon) break;
      const muted = isBarMuted(s, this.bar);
      if (!muted) {
        const strokes = s.strum && s.strumSounds;
        // With stroke sounds on, the strokes replace the subdivision ticks and the beat clicks soften.
        if (click.level !== 0 && !(strokes && click.level === 'sub')) {
          const [freq, gain] = SOUND[String(click.level)]!;
          this.play(clickBuffer(this.ctx, freq, strokes ? gain * 0.45 : gain), time);
        }
        const voices = s.chords?.voices && click.chord !== undefined ? s.chords.voices[click.chord] : undefined;
        const stroke = click.step?.stroke;
        // With chords sounding, strums and bass notes play the chord; chucks and knocks stay percussive.
        const pitched = voices && voices.length > 0 && (s.strum ? stroke === 'D' || stroke === 'U' || stroke === 'B' : click.change);
        if (pitched) this.strumChord(voices, s.strum ? stroke! : 'D', !!click.step?.accent || !!click.change, time, s.chords!.a4);
        else if (strokes && click.step && click.step.stroke !== '-') {
          this.play(strokeBuffer(this.ctx, click.step.stroke, click.step.accent), time);
        }
      }
      this.queue.push({ ...click, time, bar: this.bar, bpm: tempoForBar(s, this.bar), muted });
      this.index++;
    }
  }

  /** Sound a chord voicing as a strum: low to high going down, the top strings high to low going up, the lowest note alone for a bass stroke. */
  private strumChord(pitches: number[], stroke: string, accent: boolean, time: number, a4: number): void {
    const notes = stroke === 'B' ? pitches.slice(0, 1) : stroke === 'U' ? pitches.slice(-4).reverse() : pitches;
    const level = (accent ? 0.16 : 0.11) * (stroke === 'U' ? 0.75 : 1);
    notes.forEach((p, i) => pluck(this.ctx, p, a4, time + i * 0.012, stroke === 'B' ? 1.2 : 0.9, this.chordBus, level));
  }

  private play(buf: AudioBuffer, time: number): void {
    const src = playBuffer(this.ctx, buf, time, this.output);
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  /** Clicks that have reached the speakers since the last call. */
  takeHeard(): ScheduledClick[] {
    const now = this.ctx.getOutputTimestamp?.().contextTime ?? this.ctx.currentTime;
    let n = 0;
    while (n < this.queue.length && this.queue[n]!.time <= now) n++;
    return this.queue.splice(0, n);
  }

  dispose(): void {
    this.stop();
    this.output.disconnect();
  }
}
