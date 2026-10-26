import { useEffect, useRef, useState } from 'react';
import {
  accentsFromGrouping,
  COMMON_TIME_SIGNATURES,
  defaultAccents,
  defaultGrouping,
  formatTimeSignature,
  parseGrouping,
  parseTimeSignature,
  tapTempo,
  tempoMarking,
  type Accent,
} from '@toner/theory';
import { formatStrum, parseStrum, STRUM_PATTERNS, strumPattern, type StrumPattern } from '@toner/instrument';
import { audioContext, resumeAudio } from '../audio/context';
import { useSettings } from '../settings';
import { MetronomeEngine, type ScheduledClick } from './engine';
import type { MetronomeSettings } from './plan';
import { StrumLane } from './StrumLane';
import { ChordLane, ProgressionPicker, usePracticeProgression } from './Progression';

const MIN_BPM = 20;
const MAX_BPM = 320;
const clampBpm = (v: number) => Math.round(Math.min(MAX_BPM, Math.max(MIN_BPM, v)));

const INITIAL: MetronomeSettings = {
  bpm: 90,
  timeSignature: { beats: 4, unit: 4 },
  accents: defaultAccents({ beats: 4, unit: 4 }),
  subdivision: 1,
  swing: 0,
  trainer: { enabled: false, target: 120, step: 5, everyBars: 4, then: 'hold' },
  gap: { enabled: false, play: 3, mute: 1 },
  strum: null,
  strumSounds: true,
  chords: null,
};

/** Metronome settings that make the grid match a pattern. */
function settingsForPattern(p: StrumPattern): Partial<MetronomeSettings> {
  return { timeSignature: p.timeSignature, accents: defaultAccents(p.timeSignature), subdivision: p.subdivision, swing: p.swing ?? 0, bpm: p.bpm };
}

/** Groupings of all single beats are the default for simple meters; show them as blank. */
const groupingText = (g: number[]) => (g.every((x) => x === 1) ? '' : g.join('+'));

const ACCENT_LABEL: Record<Accent, string> = { 3: 'strong', 2: 'medium', 1: 'normal', 0: 'silent' };
const NEXT_ACCENT: Record<Accent, Accent> = { 3: 2, 2: 1, 1: 0, 0: 3 };

export function Metronome() {
  const { settings, set, names } = useSettings();
  const [s, setS] = useState<MetronomeSettings>(() => {
    const p = strumPattern(settings.strum);
    return p ? { ...INITIAL, ...settingsForPattern(p), strum: p } : INITIAL;
  });
  const [customStrum, setCustomStrum] = useState('>D - D U - U D U');
  const [strumError, setStrumError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [grouping, setGrouping] = useState(groupingText(defaultGrouping(INITIAL.timeSignature)));
  const [customTs, setCustomTs] = useState('');
  const [now, setNow] = useState<ScheduledClick | null>(null);
  const [flash, setFlash] = useState(0);
  const [customProg, setCustomProg] = useState('I V vi IV');
  const [perBar, setPerBar] = useState<1 | 2 | null>(null);
  const [chordSound, setChordSound] = useState(true);
  /** Chord in focus while stopped; playback starts from it. */
  const [focus, setFocus] = useState(0);
  const [startChord, setStartChord] = useState(0);
  const { progression: prog, error: progError } = usePracticeProgression(customProg, perBar);
  const settingsRef = useRef(s);
  settingsRef.current = {
    ...s,
    chords: prog
      ? { count: prog.chords.length, perBar: prog.perBar, start: startChord, voices: chordSound ? prog.chords.map((c) => c.voicing?.pitches ?? []) : null, a4: settings.a4 }
      : null,
  };
  const engine = useRef<MetronomeEngine | null>(null);
  const taps = useRef<number[]>([]);

  const update = (patch: Partial<MetronomeSettings>) => setS((x) => ({ ...x, ...patch }));

  function setTimeSignature(text: string) {
    const ts = parseTimeSignature(text);
    if (!ts) return;
    const g = defaultGrouping(ts);
    setGrouping(groupingText(g));
    update({ timeSignature: ts, accents: accentsFromGrouping(g) });
  }

  function applyGrouping(text: string) {
    setGrouping(text);
    const g = text.trim() ? parseGrouping(text, s.timeSignature.beats) : defaultGrouping(s.timeSignature);
    if (g) update({ accents: accentsFromGrouping(g) });
  }

  function chooseStrum(id: string) {
    set({ strum: id });
    setStrumError(null);
    if (id === '') return update({ strum: null });
    if (id === 'custom') return applyCustom(customStrum);
    const p = strumPattern(id);
    if (p) {
      setGrouping(groupingText(defaultGrouping(p.timeSignature)));
      update({ ...settingsForPattern(p), strum: p });
    }
  }

  /** A custom pattern uses the metronome's current time signature and subdivision. */
  function applyCustom(text: string, sub = s.subdivision) {
    setCustomStrum(text);
    const r = parseStrum(text);
    if ('error' in r) {
      update({ strum: null });
      return setStrumError(r.error);
    }
    const perBar = s.timeSignature.beats * sub;
    if (r.steps.length % perBar !== 0) {
      update({ strum: null });
      return setStrumError(`${r.steps.length} strokes don't fill whole bars of ${perBar} (${formatTimeSignature(s.timeSignature)} with ${sub} per beat).`);
    }
    setStrumError(null);
    update({ strum: { id: 'custom', name: 'Custom', style: 'Custom', timeSignature: s.timeSignature, subdivision: sub, steps: r.steps, bpm: s.bpm } });
  }

  // Changing the time signature or subdivision under a pattern turns it into a custom pattern on the new grid.
  useEffect(() => {
    const st = s.strum;
    if (!st || (st.subdivision === s.subdivision && formatTimeSignature(st.timeSignature) === formatTimeSignature(s.timeSignature))) return;
    set({ strum: 'custom' });
    applyCustom(formatStrum(st), s.subdivision);
  }, [s.timeSignature, s.subdivision]);

  async function toggle() {
    if (engine.current?.running) {
      engine.current.stop();
      setRunning(false);
      // Stopping leaves the chord that was sounding in focus, to look at or start again from.
      if (now?.chord !== undefined) setFocus(now.chord);
      setNow(null);
      return;
    }
    const ctx = await resumeAudio();
    setStartChord(focus);
    settingsRef.current = { ...settingsRef.current, chords: settingsRef.current.chords && { ...settingsRef.current.chords, start: focus } };
    engine.current ??= new MetronomeEngine(ctx, () => settingsRef.current);
    engine.current.volume = volume;
    engine.current.start();
    setRunning(true);
  }

  function tap() {
    const t = performance.now() / 1000;
    const recent = taps.current.filter((x) => t - x < 3);
    recent.push(t);
    taps.current = recent.slice(-8);
    const bpm = tapTempo(taps.current);
    if (bpm) update({ bpm: clampBpm(bpm) });
  }

  useEffect(() => {
    if (engine.current) engine.current.volume = volume;
  }, [volume]);

  // Show each click when it reaches the speakers.
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const loop = () => {
      const heard = engine.current?.takeHeard() ?? [];
      const last = heard[heard.length - 1];
      if (last) {
        setNow(last);
        const beatClick = heard.filter((c) => c.sub === 0 && !c.muted).pop();
        if (beatClick) setFlash((f) => f + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  useEffect(() => () => engine.current?.dispose(), []);

  // Space bar starts and stops.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        void toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const tsText = formatTimeSignature(s.timeSignature);
  const known = COMMON_TIME_SIGNATURES.some((t) => formatTimeSignature(t) === tsText);
  const bpmNow = now?.bpm ?? s.bpm;
  const t = s.trainer;
  const g = s.gap;

  return (
    <section className="page metronome">
      <div className={`beat-display ${now?.muted ? 'muted' : ''}`}>
        {prog && <ChordLane progression={prog} now={now} running={running} focus={focus} onFocus={setFocus} />}
        {s.strum ? (
          <StrumLane pattern={s.strum} now={running ? now : null} />
        ) : (
        <div className="beats" role="img" aria-label={now ? `Beat ${now.beat + 1}` : 'Stopped'}>
          {s.accents.map((a, i) => (
            <button
              key={i}
              className={`beat level-${a} ${now && now.beat === i ? 'on' : ''}`}
              onClick={() => update({ accents: s.accents.map((x, k) => (k === i ? NEXT_ACCENT[x] : x)) })}
              title={`Beat ${i + 1}: ${ACCENT_LABEL[a]} (click to change)`}
            >
              <span>{i + 1}</span>
              {s.subdivision > 1 && (
                <span className="subs">
                  {Array.from({ length: s.subdivision - 1 }, (_, k) => (
                    <i key={k} className={now && now.beat === i && now.sub === k + 1 ? 'on' : ''} />
                  ))}
                </span>
              )}
            </button>
          ))}
        </div>
        )}
        <div key={flash} className={`pulse ${now?.beat === 0 && now.sub === 0 ? 'down' : ''}`} />
        <div className="status">
          {running ? (
            <>
              Bar {(now?.bar ?? 0) + 1}
              {now?.muted ? ' · silent bar, keep counting' : ''}
              {t.enabled ? ` · ${bpmNow} BPM` : ''}
            </>
          ) : (
            s.strum ? `${s.strum.name}: ${formatStrum(s.strum)}` : 'Tap a beat to change its accent'
          )}
        </div>
      </div>

      <div className="tempo">
        <button onClick={() => update({ bpm: clampBpm(s.bpm - 5) })} aria-label="Slower by 5">
          −5
        </button>
        <button onClick={() => update({ bpm: clampBpm(s.bpm - 1) })} aria-label="Slower by 1">
          −1
        </button>
        <div className="bpm">
          <input
            type="number"
            min={MIN_BPM}
            max={MAX_BPM}
            value={s.bpm}
            onChange={(e) => update({ bpm: clampBpm(Number(e.target.value) || s.bpm) })}
            aria-label="Beats per minute"
          />
          <small>
            BPM · {tempoMarking(s.bpm)}
            {s.timeSignature.unit !== 4 ? ` · beat = 1/${s.timeSignature.unit}` : ''}
          </small>
        </div>
        <button onClick={() => update({ bpm: clampBpm(s.bpm + 1) })} aria-label="Faster by 1">
          +1
        </button>
        <button onClick={() => update({ bpm: clampBpm(s.bpm + 5) })} aria-label="Faster by 5">
          +5
        </button>
      </div>
      <input className="slider" type="range" min={MIN_BPM} max={MAX_BPM} value={s.bpm} onChange={(e) => update({ bpm: Number(e.target.value) })} aria-label="Tempo" />

      <div className="actions">
        <button className="primary big" onClick={() => void toggle()}>
          {running ? 'Stop' : 'Start'}
        </button>
        <button onClick={tap}>Tap tempo</button>
      </div>

      <div className="controls">
        <label>
          Time signature
          <select value={known ? tsText : 'custom'} onChange={(e) => (e.target.value === 'custom' ? setCustomTs(tsText) : setTimeSignature(e.target.value))}>
            {COMMON_TIME_SIGNATURES.map((ts) => (
              <option key={formatTimeSignature(ts)}>{formatTimeSignature(ts)}</option>
            ))}
            <option value="custom">Other…</option>
          </select>
        </label>
        {(!known || customTs) && (
          <label>
            Other
            <input
              value={customTs || tsText}
              placeholder="11/8"
              onChange={(e) => {
                setCustomTs(e.target.value);
                setTimeSignature(e.target.value);
              }}
            />
          </label>
        )}
        <label>
          Grouping
          <input value={grouping} onChange={(e) => applyGrouping(e.target.value)} aria-invalid={grouping.trim() !== '' && !parseGrouping(grouping, s.timeSignature.beats)} placeholder="e.g. 2+2+3" />
        </label>
        <div className="seg" role="group" aria-label="Subdivision">
          {([1, 2, 3, 4] as const).map((n) => (
            <button key={n} aria-pressed={s.subdivision === n} onClick={() => update({ subdivision: n })}>
              {n === 1 ? 'Beats' : n === 2 ? '½' : n === 3 ? '⅓' : '¼'}
            </button>
          ))}
        </div>
        {s.subdivision === 2 && (
          <label>
            Swing {Math.round(s.swing * 100)}%
            <input type="range" min={0} max={1} step={0.05} value={s.swing} onChange={(e) => update({ swing: Number(e.target.value) })} />
          </label>
        )}
        <label>
          Volume
          <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
        </label>
      </div>

      <fieldset className="panel">
        <legend>Chord changes</legend>
        <div className="controls">
          <label>
            Progression
            <ProgressionPicker
              value={settings.progression}
              onChange={(id) => {
                set({ progression: id });
                setPerBar(null);
                setFocus(0);
              }}
            />
          </label>
          {settings.progression === 'custom' && (
            <label className="grow">
              Chords as roman numerals from home
              <input value={customProg} onChange={(e) => setCustomProg(e.target.value)} aria-invalid={!!progError} spellCheck={false} placeholder="I V vi IV" />
            </label>
          )}
          {prog && (
            <>
              <div className="seg" role="group" aria-label="Chords per bar">
                {([1, 2] as const).map((k) => (
                  <button key={k} aria-pressed={prog.perBar === k} onClick={() => setPerBar(k)}>
                    {k === 1 ? '1 per bar' : '2 per bar'}
                  </button>
                ))}
              </div>
              <label className="check">
                <input type="checkbox" checked={chordSound} onChange={(e) => setChordSound(e.target.checked)} /> Play the chords
              </label>
            </>
          )}
        </div>
        {progError && <p className="error">{progError}</p>}
        {prog?.notes && <p className="hint">{prog.notes}</p>}
        <p className="hint">
          {prog
            ? `In ${names.pc(settings.home)} (home in the header). With a strumming pattern the strums play the chord; without one, each chord sounds once when it arrives.`
            : 'Pick a progression to practise chord changes in time, alone or with a strumming pattern. Change home in the header to move it to another key.'}{' '}
          Custom: I ii iii IV V vi vii°, ♭III ♭VI ♭VII, and suffixes 7 maj7 ø7 °7 sus4 6 9.
        </p>
      </fieldset>

      <fieldset className="panel">
        <legend>Strumming pattern</legend>
        <div className="controls">
          <label>
            Pattern
            <select value={settings.strum === 'custom' || s.strum ? settings.strum : ''} onChange={(e) => chooseStrum(e.target.value)}>
              <option value="">None (plain metronome)</option>
              {[...new Set(STRUM_PATTERNS.map((p) => p.style))].map((style) => (
                <optgroup key={style} label={style}>
                  {STRUM_PATTERNS.filter((p) => p.style === style).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value="custom">Custom…</option>
            </select>
          </label>
          {settings.strum === 'custom' && (
            <label className="grow">
              Strokes ({formatTimeSignature(s.timeSignature)}, {s.subdivision} per beat)
              <input value={customStrum} onChange={(e) => applyCustom(e.target.value)} aria-invalid={!!strumError} spellCheck={false} />
            </label>
          )}
          {s.strum && (
            <label className="check">
              <input type="checkbox" checked={s.strumSounds} onChange={(e) => update({ strumSounds: e.target.checked })} /> Stroke sounds
            </label>
          )}
        </div>
        {strumError && <p className="error">{strumError}</p>}
        {s.strum?.notes && <p className="hint">{s.strum.notes}</p>}
        <p className="hint">
          ↓ down · ↑ up · ✕ chuck (muted) · ● knock on the body · B bass note · faint arrows are rests where the hand keeps moving · gold is accented. Custom: D U X x K B -, with &gt; for an accent and | between bars.
        </p>
      </fieldset>

      <fieldset className="panel">
        <legend>
          <label className="check">
            <input type="checkbox" checked={t.enabled} onChange={(e) => update({ trainer: { ...t, enabled: e.target.checked } })} /> Speed trainer
          </label>
        </legend>
        <div className="controls">
          <label>
            Up to (BPM)
            <input type="number" min={MIN_BPM} max={MAX_BPM} value={t.target} onChange={(e) => update({ trainer: { ...t, target: clampBpm(Number(e.target.value)) } })} />
          </label>
          <label>
            Step (BPM)
            <input type="number" min={1} max={40} value={t.step} onChange={(e) => update({ trainer: { ...t, step: Math.max(1, Number(e.target.value)) } })} />
          </label>
          <label>
            Every (bars)
            <input type="number" min={1} max={64} value={t.everyBars} onChange={(e) => update({ trainer: { ...t, everyBars: Math.max(1, Number(e.target.value)) } })} />
          </label>
          <div className="seg" role="group" aria-label="At the target">
            <button aria-pressed={t.then === 'hold'} onClick={() => update({ trainer: { ...t, then: 'hold' } })}>
              Then hold
            </button>
            <button aria-pressed={t.then === 'restart'} onClick={() => update({ trainer: { ...t, then: 'restart' } })}>
              Then restart
            </button>
          </div>
        </div>
        <p className="hint">Starts at {s.bpm} BPM and steps by {t.step} every {t.everyBars} bars. Changes apply from the next bar.</p>
      </fieldset>

      <fieldset className="panel">
        <legend>
          <label className="check">
            <input type="checkbox" checked={g.enabled} onChange={(e) => update({ gap: { ...g, enabled: e.target.checked } })} /> Silent bars
          </label>
        </legend>
        <div className="controls">
          <label>
            Play (bars)
            <input type="number" min={1} max={32} value={g.play} onChange={(e) => update({ gap: { ...g, play: Math.max(1, Number(e.target.value)) } })} />
          </label>
          <label>
            Then silent (bars)
            <input type="number" min={1} max={32} value={g.mute} onChange={(e) => update({ gap: { ...g, mute: Math.max(1, Number(e.target.value)) } })} />
          </label>
        </div>
        <p className="hint">The click drops out so you can check your own time; the display keeps counting.</p>
      </fieldset>
      {running && audioContext().outputLatency > 0 && <p className="hint">Output latency reported by the browser: {(audioContext().outputLatency * 1000).toFixed(0)} ms</p>}
    </section>
  );
}
