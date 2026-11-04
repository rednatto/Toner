import { chordPcs, type Chord, type HarmonicFunction, type Mode } from '@toner/theory';
import { KeyWell, type WellMark } from '../visual/KeyWell';
import { FN_TINT } from './deco';

/**
 * A chord as a key-well miniature, with a faint tint behind it for the
 * chord's job. Used inside the puzzle boards (an SVG), so it is placed with a
 * transform by the caller.
 */
export function ChordMini({ chord, size = 44, marks = [], fn, mode = 'major' }: { chord: Chord; size?: number; marks?: WellMark[]; fn?: HarmonicFunction; mode?: Mode }) {
  return (
    <g>
      {fn && <circle cx={size / 2} cy={size / 2} r={size / 2} fill={FN_TINT[fn]} fillOpacity={0.3} />}
      <KeyWell pcs={chordPcs(chord)} root={chord.root} mode={mode} size={size} marks={marks} />
    </g>
  );
}
