import { useEffect, useMemo, useRef, useState } from 'react';
import { instrument, parseTuning, type Tuning } from '@toner/instrument';
import { pitchClass } from '@toner/theory';
import { audioContext, resumeAudio } from '../audio/context';
import { openMic, type MicInput } from '../audio/mic';
import { drone, pluck } from '../audio/synth';
import { useSettings } from '../settings';
import { PitchSmoother, readPitch, tuneState, type Reading, type TargetMode } from './logic';

type View = 'needle' | 'strobe';

export function Tuner() {
  const { settings, set, names, letters, colours } = useSettings();
  const profile = instrument(settings.instrument);
  const [custom, setCustom] = useState('D A D G B E');
  const [mode, setMode] = useState<TargetMode>({ kind: 'auto' });
  const [view, setView] = useState<View>('needle');
  const [useDrone, setUseDrone] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [level, setLevel] = useState(0);
  const mic = useRef<MicInput | null>(null);
  const stopDrone = useRef<(() => void) | null>(null);
  const latest = useRef<{ reading: Reading | null; level: number }>({ reading: null, level: 0 });

  const tuning: Tuning | null = useMemo(() => {
    if (settings.tuning === 'custom') {
      const strings = parseTuning(custom);
      return strings ? { id: 'custom', name: 'Custom', strings, style: 'Custom' } : null;
    }
    return profile.tunings.find((t) => t.id === settings.tuning) ?? profile.tunings[0]!;
  }, [settings.tuning, custom, profile]);
  const strings = tuning?.strings ?? [];

  // Keep the analysis callback current without reopening the mic.
  const analysis = useRef({ strings, mode, a4: settings.a4 });
  analysis.current = { strings, mode, a4: settings.a4 };
  const smoother = useRef(new PitchSmoother());

  async function start() {
    setError(null);
    try {
      mic.current = await openMic(
        (m) => {
          if (m.type === 'error') setError(m.message);
          if (m.type !== 'pitch') return;
          const { strings: s, mode: md, a4 } = analysis.current;
          const p = smoother.current.push(m.time, m.freq, m.clarity, a4);
          latest.current = { reading: p === null ? null : readPitch(p, s, md), level: m.level };
        },
        { minHz: profile.range.minHz, maxHz: profile.range.maxHz },
      );
      setRunning(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function stop() {
    mic.current?.stop();
    mic.current = null;
    smoother.current.reset();
    latest.current = { reading: null, level: 0 };
    setReading(null);
    setRunning(false);
  }

  useEffect(() => () => mic.current?.stop(), []);
  useEffect(() => mic.current?.configure({ minHz: profile.range.minHz, maxHz: profile.range.maxHz }), [profile]);
  useEffect(() => () => stopDrone.current?.(), []);

  // Repaint at display rate, not at the detector's rate.
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const tick = () => {
      setReading(latest.current.reading);
      setLevel(latest.current.level);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  async function playString(i: number) {
    const ctx = await resumeAudio();
    setMode({ kind: 'string', string: i });
    stopDrone.current?.();
    stopDrone.current = null;
    if (useDrone) stopDrone.current = drone(ctx, strings[i]!, settings.a4);
    else pluck(ctx, strings[i]!, settings.a4);
  }

  const styles = [...new Set(profile.tunings.map((t) => t.style))];
  const state = reading ? tuneState(reading.cents) : null;
  const target = reading?.target;

  return (
    <section className="page tuner">
      <div className="controls">
        <label>
          Instrument
          <select value={settings.instrument} onChange={(e) => set({ instrument: e.target.value, tuning: 'standard' })}>
            {['guitar', 'bass', 'ukulele'].map((id) => (
              <option key={id} value={id}>
                {instrument(id).name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tuning
          <select value={settings.tuning} onChange={(e) => set({ tuning: e.target.value })}>
            {styles.map((style) => (
              <optgroup key={style} label={style}>
                {profile.tunings
                  .filter((t) => t.style === style)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </optgroup>
            ))}
            <option value="custom">Custom…</option>
          </select>
        </label>
        {settings.tuning === 'custom' && (
          <label>
            Strings, low to high
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="D A D G A D" aria-invalid={!tuning} />
          </label>
        )}
        <label>
          A4 (Hz)
          <input
            type="number"
            min={415}
            max={466}
            step={0.5}
            value={settings.a4}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v >= 415 && v <= 466) set({ a4: v });
            }}
          />
        </label>
        <div className="seg" role="group" aria-label="Target">
          <button aria-pressed={mode.kind === 'auto'} onClick={() => setMode({ kind: 'auto' })}>
            Auto
          </button>
          <button aria-pressed={mode.kind === 'chromatic'} onClick={() => setMode({ kind: 'chromatic' })}>
            Chromatic
          </button>
        </div>
        <div className="seg" role="group" aria-label="Display">
          <button aria-pressed={view === 'needle'} onClick={() => setView('needle')}>
            Needle
          </button>
          <button aria-pressed={view === 'strobe'} onClick={() => setView('strobe')}>
            Strobe
          </button>
        </div>
      </div>
      {tuning?.notes && <p className="hint">{tuning.notes}</p>}

      <div className={`readout ${state ?? 'idle'}`}>
        <div className="note" style={target !== undefined ? { color: colours.pc(pitchClass(target), settings.home) } : undefined}>
          {target !== undefined ? names.pitch(target) : '–'}
        </div>
        {target !== undefined && settings.naming !== 'letters' && <div className="alt">{letters.pitch(target)}</div>}
        <div className="cents">{reading ? `${reading.cents > 0 ? '+' : ''}${reading.cents.toFixed(1)} ¢` : running ? 'Play a note' : 'Tap Start to listen'}</div>
        {view === 'needle' ? <Needle cents={reading?.cents ?? null} /> : <Strobe cents={reading?.cents ?? null} />}
        <div className="level" aria-label="Input level">
          <span style={{ width: `${Math.min(100, Math.sqrt(level) * 200)}%` }} />
        </div>
      </div>

      <div className="strings">
        {strings.map((p, i) => {
          const active = reading?.string === i || (mode.kind === 'string' && mode.string === i);
          return (
            <button
              key={i}
              className={active ? 'active' : ''}
              onClick={() => playString(i)}
              title={`Play ${letters.pitch(p)} and lock the tuner to this string`}
            >
              <span className="dot" style={{ background: colours.pc(pitchClass(p), settings.home) }} />
              {names.pitch(p)}
              {settings.naming !== 'letters' && <small>{letters.pitch(p)}</small>}
            </button>
          );
        })}
        <label className="check">
          <input type="checkbox" checked={useDrone} onChange={(e) => setUseDrone(e.target.checked)} /> Drone
        </label>
        {useDrone && (
          <button
            onClick={() => {
              stopDrone.current?.();
              stopDrone.current = null;
            }}
          >
            Stop drone
          </button>
        )}
      </div>

      <div className="actions">
        {running ? (
          <button className="primary" onClick={stop}>
            Stop
          </button>
        ) : (
          <button className="primary" onClick={start}>
            Start
          </button>
        )}
        {audioContext().state === 'running' && <span className="hint">Sample rate {audioContext().sampleRate} Hz</span>}
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function Needle({ cents }: { cents: number | null }) {
  const c = cents === null ? 0 : Math.max(-50, Math.min(50, cents));
  const angle = c * 1.2;
  const ticks = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50];
  return (
    <svg className="needle" viewBox="-160 -150 320 170" role="img" aria-label={cents === null ? 'No pitch' : `${cents.toFixed(0)} cents`}>
      <path d="M -130 -2 A 150 150 0 0 1 130 -2" fill="none" stroke="var(--line)" strokeWidth="2" transform="translate(0 0)" />
      <path d="M -11 -147 A 150 150 0 0 1 11 -147" stroke="var(--good)" strokeWidth="10" fill="none" />
      {ticks.map((t) => (
        <line key={t} x1="0" y1="-150" x2="0" y2={t % 50 === 0 || t === 0 ? -132 : -140} stroke="var(--muted)" strokeWidth={t === 0 ? 3 : 1.5} transform={`rotate(${t * 1.2})`} />
      ))}
      <text x="-128" y="14" className="tick">♭</text>
      <text x="120" y="14" className="tick">♯</text>
      {cents !== null && <line x1="0" y1="0" x2="0" y2="-138" stroke="var(--fg)" strokeWidth="3" strokeLinecap="round" transform={`rotate(${angle})`} />}
      <circle r="7" fill="var(--fg)" />
    </svg>
  );
}

/** A strobe: stripes drift right when sharp, left when flat, and stand still when in tune. */
function Strobe({ cents }: { cents: number | null }) {
  const ref = useRef<SVGGElement>(null);
  const centsRef = useRef(cents);
  centsRef.current = cents;
  useEffect(() => {
    let raf = 0;
    let phase = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const c = centsRef.current;
      if (c !== null) phase = (phase + c * dt * 4) % 40;
      ref.current?.setAttribute('transform', `translate(${phase} 0)`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <svg className="strobe" viewBox="0 0 320 60" role="img" aria-label="Strobe">
      <defs>
        <clipPath id="strobe-clip">
          <rect x="0" y="0" width="320" height="60" rx="10" />
        </clipPath>
      </defs>
      <g clipPath="url(#strobe-clip)">
        <rect width="320" height="60" fill="var(--stage)" />
        <g ref={ref} opacity={cents === null ? 0.25 : 1}>
          {Array.from({ length: 11 }, (_, i) => (
            <rect key={i} x={-40 + i * 40} y="0" width="20" height="60" fill={cents !== null && Math.abs(cents) <= 3 ? 'var(--good)' : 'var(--accent)'} />
          ))}
        </g>
      </g>
    </svg>
  );
}
