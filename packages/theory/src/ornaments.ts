/**
 * Ornaments, articulations, bowings and dynamics on notes, and how to sound
 * them. A note carries marks by id; `performNotes` turns written notes into
 * what a player would actually sound: grace notes before the beat, a roll as
 * cut and tap, a trill as alternation with the note above, staccato shortened,
 * accents and dynamics as loudness.
 */
import { mod12, type Pitch, type PitchClass } from './pitch.js';
import type { TimedNote } from './song.js';

export interface MarkInfo {
  id: string;
  name: string;
  /** Short sign to draw above the note. */
  symbol: string;
  kind: 'ornament' | 'articulation' | 'bowing' | 'dynamic' | 'other';
  description: string;
}

const m = (id: string, name: string, symbol: string, kind: MarkInfo['kind'], description: string): MarkInfo => ({ id, name, symbol, kind, description });

export const NOTE_MARKS: readonly MarkInfo[] = [
  m('roll', 'roll', '~', 'ornament', 'The note, cut by the note above, then tapped by the note below: the Irish roll.'),
  m('trill', 'trill', 'tr', 'ornament', 'Alternate quickly with the note above, ending on the note.'),
  m('mordent', 'mordent', 'ᴍ', 'ornament', 'The note, the note below, the note again, quickly.'),
  m('uppermordent', 'upper mordent', 'ᴘ', 'ornament', 'The note, the note above, the note again, quickly.'),
  m('turn', 'turn', '∽', 'ornament', 'The note above, the note, the note below, the note.'),
  m('slide', 'slide', '↗', 'ornament', 'Slide up into the note from a semitone below.'),
  m('staccato', 'staccato', '·', 'articulation', 'Short and detached.'),
  m('tenuto', 'tenuto', '–', 'articulation', 'Held for its full length.'),
  m('accent', 'accent', '>', 'articulation', 'Louder attack.'),
  m('fermata', 'fermata', '𝄐', 'articulation', 'Hold longer than written.'),
  m('breath', 'breath', ',', 'articulation', 'Breathe or lift after this note.'),
  m('upbow', 'up bow', 'V', 'bowing', 'Bow upwards (fiddle), or an upstroke.'),
  m('downbow', 'down bow', '⊓', 'bowing', 'Bow downwards (fiddle), or a downstroke.'),
  ...(['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'sfz'] as const).map((d) => m(d, d, d, 'dynamic', 'How loud from here on.')),
];

const BY_ID = new Map(NOTE_MARKS.map((x) => [x.id, x]));

/** Description of a mark id; an unknown one is shown by its written name. */
export function markInfo(id: string): MarkInfo {
  return BY_ID.get(id) ?? m(id, id, id.length > 4 ? `${id.slice(0, 4)}.` : id, 'other', `Written as "${id}".`);
}

const DYNAMIC_LEVEL: Record<string, number> = { ppp: 0.4, pp: 0.55, p: 0.7, mp: 0.85, mf: 1, f: 1.2, ff: 1.4, fff: 1.6 };

/** One sounded note. Times in beats, like the written notes. */
export interface Sounding {
  start: number;
  duration: number;
  pitch: Pitch;
  /** Loudness, 1 = normal. */
  level: number;
  /** True for the extra notes an ornament or grace adds. */
  ornament?: true;
}

/** The nearest pitch above (dir 1) or below (dir -1) whose pitch class is in the scale. */
export function scaleNeighbour(pitch: Pitch, scale: PitchClass[], dir: 1 | -1): Pitch {
  if (!scale.length) return pitch + 2 * dir;
  const set = new Set(scale.map(mod12));
  for (let step = 1; step <= 12; step++) if (set.has(mod12(Math.round(pitch) + dir * step))) return pitch + dir * step;
  return pitch + 2 * dir;
}

/**
 * What a player sounds for written notes. `scale` gives the neighbours that
 * rolls, trills and mordents use; `grace` is the length of one grace or
 * ornament note in beats (callers derive it from the tempo, about 60 ms).
 */
export function performNotes(notes: TimedNote[], scale: PitchClass[], grace: number): Sounding[] {
  const out: Sounding[] = [];
  let dynamic = 1;
  for (const n of notes) {
    const marks = new Set(n.marks ?? []);
    for (const id of marks) if (id in DYNAMIC_LEVEL) dynamic = DYNAMIC_LEVEL[id]!;
    const level = dynamic * (marks.has('accent') || marks.has('sfz') ? 1.4 : 1);
    const add = (start: number, duration: number, pitch: Pitch, ornament = true) => {
      const s: Sounding = { start, duration, pitch, level: ornament ? level * 0.8 : level };
      if (ornament) s.ornament = true;
      out.push(s);
    };
    // Grace notes come just before the beat, so the main note stays on time.
    (n.grace ?? []).forEach((g, i, all) => add(n.start - (all.length - i) * grace, grace, g));
    const up = () => scaleNeighbour(n.pitch, scale, 1);
    const down = () => scaleNeighbour(n.pitch, scale, -1);
    let d = n.duration;
    if (marks.has('staccato')) d *= 0.5;
    if (marks.has('fermata')) d *= 1.6;
    const t = n.start;
    if (marks.has('roll') && n.duration >= 6 * grace) {
      // Irish roll: the note, a cut from above, the note, a tap from below, the note.
      const third = n.duration / 3;
      add(t, third, n.pitch, false);
      add(t + third, grace, up());
      add(t + third + grace, third - grace, n.pitch, false);
      add(t + 2 * third, grace, down());
      add(t + 2 * third + grace, d - 2 * third - grace, n.pitch, false);
    } else if (marks.has('roll') || marks.has('turn')) {
      // Too short for a full roll: a quick turn into the note.
      [up(), n.pitch, down()].forEach((p, i) => add(t + i * grace, grace, p));
      add(t + 3 * grace, Math.max(grace, d - 3 * grace), n.pitch, false);
    } else if (marks.has('trill')) {
      const step = grace;
      const pairs = Math.max(1, Math.floor((n.duration * 0.75) / (2 * step)));
      for (let i = 0; i < pairs; i++) {
        add(t + 2 * i * step, step, up());
        add(t + (2 * i + 1) * step, step, n.pitch);
      }
      add(t + 2 * pairs * step, Math.max(grace, d - 2 * pairs * step), n.pitch, false);
    } else if (marks.has('mordent') || marks.has('uppermordent')) {
      add(t, grace, n.pitch, false);
      add(t + grace, grace, marks.has('mordent') ? down() : up());
      add(t + 2 * grace, Math.max(grace, d - 2 * grace), n.pitch, false);
    } else if (marks.has('slide')) {
      add(t - grace, grace, n.pitch - 1);
      add(t, d, n.pitch, false);
    } else {
      add(t, d, n.pitch, false);
    }
  }
  return out.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
}
