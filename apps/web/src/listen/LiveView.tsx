import { useEffect, useRef, useState } from 'react';
import { parseChordSymbol, type Chord } from '@toner/theory';
import { openCapture, type Capture } from '../audio/capture';
import { useSettings } from '../settings';
import { agreement, ChordDetector, defaultDetectorOptions, VOCABULARIES, type Estimate, type Frame } from './chroma';

const WINDOW = 10; // seconds of timeline on screen
const KEEP = 30; // seconds of frames kept

type Which = 'smooth' | 'raw';

export function LiveView() {
  const { settings, names, letters, colours } = useSettings();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vocab, setVocab] = useState(VOCABULARIES[1]!.id);
  const [smoothing, setSmoothing] = useState(0.25);
  const [gate, setGate] = useState(0.003);
  const [which, setWhich] = useState<Which>('smooth');
  const [targetText, setTargetText] = useState('');
  const [now, setNow] = useState<Frame | null>(null);
  const capture = useRef<Capture | null>(null);
  const detector = useRef<ChordDetector | null>(null);
  const history = useRef<Frame[]>([]);
  const canvas = useRef<HTMLCanvasElement | null>(null);

  const target: Chord | null = targetText.trim() ? parseChordSymbol(targetText) : null;
  const vocabulary = VOCABULARIES.find((v) => v.id === vocab)!;
  const options = { vocabulary, smoothing, gate, chroma: { ...defaultDetectorOptions(48000).chroma, a4: settings.a4 } };

  useEffect(() => detector.current?.configure(options), [vocab, smoothing, gate, settings.a4]);
  useEffect(() => () => capture.current?.stop(), []);

  async function start() {
    setError(null);
    history.current = [];
    try {
      capture.current = await openCapture((b) => {
        const d = detector.current;
        if (!d) return;
        const frames = d.push(b.samples, b.time);
        if (frames.length === 0) return;
        const h = history.current;
        h.push(...frames);
        const cut = h.findIndex((f) => f.time > b.time - KEEP);
        if (cut > 0) h.splice(0, cut);
      });
      detector.current = new ChordDetector({ ...defaultDetectorOptions(capture.current.ctx.sampleRate), ...options });
      setRunning(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function stop() {
    capture.current?.stop();
    capture.current = null;
    detector.current = null;
    setRunning(false);
  }

  // Repaint at display rate.
  const paint = useRef({ which, names, colours, home: settings.home, target });
  paint.current = { which, names, colours, home: settings.home, target };
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const tick = () => {
      const h = history.current;
      setNow(h[h.length - 1] ?? null);
      const c = canvas.current;
      const ctx = capture.current?.ctx;
      if (c && ctx) drawTimeline(c, h, ctx.currentTime, paint.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const est: Estimate | null = now ? now[which] : null;
  const best = est?.best ?? null;
  const verdict = target && best ? agreement(target, best.chord) : null;

  return (
    <>
      <p>
        Strum or pick a chord and Toner names it as it rings, with how sure it is. This is the plain baseline: a pitch-class profile of each moment matched against chord
        templates, with no knowledge of your guitar yet. The timeline keeps the last {WINDOW} seconds so you can see when it changes its mind.
      </p>
      <div className="controls">
        <label>
          Chords it knows
          <select value={vocab} onChange={(e) => setVocab(e.target.value)}>
            {VOCABULARIES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Smoothing {Math.round(smoothing * 1000)} ms
          <input type="range" min={0} max={1} step={0.05} value={smoothing} onChange={(e) => setSmoothing(Number(e.target.value))} />
        </label>
        <label>
          Silence below {gate.toFixed(4)}
          <input type="range" min={0.0005} max={0.03} step={0.0005} value={gate} onChange={(e) => setGate(Number(e.target.value))} />
        </label>
        <div className="seg" role="group" aria-label="Reading">
          {(['smooth', 'raw'] as Which[]).map((w) => (
            <button key={w} aria-pressed={which === w} onClick={() => setWhich(w)}>
              {w === 'smooth' ? 'Smoothed' : 'Each frame'}
            </button>
          ))}
        </div>
        <label>
          Expecting (optional)
          <input value={targetText} onChange={(e) => setTargetText(e.target.value)} placeholder="Am" aria-invalid={!!targetText.trim() && !target} size={6} />
        </label>
      </div>
      <div className="actions">
        <button className="primary big" onClick={() => (running ? stop() : void start())}>
          {running ? 'Stop' : 'Listen'}
        </button>
        {running && (
          <div className="level wide" aria-label="Input level">
            <span style={{ width: `${Math.min(100, Math.sqrt(now?.level ?? 0) * 200)}%` }} />
          </div>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="listen-now">
        <div className="listen-chord" style={{ color: best ? colours.pc(best.chord.root, settings.home) : undefined, opacity: best ? 0.4 + 0.6 * best.p : 1 }}>
          {best ? names.chord(best.chord) : running ? '…' : '–'}
          {best && settings.naming !== 'letters' && <small>{letters.chord(best.chord)}</small>}
        </div>
        <div className="listen-meta">
          {best && <div>Confidence {(best.p * 100).toFixed(0)}% · match {best.score.toFixed(2)}</div>}
          {verdict && (
            <div className={verdict === 'exact' ? 'good' : verdict === 'wrong' ? 'bad' : 'warn'}>
              {verdict === 'exact' ? `That is ${names.chord(target!)}` : verdict === 'root' ? 'Right root, different chord' : verdict === 'related' ? 'Shares notes with it' : 'Not it'}
            </div>
          )}
          <ol className="listen-ranked">
            {est?.ranked.slice(0, 4).map((c, i) => (
              <li key={i}>
                <span className="swatch" style={{ background: colours.pc(c.chord.root, settings.home) }} />
                {names.chord(c.chord)}
                <span className="bar">
                  <span style={{ width: `${c.p * 100}%` }} />
                </span>
                <span className="muted">{(c.p * 100).toFixed(0)}%</span>
              </li>
            ))}
          </ol>
        </div>
        <Chroma chroma={est?.chroma ?? null} />
      </div>
      <canvas ref={canvas} className="listen-timeline" height={150} aria-label="Chord timeline, last ten seconds" />
      <p className="hint">
        Each column is one analysis frame (about 40 ms), coloured by the chord's root and faded by confidence. White ticks are strums, the grey line is loudness, and with
        an expected chord the strip underneath is green when it matches. Readings lag the strum by about 150 ms because each frame listens to 170 ms of sound.
      </p>
    </>
  );
}

function Chroma({ chroma }: { chroma: Float64Array | null }) {
  const { settings, names, colours } = useSettings();
  const max = chroma ? Math.max(1e-9, ...chroma) : 1;
  return (
    <div className="listen-chroma" aria-label="Pitch classes heard">
      {Array.from({ length: 12 }, (_, i) => {
        const pc = (settings.home + i) % 12;
        const v = chroma ? chroma[pc]! / max : 0;
        return (
          <div key={pc} className="col">
            <span className="fill" style={{ height: `${v * 100}%`, background: colours.pc(pc, settings.home) }} />
            <span className="lbl">{names.pc(pc)}</span>
          </div>
        );
      })}
    </div>
  );
}

function drawTimeline(
  c: HTMLCanvasElement,
  frames: Frame[],
  now: number,
  p: { which: Which; names: ReturnType<typeof useSettings>['names']; colours: ReturnType<typeof useSettings>['colours']; home: number; target: Chord | null },
) {
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (c.width !== Math.round(w * dpr)) c.width = Math.round(w * dpr);
  if (c.height !== Math.round(h * dpr)) c.height = Math.round(h * dpr);
  const g = c.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const t0 = now - WINDOW;
  const x = (t: number) => ((t - t0) / WINDOW) * w;
  const lane = h - 40;
  const visible = frames.filter((f) => f.time > t0 - 1);
  const style = getComputedStyle(c);
  g.font = `600 13px ${style.fontFamily}`;
  g.textBaseline = 'top';

  // Grid: one line a second.
  g.strokeStyle = 'rgba(255,255,255,0.06)';
  for (let s = Math.ceil(t0); s < now; s++) {
    g.beginPath();
    g.moveTo(x(s), 0);
    g.lineTo(x(s), h);
    g.stroke();
  }

  let lastLabel = '';
  let lastLabelX = -Infinity;
  const labels: { x: number; text: string }[] = [];
  const onsets: number[] = [];
  visible.forEach((f, i) => {
    const next = visible[i + 1];
    const x0 = x(f.time);
    const x1 = next ? x(next.time) : x(f.time) + 4;
    const b = f[p.which].best;
    if (b) {
      g.globalAlpha = 0.15 + 0.85 * b.p;
      g.fillStyle = p.colours.pc(b.chord.root, p.home);
      g.fillRect(x0, 0, Math.max(1, x1 - x0 + 0.5), lane);
      g.globalAlpha = 1;
      const label = p.names.chord(b.chord);
      if (label !== lastLabel && x0 - lastLabelX > 36) {
        labels.push({ x: x0, text: label });
        lastLabelX = x0;
      }
      lastLabel = label;
      if (p.target) {
        const a = agreement(p.target, b.chord);
        g.fillStyle = a === 'exact' ? 'oklch(0.78 0.15 155)' : a === 'wrong' ? 'oklch(0.7 0.17 30)' : 'oklch(0.82 0.14 85)';
        g.fillRect(x0, lane + 28, Math.max(1, x1 - x0 + 0.5), 8);
      }
    } else lastLabel = '';
    if (f.onset) onsets.push(x0);
  });

  // Marks go on top of the colour, so draw them after it.
  g.fillStyle = '#fff';
  for (const ox of onsets) g.fillRect(ox - 1, lane - 12, 2, 12);
  for (const l of labels) {
    const tw = g.measureText(l.text).width;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(l.x + 1, 3, tw + 6, 18);
    g.fillStyle = '#fff';
    g.fillText(l.text, l.x + 4, 5);
  }

  // Loudness.
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.beginPath();
  visible.forEach((f, i) => {
    const y = lane + 24 - Math.min(1, Math.sqrt(f.level) * 2) * 20;
    if (i === 0) g.moveTo(x(f.time), y);
    else g.lineTo(x(f.time), y);
  });
  g.stroke();
}
