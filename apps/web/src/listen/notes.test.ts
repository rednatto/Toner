import { describe, expect, it } from 'vitest';
import { generateVoicings, GUITAR } from '@toner/instrument';
import { pitchClass, pitchToFreq, type Chord } from '@toner/theory';
import { analyseBuffer, defaultDetectorOptions, harmonicTemplate, magnitudeSpectrum, normalise, spectralPeaks, VOCABULARIES } from './chroma';
import { checkChord, checkChroma, colourTones, NoteMemory, notesFromPeaks } from './notes';
import { strum } from './synthGuitar';

const SR = 48000;
const standard = GUITAR.tunings.find((t) => t.id === 'standard')!.strings;

/** Harmonic tone with partials falling off like a plucked string. */
function tone(pitches: number[], n = 8192): Float64Array {
  const out = new Float64Array(n);
  for (const p of pitches) {
    const f = pitchToFreq(p);
    for (let h = 1; h <= 10; h++) for (let i = 0; i < n; i++) out[i]! += (0.6 ** (h - 1) * Math.sin((2 * Math.PI * f * h * i) / SR)) / pitches.length;
  }
  return out;
}

const pick = (x: Float64Array) => notesFromPeaks(spectralPeaks(magnitudeSpectrum(x), SR)).map((n) => n.pitch);

describe('note picking', () => {
  it('finds a single string, not its overtones', () => {
    expect(pick(tone([40]))).toEqual([40]);
    expect(pick(tone([57]))).toEqual([57]);
  });

  it('finds the notes of a triad', () => {
    expect(pick(tone([48, 52, 55])).sort()).toEqual([48, 52, 55]);
  });

  it('keeps a doubled octave when it is really played', () => {
    expect(pick(tone([45, 57])).sort()).toEqual([45, 57]);
  });
});

describe('checking against a target', () => {
  const E: Chord = { root: 4, quality: 'maj' };
  it('treats the seventh as a colour tone, not a wrong note', () => {
    expect(colourTones(E)).toContain(2); // D makes E7
    const c = checkChord(E, [4, 8, 11, 2]);
    expect(c.verdict).toBe('coloured');
    expect(c.colour).toEqual([2]);
  });
  it('lets the fifth go but not the third', () => {
    expect(checkChord(E, [4, 8]).verdict).toBe('right');
    expect(checkChord(E, [4, 11]).verdict).toBe('missing');
  });
  it('flags notes that do not belong', () => {
    const c = checkChord(E, [4, 8, 11, 0]);
    expect(c.verdict).toBe('wrong');
    expect(c.foreign).toEqual([0]);
  });
});

describe('note memory', () => {
  it('fades notes and lets a strum push the old chord back', () => {
    const m = new NoteMemory(1, 1);
    m.push(0, [{ pitch: 40, strength: 1 }]);
    expect(m.at(1)[0]!.level).toBeCloseTo(Math.exp(-1), 5);
    m.push(1, [{ pitch: 45, strength: 1 }], true);
    const now = m.at(1);
    expect(now[0]!.pitch).toBe(45);
    expect(now.find((n) => n.pitch === 40)!.level).toBeLessThan(0.2);
  });
});

describe('notes in synthetic strums', { timeout: 60_000 }, () => {
  it('hears the notes of strummed shapes, passes them as their own chord and flags them as another', () => {
    const o = defaultDetectorOptions(SR);
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let exactPitches = 0;
    let shapes = 0;
    const verdicts: Record<string, number> = {};
    const chromaVerdicts: Record<string, number> = {};
    const caught: Record<string, number> = {};
    const bad: string[] = [];
    let seed = 1;
    for (const quality of VOCABULARIES[1]!.qualities) {
      for (let root = 0; root < 12; root++) {
        const chord: Chord = { root, quality };
        for (const v of generateVoicings(chord, standard).slice(0, 2)) {
          const frames = analyseBuffer(strum(v.pitches, { sampleRate: SR, seed: seed++ }), o);
          const mem = new NoteMemory(1.2);
          for (const f of frames) mem.push(f.time, f.notes, f.onset);
          const heard = mem.at(0.7, 0.45);
          const pcs = new Set(heard.map((n) => pitchClass(n.pitch)));
          const truth = new Set(v.pitches.map(pitchClass));
          for (const p of pcs) truth.has(p) ? tp++ : fp++;
          for (const p of truth) if (!pcs.has(p)) fn++;
          const truthPitches = new Set(v.pitches);
          if (heard.length === truthPitches.size && heard.every((n) => truthPitches.has(n.pitch))) exactPitches++;
          shapes++;
          const c = checkChord(chord, pcs);
          verdicts[c.verdict] = (verdicts[c.verdict] ?? 0) + 1;
          const avg = new Float64Array(12);
          for (const f of frames) if (f.time > 0.3 && f.time < 0.9) f.smooth.chroma.forEach((x, i) => (avg[i]! += x));
          const cc = checkChroma(chord, normalise(avg), harmonicTemplate(chord));
          chromaVerdicts[cc.verdict] = (chromaVerdicts[cc.verdict] ?? 0) + 1;
          // And against a wrong target: the chord a whole step up should be flagged.
          const wrongTarget = { root: (root + 2) % 12, quality };
          const cw = checkChroma(wrongTarget, normalise(Float64Array.from(avg)), harmonicTemplate(wrongTarget));
          caught[cw.verdict] = (caught[cw.verdict] ?? 0) + 1;
          if (c.verdict === 'wrong' || c.verdict === 'missing') bad.push(`${root}:${quality} ${v.frets.map((f) => f ?? 'x').join('')} heard ${[...pcs].join(' ')}`);
        }
      }
    }
    const precision = tp / (tp + fp);
    const recall = tp / (tp + fn);
    console.log(`notes: precision ${(precision * 100).toFixed(1)}%, recall ${(recall * 100).toFixed(1)}%, every pitch exactly ${exactPitches}/${shapes}`, verdicts, bad.slice(0, 10));
    console.log('chroma check, right target:', chromaVerdicts, 'wrong target:', caught);
    // Note picking drives the picture, so it should be mostly right; the check itself uses the profile.
    expect(precision).toBeGreaterThan(0.8);
    expect(recall).toBeGreaterThan(0.8);
    expect(((chromaVerdicts.right ?? 0) + (chromaVerdicts.coloured ?? 0)) / shapes).toBeGreaterThan(0.95);
    expect((caught.wrong ?? 0) + (caught.missing ?? 0)).toBeGreaterThan(shapes * 0.95);
  });
});

describe('checking played shapes against a target', { timeout: 60_000 }, () => {
  const o = defaultDetectorOptions(SR);
  function verdict(target: Chord, pitches: number[], seed: number) {
    const frames = analyseBuffer(strum(pitches, { sampleRate: SR, seed }), o);
    const avg = new Float64Array(12);
    for (const f of frames) if (f.time > 0.3 && f.time < 0.9) f.smooth.chroma.forEach((x, i) => (avg[i]! += x));
    return checkChroma(target, normalise(avg), harmonicTemplate(target));
  }

  it('calls E7 a coloured E, and E short of the seventh for E7', () => {
    const e7 = generateVoicings({ root: 4, quality: 'dom7' }, standard)[0]!;
    const e = generateVoicings({ root: 4, quality: 'maj' }, standard)[0]!;
    const asE = verdict({ root: 4, quality: 'maj' }, e7.pitches, 1);
    expect(asE.verdict).toBe('coloured');
    expect(asE.colour).toContain(2);
    const asE7 = verdict({ root: 4, quality: 'dom7' }, e.pitches, 2);
    expect(asE7.verdict).toBe('missing');
    expect(asE7.missing).toEqual([2]);
  });

  it('catches one string fretted a semitone off', () => {
    let caught = 0;
    let total = 0;
    const misses: string[] = [];
    let seed = 100;
    for (const quality of ['maj', 'min']) {
      for (let root = 0; root < 12; root++) {
        const chord: Chord = { root, quality };
        const v = generateVoicings(chord, standard)[0]!;
        // Push each sounding string up a fret in turn, when that makes a note outside the chord.
        v.pitches.forEach((_, s) => {
          const wrong = [...v.pitches];
          wrong[s] = wrong[s]! + 1;
          if (checkChord(chord, wrong.map(pitchClass)).verdict !== 'wrong') return;
          total++;
          const c = verdict(chord, wrong, seed++);
          if (c.verdict === 'wrong' || c.verdict === 'missing') caught++;
          else misses.push(`${root}:${quality} string ${s} → ${c.verdict}`);
        });
      }
    }
    console.log(`one wrong string: caught ${caught}/${total}`, misses.slice(0, 8));
    expect(caught / total).toBeGreaterThan(0.8);
  });
});
