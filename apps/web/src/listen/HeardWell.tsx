import { chordPcs, mod12, type Chord, type PitchClass } from '@toner/theory';
import { KeyWell, type WellMark } from '../visual/KeyWell';
import type { Check, Remembered } from './notes';

/**
 * What is being heard, on the key well the rest of the app uses for chords.
 *
 * Round the outside, a histogram shows each pitch class as it sounds, moment
 * by moment. Inside, things hold still: with an expected chord the well shows
 * that chord, each chord note solid while it has been heard recently and a
 * dashed outline when not, doubling rings for notes heard in more than one
 * octave, and notes outside the chord on the rim as colour tones (diamonds)
 * or rubs (red rings). Without one, the well shows the chord the namer hears.
 */
export function HeardWell({
  notes,
  pcLevels,
  target,
  check,
  shown,
  energy,
  size = 340,
}: {
  /** Notes (with octaves) heard recently, with how strongly. */
  notes: Remembered[];
  /** Pitch classes the check heard recently, with how strongly. */
  pcLevels: Remembered[];
  target: Chord | null;
  check: Check | null;
  /** Without a target: the chord the namer hears, drawn as a plain chord. */
  shown: Chord | null;
  /** Each pitch class sounding right now, 0 … 1, for the histogram round the rim. */
  energy: ArrayLike<number>;
  size?: number;
}) {
  if (!target) {
    return <KeyWell pcs={shown ? chordPcs(shown) : []} root={shown?.root} energy={energy} size={size} animate={false} label="Chord heard" />;
  }
  const tones = chordPcs(target);
  // Steady, not fading: a chord note is either heard (within the hold) or not.
  const heard = new Set(pcLevels.filter((n) => n.level >= HEARD).map((n) => mod12(n.pitch)));
  const gone = new Set([...(check?.missing ?? []), ...(check?.dropped ?? [])]);
  const presence = new Map<PitchClass, number>(tones.map((pc) => [pc, heard.has(pc) && !gone.has(pc) ? 1 : 0]));
  const marks: WellMark[] = [
    ...(check?.colour ?? []).map((pc) => ({ pc, kind: 'colour' as const })),
    ...(check?.foreign ?? []).map((pc) => ({ pc, kind: 'rub' as const })),
  ];
  const doubled = notes.filter((n) => n.level >= 0.5 && tones.includes(mod12(n.pitch))).map((n) => n.pitch);
  return (
    <KeyWell
      pcs={tones}
      root={target.root}
      pitches={doubled}
      presence={presence}
      marks={marks}
      energy={energy}
      size={size}
      animate={false}
      interactive
      label="Expected chord, lit by the notes heard"
    />
  );
}

/** Level in the pitch-class memory above which a note counts as heard. */
export const HEARD = 0.35;
