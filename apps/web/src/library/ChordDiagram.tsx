import { pitchClass, type Pitch } from '@toner/theory';
import { voicingToString, type Voicing } from '@toner/instrument';
import { useSettings } from '../settings';

/** A vertical chord box: strings left (low) to right (high), frets downwards. */
export function ChordDiagram({ voicing, strings, title, onPlay }: { voicing: Voicing; strings: Pitch[]; title?: string; onPlay?: () => void }) {
  const { settings, names, colours } = useSettings();
  const n = strings.length;
  const rows = 5;
  const gap = 18;
  const fretH = 22;
  const w = (n - 1) * gap;
  const fretted = voicing.frets.filter((f): f is number => f !== null && f > 0);
  const maxFret = fretted.length ? Math.max(...fretted) : 0;
  const top = maxFret <= rows ? 1 : voicing.baseFret;
  const y = (fret: number) => (fret - top + 0.5) * fretH;
  return (
    <figure className="chord-diagram">
      <svg viewBox={`-22 -30 ${w + 44} ${rows * fretH + 54}`} role="img" aria-label={`${title ?? ''} ${voicingToString(voicing)}`} onClick={onPlay} style={onPlay ? { cursor: 'pointer' } : undefined}>
        {top === 1 ? <rect x={-1} y={-4} width={w + 2} height={4} fill="var(--fg)" /> : <text x={-8} y={fretH * 0.5 + 4} textAnchor="end" className="fret-no">{top}</text>}
        {Array.from({ length: rows + 1 }, (_, r) => (
          <line key={r} x1={0} x2={w} y1={r * fretH} y2={r * fretH} stroke="var(--line)" />
        ))}
        {strings.map((_, s) => (
          <line key={s} x1={s * gap} x2={s * gap} y1={0} y2={rows * fretH} stroke="var(--muted)" strokeWidth={1 + (n - s) * 0.15} />
        ))}
        {voicing.barre && (
          <rect
            x={voicing.barre.fromString * gap - 7}
            y={y(voicing.barre.fret) - 7}
            width={(voicing.barre.toString - voicing.barre.fromString) * gap + 14}
            height={14}
            rx={7}
            fill="var(--fg)"
            opacity="0.35"
          />
        )}
        {voicing.frets.map((f, s) => {
          const x = s * gap;
          if (f === null) return <text key={s} x={x} y={-10} textAnchor="middle" className="mute">×</text>;
          const pitch = strings[s]! + f;
          const pc = pitchClass(pitch);
          if (f === 0) return <circle key={s} cx={x} cy={-13} r={5} fill="none" stroke={colours.pc(pc, settings.home)} strokeWidth={2} />;
          return (
            <g key={s}>
              <circle cx={x} cy={y(f)} r={8} fill={colours.pc(pc, settings.home)} />
              <text x={x} y={y(f) + 3.5} textAnchor="middle" className="dot-label">
                {names.pc(pc)}
              </text>
            </g>
          );
        })}
        {voicing.fingers.map((fg, s) => (fg ? <text key={s} x={s * gap} y={rows * fretH + 16} textAnchor="middle" className="finger">{fg}</text> : null))}
      </svg>
      <figcaption>
        <code>{voicingToString(voicing)}</code>
        {voicing.omitted.length > 0 && <small> no {voicing.omitted.map((p) => names.pc(p)).join(', ')}</small>}
      </figcaption>
    </figure>
  );
}
