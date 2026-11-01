import { useEffect, useMemo, useRef, useState } from 'react';
import { detectKey, indexAbc, Naming, parseAbc, type AbcTune, type TimedNote } from '@toner/theory';
import { resumeAudio } from '../audio/context';
import { pluck } from '../audio/synth';
import { useSettings } from '../settings';
import { notesByBar, pcWeights, pitchRange, playedBars, type PlacedBar, type Source } from './score';

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
  const { settings, colours, letters } = useSettings();
  const parsed = useMemo((): AbcTune | { error: string } => {
    try {
      return parseAbc(entry.text);
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [entry]);
  const [speed, setSpeed] = useState(0.7);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingBar, setPlayingBar] = useState<number | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRef.current?.(), []);

  if ('error' in parsed) return <p className="error">Could not read this tune: {parsed.error}</p>;
  const { song, info, warnings } = parsed;
  const home = song.home ?? 0;
  // Numbers count from the tune's own home, so a tune reads the same in any key.
  const names = new Naming({ mode: settings.naming, home });
  const also = settings.alsoLetters && settings.naming !== 'letters' ? new Naming({ mode: 'letters', home }) : null;
  const notes = song.parts?.[0]?.notes ?? [];
  const weights = pcWeights(notes);
  const maxWeight = Math.max(...weights, 1e-9);
  const guess = detectKey(weights)[0]?.key;
  const range = pitchRange(notes);
  const bars = playedBars(song);
  const byBar = notesByBar(song);
  const playing = playingBar === null ? null : bars[playingBar];

  async function play() {
    stopRef.current?.();
    const ctx = await resumeAudio();
    const secPerBeat = 60 / (song.tempo * speed);
    const t0 = ctx.currentTime + 0.1;
    let next = 0;
    let raf = 0;
    const end = bars.length ? bars.at(-1)!.start + bars.at(-1)!.beats : 0;
    // Schedule a little ahead on the audio clock, so stopping is quick and timing stays tight.
    const tick = () => {
      const horizon = ctx.currentTime + 0.4;
      while (next < notes.length && t0 + notes[next]!.start * secPerBeat < horizon) {
        const n: TimedNote = notes[next++]!;
        pluck(ctx, n.pitch, settings.a4, t0 + n.start * secPerBeat, Math.max(0.25, n.duration * secPerBeat * 1.4), ctx.destination, 0.16);
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
      </div>

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

function BarView(props: {
  placed: PlacedBar | undefined;
  unit: number;
  notes: TimedNote[];
  range: [number, number];
  names: Naming;
  colour: (pc: number) => string;
  on: boolean;
  chordLabels: { beat: number; label: string }[];
}) {
  const { placed, unit, notes, range, names, colour, on, chordLabels } = props;
  const beats = placed?.beats ?? unit;
  const w = Math.max(28, Math.round((beats / unit) * pxPerWhole()));
  const [lo, hi] = range;
  const step = (LANE_H - 14) / (hi - lo + 1);
  const y = (p: number) => LANE_H - 2 - (p - lo + 1) * step;
  return (
    <div className={`tune-bar${on ? ' on' : ''}`} style={{ width: w }}>
      <div className="tune-chords">
        {chordLabels.map((c, i) => (
          <span key={i} style={{ left: (c.beat / beats) * w }}>
            {c.label}
          </span>
        ))}
      </div>
      <svg width={w} height={LANE_H} role="img" aria-label={notes.map((n) => names.pitch(n.pitch)).join(' ')}>
        {notes.map((n, i) => {
          const x = (n.start / beats) * w;
          const nw = Math.max(3, Math.min(w - x, (n.duration / beats) * w) - 1.5);
          const h = Math.max(6, step + 2);
          return (
            <g key={i}>
              <rect x={x} y={y(n.pitch) - h / 2 + step / 2} width={nw} height={h} rx={2} fill={colour(Math.round(n.pitch))} />
              {nw >= 11 && (
                <text x={x + 2} y={y(n.pitch) + step / 2 + 3.5} className="tune-note-label">
                  {names.pc(Math.round(n.pitch))}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
