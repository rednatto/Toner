import { mod12, type PitchClass } from '@toner/theory';
import { useSettings } from '../settings';

/**
 * The Z12 clock: twelve pitch classes round a circle with home at the top.
 * Members are filled with their scheme colour and joined as a polygon, so a
 * set's shape (and its symmetry) is visible at a glance. Optionally clickable.
 */
export function PcClock({
  pcs,
  root,
  onToggle,
  size = 180,
  label,
}: {
  pcs: PitchClass[];
  root?: PitchClass;
  onToggle?: (pc: PitchClass) => void;
  size?: number;
  label?: string;
}) {
  const { settings, names, colours } = useSettings();
  const home = settings.home;
  const R = 70;
  const pos = (pc: PitchClass, r = R) => {
    const a = (mod12(pc - home) * 30 - 90) * (Math.PI / 180);
    return [r * Math.cos(a), r * Math.sin(a)] as const;
  };
  const members = [...new Set(pcs.map(mod12))].sort((a, b) => mod12(a - home) - mod12(b - home));
  const poly = members.map((pc) => pos(pc).join(',')).join(' ');
  return (
    <svg className="pc-clock" viewBox="-100 -100 200 200" width={size} height={size} role="img" aria-label={label ?? `Notes ${members.map((p) => names.pc(p)).join(' ')}`}>
      <circle r={R} fill="none" stroke="var(--line)" />
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
