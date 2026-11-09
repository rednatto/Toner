import { chordPcs, mod12, type Chord, type PitchClass } from '@toner/theory';
import { KeyWell, type WellMark } from '../visual/KeyWell';
import type { Check, Remembered } from './notes';

/**
 * What is being heard, on the key well the rest of the app uses for chords.
 *
 * With an expected chord the well shows that chord, as it does everywhere
 * else, and listening brings it to life: each chord note glows while it is
 * heard and fades after, a note heard in more than one octave gets the well's
 * doubling rings, a chord note not heard is a dashed outline, and notes
 * outside the chord appear on the rim as colour tones (diamonds) or rubs (red
 * rings). Without one, the well simply shows the notes heard.
 */
export function HeardWell({
  notes,
  pcLevels,
  target,
  check,
  root,
  size = 320,
}: {
  /** Notes (with octaves) heard recently, with how strongly. */
  notes: Remembered[];
  /** Pitch classes the check heard recently, with how strongly. */
  pcLevels: Remembered[];
  target: Chord | null;
  check: Check | null;
  /** Root to mark when there is no target, such as the chord the namer heard. */
  root?: PitchClass;
  size?: number;
}) {
  const loud = notes.filter((n) => n.level > 0.3);
  if (!target) {
    const presence = new Map<PitchClass, number>();
    for (const n of loud) presence.set(mod12(n.pitch), Math.max(presence.get(mod12(n.pitch)) ?? 0, n.level));
    const pcs = [...presence.keys()];
    return <KeyWell pcs={pcs} root={root !== undefined && presence.has(root) ? root : undefined} pitches={loud.map((n) => n.pitch)} presence={presence} size={size} animate={false} label="Notes heard" />;
  }
  const tones = chordPcs(target);
  const level = new Map(pcLevels.map((n) => [mod12(n.pitch), n.level] as const));
  const gone = new Set([...(check?.missing ?? []), ...(check?.dropped ?? [])]);
  const presence = new Map<PitchClass, number>(tones.map((pc) => [pc, gone.has(pc) ? 0 : (level.get(pc) ?? 0)]));
  const marks: WellMark[] = [
    ...(check?.colour ?? []).map((pc) => ({ pc, kind: 'colour' as const, level: level.get(pc) ?? 1 })),
    ...(check?.foreign ?? []).map((pc) => ({ pc, kind: 'rub' as const, level: level.get(pc) ?? 1 })),
  ];
  return (
    <KeyWell
      pcs={tones}
      root={target.root}
      pitches={loud.filter((n) => tones.includes(mod12(n.pitch))).map((n) => n.pitch)}
      presence={presence}
      marks={marks}
      size={size}
      animate={false}
      interactive
      label="Expected chord, lit by the notes heard"
    />
  );
}
