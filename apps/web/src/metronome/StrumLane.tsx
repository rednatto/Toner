import { handMotion, STROKE_INFO, stepsPerBar, type StrumPattern } from '@toner/instrument';
import type { ScheduledClick } from './engine';

const COUNTS: Record<number, string[]> = { 1: [''], 2: ['', '&'], 3: ['', '&', 'a'], 4: ['', 'e', '&', 'a'] };

/**
 * One bar of a strumming pattern as a row of cells: the stroke to play, the
 * count underneath ("1 & 2 &"), and for rests a faint arrow showing which way
 * the hand is still moving. The cell being heard lights up.
 */
export function StrumLane({ pattern, now }: { pattern: StrumPattern; now: ScheduledClick | null }) {
  const perBar = stepsPerBar(pattern);
  const current = now?.stepIndex ?? -1;
  const barOfPattern = current >= 0 ? Math.floor(current / perBar) : 0;
  const start = barOfPattern * perBar;
  const cells = pattern.steps.slice(start, start + perBar);
  const bars = Math.ceil(pattern.steps.length / perBar);
  return (
    <div className="strum-lane" role="img" aria-label={`Strumming: ${cells.map((c) => STROKE_INFO[c.stroke].name).join(', ')}`}>
      {bars > 1 && <div className="strum-bar">Bar {barOfPattern + 1} of {bars}</div>}
      <div className="strum-cells" style={{ gridTemplateColumns: `repeat(${perBar}, minmax(0, 1fr))` }}>
        {cells.map((step, i) => {
          const index = start + i;
          const onBeat = i % pattern.subdivision === 0;
          const rest = step.stroke === '-';
          const motion = handMotion(index);
          return (
            <div key={i} className={`strum-cell ${index === current ? 'on' : ''} ${onBeat ? 'on-beat' : ''} ${rest ? 'rest' : ''} ${step.accent ? 'accent' : ''} stroke-${step.stroke === 'x' ? 'xu' : step.stroke}`} title={STROKE_INFO[step.stroke].name}>
              <span className="glyph">{rest ? (motion === 'down' ? '↓' : '↑') : STROKE_INFO[step.stroke].symbol}</span>
              <span className="count">{onBeat ? i / pattern.subdivision + 1 : COUNTS[pattern.subdivision]![i % pattern.subdivision]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
