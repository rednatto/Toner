import { useEffect, useRef, useState } from 'react';
import { parseChordSymbol, type Chord } from '@toner/theory';
import { openCapture, type Capture } from '../audio/capture';
import { useSettings } from '../settings';
import { ChordDetector, defaultDetectorOptions, harmonicTemplate, VOCABULARIES, type Estimate, type Frame } from './chroma';
import { HeardGlyph } from './HeardGlyph';
import { checkChord, checkChroma, DEFAULT_CHROMA_CHECK, NoteMemory, type Check, type Remembered } from './notes';

const WINDOW = 10; // seconds of timeline on screen
const KEEP = 30; // seconds of frames kept

type Which = 'smooth' | 'raw';
type Verdict = Check['verdict'];

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
  const [fade, setFade] = useState(1.5);
  const [strict, setStrict] = useState(DEFAULT_CHROMA_CHECK.extra);
  const [order, setOrder] = useState<'semitones' | 'fifths'>('semitones');
  const [glyph, setGlyph] = useState<{ notes: Remembered[]; check: Check | null }>({ notes: [], check: null });
  const noteMem = useRef(new NoteMemory(fade));
  const pcMem = useRef(new NoteMemory(fade, 2));
  const verdicts = useRef(new WeakMap<Frame, Verdict>());
  const capture = useRef<Capture | null>(null);
  const detector = useRef<ChordDetector | null>(null);
  const history = useRef<Frame[]>([]);
  const canvas = useRef<HTMLCanvasElement | null>(null);

  const target: Chord | null = targetText.trim() ? parseChordSymbol(targetText) : null;
  const vocabulary = VOCABULARIES.find((v) => v.id === vocab)!;
  const options = { vocabulary, smoothing, gate, chroma: { ...defaultDetectorOptions(48000).chroma, a4: settings.a4 } };

  useEffect(() => detector.current?.configure(options), [vocab, smoothing, gate, settings.a4]);
  useEffect(() => {
    noteMem.current.fade = fade;
    pcMem.current.fade = fade;
  }, [fade]);
  // What the notes are checked against, readable from the audio callback without reopening the mic.
  const checking = useRef<{ target: Chord; template: Float64Array; extra: number } | null>(null);
  const targetKey = target ? `${target.root}:${target.quality}:${target.bass ?? ''}` : '';
  useEffect(() => {
    checking.current = target ? { target, template: harmonicTemplate(target), extra: strict } : null;
    pcMem.current.clear();
  }, [targetKey, strict]);
  useEffect(() => () => capture.current?.stop(), []);

  async function start() {
    setError(null);
    history.current = [];
    noteMem.current.clear();
    pcMem.current.clear();
    try {
      capture.current = await openCapture((b) => {
        const d = detector.current;
        if (!d) return;
        const frames = d.push(b.samples, b.time);
        if (frames.length === 0) return;
        for (const f of frames) {
          noteMem.current.push(f.time, f.notes, f.onset);
          const k = checking.current;
          if (!k || !f.smooth.best) continue;
          const c = checkChroma(k.target, f.smooth.chroma, k.template, { ...DEFAULT_CHROMA_CHECK, extra: k.extra });
          verdicts.current.set(f, c.verdict);
          pcMem.current.push(f.time, [...c.present, ...c.colour, ...c.foreign].map((pc) => ({ pitch: pc, strength: 1 })), f.onset);
        }
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
  const paint = useRef({ which, names, colours, home: settings.home, target, verdicts: verdicts.current });
  paint.current = { which, names, colours, home: settings.home, target, verdicts: verdicts.current };
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const tick = () => {
      const h = history.current;
      setNow(h[h.length - 1] ?? null);
      const c = canvas.current;
      const ctx = capture.current?.ctx;
      if (c && ctx) drawTimeline(c, h, ctx.currentTime, paint.current);
      if (ctx) {
        // Notes and verdicts are on the frame clock (window centres), which runs a little behind.
        const t = h[h.length - 1]?.time ?? ctx.currentTime;
        const k = checking.current;
        const heard = pcMem.current.at(t, 0.35).map((n) => n.pitch);
        setGlyph({ notes: noteMem.current.at(t, 0.05), check: k ? checkChord(k.target, heard) : null });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const est: Estimate | null = now ? now[which] : null;
  const best = est?.best ?? null;

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
        <label>
          Notes fade over {fade.toFixed(1)} s
          <input type="range" min={0.3} max={5} step={0.1} value={fade} onChange={(e) => setFade(Number(e.target.value))} />
        </label>
        <label>
          Extra notes: {strict <= 0.22 ? 'strict' : strict >= 0.34 ? 'lenient' : 'balanced'}
          <input type="range" min={0.15} max={0.4} step={0.01} value={0.55 - strict} onChange={(e) => setStrict(0.55 - Number(e.target.value))} />
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
      <div className="listen-check">
        <div className="listen-glyph">
          <HeardGlyph notes={glyph.notes} target={target} check={glyph.check} order={order} />
          <div className="seg small" role="group" aria-label="Order">
            {(['semitones', 'fifths'] as const).map((o) => (
              <button key={o} aria-pressed={order === o} onClick={() => setOrder(o)}>
                {o === 'semitones' ? 'Semitones' : 'Fifths'}
              </button>
            ))}
          </div>
        </div>
        <div className="listen-verdict">
          {target ? <CheckText target={target} check={glyph.check} /> : <p className="muted">Type the chord you mean to play under “Expecting” and Toner checks the notes against it.</p>}
          <p className="hint">
            Each spoke is a pitch class and each ring an octave (low E on the inside), so a note doubled on two strings shows as two dots on one spoke. Dots fade as the sound
            does. With an expected chord its notes have coloured spokes; a dashed ring is a chord note not heard, amber marks a colour note that makes a richer chord of the
            same kind (the D that turns E into E7), and red marks a note that does not belong.
          </p>
        </div>
      </div>
      <canvas ref={canvas} className="listen-timeline" height={150} aria-label="Chord timeline, last ten seconds" />
      <p className="hint">
        Each column is one analysis frame (about 40 ms), coloured by the chord's root and faded by confidence. White ticks are strums, the grey line is loudness, and with
        an expected chord the strip underneath is green when its notes are right, amber when one is missing and red when one does not belong. Readings lag the strum by about 150 ms because each frame listens to 170 ms of sound.
      </p>
    </>
  );
}

function CheckText({ target, check }: { target: Chord; check: Check | null }) {
  const { names } = useSettings();
  const list = (pcs: number[]) => pcs.map((p) => names.pc(p)).join(' ');
  const name = names.chord(target);
  if (!check || check.verdict === 'quiet') return <p className="listen-verdict-line muted">Play {name}…</p>;
  return (
    <div>
      <p className={`listen-verdict-line ${check.verdict === 'wrong' ? 'bad' : check.verdict === 'missing' ? 'warn' : 'good'}`}>
        {check.verdict === 'right' && `✓ ${name}`}
        {check.verdict === 'coloured' && `✓ ${name}, coloured`}
        {check.verdict === 'missing' && `Almost: ${name} without ${list(check.missing)}`}
        {check.verdict === 'wrong' && `Unexpected ${list(check.foreign)}`}
      </p>
      <ul className="listen-verdict-detail">
        {check.present.length > 0 && <li>Chord notes heard: {list(check.present)}</li>}
        {check.colour.length > 0 && <li className="warn">Colour notes: {list(check.colour)}, the same chord with more in it (fine unless the song wants it plain)</li>}
        {check.missing.length > 0 && <li className="warn">Not heard: {list(check.missing)}</li>}
        {check.dropped.length > 0 && <li className="muted">Left out, which is fine: {list(check.dropped)}</li>}
        {check.foreign.length > 0 && <li className="bad">Does not belong: {list(check.foreign)}</li>}
      </ul>
    </div>
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
  p: {
    which: Which;
    names: ReturnType<typeof useSettings>['names'];
    colours: ReturnType<typeof useSettings>['colours'];
    home: number;
    target: Chord | null;
    verdicts: WeakMap<Frame, Verdict>;
  },
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
      const v = p.target ? p.verdicts.get(f) : undefined;
      if (v) {
        g.fillStyle = v === 'right' || v === 'coloured' ? 'oklch(0.78 0.15 155)' : v === 'wrong' ? 'oklch(0.7 0.17 30)' : 'oklch(0.82 0.14 85)';
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
