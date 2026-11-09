/**
 * Chord recognition baseline: spectrum → pitch-class profile (chroma) →
 * template matching.
 *
 * Each analysis frame is windowed and transformed; spectral peaks are refined
 * by parabolic interpolation (so the low strings land on the right semitone
 * even though an 8192-point FFT only resolves ~6 Hz), and each peak adds its
 * compressed magnitude to the pitch class it is nearest, weighted by how close
 * it is to the semitone centre (an HPCP-style profile).
 *
 * Templates are harmonic: each chord tone contributes its first few overtones
 * with decaying weight, so the strong fifth (3rd harmonic) and major third
 * (5th harmonic) that every real string produces are expected rather than
 * mistaken for other chords. Scores are cosine similarities; confidence is a
 * softmax over them.
 *
 * Everything here is pure and runs the same in the browser and in tests.
 */
import { CHORD_QUALITIES, chordQuality, mod12, type Chord } from '@toner/theory';
import { DEFAULT_NOTES, notesFromPeaks, type HeardNote } from './notes';

// ---------------------------------------------------------------------------
// FFT

/** In-place iterative radix-2 FFT. `re` and `im` must have the same power-of-two length. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

const windows = new Map<number, Float64Array>();
function hann(n: number): Float64Array {
  let w = windows.get(n);
  if (!w) {
    w = new Float64Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    windows.set(n, w);
  }
  return w;
}

/** Magnitude spectrum (bins 0 … n/2) of a Hann-windowed frame. */
export function magnitudeSpectrum(frame: ArrayLike<number>): Float64Array {
  const n = frame.length;
  const w = hann(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = frame[i]! * w[i]!;
  fft(re, im);
  const mag = new Float64Array(n / 2 + 1);
  for (let k = 0; k <= n / 2; k++) mag[k] = Math.hypot(re[k]!, im[k]!);
  return mag;
}

// ---------------------------------------------------------------------------
// Chroma

export interface ChromaOptions {
  a4: number;
  minHz: number;
  maxHz: number;
  /** Peaks quieter than this fraction of the loudest peak are ignored. */
  peakFloor: number;
}

export const DEFAULT_CHROMA: ChromaOptions = { a4: 440, minHz: 70, maxHz: 3000, peakFloor: 0.02 };

export interface Peak {
  hz: number;
  mag: number;
}

/** Local maxima of a magnitude spectrum, with frequencies refined by parabolic interpolation. */
export function spectralPeaks(mag: Float64Array, sampleRate: number, o: ChromaOptions = DEFAULT_CHROMA): Peak[] {
  const n = (mag.length - 1) * 2;
  const binHz = sampleRate / n;
  const lo = Math.max(2, Math.floor(o.minHz / binHz));
  const hi = Math.min(mag.length - 2, Math.ceil(o.maxHz / binHz));
  let max = 0;
  for (let k = lo; k <= hi; k++) if (mag[k]! > max) max = mag[k]!;
  if (max <= 0) return [];
  const floor = max * o.peakFloor;
  const out: Peak[] = [];
  for (let k = lo; k <= hi; k++) {
    const m = mag[k]!;
    if (m < floor || m < mag[k - 1]! || m <= mag[k + 1]!) continue;
    // Parabolic interpolation on log magnitude.
    const a = Math.log(mag[k - 1]! + 1e-12);
    const b = Math.log(m + 1e-12);
    const c = Math.log(mag[k + 1]! + 1e-12);
    const d = a - 2 * b + c;
    const delta = d === 0 ? 0 : (0.5 * (a - c)) / d;
    out.push({ hz: (k + delta) * binHz, mag: Math.exp(b - 0.25 * (a - c) * delta) });
  }
  return out;
}

/**
 * Pitch-class profile of a frame's peaks, normalised to unit length (all zeros
 * when there are no peaks). Bin 0 is C.
 */
export function chromaFromPeaks(peaks: Peak[], o: ChromaOptions = DEFAULT_CHROMA): Float64Array {
  const chroma = new Float64Array(12);
  for (const p of peaks) {
    const pitch = 69 + 12 * Math.log2(p.hz / o.a4);
    const nearest = Math.round(pitch);
    const dev = Math.abs(pitch - nearest);
    // Full weight at the semitone centre, falling to zero half a semitone away.
    const w = Math.cos(Math.PI * dev) ** 2;
    // Compress magnitudes so one loud string does not drown the rest.
    chroma[mod12(nearest)]! += w * Math.sqrt(p.mag);
  }
  return normalise(chroma);
}

export function chromaOfFrame(frame: ArrayLike<number>, sampleRate: number, o: ChromaOptions = DEFAULT_CHROMA): Float64Array {
  return chromaFromPeaks(spectralPeaks(magnitudeSpectrum(frame), sampleRate, o), o);
}

export function normalise(v: Float64Array): Float64Array {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s);
  if (n > 0) for (let i = 0; i < v.length; i++) v[i]! /= n;
  return v;
}

export function rms(frame: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < frame.length; i++) s += frame[i]! * frame[i]!;
  return Math.sqrt(s / Math.max(1, frame.length));
}

// ---------------------------------------------------------------------------
// Templates

export interface Vocabulary {
  id: string;
  name: string;
  qualities: string[];
}

export const VOCABULARIES: Vocabulary[] = [
  { id: 'triads', name: 'Major and minor', qualities: ['maj', 'min'] },
  { id: 'sevenths', name: '+ sevenths', qualities: ['maj', 'min', 'dom7', 'min7', 'maj7'] },
  { id: 'wide', name: '+ sus, dim, power', qualities: ['maj', 'min', 'dom7', 'min7', 'maj7', 'sus2', 'sus4', 'dim', '5'] },
];

export interface Template {
  chord: Chord;
  vector: Float64Array;
  /** Added to the cosine score: a prior against richer chords. */
  bias: number;
}

/** Overtones and weights used for harmonic templates: harmonic h adds 12·log2(h) semitones with weight decay^(h-1). */
export function harmonicTemplate(c: Chord, harmonics = 6, decay = 0.6): Float64Array {
  const v = new Float64Array(12);
  const q = chordQuality(c.quality);
  const tones = [...new Set(q.intervals.map((i) => mod12(c.root + i)))];
  for (const t of tones) {
    for (let h = 1; h <= harmonics; h++) {
      const pc = mod12(t + Math.round(12 * Math.log2(h)));
      v[pc]! += decay ** (h - 1);
    }
  }
  // The root is usually doubled on guitar and often in the bass.
  v[mod12(c.root)]! += 0.5;
  return normalise(v);
}

/**
 * A string's own overtones already put a little of the seventh and the ninth
 * into the profile of a plain triad (the third's 3rd harmonic is the major
 * seventh), so a seventh chord template fits a triad nearly as well as the
 * triad's. `richPenalty` is subtracted per tone beyond three, so the richer
 * reading has to earn it.
 */
export function templates(vocabulary: Vocabulary, harmonics = 6, richPenalty = 0.03): Template[] {
  const out: Template[] = [];
  for (const quality of vocabulary.qualities) {
    const tones = new Set(chordQuality(quality).intervals.map(mod12)).size;
    const bias = -Math.max(0, tones - 3) * richPenalty;
    for (let root = 0; root < 12; root++) {
      const chord: Chord = { root, quality };
      out.push({ chord, vector: harmonicTemplate(chord, harmonics), bias });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Matching

export interface Candidate {
  chord: Chord;
  /** Cosine similarity, 0 … 1. */
  score: number;
  /** Softmax probability among the vocabulary. */
  p: number;
}

export interface Estimate {
  /** null when the frame is silent. */
  best: Candidate | null;
  /** Top candidates, best first. */
  ranked: Candidate[];
  chroma: Float64Array;
}

export function matchChroma(chroma: Float64Array, tpl: Template[], temperature = 0.02, top = 5): Candidate[] {
  const scores = tpl.map((t) => {
    let s = 0;
    for (let i = 0; i < 12; i++) s += chroma[i]! * t.vector[i]!;
    return s + t.bias;
  });
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp((s - max) / temperature));
  const sum = exps.reduce((a, b) => a + b, 0);
  return tpl
    .map((t, i) => ({ chord: t.chord, score: scores[i]!, p: exps[i]! / sum }))
    .sort((a, b) => b.score - a.score)
    .slice(0, top);
}

export function sameChord(a: Chord | null | undefined, b: Chord | null | undefined): boolean {
  return !!a && !!b && a.root === b.root && a.quality === b.quality;
}

// ---------------------------------------------------------------------------
// Streaming detector

export interface DetectorOptions {
  sampleRate: number;
  frameSize: number;
  hop: number;
  vocabulary: Vocabulary;
  chroma: ChromaOptions;
  /** RMS below which the frame counts as silence. */
  gate: number;
  /** Seconds for the chroma average to forget the past. 0 turns smoothing off. */
  smoothing: number;
  /** Rise in short-term energy (over the last ~40 ms) that counts as a new strum and resets the average. */
  onsetRatio: number;
  temperature: number;
  /** Score handicap per chord tone beyond three; see `templates`. */
  richPenalty: number;
}

export function defaultDetectorOptions(sampleRate: number): DetectorOptions {
  return {
    sampleRate,
    frameSize: sampleRate > 60000 ? 16384 : 8192,
    hop: sampleRate > 60000 ? 4096 : 2048,
    vocabulary: VOCABULARIES[1]!,
    chroma: DEFAULT_CHROMA,
    gate: 0.003,
    smoothing: 0.25,
    onsetRatio: 2.5,
    temperature: 0.02,
    richPenalty: 0.03,
  };
}

export interface Frame {
  /** Seconds, centre of the analysed window, on whatever clock the samples came with. */
  time: number;
  level: number;
  onset: boolean;
  /** Estimate from this frame alone. */
  raw: Estimate;
  /** Individual notes picked out of this frame, strongest first. */
  notes: HeardNote[];
  /** Estimate from the smoothed chroma. */
  smooth: Estimate;
}

const ONSET_BLOCK = 512;
const ONSET_HOLDOFF = 0.12;

const SILENT = (chroma: Float64Array): Estimate => ({ best: null, ranked: [], chroma });

/**
 * Feeds blocks of samples in, gets analysed frames out. Keeps its own ring of
 * the last `frameSize` samples and analyses every `hop` samples.
 */
export class ChordDetector {
  private ring: Float64Array;
  private write = 0;
  private filled = 0;
  private sinceHop = 0;
  private tpl: Template[];
  private avg = new Float64Array(12);
  // Short-term energy in blocks of ONSET_BLOCK samples, for spotting strums.
  private blockSum = 0;
  private blockFill = 0;
  private recent: number[] = [];
  private lastOnset = -Infinity;
  private pendingOnset = false;
  /** Time of the latest strum while the analysis window still reaches back before it. */
  private settling: number | null = null;
  /** Time of the sample just after the last one fed in. */
  private clock = 0;

  constructor(public o: DetectorOptions) {
    this.ring = new Float64Array(o.frameSize);
    this.tpl = templates(o.vocabulary, 6, o.richPenalty);
  }

  configure(patch: Partial<DetectorOptions>) {
    const size = this.o.frameSize;
    this.o = { ...this.o, ...patch };
    if (patch.vocabulary || patch.richPenalty !== undefined) this.tpl = templates(this.o.vocabulary, 6, this.o.richPenalty);
    if (this.o.frameSize !== size) this.reset();
  }

  reset() {
    this.ring = new Float64Array(this.o.frameSize);
    this.write = 0;
    this.filled = 0;
    this.sinceHop = 0;
    this.avg = new Float64Array(12);
    this.blockSum = 0;
    this.blockFill = 0;
    this.recent = [];
    this.pendingOnset = false;
    this.settling = null;
  }

  /** Feed samples whose first sample is at `time` seconds. Returns any frames completed. */
  push(samples: ArrayLike<number>, time?: number): Frame[] {
    const { sampleRate, hop } = this.o;
    if (time !== undefined) this.clock = time;
    const out: Frame[] = [];
    const n = this.ring.length;
    for (let i = 0; i < samples.length; i++) {
      const x = samples[i]!;
      this.blockSum += x * x;
      if (++this.blockFill === ONSET_BLOCK) this.endBlock(this.clock + (i + 1) / sampleRate);
      this.ring[this.write] = x;
      this.write = (this.write + 1) % n;
      if (this.filled < n) this.filled++;
      this.sinceHop++;
      if (this.sinceHop >= hop && this.filled === n) {
        this.sinceHop = 0;
        const end = this.clock + (i + 1) / sampleRate;
        out.push(this.analyse(end - n / 2 / sampleRate));
      }
    }
    this.clock += samples.length / sampleRate;
    return out;
  }

  private endBlock(time: number) {
    const e = this.blockSum / ONSET_BLOCK;
    this.blockSum = 0;
    this.blockFill = 0;
    const r = this.recent;
    const before = r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
    if (e > this.o.gate * this.o.gate && e > before * this.o.onsetRatio && time - this.lastOnset > ONSET_HOLDOFF) {
      // The attack began somewhere in this block.
      this.lastOnset = time - ONSET_BLOCK / this.o.sampleRate;
      this.pendingOnset = true;
      this.settling = this.lastOnset;
    }
    r.push(e);
    if (r.length > 4) r.shift();
  }

  private frame(): Float64Array {
    const n = this.ring.length;
    const f = new Float64Array(n);
    f.set(this.ring.subarray(this.write), 0);
    f.set(this.ring.subarray(0, this.write), n - this.write);
    return f;
  }

  private analyse(time: number): Frame {
    const o = this.o;
    const f = this.frame();
    const level = rms(f);
    const onset = this.pendingOnset;
    this.pendingOnset = false;
    if (level < o.gate) {
      this.avg.fill(0);
      const z = new Float64Array(12);
      return { time, level, onset: false, raw: SILENT(z), smooth: SILENT(z), notes: [] };
    }
    const peaks = spectralPeaks(magnitudeSpectrum(f), o.sampleRate, o.chroma);
    const chroma = chromaFromPeaks(peaks, o.chroma);
    const notes = notesFromPeaks(peaks, { ...DEFAULT_NOTES, a4: o.chroma.a4 });
    const raw = this.estimate(chroma);
    // After a strum, follow each frame until the window holds only the new sound,
    // so the average starts afresh from the new chord rather than the old one.
    const windowStart = time - o.frameSize / 2 / o.sampleRate;
    if (this.settling !== null && windowStart >= this.settling) this.settling = null;
    if (this.settling !== null || onset || o.smoothing <= 0) this.avg.set(chroma);
    else {
      const alpha = 1 - Math.exp(-o.hop / o.sampleRate / o.smoothing);
      for (let i = 0; i < 12; i++) this.avg[i] = this.avg[i]! * (1 - alpha) + chroma[i]! * alpha;
    }
    const smooth = this.estimate(normalise(Float64Array.from(this.avg)));
    return { time, level, onset, raw, smooth, notes };
  }

  private estimate(chroma: Float64Array): Estimate {
    if (!chroma.some((x) => x > 0)) return SILENT(chroma);
    const ranked = matchChroma(chroma, this.tpl, this.o.temperature);
    return { best: ranked[0] ?? null, ranked, chroma };
  }
}

/** Run a detector over a whole recording; handy for evaluation. */
export function analyseBuffer(samples: ArrayLike<number>, o: DetectorOptions): Frame[] {
  const d = new ChordDetector(o);
  return d.push(samples, 0);
}

/**
 * The single chord a recording of one held chord reads as: the label with the
 * most probability summed over its sounding frames, ignoring the first
 * `skip` seconds (the attack).
 */
export function dominantChord(frames: Frame[], skip = 0.1, which: 'raw' | 'smooth' = 'smooth'): Candidate | null {
  const votes = new Map<string, { chord: Chord; p: number; score: number; n: number }>();
  const t0 = frames[0]?.time ?? 0;
  for (const f of frames) {
    if (f.time - t0 < skip) continue;
    const b = f[which].best;
    if (!b) continue;
    const k = `${b.chord.root}:${b.chord.quality}`;
    const v = votes.get(k) ?? { chord: b.chord, p: 0, score: 0, n: 0 };
    v.p += b.p;
    v.score += b.score;
    v.n++;
    votes.set(k, v);
  }
  let best: { chord: Chord; p: number; score: number; n: number } | null = null;
  let total = 0;
  for (const v of votes.values()) {
    total += v.p;
    if (!best || v.p > best.p) best = v;
  }
  return best ? { chord: best.chord, score: best.score / best.n, p: best.p / total } : null;
}

/** All chord qualities the vocabularies may use, for UI pickers. */
export const LISTEN_QUALITIES = CHORD_QUALITIES.filter((q) => VOCABULARIES.some((v) => v.qualities.includes(q.id)));

/** How close a guess is to the truth, for scoring. */
export type Agreement = 'exact' | 'root' | 'related' | 'wrong' | 'silent';

export function agreement(truth: Chord, guess: Chord | null | undefined): Agreement {
  if (!guess) return 'silent';
  if (sameChord(truth, guess)) return 'exact';
  if (truth.root === guess.root) return 'root';
  // Shares the triad: e.g. C vs Am7 (relative), or a seventh read as its triad's neighbour.
  const tones = (c: Chord) => new Set(chordQuality(c.quality).intervals.map((i) => mod12(c.root + i)));
  const a = tones(truth);
  const b = tones(guess);
  let common = 0;
  for (const t of a) if (b.has(t)) common++;
  return common >= 2 ? 'related' : 'wrong';
}
