/**
 * Scoring the detector against labelled takes: what each take read as, how
 * many of its sounding frames were right, and a summary by chord.
 */
import { agreement, analyseBuffer, dominantChord, sameChord, type Agreement, type DetectorOptions } from './chroma';
import type { Chord } from '@toner/theory';

export interface LabelledAudio {
  id: string;
  chord: Chord | null;
  samples: ArrayLike<number>;
  sampleRate: number;
}

export interface TakeScore {
  id: string;
  truth: Chord | null;
  guess: Chord | null;
  /** How the take's overall reading relates to the label. */
  verdict: Agreement | 'quiet-ok' | 'false-chord';
  /** Share of sounding frames (or for "no chord", of all frames) the detector got right. */
  frameAccuracy: number;
  /** Mean confidence of the overall reading. */
  confidence: number;
}

export interface Summary {
  takes: number;
  /** Takes whose overall reading is exactly the label. */
  exact: number;
  /** Mean frame accuracy over takes. */
  frames: number;
  byVerdict: Record<string, number>;
  /** "truth → guess" pairs that went wrong, with counts, worst first. */
  confusions: { truth: Chord | null; guess: Chord | null; count: number }[];
}

export function scoreTake(t: LabelledAudio, o: DetectorOptions, skip = 0.1): TakeScore {
  const frames = analyseBuffer(t.samples, { ...o, sampleRate: t.sampleRate });
  const t0 = frames[0]?.time ?? 0;
  const used = frames.filter((f) => f.time - t0 >= skip);
  const dom = dominantChord(used, 0);
  if (!t.chord) {
    const quiet = used.filter((f) => !f.smooth.best).length;
    return { id: t.id, truth: null, guess: dom?.chord ?? null, verdict: dom ? 'false-chord' : 'quiet-ok', frameAccuracy: used.length ? quiet / used.length : 1, confidence: dom?.p ?? 1 };
  }
  const sounding = used.filter((f) => f.smooth.best);
  const right = sounding.filter((f) => sameChord(f.smooth.best!.chord, t.chord)).length;
  return {
    id: t.id,
    truth: t.chord,
    guess: dom?.chord ?? null,
    verdict: agreement(t.chord, dom?.chord),
    frameAccuracy: sounding.length ? right / sounding.length : 0,
    confidence: dom?.p ?? 0,
  };
}

const key = (c: Chord | null) => (c ? `${c.root}:${c.quality}` : 'N');

export function summarise(scores: TakeScore[]): Summary {
  const byVerdict: Record<string, number> = {};
  const conf = new Map<string, { truth: Chord | null; guess: Chord | null; count: number }>();
  let exact = 0;
  let frames = 0;
  for (const s of scores) {
    byVerdict[s.verdict] = (byVerdict[s.verdict] ?? 0) + 1;
    frames += s.frameAccuracy;
    const ok = s.verdict === 'exact' || s.verdict === 'quiet-ok';
    if (ok) exact++;
    else {
      const k = `${key(s.truth)}>${key(s.guess)}`;
      const c = conf.get(k) ?? { truth: s.truth, guess: s.guess, count: 0 };
      c.count++;
      conf.set(k, c);
    }
  }
  return {
    takes: scores.length,
    exact,
    frames: scores.length ? frames / scores.length : 0,
    byVerdict,
    confusions: [...conf.values()].sort((a, b) => b.count - a.count),
  };
}
