import { useMemo, useState } from 'react';
import {
  analyzeChord,
  CHORD_QUALITIES,
  chordPcs,
  chordQuality,
  chordSet,
  diatonicChords,
  fromPcs,
  identifyChord,
  intervalName,
  intervalVector,
  mod12,
  modes,
  parseChordSymbol,
  primeForm,
  scalePcs,
  scalesContaining,
  scaleSteps,
  scaleType,
  SCALE_TYPES,
  symmetries,
  transposeChord,
  triadFamily,
  type Chord,
  type PitchClass,
  type Scale,
} from '@toner/theory';
import { generateVoicings, instrument, withCapo, type Voicing } from '@toner/instrument';
import { resumeAudio } from '../audio/context';
import { pluck } from '../audio/synth';
import { useSettings } from '../settings';
import { ChordDiagram } from './ChordDiagram';
import { Fretboard } from './Fretboard';
import { PcClock } from './PcClock';

type Tab = 'chords' | 'scales' | 'find' | 'transpose';

function useStrings() {
  const { settings } = useSettings();
  const profile = instrument(settings.instrument);
  const tuning = profile.tunings.find((t) => t.id === settings.tuning) ?? profile.tunings[0]!;
  return { profile, tuning };
}

async function strum(strings: number[], v: Voicing, a4: number) {
  const ctx = await resumeAudio();
  const t = ctx.currentTime + 0.02;
  v.frets.forEach((f, s) => {
    if (f !== null) pluck(ctx, strings[s]! + f, a4, t + s * 0.035, 2);
  });
}

export function Library() {
  const [tab, setTab] = useState<Tab>('chords');
  const [chord, setChord] = useState<Chord>({ root: 0, quality: 'maj' });
  const [scale, setScale] = useState<Scale>({ root: 0, type: 'major' });
  return (
    <section className="page library">
      <div className="seg tabs" role="tablist">
        {(['chords', 'scales', 'find', 'transpose'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t === 'chords' ? 'Chords' : t === 'scales' ? 'Scales' : t === 'find' ? 'Find by notes' : 'Transpose'}
          </button>
        ))}
      </div>
      {tab === 'chords' && <ChordView chord={chord} onChange={setChord} />}
      {tab === 'scales' && (
        <ScaleView
          scale={scale}
          onChange={setScale}
          onChord={(c) => {
            setChord(c);
            setTab('chords');
          }}
        />
      )}
      {tab === 'find' && (
        <FindView
          onChord={(c) => {
            setChord(c);
            setTab('chords');
          }}
          onScale={(s) => {
            setScale(s);
            setTab('scales');
          }}
        />
      )}
      {tab === 'transpose' && <TransposeView />}
    </section>
  );
}

function RootPicker({ value, onChange, label = 'Root' }: { value: PitchClass; onChange: (pc: PitchClass) => void; label?: string }) {
  const { settings, names, letters, colours } = useSettings();
  return (
    <div className="root-picker" role="group" aria-label={label}>
      {Array.from({ length: 12 }, (_, i) => {
        const pc = mod12(settings.home + i);
        return (
          <button key={pc} aria-pressed={value === pc} onClick={() => onChange(pc)} title={letters.pc(pc)} style={value === pc ? { background: colours.pc(pc, settings.home) } : undefined}>
            {names.pc(pc)}
          </button>
        );
      })}
    </div>
  );
}

function ChordView({ chord, onChange }: { chord: Chord; onChange: (c: Chord) => void }) {
  const { settings, names, letters } = useSettings();
  const { tuning, profile } = useStrings();
  const [capo, setCapo] = useState(0);
  const q = chordQuality(chord.quality);
  const pcs = chordPcs(chord);
  const set = chordSet(chord);
  const strings = withCapo(tuning.strings, capo);
  const voicings = useMemo(() => generateVoicings(chord, strings, { maxFret: Math.min(15, profile.frets - capo), limit: 12 }), [chord, strings.join(','), profile.frets, capo]);
  const sym = symmetries(set);
  const tSym = sym.filter((s) => s.kind === 'T' && s.n !== 0);
  const home = analyzeChord(chord, { home: settings.home, mode: 'major' });
  const families = [...new Set(CHORD_QUALITIES.map((c) => c.family))];

  return (
    <div className="view">
      <RootPicker value={chord.root} onChange={(root) => onChange({ ...chord, root })} />
      <div className="quality-picker">
        {families.map((f) => (
          <div key={f} className="family">
            {CHORD_QUALITIES.filter((c) => c.family === f).map((c) => (
              <button key={c.id} aria-pressed={chord.quality === c.id} onClick={() => onChange({ root: chord.root, quality: c.id })} title={c.name}>
                {settings.naming === 'letters' ? c.symbol || 'maj' : `⟨${c.intervals.slice(1).map((x, i) => x - c.intervals[i]!).join(' ')}⟩`}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="detail">
        <PcClock pcs={pcs} root={chord.root} />
        <div className="facts">
          <h2>
            {names.chord(chord)} {settings.naming !== 'letters' && <small>{letters.chord(chord)}</small>}
          </h2>
          <p className="muted">{q.name}</p>
          <table>
            <tbody>
              <tr>
                <th>Notes</th>
                <td>{pcs.map((p) => names.pc(p)).join(' ')}</td>
              </tr>
              <tr>
                <th>Steps above root</th>
                <td>
                  {q.intervals.join(' ')} <span className="muted">({q.intervals.map(intervalName).join(' ')})</span>
                </td>
              </tr>
              {q.optional && (
                <tr>
                  <th>Can be left out</th>
                  <td>{q.optional.map((i) => names.pc(chord.root + i)).join(', ')}</td>
                </tr>
              )}
              <tr>
                <th>Shape (prime form)</th>
                <td>[{primeForm(set).join(' ')}]</td>
              </tr>
              <tr>
                <th>Interval content</th>
                <td title="How many pairs at 1, 2, 3, 4, 5 and 6 semitones apart">⟨{intervalVector(set).join('')}⟩</td>
              </tr>
              <tr>
                <th>Symmetry</th>
                <td>
                  {tSym.length
                    ? `Repeats when shifted by ${tSym.map((s) => s.n).join(', ')}: only ${12 / (tSym.length + 1)} distinct versions exist`
                    : sym.some((s) => s.kind === 'I')
                      ? 'Mirror-symmetric: its own inversion'
                      : 'No symmetry: its mirror image is a different chord'}
                </td>
              </tr>
              <tr>
                <th>From home {names.pc(settings.home)}</th>
                <td>
                  {home.offset} · {home.function}
                  {home.borrowed ? ' (borrowed from the minor side)' : ''} <span className="muted">({home.roman})</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="controls">
        <label>
          Capo
          <input type="number" min={0} max={12} value={capo} onChange={(e) => setCapo(Math.max(0, Math.min(12, Number(e.target.value))))} />
        </label>
        <span className="hint">
          {profile.name}, {tuning.name}. Tap a diagram to hear it.
        </span>
      </div>
      <div className="diagrams">
        {voicings.length === 0 && <p className="hint">No playable voicing found in this tuning.</p>}
        {voicings.map((v) => (
          <ChordDiagram key={v.frets.join(',')} voicing={v} strings={strings} title={names.chord(chord)} onPlay={() => void strum(strings, v, settings.a4)} />
        ))}
      </div>
      <h3>Every {names.chord(chord)} tone on the neck</h3>
      <Fretboard strings={strings} pcs={pcs} root={chord.root} frets={Math.min(15, profile.frets)} />
    </div>
  );
}

function ScaleView({ scale, onChange, onChord }: { scale: Scale; onChange: (s: Scale) => void; onChord: (c: Chord) => void }) {
  const { settings, names, letters } = useSettings();
  const { tuning, profile } = useStrings();
  const [size, setSize] = useState<3 | 4>(3);
  const t = scaleType(scale.type);
  const pcs = scalePcs(scale);
  const families = [...new Set(SCALE_TYPES.map((s) => s.family))];
  const chords = pcs.length === 7 ? diatonicChords(scale, size) : [];
  return (
    <div className="view">
      <RootPicker value={scale.root} onChange={(root) => onChange({ ...scale, root })} />
      <div className="quality-picker">
        {families.map((f) => (
          <div key={f} className="family">
            {SCALE_TYPES.filter((s) => s.family === f).map((s) => (
              <button key={s.id} aria-pressed={scale.type === s.id} onClick={() => onChange({ root: scale.root, type: s.id })}>
                {s.name}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="detail">
        <PcClock pcs={pcs} root={scale.root} />
        <div className="facts">
          <h2>
            {names.scale(scale)} {settings.naming !== 'letters' && <small>{letters.scale(scale)}</small>}
          </h2>
          {t.aliases && <p className="muted">Also called {t.aliases.join(', ')}</p>}
          <table>
            <tbody>
              <tr>
                <th>Notes</th>
                <td>{pcs.map((p) => names.pc(p)).join(' ')}</td>
              </tr>
              <tr>
                <th>Steps</th>
                <td>{scaleSteps(scale.type).join(' ')}</td>
              </tr>
              <tr>
                <th>Interval content</th>
                <td>⟨{intervalVector(fromPcs(pcs)).join('')}⟩</td>
              </tr>
            </tbody>
          </table>
          <h3>Modes (same notes, another home)</h3>
          <div className="chips">
            {modes(scale).map((m) => (
              <button key={m.root} disabled={!m.type} onClick={() => m.type && onChange({ root: m.root, type: m.type })}>
                {names.pc(m.root)} {m.type ? scaleType(m.type).name : `⟨${m.intervals.join(' ')}⟩`}
              </button>
            ))}
          </div>
        </div>
      </div>
      {chords.length > 0 && (
        <>
          <h3>
            Chords in this scale{' '}
            <span className="seg small">
              <button aria-pressed={size === 3} onClick={() => setSize(3)}>
                Triads
              </button>
              <button aria-pressed={size === 4} onClick={() => setSize(4)}>
                Sevenths
              </button>
            </span>
          </h3>
          <div className="chips">
            {chords.map((c) =>
              c.chord ? (
                <button key={c.degree} onClick={() => onChord(c.chord!)}>
                  <b>{names.chord(c.chord)}</b>
                  <small>
                    {mod12(c.root - scale.root)} · {triadFamily(c.chord.quality)}
                  </small>
                </button>
              ) : (
                <span key={c.degree} className="chip">
                  {c.pcs.map((p) => names.pc(p)).join(' ')}
                </span>
              ),
            )}
          </div>
        </>
      )}
      <h3>On the neck</h3>
      <Fretboard strings={tuning.strings} pcs={pcs} root={scale.root} frets={Math.min(15, profile.frets)} />
    </div>
  );
}

function FindView({ onChord, onScale }: { onChord: (c: Chord) => void; onScale: (s: Scale) => void }) {
  const { names } = useSettings();
  const [pcs, setPcs] = useState<PitchClass[]>([0, 4, 7]);
  const [bass, setBass] = useState<PitchClass | null>(null);
  const toggle = (pc: PitchClass) => setPcs((xs) => (xs.includes(pc) ? xs.filter((x) => x !== pc) : [...xs, pc]));
  const chords = identifyChord(pcs, bass ?? undefined).slice(0, 8);
  const scales = scalesContaining(pcs, bass ?? undefined).slice(0, 16);
  return (
    <div className="view">
      <p className="hint">Tap notes on the clock. Optionally say which one is lowest.</p>
      <div className="detail">
        <PcClock pcs={pcs} root={bass ?? undefined} onToggle={toggle} size={240} />
        <div className="facts">
          <label>
            Lowest note
            <select value={bass ?? ''} onChange={(e) => setBass(e.target.value === '' ? null : Number(e.target.value))}>
              <option value="">Any</option>
              {[...pcs].sort((a, b) => a - b).map((p) => (
                <option key={p} value={p}>
                  {names.pc(p)}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => setPcs([])}>Clear</button>
          <h3>Chords</h3>
          <div className="chips">
            {chords.length === 0 && <span className="hint">No chord in the vocabulary has exactly these notes.</span>}
            {chords.map((m) => (
              <button key={`${m.chord.root}-${m.chord.quality}-${m.chord.bass}`} onClick={() => onChord(m.chord)}>
                <b>{names.chord(m.chord)}</b>
                {m.missing.length > 0 && <small>without {m.missing.map((p) => names.pc(p)).join(', ')}</small>}
              </button>
            ))}
          </div>
          <h3>Scales containing them</h3>
          <div className="chips">
            {scales.map((s) => (
              <button key={`${s.root}-${s.type}`} onClick={() => onScale(s)}>
                {names.pc(s.root)} {scaleType(s.type).name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TransposeView() {
  const { names, letters } = useSettings();
  const { tuning } = useStrings();
  const [text, setText] = useState('G D Em C\nAm C D G');
  const [shift, setShift] = useState(0);
  const lines = text.split('\n').map((line) =>
    line
      .split(/[\s|]+/)
      .filter(Boolean)
      .map((tok) => ({ tok, chord: parseChordSymbol(tok) })),
  );
  const all = lines.flat().flatMap((x) => (x.chord ? [x.chord] : []));
  const unknown = lines.flat().filter((x) => !x.chord).map((x) => x.tok);

  // For each capo, how easy are the shapes you would play? (Sum of the best voicing's score.)
  const capoAdvice = useMemo(() => {
    const target = all.map((c) => transposeChord(c, shift));
    if (target.length === 0 || target.length > 32) return [];
    return Array.from({ length: 8 }, (_, capo) => {
      const shapes = target.map((c) => transposeChord(c, -capo));
      const cost = shapes.reduce((sum, c) => sum + (generateVoicings(c, tuning.strings, { maxFret: 5, limit: 1 })[0]?.score ?? 25), 0);
      return { capo, shapes, cost };
    }).sort((a, b) => a.cost - b.cost);
  }, [text, shift, tuning.strings.join(',')]);

  return (
    <div className="view">
      <label className="block">
        Chords (letters, one line per row)
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      </label>
      {unknown.length > 0 && <p className="error">Not understood: {unknown.join(' ')}</p>}
      <div className="controls">
        <label>
          Shift by
          <input type="number" min={-11} max={11} value={shift} onChange={(e) => setShift(Math.max(-11, Math.min(11, Number(e.target.value))))} />
        </label>
        <span className="hint">semitones</span>
      </div>
      <div className="transposed">
        {lines.map((line, i) => (
          <div key={i} className="line">
            {line.map((x, k) =>
              x.chord ? (
                <span key={k} className="chip">
                  <b>{letters.chord(transposeChord(x.chord, shift))}</b>
                  <small>{names.chord(transposeChord(x.chord, shift))}</small>
                </span>
              ) : (
                <span key={k} className="chip bad">
                  {x.tok}
                </span>
              ),
            )}
          </div>
        ))}
      </div>
      {capoAdvice.length > 0 && (
        <>
          <h3>Easiest capo positions ({tuning.name})</h3>
          <ol className="capo">
            {capoAdvice.slice(0, 3).map((a) => (
              <li key={a.capo}>
                <b>{a.capo === 0 ? 'No capo' : `Capo ${a.capo}`}</b>: play {a.shapes.map((c) => letters.chord(c)).join(' ')}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

