import { mod12, pcZone, type Mode, type PcZone, type PitchClass } from '@toner/theory';
import { useSettings } from '../settings';

/**
 * The Z12 clock: twelve pitch classes round a circle with home at the top.
 * Members are filled with their scheme colour and joined as a polygon, so a
 * set's shape (and its symmetry) is visible at a glance. Optionally clickable.
 *
 * In semitone order neighbours are a semitone apart; in fifths order (the
 * circle of fifths, 0 7 2 9 4 …) they are a fifth apart, so keys and scales
 * become compact arcs and related chords sit side by side.
 *
 * An outer ring marks each note's place relative to home: in the key,
 * borrowed from the parallel mode, or outside both. On the circle of fifths
 * these are three arcs, so tension reads as distance round the circle.
 */

const ZONE_COLOUR: Record<PcZone, string> = { key: 'var(--good)', borrowed: 'var(--warn)', outside: 'var(--bad)' };
export function PcClock({
  pcs,
  root,
  onToggle,
  size = 180,
  label,
  order = 'semitones',
  mode = 'major',
}: {
  pcs: PitchClass[];
  root?: PitchClass;
  onToggle?: (pc: PitchClass) => void;
  size?: number;
  label?: string;
  order?: 'semitones' | 'fifths';
  /** Mode of home, for the in-key / borrowed / outside ring. */
  mode?: Mode;
}) {
  const { settings, names, colours, also } = useSettings();
  const home = settings.home;
  const R = 70;
  const place = (pc: PitchClass) => (order === 'fifths' ? mod12(mod12(pc - home) * 7) : mod12(pc - home));
  const pos = (pc: PitchClass, r = R) => {
    const a = (place(pc) * 30 - 90) * (Math.PI / 180);
    return [r * Math.cos(a), r * Math.sin(a)] as const;
  };
  const members = [...new Set(pcs.map(mod12))].sort((a, b) => place(a) - place(b));
  const poly = members.map((pc) => pos(pc).join(',')).join(' ');
  const arc = (pc: PitchClass, r: number) => {
    const a = (place(pc) * 30 - 90) * (Math.PI / 180);
    const d = 14 * (Math.PI / 180);
    return `M ${r * Math.cos(a - d)} ${r * Math.sin(a - d)} A ${r} ${r} 0 0 1 ${r * Math.cos(a + d)} ${r * Math.sin(a + d)}`;
  };
  return (
    <svg className="pc-clock" viewBox="-110 -110 220 220" width={size} height={size} role="img" aria-label={label ?? `Notes ${members.map((p) => names.pc(p)).join(' ')}`}>
      <circle r={R} fill="none" stroke="var(--line)" />
      {Array.from({ length: 12 }, (_, i) => {
        const pc = mod12(home + i);
        const zone = pcZone(pc, { home, mode });
        return <path key={i} d={arc(pc, 89)} fill="none" stroke={ZONE_COLOUR[zone]} strokeOpacity={zone === 'key' ? 0.55 : 0.7} strokeWidth={5} strokeLinecap="round"><title>{zone === 'key' ? 'in the key' : zone === 'borrowed' ? 'borrowed from the parallel ' + (mode === 'major' ? 'minor' : 'major') : 'outside the key'}</title></path>;
      })}
      {also &&
        Array.from({ length: 12 }, (_, i) => {
          const pc = mod12(home + i);
          const [x, y] = pos(pc, 101);
          return (
            <text key={i} x={x} y={y + 3.5} textAnchor="middle" className="clock-letter">
              {also.pc(pc)}
            </text>
          );
        })}
      {members.length > 2 && <polygon points={poly} fill="var(--accent)" fillOpacity="0.12" stroke="var(--accent)" strokeOpacity="0.6" />}
      {members.length === 2 && <line x1={pos(members[0]!)[0]} y1={pos(members[0]!)[1]} x2={pos(members[1]!)[0]} y2={pos(members[1]!)[1]} stroke="var(--accent)" strokeOpacity="0.6" />}
      {Array.from({ length: 12 }, (_, i) => {
        const pc = mod12(home + i);
        const [x, y] = pos(pc);
        const on = members.includes(pc);
        return (
          <g
            key={i}
            transform={`translate(${x} ${y})`}
            onClick={onToggle ? () => onToggle(pc) : undefined}
            style={onToggle ? { cursor: 'pointer' } : undefined}
            role={onToggle ? 'button' : undefined}
            aria-pressed={onToggle ? on : undefined}
            aria-label={onToggle ? names.pc(pc) : undefined}
          >
            <circle
              r={on ? 15 : 12}
              fill={on ? colours.pc(pc, home) : 'var(--stage)'}
              stroke={pc === root ? 'var(--fg)' : pc === home ? 'var(--accent)' : 'var(--line)'}
              strokeWidth={pc === root ? 3 : 1.5}
            />
            <text y="4.5" textAnchor="middle" className={on ? 'on' : ''}>
              {names.pc(pc)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** The same notes on the semitone clock and on the circle of fifths, side by side. */
export function PcClocks(props: Omit<Parameters<typeof PcClock>[0], 'order'>) {
  const size = props.size ?? 180;
  return (
    <div className="clocks">
      <figure>
        <PcClock {...props} size={size} />
        <figcaption>Semitones</figcaption>
      </figure>
      <figure>
        <PcClock {...props} size={size} order="fifths" />
        <figcaption>Circle of fifths</figcaption>
      </figure>
      <p className="zone-legend">
        <i className="z-key" /> in the key <i className="z-borrowed" /> borrowed <i className="z-outside" /> outside
      </p>
    </div>
  );
}
