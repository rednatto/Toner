/**
 * A chord you can hear where it is. Tapping the tile plays the chord in its
 * easiest fingering on the current instrument, with a mini key well of that
 * fingering; the small arrow in the corner opens it in the chord view.
 */
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { chordPcs, type Chord, type Mode } from '@toner/theory';
import { generateVoicings } from '@toner/instrument';
import { strumPitches } from '../audio/strum';
import { useSettings, useStrings } from '../settings';
import { KeyWell } from '../visual/KeyWell';

/** The easiest fingering's pitches for a chord, or a close voicing when nothing is playable. */
export function useChordPitches(chord: Chord): number[] {
  const { tuning, profile } = useStrings();
  return useMemo(() => {
    const v = generateVoicings(chord, tuning.strings, { maxFret: Math.min(12, profile.frets), limit: 1 })[0];
    if (v) return v.pitches;
    return chordPcs(chord).map((pc) => 48 + pc + (pc < chord.root ? 12 : 0));
  }, [chord.root, chord.quality, chord.bass, tuning.strings.join(','), profile.frets]);
}

export function ChordTile({
  chord,
  mode = 'major',
  onOpen,
  className = '',
  style,
  title,
  children,
}: {
  chord: Chord;
  mode?: Mode;
  /** Open the chord elsewhere (the chord view); shown as a small corner arrow. */
  onOpen?: () => void;
  className?: string;
  style?: CSSProperties;
  title?: string;
  children: ReactNode;
}) {
  const { settings } = useSettings();
  const pitches = useChordPitches(chord);
  return (
    <div className={`chord-tile ${className}`} style={style}>
      <button className="chord-tile-play" onClick={() => void strumPitches(pitches, settings.a4)} title={title ?? 'Tap to hear it'}>
        {children}
        <KeyWell pcs={chordPcs(chord)} root={chord.root} pitches={pitches} mode={mode} size={44} />
      </button>
      {onOpen && (
        <button className="chord-tile-open" onClick={onOpen} aria-label="Open in the chord view" title="Open in the chord view">
          ↗
        </button>
      )}
    </div>
  );
}
