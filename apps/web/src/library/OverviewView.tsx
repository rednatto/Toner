import { useMemo, useState } from 'react';
import { analyzeChord, chordPcs, chordTension, FUNCTION_INFO, mod12, romanNumeral, type Chord, type Mode } from '@toner/theory';
import { useSettings } from '../settings';

const SETS = {
  triads: ['maj', 'min', 'dim', 'aug'],
  sevenths: ['dom7', 'maj7', 'min7', 'm7b5', 'dim7', 'mMaj7'],
  colour: ['sus2', 'sus4', '6', 'min6', 'add9', '9'],
} as const;
type SetId = keyof typeof SETS;
const SET_LABEL: Record<SetId, string> = { triads: 'Triads', sevenths: 'Sevenths', colour: 'Sus, sixths, added' };

type Scope = 'key' | 'borrowed' | 'all';
const SCOPE_LABEL: Record<Scope, string> = { key: 'In the key', borrowed: '+ borrowed', all: 'All 12 roots' };

/**
 * Every chord measured from home: its function name (I, V7, ♭VII) next to its
 * Z12 name and notes, sorted either by where its root sits or from the most
 * at rest to the most tense and outside the key.
 */
export function OverviewView({ onChord }: { onChord: (c: Chord) => void }) {
  const { settings, names, colours } = useSettings();
  const [mode, setMode] = useState<Mode>('major');
  const [set, setSet] = useState<SetId>('triads');
  const [scope, setScope] = useState<Scope>('borrowed');
  const [sort, setSort] = useState<'degree' | 'tension'>('tension');
  const key = { home: settings.home, mode };
  const rows = useMemo(() => {
    const out = [];
    for (let offset = 0; offset < 12; offset++) {
      for (const quality of SETS[set]) {
        const chord = { root: mod12(settings.home + offset), quality };
        const a = analyzeChord(chord, key);
        if (scope === 'key' && !a.diatonic) continue;
        if (scope === 'borrowed' && !a.diatonic && !a.borrowed) continue;
        out.push({ chord, a, tension: chordTension(chord, key), roman: romanNumeral(chord, { home: settings.home, mode: 'major' }) });
      }
    }
    return sort === 'tension' ? out.sort((x, y) => x.tension - y.tension || x.a.offset - y.a.offset) : out;
  }, [settings.home, mode, set, scope, sort]);
  const max = Math.max(1, ...rows.map((r) => r.tension));

  return (
    <div className="view">
      <div className="controls">
        <div className="seg" role="group" aria-label="Home is">
          {(['major', 'minor'] as const).map((m) => (
            <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {names.pc(settings.home)} {m}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Chords">
          {(Object.keys(SETS) as SetId[]).map((k) => (
            <button key={k} aria-pressed={set === k} onClick={() => setSet(k)}>
              {SET_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Which roots">
          {(Object.keys(SCOPE_LABEL) as Scope[]).map((k) => (
            <button key={k} aria-pressed={scope === k} onClick={() => setScope(k)}>
              {SCOPE_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Sort">
          <button aria-pressed={sort === 'tension'} onClick={() => setSort('tension')}>
            Inside → outside
          </button>
          <button aria-pressed={sort === 'degree'} onClick={() => setSort('degree')}>
            By root
          </button>
        </div>
      </div>
      <p className="hint">
        Roman numerals count from home on the major scale (♭III, ♭VI, ♭VII are the minor side). Inside → outside orders by the chord's job (home, away, tension, outside), notes outside the key, and its own
        clashes (semitones and tritones). Tap a chord to open it.
      </p>
      <div className="overview">
        {rows.map(({ chord, a, tension, roman }) => (
          <button key={`${chord.root}:${chord.quality}`} onClick={() => onChord(chord)} style={{ borderLeftColor: colours.pc(chord.root, settings.home) }} title={`${FUNCTION_INFO[a.function].description}${a.borrowed ? ', borrowed from the parallel ' + (mode === 'major' ? 'minor' : 'major') : ''}`}>
            <span className="roman">{roman}</span>
            <span>{names.chord(chord)}</span>
            <small>{chordPcs(chord).map((p) => names.pc(p)).join(' ')}</small>
            <span className={`fn fn-${a.borrowed ? 'borrowed' : a.function}`}>
              {a.borrowed ? 'borrowed' : a.function}
            </span>
            <span className="tension-bar" aria-label={`Tension ${tension.toFixed(1)}`}>
              <i style={{ width: `${(tension / max) * 100}%` }} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
