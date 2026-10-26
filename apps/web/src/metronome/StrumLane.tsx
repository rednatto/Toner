import { handMotion, patternBars, STROKE_INFO, stepsPerBar, type StrumPattern } from '@toner/instrument';
import type { ScheduledClick } from './engine';

const COUNTS: Record<number, string[]> = { 1: [''], 2: ['', '&'], 3: ['', '&', 'a'], 4: ['', 'e', '&', 'a'] };

/**
 * A strumming pattern as rows of cells, one row per bar: the stroke to play,
 * the count underneath ("1 & 2 &"), and for rests a faint arrow showing which
 * way the hand is still moving. The cell being heard lights up; in a pattern
 * of several bars every bar stays on screen, so the next one can be read
 * before it arrives.
 */
export function StrumLane({ pattern, now }: { pattern: StrumPattern; now: ScheduledClick | null }) {
  const perBar = stepsPerBar(pattern);
  const current = now?.stepIndex ?? -1;
  const bars = patternBars(pattern);
  const currentBar = current >= 0 ? Math.floor(current / perBar) : -1;
  return (
    <div className="strum-lane" role="img" aria-label={`Strumming: ${pattern.steps.map((c) => STROKE_INFO[c.stroke].name).join(', ')}`}>
      {Array.from({ length: bars }, (_, bar) => {
        const start = bar * perBar;
        const state = currentBar < 0 ? '' : bar === currentBar ? 'current' : bar === (currentBar + 1) % bars ? 'coming' : 'later';
        return (
          <div key={bar} className={`strum-row ${state}`}>
            {bars > 1 && <div className="strum-bar">Pattern bar {bar + 1} of {bars}{state === 'coming' ? ' · next' : ''}</div>}
            <div className="strum-cells" style={{ gridTemplateColumns: `repeat(${perBar}, minmax(0, 1fr))` }}>
              {pattern.steps.slice(start, start + perBar).map((step, i) => {
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
      })}
    </div>
  );
}
