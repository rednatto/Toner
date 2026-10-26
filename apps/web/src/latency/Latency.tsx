import { useEffect, useRef, useState } from 'react';
import { resumeAudio } from '../audio/context';
import { openMic, type MicInput } from '../audio/mic';
import { clickBuffer, playBuffer } from '../audio/synth';
import { useSettings } from '../settings';
import { matchOnsets, summarize, verdict, type Match } from './measure';

const CLICKS = 12;
const SPACING = 0.5;

export function Latency() {
  const { settings, set } = useSettings();
  const [sensitivity, setSensitivity] = useState(0.15);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [matches, setMatches] = useState<Match[]>([]);
  const [missed, setMissed] = useState(0);
  const [level, setLevel] = useState(0);
  const [info, setInfo] = useState<{ sampleRate: number; base: number; output: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mic = useRef<MicInput | null>(null);

  useEffect(() => () => mic.current?.stop(), []);

  async function run() {
    setError(null);
    setMatches([]);
    setPhase('running');
    const onsets: number[] = [];
    try {
      const ctx = await resumeAudio();
      mic.current?.stop();
      mic.current = await openMic(
        (m) => {
          if (m.type === 'onset') onsets.push(m.time);
          if (m.type === 'pitch') setLevel(m.level);
        },
        { onsetLevel: sensitivity, onsetHoldoff: 0.2 },
      );
      // Let the mic settle, then play a train of loud clicks at known times.
      const start = ctx.currentTime + 0.8;
      const scheduled = Array.from({ length: CLICKS }, (_, i) => start + i * SPACING);
      const buf = clickBuffer(ctx, 2000, 1);
      scheduled.forEach((t) => playBuffer(ctx, buf, t));
      setInfo({ sampleRate: ctx.sampleRate, base: ctx.baseLatency || 0, output: ctx.outputLatency || 0 });
      await new Promise((r) => setTimeout(r, (start - ctx.currentTime + CLICKS * SPACING + 0.5) * 1000));
      const m = matchOnsets(scheduled, onsets);
      setMatches(m);
      setMissed(CLICKS - m.length);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('idle');
    } finally {
      mic.current?.stop();
      mic.current = null;
    }
  }

  const summary = summarize(matches.map((m) => m.latency));

  return (
    <section className="page latency">
      <h2>Round-trip latency test</h2>
      <p>
        Toner plays {CLICKS} clicks through the speaker and listens for them with the microphone. The delay between when a click was scheduled and when the mic heard it is
        everything the play-along guide will have to compensate for: output buffer, speaker, air, mic and input buffer.
      </p>
      <ul className="hint">
        <li>Use the device speaker, or hold headphones right against the mic. Bluetooth will add 100 ms or more.</li>
        <li>Turn the volume up and keep the room quiet.</li>
        <li>Run the same test later in the native wrapper to compare.</li>
      </ul>
      <div className="controls">
        <label>
          Sensitivity
          <input type="range" min={0.02} max={0.6} step={0.01} value={sensitivity} onChange={(e) => setSensitivity(Number(e.target.value))} />
        </label>
        <span className="hint">Onset level {sensitivity.toFixed(2)}; lower hears quieter clicks but also more noise.</span>
      </div>
      <div className="actions">
        <button className="primary" disabled={phase === 'running'} onClick={() => void run()}>
          {phase === 'running' ? 'Listening…' : phase === 'done' ? 'Run again' : 'Start test'}
        </button>
        {phase === 'running' && (
          <div className="level wide" aria-label="Input level">
            <span style={{ width: `${Math.min(100, Math.sqrt(level) * 200)}%` }} />
          </div>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {phase === 'done' && !summary && <p className="error">No clicks were heard. Turn the volume up or lower the sensitivity.</p>}
      {summary && (
        <div className="result">
          <div className="big">{(summary.median * 1000).toFixed(1)} ms</div>
          <p>{verdict(summary.median * 1000, summary.iqr * 1000)}</p>
          <div className="actions">
            <button className="primary" onClick={() => set({ latencyMs: Math.round(summary.median * 10000) / 10 })} disabled={Math.abs(settings.latencyMs - summary.median * 1000) < 0.05}>
              {Math.abs(settings.latencyMs - summary.median * 1000) < 0.05 ? 'Saved for this device' : 'Save for this device'}
            </button>
            {settings.latencyMs > 0 && <span className="hint">Saved: {settings.latencyMs.toFixed(1)} ms. Play-along timing will subtract it.</span>}
          </div>
          <table>
            <tbody>
              <tr>
                <th>Clicks heard</th>
                <td>
                  {summary.count} of {CLICKS}
                  {missed > 0 ? ` (${missed} missed)` : ''}
                </td>
              </tr>
              <tr>
                <th>Range</th>
                <td>
                  {(summary.min * 1000).toFixed(1)} to {(summary.max * 1000).toFixed(1)} ms, middle half within {(summary.iqr * 1000).toFixed(1)} ms
                </td>
              </tr>
              {info && (
                <>
                  <tr>
                    <th>Browser reports</th>
                    <td>
                      output {(info.output * 1000).toFixed(1)} ms, base {(info.base * 1000).toFixed(1)} ms at {info.sampleRate} Hz
                    </td>
                  </tr>
                  <tr>
                    <th>Device</th>
                    <td className="muted">{navigator.userAgent}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
