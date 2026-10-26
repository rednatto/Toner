import { formatTimeSignature } from '@toner/theory';
import { handMotion, patternBars, STROKE_INFO, stepsPerBar, STRUM_PATTERNS, type StrumPattern } from '@toner/instrument';
import { useSettings } from '../settings';

/** The strumming pattern library: every pattern drawn as stroke cells, with a button to practise it. */
export function StrumView() {
  const { set } = useSettings();
  const styles = [...new Set(STRUM_PATTERNS.map((p) => p.style))];
  const practise = (id: string) => {
    set({ strum: id });
    window.location.hash = '#metronome';
  };
  return (
    <div className="view">
      <p className="hint">↓ down · ↑ up · ✕ chuck (muted) · ● knock on the body · B bass note · faint arrows are rests where the hand keeps moving. Bold strokes are accented.</p>
      {styles.map((style) => (
        <section key={style}>
          <h3>{style}</h3>
          <div className="strum-cards">
            {STRUM_PATTERNS.filter((p) => p.style === style).map((p) => (
              <article key={p.id} className="strum-card">
                <div className="strum-head">
                  <b>{p.name}</b>
                  <small>
                    {formatTimeSignature(p.timeSignature)} · {p.bpm} BPM{p.swing ? ' · swung' : ''}
                  </small>
                </div>
                <StaticLane pattern={p} />
                {p.notes && <p className="hint">{p.notes}</p>}
                <button className="primary" onClick={() => practise(p.id)}>
                  Practise
                </button>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function StaticLane({ pattern }: { pattern: StrumPattern }) {
  const perBar = stepsPerBar(pattern);
  return (
    <div className="strum-static">
      {Array.from({ length: patternBars(pattern) }, (_, bar) => (
        <div key={bar} className="strum-cells small" style={{ gridTemplateColumns: `repeat(${perBar}, minmax(0, 1fr))` }}>
          {pattern.steps.slice(bar * perBar, bar * perBar + perBar).map((step, i) => {
            const rest = step.stroke === '-';
            return (
              <div key={i} className={`strum-cell ${i % pattern.subdivision === 0 ? 'on-beat' : ''} ${rest ? 'rest' : ''} ${step.accent ? 'accent' : ''}`}>
                <span className="glyph">{rest ? (handMotion(bar * perBar + i) === 'down' ? '↓' : '↑') : STROKE_INFO[step.stroke].symbol}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
