import { chordQuality, mod12, octave, type Chord, type PitchClass } from '@toner/theory';
import { useSettings } from '../settings';
import type { Check, Remembered } from './notes';

/**
 * The notes heard, on the Z12 clock: each pitch class has a spoke and each
 * octave a ring, so a note played on two strings an octave apart shows as two
 * dots on one spoke. Dots fade as the sound fades. With a target chord its
 * tones get spokes, missing ones a dashed ring, and notes outside it a ring in
 * amber (a colour tone, such as the seventh) or red (a wrong note).
 */
const R_IN = 26;
const R_STEP = 14;
const LOW_OCTAVE = 2;
const OCTAVES = 5; // 2 … 6
const R_LABEL = R_IN + R_STEP * (OCTAVES - 1) + 20;

export function HeardGlyph({ notes, target, check, size = 240, order = 'semitones' }: { notes: Remembered[]; target: Chord | null; check: Check | null; size?: number; order?: 'semitones' | 'fifths' }) {
  const { settings, names, colours } = useSettings();
  const home = settings.home;
  const place = (pc: PitchClass) => (order === 'fifths' ? mod12(mod12(pc - home) * 7) : mod12(pc - home));
  const angle = (pc: PitchClass) => (place(pc) * 30 - 90) * (Math.PI / 180);
  const at = (pc: PitchClass, r: number) => [r * Math.cos(angle(pc)), r * Math.sin(angle(pc))] as const;
  const ring = (oct: number) => R_IN + R_STEP * (Math.max(LOW_OCTAVE, Math.min(LOW_OCTAVE + OCTAVES - 1, oct)) - LOW_OCTAVE);
  const tones = target ? new Set(chordQuality(target.quality).intervals.map((i) => mod12(target.root + i))) : new Set<number>();
  const colourSet = new Set(check?.colour ?? []);
  const foreignSet = new Set(check?.foreign ?? []);
  const missingSet = new Set(check?.missing ?? []);
  const outer = R_IN + R_STEP * (OCTAVES - 1);

  return (
    <svg className="heard-glyph" viewBox="-130 -130 260 260" width={size} height={size} role="img" aria-label={`Notes heard: ${[...new Set(notes.map((n) => names.pc(mod12(n.pitch))))].join(' ') || 'none'}`}>
      {Array.from({ length: OCTAVES }, (_, i) => (
        <circle key={i} r={R_IN + R_STEP * i} fill="none" stroke="var(--line)" strokeOpacity={0.5} strokeDasharray={i === 0 ? undefined : '2 4'} />
      ))}
      {Array.from({ length: 12 }, (_, i) => {
        const pc = mod12(home + i);
        const [x0, y0] = at(pc, R_IN - 8);
        const [x1, y1] = at(pc, outer + 6);
        const tone = tones.has(pc);
        return <line key={pc} x1={x0} y1={y0} x2={x1} y2={y1} stroke={tone ? colours.pc(pc, home) : 'var(--line)'} strokeOpacity={tone ? 0.55 : 0.35} strokeWidth={tone ? 3 : 1} strokeLinecap="round" />;
      })}
      {notes.map((n) => {
        const pc = mod12(n.pitch);
        const [x, y] = at(pc, ring(octave(n.pitch)));
        const bad = foreignSet.has(pc);
        return (
          <circle
            key={n.pitch}
            cx={x}
            cy={y}
            r={4 + 5 * n.level}
            fill={colours.pc(pc, home)}
            fillOpacity={0.25 + 0.75 * n.level}
            stroke={bad ? 'var(--bad)' : colourSet.has(pc) ? 'var(--warn)' : 'none'}
            strokeWidth={2}
          >
            <title>{names.pitch(n.pitch)}</title>
          </circle>
        );
      })}
      {Array.from({ length: 12 }, (_, i) => {
        const pc = mod12(home + i);
        const [x, y] = at(pc, R_LABEL);
        const tone = tones.has(pc);
        const mark = foreignSet.has(pc) ? 'var(--bad)' : colourSet.has(pc) ? 'var(--warn)' : missingSet.has(pc) ? 'var(--warn)' : null;
        return (
          <g key={pc} transform={`translate(${x} ${y})`}>
            {(tone || mark) && (
              <circle
                r={12}
                fill={tone && !missingSet.has(pc) ? colours.pc(pc, home) : 'var(--stage)'}
                fillOpacity={tone ? 0.9 : 1}
                stroke={mark ?? (target && pc === target.root ? 'var(--fg)' : 'none')}
                strokeWidth={mark ? 2.5 : 2}
                strokeDasharray={missingSet.has(pc) ? '3 3' : undefined}
              />
            )}
            <text y={4} textAnchor="middle" className={`glyph-label${tone && !missingSet.has(pc) ? ' on' : ''}`}>
              {names.pc(pc)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
