import { describe, expect, it } from 'vitest';
import { generateVoicings, GUITAR } from '@toner/instrument';
import { chordPcs, pitchToFreq, type Chord } from '@toner/theory';
import { agreement, analyseBuffer, ChordDetector, chromaOfFrame, defaultDetectorOptions, dominantChord, fft, harmonicTemplate, VOCABULARIES, type Agreement } from './chroma';
import { strum } from './synthGuitar';

const SR = 48000;
const standard = GUITAR.tunings.find((t) => t.id === 'standard')!.strings;

function sine(freqs: number[], n = 16384): Float64Array {
  const out = new Float64Array(n);
  for (const f of freqs) for (let i = 0; i < n; i++) out[i]! += Math.sin((2 * Math.PI * f * i) / SR);
  return out;
}

describe('fft', () => {
  it('puts a pure tone in its bin', () => {
    const n = 1024;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * 37 * i) / n);
    fft(re, im);
    expect(Math.hypot(re[37]!, im[37]!)).toBeCloseTo(n / 2, 6);
    expect(Math.hypot(re[36]!, im[36]!)).toBeLessThan(1e-6);
  });
});

describe('chroma', () => {
  it('maps the low E string to pitch class 4', () => {
    const c = chromaOfFrame(sine([pitchToFreq(40)]), SR);
    expect(c.indexOf(Math.max(...c))).toBe(4);
  });

  it('sees all three notes of a triad', () => {
    const c = chromaOfFrame(sine([pitchToFreq(48), pitchToFreq(52), pitchToFreq(55)]), SR);
    const top = [...c].map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, i]) => i);
    expect(top.sort()).toEqual([0, 4, 7]);
  });

  it('harmonic templates expect the overtones of the root', () => {
    const t = harmonicTemplate({ root: 0, quality: 'maj' });
    expect(t[0]).toBeGreaterThan(t[4]!);
    expect(t[1]).toBe(0);
  });
});

describe('streaming detector', () => {
  it('names a strummed open C and stays silent in silence', () => {
    const voicing = generateVoicings({ root: 0, quality: 'maj' }, standard)[0]!;
    const audio = strum(voicing.pitches, { sampleRate: SR, seconds: 1.5 });
    const d = new ChordDetector(defaultDetectorOptions(SR));
    const frames = [...d.push(new Float64Array(SR / 2), 0), ...d.push(audio)];
    expect(frames.some((f) => f.onset)).toBe(true);
    const sounding = frames.filter((f) => f.time > 0.75);
    expect(dominantChord(sounding)?.chord).toEqual({ root: 0, quality: 'maj' });
    expect(frames.filter((f) => f.time < 0.3).every((f) => f.smooth.best === null)).toBe(true);
  });

  it('timestamps frames at the window centre on the given clock', () => {
    const o = defaultDetectorOptions(SR);
    const frames = new ChordDetector(o).push(new Float64Array(o.frameSize), 10);
    expect(frames).toHaveLength(1);
    expect(frames[0]!.time).toBeCloseTo(10 + o.frameSize / 2 / SR, 6);
  });
});

/**
 * Baseline quality on synthetic strums of the generator's top fingerings.
 * The numbers are printed so the PR can quote them; the assertions are floors
 * that catch regressions.
 */
describe('baseline on synthetic strums', { timeout: 60_000 }, () => {
  function evaluate(vocabId: string, voicingsPerChord: number, extra: Parameters<typeof strum>[1] = {}) {
    const vocab = VOCABULARIES.find((v) => v.id === vocabId)!;
    const o = { ...defaultDetectorOptions(SR), vocabulary: vocab };
    const tally: Record<Agreement, number> = { exact: 0, root: 0, related: 0, wrong: 0, silent: 0 };
    const misses: string[] = [];
    let seed = 1;
    let frames = 0;
    let rightFrames = 0;
    const firstRight: number[] = [];
    for (const quality of vocab.qualities) {
      for (let root = 0; root < 12; root++) {
        const chord: Chord = { root, quality };
        for (const v of generateVoicings(chord, standard).slice(0, voicingsPerChord)) {
          const audio = strum(v.pitches, { sampleRate: SR, seed: seed++, down: seed % 3 !== 0, ...extra });
          const fs = analyseBuffer(audio, o);
          const guess = dominantChord(fs)?.chord;
          const sounding = fs.filter((f) => f.smooth.best);
          frames += sounding.length;
          rightFrames += sounding.filter((f) => agreement(chord, f.smooth.best!.chord) === 'exact').length;
          const first = sounding.find((f) => agreement(chord, f.smooth.best!.chord) === 'exact');
          // Strum starts at 20 ms; a frame's time is its window centre, so add half a window for when it was known.
          if (first) firstRight.push(first.time + o.frameSize / 2 / SR - 0.02);
          const a = agreement(chord, guess);
          tally[a]++;
          if (a !== 'exact') misses.push(`${root}:${quality} → ${guess ? `${guess.root}:${guess.quality}` : '–'} [${chordPcs(chord).join(' ')}]`);
        }
      }
    }
    const total = Object.values(tally).reduce((a, b) => a + b, 0);
    firstRight.sort((a, b) => a - b);
    const median = firstRight[Math.floor(firstRight.length / 2)] ?? NaN;
    console.log(`  frame-level: ${((rightFrames / frames) * 100).toFixed(1)}% of sounding frames exact; median strum → first right label ${(median * 1000).toFixed(0)} ms`);
    return { tally, total, exact: tally.exact / total, misses };
  }

  it('major and minor triads', () => {
    const r = evaluate('triads', 3);
    console.log(`triads: ${(r.exact * 100).toFixed(1)}% exact of ${r.total}`, r.tally, r.misses.slice(0, 12));
    expect(r.exact).toBeGreaterThan(0.9);
  });

  it('triads plus sevenths', () => {
    const r = evaluate('sevenths', 3);
    console.log(`sevenths: ${(r.exact * 100).toFixed(1)}% exact of ${r.total}`, r.tally, r.misses.slice(0, 20));
    expect(r.exact).toBeGreaterThan(0.6);
  });

  it('triads plus sevenths with a noisier, detuned guitar', () => {
    const r = evaluate('sevenths', 2, { noise: 0.02, detuneCents: 20 });
    console.log(`sevenths noisy: ${(r.exact * 100).toFixed(1)}% exact of ${r.total}`, r.tally);
    expect(r.exact).toBeGreaterThan(0.4);
  });
});
