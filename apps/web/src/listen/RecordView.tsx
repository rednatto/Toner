import { useEffect, useMemo, useRef, useState } from 'react';
import { generateVoicings, type Voicing } from '@toner/instrument';
import { parseChordSymbol, type Chord } from '@toner/theory';
import { openCapture, type Capture, type CaptureBlock } from '../audio/capture';
import { ChordDiagram } from '../library/ChordDiagram';
import { useSettings, useStrings } from '../settings';
import { analyseBuffer, defaultDetectorOptions, VOCABULARIES } from './chroma';
import { scoreTake, summarise, type Summary, type TakeScore } from './score';
import { clearTakes, deleteTake, exportTakes, fromPcm16, loadTakes, saveTake, toPcm16, type Take } from './takes';

const STYLES = [
  { id: 'strum', name: 'One down strum, let it ring' },
  { id: 'four', name: 'Four even strums' },
  { id: 'pick', name: 'Pick the strings one by one' },
  { id: 'soft', name: 'One soft strum' },
];

interface PlanItem {
  label: string;
  chord: Chord | null;
  voicing: Voicing | null;
  style: string;
}

const NO_CHORD = 'N';

export function RecordView() {
  const { names, letters } = useSettings();
  const { tuning } = useStrings();
  const [chordText, setChordText] = useState('C A G E D Am Em Dm F E7 A7 G7 N');
  const [perChord, setPerChord] = useState(2);
  const [seconds, setSeconds] = useState(3);
  const [styles, setStyles] = useState<string[]>(['strum', 'four']);
  const [shapes, setShapes] = useState<Record<string, number>>({});
  const [takes, setTakes] = useState<Take[]>([]);
  const [next, setNext] = useState(0);
  const [phase, setPhase] = useState<'closed' | 'ready' | 'count' | 'recording'>('closed');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<Map<string, TakeScore>>(new Map());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [vocab, setVocab] = useState(VOCABULARIES[1]!.id);
  const [persisted, setPersisted] = useState(true);
  const capture = useRef<Capture | null>(null);
  const sink = useRef<((b: CaptureBlock) => void) | null>(null);

  useEffect(() => {
    void loadTakes().then(setTakes);
    return () => capture.current?.stop();
  }, []);

  const tokens = chordText.split(/[\s,]+/).filter(Boolean);
  const unknown = tokens.filter((t) => t !== NO_CHORD && !parseChordSymbol(t));
  const chords = useMemo(
    () =>
      [...new Set(tokens)].flatMap((t): { label: string; chord: Chord | null; voicings: Voicing[] }[] => {
        if (t === NO_CHORD) return [{ label: t, chord: null, voicings: [] }];
        const c = parseChordSymbol(t);
        return c ? [{ label: t, chord: c, voicings: generateVoicings(c, tuning.strings, { limit: 6 }) }] : [];
      }),
    [chordText, tuning],
  );

  const plan: PlanItem[] = useMemo(() => {
    const out: PlanItem[] = [];
    for (let k = 0; k < perChord; k++) {
      for (const c of chords) {
        const style = c.chord ? (styles[k % Math.max(1, styles.length)] ?? 'strum') : 'room';
        out.push({ label: c.label, chord: c.chord, voicing: c.voicings[shapes[c.label] ?? 0] ?? null, style });
      }
    }
    return out;
  }, [chords, perChord, styles, shapes]);

  const item = plan[next % Math.max(1, plan.length)];

  async function openMic() {
    setError(null);
    try {
      capture.current = await openCapture((b) => {
        let peak = 0;
        for (const s of b.samples) peak = Math.max(peak, Math.abs(s));
        setLevel(peak);
        sink.current?.(b);
      });
      setPhase('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function record() {
    const cap = capture.current;
    if (!cap || !item) return;
    setPhase('count');
    await new Promise((r) => setTimeout(r, 1200));
    setPhase('recording');
    const sr = cap.ctx.sampleRate;
    const need = Math.round(seconds * sr);
    const buf = new Float32Array(need);
    let got = 0;
    const start = cap.ctx.currentTime;
    await new Promise<void>((resolve) => {
      sink.current = (b) => {
        // Skip any part of a block from before the take started.
        const skip = Math.max(0, Math.round((start - b.time) * sr));
        const part = b.samples.subarray(Math.min(skip, b.samples.length), Math.min(b.samples.length, skip + need - got));
        buf.set(part, got);
        got += part.length;
        if (got >= need) {
          sink.current = null;
          resolve();
        }
      };
    });
    const firstOnset = analyseBuffer(buf, defaultDetectorOptions(sr)).find((f) => f.onset)?.time ?? null;
    const take: Take = {
      id: `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 6)}`,
      chord: item.chord,
      symbol: item.chord ? letters.chord(item.chord) : NO_CHORD,
      frets: item.voicing?.frets ?? [],
      tuning: tuning.strings,
      capo: 0,
      style: item.style,
      sampleRate: sr,
      seconds,
      device: cap.device,
      recordedAt: new Date().toISOString(),
      firstOnset,
      pcm: toPcm16(buf),
    };
    setPersisted(await saveTake(take));
    setTakes((t) => [...t, take]);
    setNext((n) => n + 1);
    setPhase('ready');
  }

  function play(t: Take) {
    const ctx = capture.current?.ctx ?? new AudioContext();
    const b = ctx.createBuffer(1, t.pcm.length, t.sampleRate);
    b.copyToChannel(fromPcm16(t.pcm) as Float32Array<ArrayBuffer>, 0);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(ctx.destination);
    s.start();
  }

  async function remove(id: string) {
    await deleteTake(id);
    setTakes((t) => t.filter((x) => x.id !== id));
  }

  async function clearAll() {
    if (!confirm(`Delete all ${takes.length} takes from this browser?`)) return;
    await clearTakes();
    setTakes([]);
    setScores(new Map());
    setSummary(null);
  }

  function download() {
    const blob = new Blob([exportTakes(takes) as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `toner-chord-takes-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function scoreAll() {
    const vocabulary = VOCABULARIES.find((v) => v.id === vocab)!;
    const out = new Map<string, TakeScore>();
    for (const t of takes) {
      const o = { ...defaultDetectorOptions(t.sampleRate), vocabulary };
      out.set(t.id, scoreTake({ id: t.id, chord: t.chord, samples: fromPcm16(t.pcm), sampleRate: t.sampleRate }, o));
    }
    setScores(out);
    setSummary(summarise([...out.values()]));
  }

  const counts = new Map<string, number>();
  for (const t of takes) counts.set(t.symbol, (counts.get(t.symbol) ?? 0) + 1);
  const label = (c: Chord | null) => (c ? names.chord(c) : 'no chord');

  return (
    <>
      <p>
        Record short labelled takes of the chord shapes you play, on the mic and guitar you will practise with. They do two jobs: right away they show how well the
        baseline works for <em>your</em> setup (score them below), and later they are the training set for a small network tuned to it. Takes stay in this browser until
        you export them.
      </p>
      <div className="controls">
        <label className="block">
          Chords to record (letters; N = no chord: room noise, muted strings, talking)
          <input value={chordText} onChange={(e) => setChordText(e.target.value)} aria-invalid={unknown.length > 0} />
        </label>
      </div>
      {unknown.length > 0 && <p className="error">Not understood: {unknown.join(' ')}</p>}
      <div className="controls">
        <label>
          Takes per chord
          <input type="number" min={1} max={20} value={perChord} onChange={(e) => setPerChord(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
        </label>
        <label>
          Seconds per take
          <input type="number" min={1} max={10} step={0.5} value={seconds} onChange={(e) => setSeconds(Math.max(1, Math.min(10, Number(e.target.value) || 3)))} />
        </label>
        <fieldset className="listen-styles">
          <legend>Ways to play, taken in turn</legend>
          {STYLES.map((s) => (
            <label key={s.id} className="check">
              <input
                type="checkbox"
                checked={styles.includes(s.id)}
                onChange={(e) => setStyles((xs) => (e.target.checked ? [...xs, s.id] : xs.filter((x) => x !== s.id)))}
              />
              {s.name}
            </label>
          ))}
        </fieldset>
      </div>

      <div className="listen-shapes">
        {chords
          .filter((c) => c.chord)
          .map((c) => {
            const i = shapes[c.label] ?? 0;
            const v = c.voicings[i];
            return (
              <div key={c.label} className="listen-shape">
                <div className="listen-shape-head">
                  <strong>{label(c.chord)}</strong>
                  <span className="muted">{plural(counts.get(letters.chord(c.chord!)) ?? 0, 'take')}</span>
                </div>
                {v ? <ChordDiagram voicing={v} strings={tuning.strings} title={c.label} /> : <p className="hint">No shape in this tuning.</p>}
                {c.voicings.length > 1 && (
                  <select value={i} onChange={(e) => setShapes((s) => ({ ...s, [c.label]: Number(e.target.value) }))} aria-label={`Shape for ${c.label}`}>
                    {c.voicings.map((_, k) => (
                      <option key={k} value={k}>
                        Shape {k + 1}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
      </div>

      <div className="listen-take">
        {phase === 'closed' ? (
          <button className="primary big" onClick={() => void openMic()}>
            Open the mic
          </button>
        ) : (
          item && (
            <>
              <div className="listen-take-prompt">
                <span className="muted">
                  Take {(next % plan.length) + 1} of {plan.length}
                  {next >= plan.length ? ` (round ${Math.floor(next / plan.length) + 1})` : ''}
                </span>
                <span className="listen-chord">{label(item.chord)}</span>
                <span>{item.chord ? STYLES.find((s) => s.id === item.style)?.name : 'Leave the strings quiet: room noise, a muted scratch, a word or two'}</span>
              </div>
              {item.voicing && <ChordDiagram voicing={item.voicing} strings={tuning.strings} title={item.label} />}
              <div className="actions">
                <button className="primary big" disabled={phase !== 'ready'} onClick={() => void record()}>
                  {phase === 'count' ? 'Get ready…' : phase === 'recording' ? 'Play now!' : `Record ${seconds} s`}
                </button>
                <button disabled={phase !== 'ready'} onClick={() => setNext((n) => n + 1)}>
                  Skip
                </button>
                <div className={`level wide${phase === 'recording' ? ' live' : ''}`} aria-label="Input level">
                  <span style={{ width: `${Math.min(100, Math.sqrt(level) * 100)}%` }} />
                </div>
              </div>
            </>
          )
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {!persisted && <p className="error">This browser would not store the take, so it is kept only until the page closes. Export before leaving.</p>}

      <h3>Takes ({takes.length})</h3>
      <div className="actions">
        <label>
          Score with
          <select value={vocab} onChange={(e) => setVocab(e.target.value)}>
            {VOCABULARIES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" disabled={takes.length === 0} onClick={scoreAll}>
          Score the baseline
        </button>
        <button disabled={takes.length === 0} onClick={download}>
          Export zip
        </button>
        <button disabled={takes.length === 0} onClick={() => void clearAll()}>
          Delete all
        </button>
      </div>
      {summary && (
        <div className="result">
          <div className="big">{((summary.exact / Math.max(1, summary.takes)) * 100).toFixed(0)}%</div>
          <p>
            of {summary.takes} takes read as the right chord overall; {(summary.frames * 100).toFixed(0)}% of individual frames were right. {verdictText(summary)}
          </p>
          {summary.confusions.length > 0 && (
            <p className="hint">
              Mix-ups: {summary.confusions.slice(0, 8).map((c) => `${label(c.truth)} → ${c.guess ? names.chord(c.guess) : 'nothing'} ×${c.count}`).join(', ')}
            </p>
          )}
        </div>
      )}
      <table className="listen-takes">
        <tbody>
          {[...takes].reverse().map((t) => {
            const s = scores.get(t.id);
            return (
              <tr key={t.id}>
                <td>{label(t.chord)}</td>
                <td className="muted">{t.style}</td>
                <td className="muted">{t.frets.map((f) => (f === null ? '×' : f)).join('')}</td>
                <td className={s ? (s.verdict === 'exact' || s.verdict === 'quiet-ok' ? 'good' : s.verdict === 'wrong' || s.verdict === 'false-chord' ? 'bad' : 'warn') : ''}>
                  {s ? `${s.guess ? names.chord(s.guess) : 'nothing'} · ${(s.frameAccuracy * 100).toFixed(0)}% of frames` : ''}
                </td>
                <td>
                  <button onClick={() => play(t)}>Play</button> <button onClick={() => void remove(t.id)}>Delete</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** What the score says about the next step. Thresholds are rules of thumb for practice feedback. */
export function verdictText(s: Summary): string {
  const rate = s.exact / Math.max(1, s.takes);
  if (s.takes < 20) return 'Record at least a couple of takes of each chord before reading much into this.';
  if (rate >= 0.9 && s.frames >= 0.8) return 'Good enough for practice feedback on these chords; tune the smoothing rather than train a model.';
  if (rate >= 0.7) return 'Usable, but it will nag. Look at the mix-ups: if they are mostly sevenths and triads, a smaller vocabulary may do; otherwise a trained model is worth it.';
  return 'Weak on this setup. Record more takes (aim for 20+ per chord across shapes and ways of playing) and train the small network on them.';
}
