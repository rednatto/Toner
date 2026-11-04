import { useMemo, useState } from 'react';
import {
  analyzeChord,
  degreeChord,
  EMBELLISHMENTS,
  has,
  keySet,
  melodise,
  melodyModel,
  mod12,
  pitchClass,
  PROGRESSIONS,
  type EmbellishmentId,
  type Key,
  type MelodiseOptions,
  type Pitch,
} from '@toner/theory';
import { useSettings } from '../settings';
import { ChordMini } from './ChordMini';
import { DecoFrame, FN_TINT, GOLD, NumLetter } from './deco';
import { useLabels } from './labels';
import { chordNotes, usePlayer, type PlayNote } from './player';

const BEATS = 4;
const BPM = 112;
const CHOICES = PROGRESSIONS.filter((p) => p.degrees.length <= 8);
const EMB_LABEL: Record<EmbellishmentId, string> = { '7': 'the 7', '9': 'ninth', '11': 'eleventh', '13': 'thirteenth' };

export function MelodyPuzzle() {
  const { settings, colours } = useSettings();
  const [progId, setProgId] = useState('axis');
  const prog = CHOICES.find((p) => p.id === progId) ?? CHOICES[0]!;
  const L = useLabels(prog.mode);
  const [allowed, setAllowed] = useState<EmbellishmentId[]>(['7', '9']);
  const [hints, setHints] = useState(true);
  const [ghost, setGhost] = useState(false);
  const [seed, setSeed] = useState(1);
  const [line, setLine] = useState<Record<number, Pitch>>({});
  const [focus, setFocus] = useState(0);
  const player = usePlayer(BPM, settings.a4);

  const key: Key = { home: settings.home, mode: prog.mode };
  const chords = useMemo(() => prog.degrees.map((d) => ({ chord: degreeChord(d, settings.home), beats: BEATS })), [prog, settings.home]);
  const opts: MelodiseOptions = { key, chords, allowed };
  const model = useMemo(() => melodyModel(opts), [chords, allowed.join(), key.mode]);
  const solver = useMemo(() => melodise({ ...opts, seed }), [chords, allowed.join(), key.mode, seed]);
  const { slots, range } = model;
  const n = slots.length;
  const mineLine = slots.map((_, k) => line[k] ?? null);
  const judged = model.judge(mineLine);
  const complete = judged.filled === n;
  const gap = solver.judgement.total - judged.total;
  const stars = !complete ? 0 : gap <= 0 ? 3 : gap <= 4 ? 2 : 1;

  const reset = () => {
    setLine({});
    setGhost(false);
    player.stop();
  };
  const toggleEmb = (id: EmbellishmentId) => setAllowed((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id].sort()));
  const place = (k: number, p: Pitch) => {
    setLine((l) => {
      const next = { ...l };
      if (next[k] === p) delete next[k];
      else next[k] = p;
      return next;
    });
    setFocus(slots[k]!.chordIndex);
  };
  const finish = () => {
    const r = melodise({ ...opts, seed, pins: line });
    setLine(Object.fromEntries(r.pitches.map((p, k) => [k, p])));
  };
  const play = (pitches: (Pitch | null)[]) => {
    const evs: PlayNote[] = [];
    chords.forEach((c, i) => evs.push(...chordNotes(c.chord, i * BEATS, BEATS)));
    pitches.forEach((p, k) => {
      if (p !== null) evs.push({ start: k, duration: 0.9, pitch: p, level: 0.24 });
    });
    player.play(evs);
  };

  // Layout
  const x0 = 64;
  const bw = chords.length <= 4 ? 34 : 24;
  const cw = bw * BEATS;
  const W = x0 + cw * chords.length + 16;
  const headY = 20;
  const top = 132;
  const rowH = 13;
  const [lo, hi] = range;
  const rows = hi - lo + 1;
  const bot = top + rowH * (rows - 1);
  const H = bot + 30;
  const yOf = (p: Pitch) => bot - (p - lo) * rowH;
  const xOf = (k: number) => x0 + bw * k + bw / 2;
  const playX = player.beat !== null ? x0 + Math.min(player.beat, n) * bw : null;
  const ks = keySet(key);
  const inKey = (p: Pitch) => has(ks, pitchClass(p));
  const used = new Set(model.chordInfo.flatMap((c) => c.core));
  const labelled = (p: Pitch) => inKey(p) || used.has(pitchClass(p));
  const focusInfo = model.chordInfo[focus]!;
  const focusChord = chords[focus]!.chord;

  return (
    <div className="puzzle">
      <div className="controls">
        <label>
          Chords
          <select value={progId} onChange={(e) => { setProgId(e.target.value); setFocus(0); reset(); }}>
            {CHOICES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="emb-picks" role="group" aria-label="Embellish with">
          <span className="hint">Embellish with</span>
          {EMBELLISHMENTS.map((e) => (
            <button key={e.id} className="chip-btn" aria-pressed={allowed.includes(e.id)} onClick={() => toggleEmb(e.id)}>
              {EMB_LABEL[e.id]}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={hints} onChange={(e) => setHints(e.target.checked)} /> Show where notes fit
        </label>
      </div>
      <p className="hint">Write one note a beat. Tap a row to place a note, tap it again to take it away. Solid lanes are chord notes, gold dashes the embellishments you allowed, red dashes the ones that rub.</p>

      <div className="board-wrap">
        <svg className="board" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="group" aria-label="Melody board">
          <rect width={W} height={H} rx={10} fill="var(--stage)" />
          <DecoFrame w={W} h={H} />
          {/* chord headers */}
          {chords.map((c, i) => {
            const x = x0 + cw * i;
            const fn = analyzeChord(c.chord, key).function;
            const marks = model.chordInfo[i]!.colours.map((f) => ({ pc: f.pc, kind: f.rub ? ('rub' as const) : ('colour' as const) }));
            return (
              <g key={'h' + i} onClick={() => setFocus(i)} className="cell">
                <rect x={x + 2} y={headY - 8} width={cw - 4} height={top - headY - 4} rx={6} fill={FN_TINT[fn]} fillOpacity={focus === i ? 0.4 : 0.18} />
                <g transform={`translate(${x + cw / 2 - 28} ${headY - 2})`}>
                  <ChordMini chord={c.chord} size={56} mode={key.mode} marks={marks} />
                </g>
                <text x={x + cw / 2} y={headY + 74} textAnchor="middle" className="row-label">
                  {L.chordNum(c.chord)}
                </text>
                <text x={x + cw / 2} y={headY + 88} textAnchor="middle" className="row-fn">
                  {L.chordLetter(c.chord)}
                </text>
              </g>
            );
          })}
          {/* pitch rows */}
          {Array.from({ length: rows }, (_, i) => {
            const p = lo + i;
            const pc = pitchClass(p);
            const home = pc === mod12(settings.home);
            const y = yOf(p);
            return (
              <g key={'p' + p} pointerEvents="none">
                <line x1={x0} x2={x0 + cw * chords.length} y1={y} y2={y} stroke={home ? GOLD : 'var(--line)'} strokeOpacity={home ? 0.45 : inKey(p) ? 0.35 : 0.12} strokeWidth={home ? 0.9 : 0.5} />
                {labelled(p) && <NumLetter x={x0 - 10} y={y + 3.5} num={L.num(pc)} letter={L.letter(pc)} size={9.5} anchor="end" fill={home ? GOLD : 'var(--muted)'} />}
              </g>
            );
          })}
          {/* lanes: where the melody may land under each chord */}
          {hints &&
            chords.map((_, i) => {
              const info = model.chordInfo[i]!;
              const xa = x0 + cw * i + 3;
              const xb = x0 + cw * (i + 1) - 3;
              return Array.from({ length: rows }, (_, r) => {
                const p = lo + r;
                const pc = pitchClass(p);
                if (info.core.includes(pc)) return <line key={`b${i}-${p}`} x1={xa} x2={xb} y1={yOf(p)} y2={yOf(p)} stroke={colours.pc(pc, settings.home)} strokeOpacity={0.35} strokeWidth={3} strokeLinecap="round" pointerEvents="none" />;
                const col = info.colours.find((f) => f.pc === pc);
                if (col) return <line key={`b${i}-${p}`} x1={xa} x2={xb} y1={yOf(p)} y2={yOf(p)} stroke={col.rub ? 'var(--bad)' : GOLD} strokeOpacity={0.45} strokeWidth={1} strokeDasharray="3 3" pointerEvents="none" />;
                return null;
              });
            })}
          {/* bar and beat rules */}
          {Array.from({ length: n + 1 }, (_, k) => (
            <line key={'v' + k} x1={x0 + bw * k} x2={x0 + bw * k} y1={top - 6} y2={bot + 6} stroke={GOLD} strokeOpacity={k % BEATS === 0 ? 0.3 : 0.06} strokeWidth={0.7} pointerEvents="none" />
          ))}
          {/* tap targets */}
          {slots.map((_, k) =>
            Array.from({ length: rows }, (_, r) => {
              const p = lo + r;
              return <rect key={`t${k}-${p}`} x={x0 + bw * k} y={yOf(p) - rowH / 2} width={bw} height={rowH} fill="transparent" className="cell" onClick={() => place(k, p)} aria-label={`Beat ${k + 1}: ${L.num(pitchClass(p))} ${L.letter(pitchClass(p))}`} />;
            }),
          )}
          {/* the solver's line, faint */}
          {ghost && (
            <g pointerEvents="none">
              <polyline points={solver.pitches.map((p, k) => `${xOf(k)},${yOf(p)}`).join(' ')} fill="none" stroke={GOLD} strokeOpacity={0.45} strokeDasharray="2 3" strokeWidth={1} />
              {solver.pitches.map((p, k) => (
                <circle key={k} cx={xOf(k)} cy={yOf(p)} r={2.5} fill="none" stroke={GOLD} strokeOpacity={0.6} strokeWidth={0.8} />
              ))}
            </g>
          )}
          {/* your line */}
          {mineLine.map((p, k) => {
            if (p === null || k === 0 || mineLine[k - 1] === null) return null;
            return <line key={'m' + k} x1={xOf(k - 1)} y1={yOf(mineLine[k - 1]!)} x2={xOf(k)} y2={yOf(p)} stroke={GOLD} strokeOpacity={0.75} strokeWidth={1.1} pointerEvents="none" />;
          })}
          {judged.notes.map((j, k) => {
            if (!j) return null;
            const x = xOf(k);
            const y = yOf(j.pitch);
            const c = colours.pc(pitchClass(j.pitch), settings.home);
            const on = player.beat !== null && Math.floor(player.beat) === k;
            const r = on ? 7 : 5.5;
            return (
              <g key={'j' + k} pointerEvents="none">
                {j.role === 'core' && <circle cx={x} cy={y} r={r} fill={c} />}
                {j.role === 'colour' && <path d={`M${x} ${y - r - 1}L${x + r * 0.8} ${y}L${x} ${y + r + 1}L${x - r * 0.8} ${y}Z`} fill={c} stroke={j.rub ? 'var(--bad)' : GOLD} strokeWidth={1.3} />}
                {j.role === 'passing' && <circle cx={x} cy={y} r={r - 1.5} fill="var(--stage)" stroke={c} strokeWidth={1.4} />}
                {j.role === 'outside' && (
                  <g stroke="var(--bad)" strokeWidth={1.4}>
                    <circle cx={x} cy={y} r={r - 1} fill="var(--stage)" />
                    <line x1={x - 3} y1={y - 3} x2={x + 3} y2={y + 3} />
                  </g>
                )}
              </g>
            );
          })}
          {playX !== null && <line x1={playX} x2={playX} y1={headY - 8} y2={bot + 8} stroke={GOLD} strokeOpacity={0.8} strokeWidth={1} pointerEvents="none" />}
        </svg>
      </div>

      <div className="stack-row">
        <span className="hint">Stack on {L.chord(focusChord)}:</span>
        {focusInfo.stack.map((f) => {
          const allowedHere = !!f.id && allowed.includes(f.id) && !f.core;
          return (
            <span key={f.floor} className={`floor ${f.core ? 'core' : allowedHere ? (f.rub ? 'rub' : 'colour') : 'off'}`} style={f.core ? { background: colours.pc(f.pc, settings.home) } : undefined} title={f.floor < 3 ? 'chord note' : f.core ? 'chord note' : `${EMB_LABEL[f.id!]}${f.rub ? ', rubs' : ''}`}>
              {L.num(f.pc)}
              <small>{L.letter(f.pc)}</small>
            </span>
          );
        })}
        <span className="hint">Keep stacking 3s and 4s: the chord at the bottom, embellishments on top, and seven floors spell the whole home scale.</span>
      </div>

      <ul className="goals">
        {judged.goals.map((g) => (
          <li key={g.id} className={g.met ? 'met' : ''}>
            {g.met ? '✓' : '○'} {g.label}
          </li>
        ))}
      </ul>
      <div className="scoreline" aria-live="polite">
        {complete ? (
          <>
            <span className="stars" aria-label={`${stars} of 3`}>{'★'.repeat(stars)}<i>{'★'.repeat(3 - stars)}</i></span>
            <span>
              Your line scores <b>{judged.total.toFixed(1)}</b>; the solver's scores <b>{solver.judgement.total.toFixed(1)}</b>.{' '}
              {stars === 3 ? 'You matched or beat it.' : 'Play both and listen for where they differ.'}
            </span>
          </>
        ) : (
          <span className="muted">
            {judged.filled} of {n} beats have a note.
          </span>
        )}
      </div>

      <div className="actions">
        <button className="primary" onClick={() => (player.playing ? player.stop() : play(mineLine))}>{player.playing ? 'Stop' : 'Play mine'}</button>
        <button onClick={() => play(solver.pitches)}>Play the solver's</button>
        <button onClick={() => setGhost((g) => !g)} aria-pressed={ghost}>{ghost ? 'Hide' : 'Show'} the solver's</button>
        <button onClick={() => setSeed((s) => s + 1)}>Another solver line</button>
        <button onClick={finish}>Finish it for me</button>
        <button onClick={reset}>Clear</button>
      </div>
      <details className="rules">
        <summary>How lines are scored</summary>
        <p>
          A chord note on the first beat of a chord scores most. Embellishments score best on the third beat and lightly on the others, and lose points when they rub. Other notes of the key are fine as passing notes on the off-beats if you reach and leave them by step. Small steps score, repeated notes and wide jumps cost, and the last note should be 0. "Finish it for me" keeps your notes and writes the rest around them.
        </p>
      </details>
    </div>
  );
}
