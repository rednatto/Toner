import { useMemo, useState } from 'react';
import {
  analyzeChord,
  chord,
  diatonicPalette,
  FUNCTION_INFO,
  harmonise,
  harmonyModel,
  noteFit,
  pitchClass,
  type Chord,
  type HarmoniseOptions,
  type Key,
} from '@toner/theory';
import { useSettings } from '../settings';
import { ChordMini } from './ChordMini';
import { Chevron, Curl, DecoFrame, FN_TINT, GOLD, NumLetter } from './deco';
import { useLabels } from './labels';
import { MELODIES, melodyNotes } from './melodies';
import { chordNotes, usePlayer, type PlayNote } from './player';

/** The key's own chords, plus (when asked) the 7⟨4 3 3⟩ on 7 and two chords borrowed from the other side of home. */
function paletteFor(key: Key, more: boolean): Chord[] {
  const base = diatonicPalette(key);
  if (!more) return base;
  const h = key.home;
  const extra = key.mode === 'major' ? [chord(h + 7, 'dom7'), chord(h + 10, 'maj'), chord(h + 5, 'min')] : [chord(h + 7, 'dom7'), chord(h + 5, 'maj')];
  return [...base.filter((c) => !(c.root === extra[0]!.root && c.quality === 'maj' && key.mode === 'minor')), ...extra];
}

const BPM = 96;

export function HarmonisePuzzle() {
  const { settings, colours } = useSettings();
  const [melodyId, setMelodyId] = useState(MELODIES[0]!.id);
  const melody = MELODIES.find((m) => m.id === melodyId)!;
  const L = useLabels(melody.mode);
  const [half, setHalf] = useState(true);
  const [more, setMore] = useState(false);
  const [hints, setHints] = useState(true);
  const [reveal, setReveal] = useState(false);
  const [choice, setChoice] = useState<Record<number, number>>({});
  const [focus, setFocus] = useState<number | null>(null);
  const [hinted, setHinted] = useState<number | null>(null);
  const player = usePlayer(BPM, settings.a4);

  const key: Key = { home: settings.home, mode: melody.mode };
  const span = half && melody.beatsPerBar % 2 === 0 ? melody.beatsPerBar / 2 : melody.beatsPerBar;
  const notes = useMemo(() => melodyNotes(melody, settings.home), [melody, settings.home]);
  const palette = useMemo(() => paletteFor(key, more), [key.home, key.mode, more]);
  const opts: HarmoniseOptions = { key, span, offset: melody.pickup, palette };
  const model = useMemo(() => harmonyModel(notes, opts), [notes, palette, span, melody.pickup]);
  const best = useMemo(() => harmonise(notes, opts), [notes, palette, span, melody.pickup]);
  const spans = model.spans;
  const n = spans.length;
  const chosen = spans.map((_, g) => choice[g]);
  const complete = chosen.every((c) => c !== undefined);
  const mine = complete ? model.score(chosen as number[]) : null;
  const gap = mine ? best.score.total - mine.total : null;
  const stars = gap === null ? 0 : gap <= 0.25 ? 3 : gap <= 2.5 ? 2 : 1;

  const reset = () => {
    setChoice({});
    setFocus(null);
    setHinted(null);
    setReveal(false);
    player.stop();
  };

  const pick = (g: number, c: number) => {
    setChoice((ch) => {
      const next = { ...ch };
      if (next[g] === c) delete next[g];
      else next[g] = c;
      return next;
    });
    setFocus(g);
    setHinted(null);
  };

  const hint = () => {
    // The stretch where your route loses most against the best route through it.
    let worst = -1;
    let loss = -Infinity;
    spans.forEach((_, g) => {
      const c = chosen[g];
      const l = c === undefined ? 1e6 - g : best.through[g]![best.path[g]!]! - best.through[g]![c]!;
      if (c !== best.path[g] && l > loss) {
        loss = l;
        worst = g;
      }
    });
    setHinted(worst >= 0 ? worst : null);
    if (worst >= 0) setFocus(worst);
  };

  const finish = () => {
    const pins: Record<number, number> = {};
    spans.forEach((_, g) => {
      if (chosen[g] !== undefined) pins[g] = chosen[g]!;
    });
    const r = harmonise(notes, { ...opts, pins });
    setChoice(Object.fromEntries(r.path.map((c, g) => [g, c])));
    setHinted(null);
  };

  const play = (route: (number | undefined)[]) => {
    const evs: PlayNote[] = notes.map((m) => ({ ...m }));
    spans.forEach((s, g) => {
      const c = route[g];
      if (c !== undefined) evs.push(...chordNotes(palette[c]!, Math.max(0, s.start), s.end - Math.max(0, s.start)));
    });
    player.play(evs);
  };

  // Layout
  const x0 = 168;
  const cw = Math.max(66, Math.max(...spans.map((s) => s.notes.length)) * 15 + 14);
  const W = x0 + cw * n + 16;
  const melTop = 34;
  const melH = 70;
  const gy = melTop + melH + 26;
  const rh = 30;
  const gridH = rh * palette.length;
  const miniY = gy + gridH + 44;
  const H = miniY + 60;
  const pitches = notes.map((m) => m.pitch);
  const pLo = Math.min(...pitches);
  const pHi = Math.max(...pitches);
  const py = (p: number) => melTop + melH - 8 - ((p - pLo) / Math.max(1, pHi - pLo)) * (melH - 22);
  const spanX = (g: number) => x0 + cw * g;
  const beatX = (b: number) => {
    const g = Math.max(0, spans.findIndex((s) => b >= s.start - 1e-9 && b < s.end - 1e-9));
    const s = spans[g] ?? spans[n - 1]!;
    return spanX(g) + 6 + ((b - s.start) / (s.end - s.start)) * (cw - 12);
  };
  const ry = (c: number) => gy + rh * c + rh / 2;
  const playX = player.beat !== null ? beatX(Math.min(player.beat, spans[n - 1]!.end - 0.01)) : null;

  const explain = (g: number) => {
    const c = chosen[g];
    if (c === undefined) return null;
    const ch = palette[c]!;
    const info = model.info[c]!;
    const step = mine?.steps[g] ?? model.score(spans.map((_, k) => (k === g ? c : (chosen[k] ?? c)))).steps[g]!;
    // One phrase per distinct note, the strong one first.
    const seen = new Set<number>();
    const parts = [...spans[g]!.notes]
      .sort((a, b) => Number(b.strong) - Number(a.strong))
      .filter((m) => !seen.has(pitchClass(m.pitch)) && !!seen.add(pitchClass(m.pitch)))
      .map((m) => {
        const pc = pitchClass(m.pitch);
        const f = noteFit(pc, info.pcs);
        const nm = `${L.num(pc)} ${L.letter(pc)}`;
        return f === 'chord' ? `${nm} is in the chord${m.strong ? ' on the strong beat' : ''}` : f === 'rub' ? `${nm} rubs, one fret from a chord note` : `${nm} passes through`;
      });
    const prev = g > 0 ? chosen[g - 1] : undefined;
    const flow = prev !== undefined && prev !== c ? `${FUNCTION_INFO[model.info[prev]!.fn].name} → ${FUNCTION_INFO[info.fn].name}, hands move ${step.motion}` : prev === c ? 'same chord again' : null;
    return { title: `${L.chord(ch)} · ${FUNCTION_INFO[info.fn].name}`, text: [...parts, ...(flow ? [flow] : [])].join(' · '), points: step.fit + step.shape + step.move };
  };
  const ex = focus !== null ? explain(focus) : null;

  return (
    <div className="puzzle">
      <div className="controls">
        <label>
          Melody
          <select value={melodyId} onChange={(e) => { setMelodyId(e.target.value); reset(); }}>
            {MELODIES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        {melody.beatsPerBar % 2 === 0 && (
          <div className="seg small" role="group" aria-label="Chord every">
            <button aria-pressed={half} onClick={() => { setHalf(true); reset(); }}>Chord every half bar</button>
            <button aria-pressed={!half} onClick={() => { setHalf(false); reset(); }}>Every bar</button>
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={more} onChange={(e) => { setMore(e.target.checked); reset(); }} /> More chords
        </label>
        <label className="check">
          <input type="checkbox" checked={hints} onChange={(e) => setHints(e.target.checked)} /> Show how notes fit
        </label>
      </div>
      <p className="hint">{melody.about} Tap a cell to put that chord under that stretch of tune.</p>

      <div className="board-wrap">
        <svg className="board" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="group" aria-label="Harmonising board">
          <rect width={W} height={H} rx={10} fill="var(--stage)" />
          <DecoFrame w={W} h={H} />
          {/* melody */}
          <text x={x0 - 14} y={melTop + melH / 2} textAnchor="end" className="board-label">tune</text>
          {notes.map((m, k) => {
            if (k === 0) return null;
            const a = notes[k - 1]!;
            return <line key={'l' + k} x1={beatX(a.start)} y1={py(a.pitch)} x2={beatX(m.start)} y2={py(m.pitch)} stroke={GOLD} strokeOpacity={0.3} strokeWidth={0.8} />;
          })}
          {notes.map((m, k) => {
            const pc = pitchClass(m.pitch);
            const on = player.beat !== null && player.beat >= m.start && player.beat < m.start + m.duration;
            return (
              <g key={'n' + k}>
                <circle cx={beatX(m.start)} cy={py(m.pitch)} r={on ? 5.5 : 3.8} fill={colours.pc(pc, settings.home)} />
                {(k === 0 || notes[k - 1]!.pitch !== m.pitch) && <NumLetter x={beatX(m.start)} y={py(m.pitch) - 8} num={L.num(pc)} letter={L.letter(pc)} size={9} fill="var(--muted)" />}
              </g>
            );
          })}
          {/* column rules */}
          {spans.map((_, g) => (
            <line key={'v' + g} x1={spanX(g)} x2={spanX(g)} y1={melTop} y2={gy + gridH} stroke={GOLD} strokeOpacity={g % 2 ? 0.08 : 0.16} strokeWidth={0.7} />
          ))}
          {/* chord rows */}
          {palette.map((ch, c) => {
            const info = model.info[c]!;
            return (
              <g key={'r' + c}>
                <rect x={14} y={ry(c) - rh / 2 + 3} width={x0 - 24} height={rh - 6} rx={5} fill={FN_TINT[info.fn]} fillOpacity={0.45} />
                <text x={24} y={ry(c) + 4} className="row-label">
                  {L.chordNum(ch)}
                  <tspan fontSize="0.78em" fillOpacity={0.7} dx={5}>{L.chordLetter(ch)}</tspan>
                </text>
                <text x={x0 - 16} y={ry(c) + 4} textAnchor="end" className="row-fn">{FUNCTION_INFO[info.fn].name}</text>
              </g>
            );
          })}
          {/* cells */}
          {spans.map((s, g) =>
            palette.map((ch, c) => {
              const mineHere = chosen[g] === c;
              const bestHere = best.path[g] === c;
              const near = reveal && !bestHere && best.score.total - best.through[g]![c]! < 1.6;
              const isHint = hinted === g && bestHere;
              const info = model.info[c]!;
              const showDots = hints || mineHere;
              return (
                <g key={`c${g}-${c}`} onClick={() => pick(g, c)} className="cell" role="button" aria-pressed={mineHere} aria-label={`Stretch ${g + 1}: ${L.chord(ch)}`}>
                  <rect
                    x={spanX(g) + 2}
                    y={ry(c) - rh / 2 + 2}
                    width={cw - 4}
                    height={rh - 4}
                    rx={5}
                    fill={mineHere ? FN_TINT[info.fn] : near ? GOLD : 'oklch(0.3 0.02 270)'}
                    fillOpacity={mineHere ? 0.9 : near ? 0.14 : 0.28}
                    stroke={isHint ? GOLD : mineHere ? GOLD : 'none'}
                    strokeOpacity={isHint ? 1 : 0.7}
                    strokeWidth={isHint ? 1.6 : 1}
                    strokeDasharray={isHint ? '3 3' : undefined}
                    className={isHint ? 'pulse-cell' : undefined}
                  />
                  {showDots &&
                    s.notes.map((m, j) => {
                      const f = noteFit(pitchClass(m.pitch), info.pcs);
                      const x = beatX(m.start);
                      const op = mineHere ? 1 : f === 'chord' ? 0.55 : 0.35;
                      return f === 'chord' ? (
                        <circle key={j} cx={x} cy={ry(c)} r={m.strong ? 4 : 3} fill={colours.pc(pitchClass(m.pitch), settings.home)} opacity={op} pointerEvents="none" />
                      ) : (
                        <circle key={j} cx={x} cy={ry(c)} r={2.8} fill="none" stroke={f === 'rub' ? 'var(--bad)' : 'var(--muted)'} strokeWidth={f === 'rub' ? 1.1 : 0.8} opacity={op} pointerEvents="none" />
                      );
                    })}
                </g>
              );
            }),
          )}
          {/* your route as a gold thread, chevrons where it changes */}
          {chosen.map((c, g) => {
            if (c === undefined) return null;
            const out = [<line key={'h' + g} x1={spanX(g) + 8} x2={spanX(g) + cw - 8} y1={ry(c)} y2={ry(c)} stroke={GOLD} strokeWidth={1.2} strokeOpacity={0.9} pointerEvents="none" />];
            const nx = chosen[g + 1];
            if (nx !== undefined) {
              const xa = spanX(g) + cw - 8;
              const xb = spanX(g + 1) + 8;
              out.push(<line key={'j' + g} x1={xa} y1={ry(c)} x2={xb} y2={ry(nx)} stroke={GOLD} strokeWidth={1.2} strokeOpacity={0.9} pointerEvents="none" />);
              if (nx !== c) out.push(<Chevron key={'v' + g} x={(xa + xb) / 2} y={(ry(c) + ry(nx)) / 2} dx={xb - xa} dy={ry(nx) - ry(c)} size={4} />);
            }
            if (g === 0) out.push(<Curl key="curl" x={spanX(0) + 8} y={ry(c)} r={5} />);
            return <g key={'route' + g}>{out}</g>;
          })}
          {/* the solver's route */}
          {reveal &&
            best.path.map((c, g) => (
              <g key={'b' + g} pointerEvents="none">
                <line x1={spanX(g) + 6} x2={spanX(g) + cw - 6} y1={ry(c) + 9} y2={ry(c) + 9} stroke={GOLD} strokeOpacity={0.75} strokeDasharray="2 3" strokeWidth={1} />
                {g + 1 < n && <line x1={spanX(g) + cw - 6} x2={spanX(g + 1) + 6} y1={ry(c) + 9} y2={ry(best.path[g + 1]!) + 9} stroke={GOLD} strokeOpacity={0.75} strokeDasharray="2 3" strokeWidth={1} />}
              </g>
            ))}
          {/* minis: your chord under each stretch, with the tune's notes on its rim */}
          <text x={x0 - 14} y={miniY + 4} textAnchor="end" className="board-label">your chords</text>
          {spans.map((s, g) => {
            const c = chosen[g];
            if (c === undefined) return <circle key={'m' + g} cx={spanX(g) + cw / 2} cy={miniY} r={14} fill="none" stroke={GOLD} strokeOpacity={0.15} strokeDasharray="2 3" />;
            const ch = palette[c]!;
            return (
              <g key={'m' + g} transform={`translate(${spanX(g) + cw / 2 - 22} ${miniY - 22})`} onClick={() => setFocus(g)} className="cell">
                <ChordMini chord={ch} size={44} mode={key.mode} fn={analyzeChord(ch, key).function} marks={s.notes.map((m) => ({ pc: pitchClass(m.pitch), kind: 'melody' as const }))} />
              </g>
            );
          })}
          {playX !== null && <line x1={playX} x2={playX} y1={melTop - 6} y2={gy + gridH} stroke={GOLD} strokeOpacity={0.8} strokeWidth={1} pointerEvents="none" />}
        </svg>
      </div>

      <div className="scoreline" aria-live="polite">
        {complete && mine ? (
          <>
            <span className="stars" aria-label={`${stars} of 3`}>{'★'.repeat(stars)}<i>{'★'.repeat(3 - stars)}</i></span>
            <span>
              Your chords score <b>{mine.total.toFixed(1)}</b>, the best route scores <b>{best.score.total.toFixed(1)}</b>.{' '}
              {stars === 3 ? 'As good as it gets with these rules.' : stars === 2 ? 'Close. Try a hint, or play both and compare.' : 'Some stretches fight the tune. A hint points at the worst one.'}
            </span>
          </>
        ) : (
          <span className="muted">
            {Object.keys(choice).length} of {n} stretches have a chord. Best possible score: {reveal ? best.score.total.toFixed(1) : '?'}
          </span>
        )}
      </div>
      {ex && (
        <p className="explain">
          <b>Stretch {focus! + 1}: {ex.title}</b> ({ex.points >= 0 ? '+' : ''}{ex.points.toFixed(1)}). {ex.text}.
        </p>
      )}
      {hinted !== null && !ex?.title.startsWith(L.chord(palette[best.path[hinted]!]!)) && <p className="explain">Hint: the dashed cell in stretch {hinted + 1} does better there.</p>}

      <div className="actions">
        <button className="primary" onClick={() => (player.playing ? player.stop() : play(chosen))}>{player.playing ? 'Stop' : 'Play mine'}</button>
        <button onClick={() => play(best.path)}>Play the best route</button>
        <button onClick={hint}>Hint</button>
        <button onClick={finish}>Finish it for me</button>
        <button onClick={() => setReveal((r) => !r)} aria-pressed={reveal}>{reveal ? 'Hide' : 'Show'} the best route</button>
        <button onClick={reset}>Clear</button>
      </div>
      <details className="rules">
        <summary>How routes are scored</summary>
        <p>
          A chord note under the first note of a stretch is worth the most, and long notes count more than short ones. A note one fret from a chord note rubs and costs points; other notes just pass through. Between stretches, small hand movement scores, and so does the usual pull home → away → tension → home, with an extra pull from the chord on 7 to the chord on 0. Starting and ending on the home chord scores too. "Finish it for me" keeps your chords and fills the rest with the best route around them.
        </p>
      </details>
    </div>
  );
}
