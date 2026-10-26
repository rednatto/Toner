/**
 * Chord fingering generator. Given a chord's tones and a tuning, list the
 * playable voicings, ranked by how comfortable and complete they are.
 *
 * The search slides a window of `maxSpan` frets up the neck; on each string a
 * voicing may mute, play open, or fret a chord tone inside the window. Every
 * candidate is then checked for completeness (all required tones, correct
 * bass), playability (at most four fingers, allowing a barre) and scored.
 */
import { chordQuality, mod12, type Chord, type Pitch, type PitchClass } from '@toner/theory';

export interface Voicing {
  /** Fret per string, low to high; null = muted, 0 = open. */
  frets: (number | null)[];
  /** Suggested finger per string (1 = index … 4 = pinky), null for open or muted. */
  fingers: (number | null)[];
  barre?: { fret: number; fromString: number; toString: number };
  /** Lowest fretted fret, for drawing the diagram window. */
  baseFret: number;
  pitches: Pitch[];
  /** Optional chord tones left out. */
  omitted: PitchClass[];
  /** Lower is easier / better. */
  score: number;
}

export interface FingeringOptions {
  /** Frets covered by the hand, including the first. Default 4. */
  maxSpan?: number;
  /** Highest fret to consider. Default 15. */
  maxFret?: number;
  /** Pitch class that must be the lowest note. Defaults to the chord's bass or root; null allows any. */
  bass?: PitchClass | null;
  /** Minimum sounding strings. Default min(strings, max(3, chord size)). */
  minStrings?: number;
  /** Number of voicings to return. Default 12. */
  limit?: number;
}

export interface ChordTones {
  required: PitchClass[];
  optional: PitchClass[];
  bass: PitchClass;
}

export function chordTones(c: Chord): ChordTones {
  const q = chordQuality(c.quality);
  const opt = new Set((q.optional ?? []).map((i) => mod12(c.root + i)));
  const all = [...new Set(q.intervals.map((i) => mod12(c.root + i)))];
  const required = all.filter((p) => !opt.has(p));
  const bass = c.bass ?? c.root;
  if (!required.includes(bass)) required.push(bass);
  return { required, optional: all.filter((p) => opt.has(p) && p !== bass), bass };
}

/** Assign fingers; detect a barre when the lowest fret is needed on several strings. */
function fingerPlan(frets: (number | null)[]): { fingers: (number | null)[]; barre?: Voicing['barre'] } | null {
  const fretted = frets.map((f, i) => ({ f, i })).filter((x): x is { f: number; i: number } => x.f !== null && x.f > 0);
  const fingers: (number | null)[] = frets.map(() => null);
  if (fretted.length === 0) return { fingers };
  const min = Math.min(...fretted.map((x) => x.f));
  const atMin = fretted.filter((x) => x.f === min);
  let barre: Voicing['barre'] | undefined;
  let needed = fretted.length;
  if (atMin.length >= 2) {
    const from = atMin[0]!.i;
    const to = atMin[atMin.length - 1]!.i;
    // A barre presses every string between; none of them may be open or muted.
    const ok = frets.slice(from, to + 1).every((f) => f !== null && f >= min);
    if (ok) {
      barre = { fret: min, fromString: from, toString: to };
      needed = fretted.length - atMin.length + 1;
    }
  }
  if (needed > 4) return null;
  // Fingers by fret distance from the lowest fret; keep order across strings at the same fret.
  let next = barre ? 2 : 1;
  const byFret = [...fretted].sort((a, b) => a.f - b.f || a.i - b.i);
  for (const { f, i } of byFret) {
    if (barre && f === min) fingers[i] = 1;
    else {
      fingers[i] = Math.min(4, Math.max(next, f - min + 1));
      next = fingers[i]! + 1;
    }
  }
  return barre ? { fingers, barre } : { fingers };
}

export function generateVoicings(c: Chord, strings: Pitch[], opts: FingeringOptions = {}): Voicing[] {
  const tones = chordTones(c);
  const bass = opts.bass === undefined ? tones.bass : opts.bass;
  const chordPcs = new Set([...tones.required, ...tones.optional]);
  const maxSpan = opts.maxSpan ?? 4;
  const maxFret = opts.maxFret ?? 15;
  const n = strings.length;
  const minStrings = opts.minStrings ?? Math.min(n, Math.max(3, tones.required.length));
  const seen = new Set<string>();
  const out: Voicing[] = [];

  for (let start = 1; start <= maxFret; start++) {
    const end = start + maxSpan - 1;
    const options: (number | null)[][] = strings.map((open) => {
      const o: (number | null)[] = [null];
      if (chordPcs.has(mod12(open))) o.push(0);
      for (let f = start; f <= end; f++) if (chordPcs.has(mod12(open + f))) o.push(f);
      return o;
    });
    const cur: (number | null)[] = new Array(n).fill(null);
    const walk = (s: number) => {
      if (s === n) {
        consider([...cur]);
        return;
      }
      for (const f of options[s]!) {
        cur[s] = f;
        walk(s + 1);
      }
    };
    walk(0);
  }

  function consider(frets: (number | null)[]) {
    const key = frets.map((f) => (f === null ? 'x' : f)).join(',');
    if (seen.has(key)) return;
    const sounding = frets.map((f, i) => (f === null ? null : strings[i]! + f));
    const pitches = sounding.filter((p): p is number => p !== null);
    if (pitches.length < minStrings) return;
    // The lowest sounding note must be the bass.
    if (bass !== null && mod12(Math.min(...pitches)) !== bass) return;
    const present = new Set(pitches.map(mod12));
    if (!tones.required.every((p) => present.has(p))) return;
    const first = frets.findIndex((f) => f !== null);
    const last = n - 1 - [...frets].reverse().findIndex((f) => f !== null);
    const interiorMutes = frets.slice(first, last + 1).filter((f) => f === null).length;
    if (interiorMutes > 1) return;
    const fretted = frets.filter((f): f is number => f !== null && f > 0);
    const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
    if (span > maxSpan - 1) return;
    const plan = fingerPlan(frets);
    if (!plan) return;
    seen.add(key);
    const omitted = tones.optional.filter((p) => !present.has(p));
    const baseFret = fretted.length ? Math.min(...fretted) : 0;
    const maxFret = fretted.length ? Math.max(...fretted) : 0;
    const opens = frets.filter((f) => f === 0).length;
    const muted = n - pitches.length;
    const score =
      baseFret * 0.35 +
      span * 0.8 +
      interiorMutes * 3 +
      muted * 0.7 +
      omitted.length * 1.2 +
      fretted.length * 0.15 +
      (plan.barre ? 0.8 : 0) +
      // Open strings help in first position but mixing them with frets above 3 is awkward.
      (maxFret <= 3 ? -0.25 : 0.5) * opens +
      // Muting low strings is easy; muting high strings less so.
      (n - 1 - last) * 0.6;
    const v: Voicing = { frets, fingers: plan.fingers, baseFret, pitches, omitted, score };
    if (plan.barre) v.barre = plan.barre;
    out.push(v);
  }

  out.sort((a, b) => a.score - b.score);
  return out.slice(0, opts.limit ?? 12);
}

/** Compact text form, e.g. "x32010". Frets above 9 are wrapped in parentheses. */
export function voicingToString(v: Voicing): string {
  return v.frets.map((f) => (f === null ? 'x' : f > 9 ? `(${f})` : String(f))).join('');
}
