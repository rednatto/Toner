import { DOUBLE_INLAYS, INLAYS } from '@toner/instrument';
import { mod12, type Pitch, type PitchClass } from '@toner/theory';
import { useSettings } from '../settings';

/**
 * A horizontal neck showing where a set of pitch classes falls. High string on
 * top, as a player looking down at the guitar sees it. Root notes are ringed.
 */
export function Fretboard({ strings, pcs, root, frets = 15 }: { strings: Pitch[]; pcs: PitchClass[]; root?: PitchClass; frets?: number }) {
  const { settings, names, colours } = useSettings();
  const n = strings.length;
  const fw = 46;
  const sh = 22;
  const nutX = 34;
  const width = nutX + frets * fw + 10;
  const height = (n - 1) * sh + 40;
  const set = new Set(pcs.map(mod12));
  const sy = (s: number) => 20 + (n - 1 - s) * sh;
  const fx = (f: number) => (f === 0 ? nutX - 16 : nutX + (f - 0.5) * fw);
  return (
    <div className="fretboard-wrap">
      <svg className="fretboard" viewBox={`0 0 ${width} ${height}`} style={{ minWidth: width * 0.75 }} role="img" aria-label="Fretboard">
        {INLAYS.filter((f) => f <= frets).map((f) =>
          DOUBLE_INLAYS.has(f) ? (
            <g key={f}>
              <circle cx={fx(f)} cy={sy(0) + sh * 0.5 + 2} r={4} fill="var(--line)" />
              <circle cx={fx(f)} cy={sy(n - 1) - sh * 0.5 - 2} r={4} fill="var(--line)" />
            </g>
          ) : (
            <circle key={f} cx={fx(f)} cy={(sy(0) + sy(n - 1)) / 2} r={4} fill="var(--line)" />
          ),
        )}
        <rect x={nutX - 3} y={sy(n - 1)} width={4} height={(n - 1) * sh} fill="var(--fg)" />
        {Array.from({ length: frets }, (_, i) => (
          <line key={i} x1={nutX + (i + 1) * fw} x2={nutX + (i + 1) * fw} y1={sy(n - 1)} y2={sy(0)} stroke="var(--line)" />
        ))}
        {strings.map((_, s) => (
          <line key={s} x1={nutX} x2={width - 10} y1={sy(s)} y2={sy(s)} stroke="var(--muted)" strokeWidth={0.8 + (n - s) * 0.2} />
        ))}
        {Array.from({ length: frets + 1 }, (_, f) => (
          <text key={f} x={fx(f)} y={height - 3} textAnchor="middle" className="fret-no">
            {f || ''}
          </text>
        ))}
        {strings.flatMap((open, s) =>
          Array.from({ length: frets + 1 }, (_, f) => {
            const pc = mod12(open + f);
            if (!set.has(pc)) return null;
            return (
              <g key={`${s}-${f}`} transform={`translate(${fx(f)} ${sy(s)})`}>
                <circle r={9} fill={colours.pc(pc, settings.home)} stroke={pc === root ? 'var(--fg)' : 'none'} strokeWidth={2.5} />
                <text y={3.5} textAnchor="middle" className="dot-label">
                  {names.pc(pc)}
                </text>
              </g>
            );
          }),
        )}
      </svg>
    </div>
  );
}
