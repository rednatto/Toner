import { analyzeChord, degreeChord, degreeName, PROGRESSIONS, type Progression } from '@toner/theory';
import { generateVoicings } from '@toner/instrument';
import { resumeAudio } from '../audio/context';
import { pluck } from '../audio/synth';
import { useSettings, useStrings } from '../settings';
import { functionColour } from '../visual/functions';

/** The chord progression library: each loop in roman numerals and in the current key, ready to hear or practise. */
export function ProgressionView() {
  const { settings, set, names, also } = useSettings();
  const { tuning, profile } = useStrings();
  const styles = [...new Set(PROGRESSIONS.map((p) => p.style))];

  async function listen(p: Progression) {
    const ctx = await resumeAudio();
    const beat = 60 / 90;
    const perChord = (p.chordsPerBar === 2 ? 2 : 4) * beat;
    let t = ctx.currentTime + 0.05;
    for (const d of p.degrees) {
      const v = generateVoicings(degreeChord(d, settings.home), tuning.strings, { maxFret: Math.min(12, profile.frets), limit: 1 })[0];
      v?.pitches.forEach((pitch, i) => pluck(ctx, pitch, settings.a4, t + i * 0.02, perChord + 0.3, ctx.destination, 0.12));
      t += perChord;
    }
  }

  const practise = (id: string) => {
    set({ progression: id });
    window.location.hash = '#practice';
  };

  return (
    <div className="view">
      <p className="hint">
        Written from home in roman numerals (upper case major, lower case minor, ♭ for the minor side), shown here in {names.pc(settings.home)}. Change home in the header to move them. Borders show the chord's job: green home, gold tension, red outside the key.
      </p>
      {styles.map((style) => (
        <section key={style}>
          <h3>{style}</h3>
          <div className="strum-cards">
            {PROGRESSIONS.filter((p) => p.style === style).map((p) => {
              const key = { home: settings.home, mode: p.mode };
              return (
                <article key={p.id} className="strum-card">
                  <div className="strum-head">
                    <b>{p.name}</b>
                    <small>
                      {p.mode === 'minor' ? 'minor home' : 'major home'} · {p.degrees.length} chords{p.chordsPerBar === 2 ? ', 2 per bar' : ''}
                    </small>
                  </div>
                  <div className="prog-chords">
                    {p.degrees.map((d, i) => {
                      const c = degreeChord(d, settings.home);
                      const fn = analyzeChord(c, key).function;
                      return (
                        <span key={i} className={`chart-chord fn-${fn}`} style={{ borderBottomColor: functionColour(fn) }} title={fn}>
                          <b>{degreeName(d)}</b>
                          <small>{names.chord(c)}</small>
                          {also && <small>{also.chord(c)}</small>}
                        </span>
                      );
                    })}
                  </div>
                  {p.notes && <p className="hint">{p.notes}</p>}
                  <div className="actions">
                    <button onClick={() => void listen(p)}>Listen</button>
                    <button className="primary" onClick={() => practise(p.id)}>
                      Practise
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
