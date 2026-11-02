import { useEffect, useMemo, useRef, useState } from 'react';
import { detectKey, indexAbc, markInfo, Naming, parseAbc, performNotes, scalePcs, type AbcTune, type Bar, type BarMark, type TimedNote } from '@toner/theory';
import { resumeAudio } from '../audio/context';
import { pluck } from '../audio/synth';
import { useSettings } from '../settings';
import { marksUsed, notesByBar, pcWeights, pitchRange, playedBars, type PlacedBar, type Source } from './score';

const base = `${import.meta.env.BASE_URL}tunes/`;
const PAGE = 100;

type Entry = ReturnType<typeof indexAbc>[number] & { text: string };

/** Folk tune collections: browse, read a tune laid out in Toner's numbers and colours, and hear it. */
export function Tunes() {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [error, setError] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [query, setQuery] = useState('');
  const [rhythm, setRhythm] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [picked, setPicked] = useState<Entry | null>(null);

  useEffect(() => {
    fetch(`${base}sources.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Source[]>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((s) => {
        setSources(s);
        setSourceId((id) => id || s[0]?.id || '');
      })
      .catch((e: Error) => setError(`Could not load the tune collections (${e.message}).`));
  }, []);

  const source = sources?.find((s) => s.id === sourceId);
  useEffect(() => {
    if (!source) return;
    let live = true;
    setEntries(null);
    setPicked(null);
    fetch(base + source.file)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((text) => {
        if (!live) return;
        const idx = indexAbc(text);
        setEntries(idx.map((e, i) => ({ ...e, text: text.slice(e.offset, idx[i + 1]?.offset ?? text.length) })));
      })
      .catch((e: Error) => live && setError(`Could not load ${source.name} (${e.message}).`));
    return () => {
      live = false;
    };
  }, [source]);

  const rhythms = useMemo(() => [...new Set((entries ?? []).map((e) => e.rhythm?.toLowerCase()).filter((r): r is string => !!r))].sort(), [entries]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (entries ?? []).filter(
      (e) => (!rhythm || e.rhythm?.toLowerCase() === rhythm) && (!q || e.title.toLowerCase().includes(q) || String(e.index) === q || e.text.slice(0, 400).toLowerCase().includes(`t:${q}`)),
    );
  }, [entries, query, rhythm]);

  if (error) return <p className="error">{error}</p>;
  if (!sources) return <p className="muted">Loading collections…</p>;

  return (
    <section className="page tunes">
      {sources.length > 1 && (
        <div className="seg tabs">
          {sources.map((s) => (
            <button key={s.id} aria-pressed={s.id === sourceId} onClick={() => setSourceId(s.id)}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      {source && (
        <p className="hint">
          {source.description} {source.tunes.toLocaleString()} tunes. {source.attribution} <a href={base + source.licence.file}>Licence</a> · <a href={source.homepage}>Source</a>
          {source.via && (
            <>
              {' '}
              · via <a href={source.via.url}>{source.via.name}</a>
            </>
          )}
        </p>
      )}
      {picked ? (
        <TuneView entry={picked} source={source!} onBack={() => setPicked(null)} />
      ) : (
        <>
          <div className="controls">
            <label>
              Search
              <input type="search" value={query} placeholder="Title or number" onChange={(e) => (setQuery(e.target.value), setShown(PAGE))} />
            </label>
            <label>
              Type
              <select value={rhythm} onChange={(e) => (setRhythm(e.target.value), setShown(PAGE))}>
                <option value="">All</option>
                {rhythms.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!entries ? (
            <p className="muted">Loading tunes…</p>
          ) : (
            <>
              <p className="muted">{matches.length.toLocaleString()} tunes</p>
              <ul className="tune-list">
                {matches.slice(0, shown).map((e) => (
                  <li key={e.offset}>
                    <button onClick={() => setPicked(e)}>
                      <span className="tune-no">{e.index}</span>
                      <b>{e.title}</b>
                      <small>
                        {e.rhythm ? `${e.rhythm} · ` : ''}
                        {e.key}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
              {matches.length > shown && <button onClick={() => setShown((n) => n + PAGE)}>Show more</button>}
            </>
          )}
        </>
      )}
    </section>
  );
}

function TuneView({ entry, source, onBack }: { entry: Entry; source: Source; onBack: () => void }) {
  const { settings, colours } = useSettings();
  const parsed = useMemo((): AbcTune | { error: string } => {
    try {
      return parseAbc(entry.text);
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [entry]);
  const [speed, setSpeed] = useState(0.7);
  const [isPlaying, setIsPlaying] = useState(false);
  const [ornaments, setOrnaments] = useState(true);
  const [playingBar, setPlayingBar] = useState<number | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRef.current?.(), []);

  if ('error' in parsed) return <p className="error">Could not read this tune: {parsed.error}</p>;
  const { song, info, warnings } = parsed;
  const home = song.home ?? 0;
  // Numbers count from the tune's own home, so a tune reads the same in any key.
  const names = new Naming({ mode: settings.naming, home });
  // Letters spelled for the tune's key, so a tune in B♭ reads B♭ rather than A♯.
  const letters = new Naming({ mode: 'letters', home });
  const also = settings.alsoLetters && settings.naming !== 'letters' ? letters : null;
  const notes = song.parts?.[0]?.notes ?? [];
  const weights = pcWeights(notes);
  const maxWeight = Math.max(...weights, 1e-9);
  const guess = detectKey(weights)[0]?.key;
  const range = pitchRange(notes);
  const bars = playedBars(song);
  const byBar = notesByBar(song);
  const playing = playingBar === null ? null : bars[playingBar];
  const used = marksUsed(notes);

  async function play() {
    stopRef.current?.();
    const ctx = await resumeAudio();
    const secPerBeat = 60 / (song.tempo * speed);
    const t0 = ctx.currentTime + 0.1;
    let next = 0;
    let raf = 0;
    const end = bars.length ? bars.at(-1)!.start + bars.at(-1)!.beats : 0;
    // Schedule a little ahead on the audio clock, so stopping is quick and timing stays tight.
    // Ornaments, grace notes, articulation and dynamics as a player would sound them; grace notes last about 60 ms.
    const sounding = ornaments
      ? performNotes(notes, scalePcs({ root: home, type: info.scale }), 0.06 / secPerBeat)
      : notes.map((n) => ({ start: n.start, duration: n.duration, pitch: n.pitch, level: 1 }));
    const tick = () => {
      const horizon = ctx.currentTime + 0.4;
      while (next < sounding.length && t0 + sounding[next]!.start * secPerBeat < horizon) {
        const n = sounding[next++]!;
        const when = Math.max(ctx.currentTime, t0 + n.start * secPerBeat);
        pluck(ctx, n.pitch, settings.a4, when, Math.max(0.12, n.duration * secPerBeat * 1.4), ctx.destination, 0.16 * n.level);
      }
    };
    const timer = window.setInterval(tick, 100);
    tick();
    const frame = () => {
      const beat = (ctx.currentTime - t0) / secPerBeat;
      if (beat >= end) return stop();
      const i = bars.findIndex((b) => beat >= b.start && beat < b.start + b.beats);
      setPlayingBar(i < 0 ? null : i);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const stop = () => {
      window.clearInterval(timer);
      cancelAnimationFrame(raf);
      setPlayingBar(null);
      setIsPlaying(false);
      stopRef.current = null;
    };
    stopRef.current = stop;
    setIsPlaying(true);
  }

  const keyName = letters.scale({ root: home, type: info.scale });
  const guessName = guess ? letters.scale({ root: guess.home, type: guess.mode }) : '';

  return (
    <div className="view tune">
      <button onClick={onBack}>← All tunes</button>
      <h2>
        {song.title} <small>{[info.index !== undefined ? `No. ${info.index}` : '', info.rhythm].filter(Boolean).join(' · ')}</small>
      </h2>
      {info.titles.length > 1 && <p className="muted">Also: {info.titles.slice(1).join(', ')}</p>}
      <div className="tune-facts">
        <span>
          Home <b>{letters.pc(home)}</b>
          {settings.naming === 'letters' ? '' : ` (${names.pc(home)})`}, {keyName}
        </span>
        <span>
          Time{' '}
          <b>
            {song.timeSignature.beats}/{song.timeSignature.unit}
          </b>
        </span>
        <span>
          Plays as <b>{song.arrangement?.join(' ') ?? song.sections.map((s) => s.id).join(' ')}</b>
        </span>
        {guess && (guess.home !== home || guess.mode !== song.mode) && <span className="muted">The notes alone lean towards {guessName}.</span>}
      </div>

      <div className="tune-pcs" aria-label="Notes used, sized by how long they sound">
        {Array.from({ length: 12 }, (_, i) => (home + i) % 12).map((pc) => {
          const w = weights[pc]!;
          return (
            <span key={pc} className={w ? '' : 'unused'} title={`${letters.pc(pc)}: ${Math.round((100 * w) / maxWeight)}%`}>
              <i style={{ background: colours.pc(pc, home), height: `${Math.max(2, (28 * w) / maxWeight)}px` }} />
              {names.pc(pc)}
              {also && <small>{also.pc(pc)}</small>}
            </span>
          );
        })}
      </div>

      <div className="actions">
        {isPlaying ? (
          <button onClick={() => stopRef.current?.()}>Stop</button>
        ) : (
          <button className="primary" onClick={() => void play()} disabled={!notes.length}>
            Play
          </button>
        )}
        <label>
          Speed {Math.round(speed * 100)}%
          <input type="range" min={0.3} max={1.2} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
        </label>
        <span className="muted">{Math.round(song.tempo * speed)} beats a minute</span>
        {used.length > 0 && (
          <label className="check">
            <input type="checkbox" checked={ornaments} onChange={(e) => setOrnaments(e.target.checked)} /> Play ornaments
          </label>
        )}
      </div>

      {used.length > 0 && (
        <ul className="tune-marks" aria-label="Ornaments and markings in this tune">
          {used.map(({ id, count }) => {
            const info = id === 'grace' ? { symbol: '♪', name: 'grace notes', description: 'Quick notes flicked in just before the beat, drawn small.' } : markInfo(id);
            return (
              <li key={id}>
                <b className={`mark-sym kind-${id === 'grace' ? 'ornament' : markInfo(id).kind}`}>{info.symbol}</b> {info.name} <small>×{count}</small>
                <span className="muted"> {info.description}</span>
              </li>
            );
          })}
        </ul>
      )}

      {song.sections.map((s) => (
        <section key={s.id} className="tune-section">
          <h3>{s.name}</h3>
          <div className="tune-bars">
            {s.bars.map((bar, i) => {
              const placed = bars.find((b) => b.section === s.id && b.index === i);
              return (
                <BarView
                  key={i}
                  placed={placed}
                  unit={song.timeSignature.unit}
                  notes={byBar.get(`${s.id}:${i}`) ?? []}
                  range={range}
                  names={names}
                  colour={(pc) => colours.pc(pc, home)}
                  on={!!playing && playing.section === s.id && playing.index === i}
                  bar={bar}
                  chordLabels={bar.chords.map((c) => ({ beat: c.beat, label: names.chord(c.chord) }))}
                />
              );
            })}
          </div>
        </section>
      ))}

      <footer className="tune-credit">
        <p>
          From {source.name}
          {info.book ? `, ${info.book}` : ''}. {info.transcription}
          {info.composer ? ` Composer: ${info.composer}.` : ''}
          {info.origin ? ` Origin: ${info.origin}.` : ''}
        </p>
        <p className="muted">
          {source.attribution} <a href={source.licence.url}>{source.licence.name}</a>.
        </p>
        {info.notes.length > 0 && <p className="muted">Notes: {info.notes.join(' · ')}</p>}
        {warnings.length > 0 && <p className="muted">Read with gaps: {warnings.join('; ')}.</p>}
        <details>
          <summary>ABC source</summary>
          <pre>{entry.text.trim()}</pre>
        </details>
      </footer>
    </div>
  );
}

/** Bar width per whole note, so a bar of 2/4 is half as wide as one of 4/4; narrower on a phone so two bars fit a row. */
const pxPerWhole = () => Math.round(Math.min(200, Math.max(120, (window.innerWidth - 40) / 2)));
const LANE_H = 64;
/** Room above the notes for ornament signs and slurs, and below for dynamics. */
const TOP = 14;
const BOTTOM = 11;

const SIGN_LABEL: Record<BarMark, string> = { segno: '𝄋', coda: '𝄌', fine: 'Fine', dc: 'D.C.', ds: 'D.S.', toCoda: 'To 𝄌' };
const SIGN_TITLE: Record<BarMark, string> = {
  segno: 'Sign: D.S. comes back here',
  coda: 'Coda: "to coda" jumps here',
  fine: 'Fine: the tune ends here after going back',
  dc: 'D.C.: go back to the start',
  ds: 'D.S.: go back to the sign',
  toCoda: 'To coda: after going back, jump to the coda from here',
};

function BarView(props: {
  placed: PlacedBar | undefined;
  unit: number;
  notes: TimedNote[];
  range: [number, number];
  names: Naming;
  colour: (pc: number) => string;
  on: boolean;
  bar: Bar;
  chordLabels: { beat: number; label: string }[];
}) {
  const { placed, unit, notes, range, names, colour, on, bar, chordLabels } = props;
  const beats = placed?.beats ?? unit;
  const w = Math.max(28, Math.round((beats / unit) * pxPerWhole()));
  const [lo, hi] = range;
  const step = (LANE_H - 14) / (hi - lo + 1);
  const y = (p: number) => TOP + LANE_H - 2 - (p - lo + 1) * step;
  const h = Math.max(6, step + 2);
  const xAt = (beat: number) => (beat / beats) * w;
  // Slurs: one arc over each group of notes in this bar that share a slur.
  const slurs = new Map<number, TimedNote[]>();
  for (const n of notes) if (n.slur !== undefined) slurs.set(n.slur, [...(slurs.get(n.slur) ?? []), n]);
  const startSigns = (bar.marks ?? []).filter((m) => m === 'segno' || m === 'coda');
  const endSigns = (bar.marks ?? []).filter((m) => m !== 'segno' && m !== 'coda');
  const texts = bar.annotations ?? [];
  return (
    <div className={`tune-bar${on ? ' on' : ''}${texts.length || startSigns.length || endSigns.length ? ' has-text' : ''}`} style={{ width: w }}>
      {(texts.length > 0 || startSigns.length > 0 || endSigns.length > 0) && (
        <div className="tune-texts">
          {startSigns.map((m) => (
            <span key={m} className="sign" style={{ left: 0 }} title={SIGN_TITLE[m]}>
              {SIGN_LABEL[m]}
            </span>
          ))}
          {texts.map((a, i) => (
            <span key={i} style={{ left: xAt(a.beat) + (startSigns.length ? 14 : 0) }}>
              {a.text}
            </span>
          ))}
          {endSigns.map((m) => (
            <span key={m} className="sign end" title={SIGN_TITLE[m]}>
              {SIGN_LABEL[m]}
            </span>
          ))}
        </div>
      )}
      <div className="tune-chords">
        {chordLabels.map((c, i) => (
          <span key={i} style={{ left: xAt(c.beat) }}>
            {c.label}
          </span>
        ))}
      </div>
      <svg width={w} height={TOP + LANE_H + BOTTOM} role="img" aria-label={notes.map((n) => names.pitch(n.pitch)).join(' ')}>
        {[...slurs.values()]
          .filter((g) => g.length > 1)
          .map((g, i) => {
            const x1 = xAt(g[0]!.start) + 2;
            const last = g.at(-1)!;
            const x2 = Math.min(w - 1, xAt(last.start) + Math.max(4, xAt(last.duration) - 3));
            const top = Math.min(...g.map((n) => y(n.pitch))) - 2;
            const peak = Math.max(1, top - 7);
            return <path key={`s${i}`} className="tune-slur" d={`M${x1},${top} Q${(x1 + x2) / 2},${peak} ${x2},${top}`} />;
          })}
        {notes.map((n, i) => {
          const x = xAt(n.start);
          const nw = Math.max(3, Math.min(w - x, xAt(n.duration)) - 1.5);
          const ny = y(n.pitch) - h / 2 + step / 2;
          const marks = (n.marks ?? []).map(markInfo);
          const signs = marks.filter((m) => m.kind !== 'dynamic');
          const dynamics = marks.filter((m) => m.kind === 'dynamic');
          return (
            <g key={i}>
              {(n.grace ?? []).map((g, gi, all) => (
                <rect key={`g${gi}`} className="tune-grace" x={Math.max(0, x - (all.length - gi) * 4)} y={y(g) - h * 0.3 + step / 2} width={3} height={h * 0.6} rx={1} fill={colour(Math.round(g))}>
                  <title>grace {names.pitch(g)}</title>
                </rect>
              ))}
              <rect x={x} y={ny} width={nw} height={h} rx={2} fill={colour(Math.round(n.pitch))} />
              {nw >= 11 && (
                <text x={x + 2} y={y(n.pitch) + step / 2 + 3.5} className="tune-note-label">
                  {names.pc(Math.round(n.pitch))}
                </text>
              )}
              {signs.length > 0 && (
                <text x={x + 1} y={10} className="tune-mark">
                  {signs.map((m) => m.symbol).join('')}
                  <title>{signs.map((m) => m.name).join(', ')}</title>
                </text>
              )}
              {dynamics.length > 0 && (
                <text x={x + 1} y={TOP + LANE_H + BOTTOM - 2} className="tune-dynamic">
                  {dynamics.map((m) => m.symbol).join(' ')}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
