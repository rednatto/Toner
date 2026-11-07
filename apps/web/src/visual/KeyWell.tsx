/**
 * The key well, drawn. One component for every place a chord's notes are
 * shown against home: a miniature under a chord chart, a medium glyph beside
 * a chord diagram, and a large interactive one in the chord library.
 *
 * The semitone clock with home at the top. A note's distance from the centre
 * says how at home it is (see `wellTier`), doubled notes in a voicing get one
 * thin ring per extra copy, edges between chord notes are hairlines styled by
 * how far apart the notes are, and a note outside the key points to where it
 * leans. Every change of chord, layers or spacing glides: notes follow the
 * smallest voice leading, and when they change ring they swing a little
 * sideways so the move reads as a turn rather than a jump.
 *
 * Large and interactive: tap the centre to hear the chord, hold it to hear the
 * notes one by one, tap any point on the rings to hear that note.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import {
  intervalClass,
  mod12,
  relative,
  voiceLeading,
  wellAngle,
  wellCounts,
  wellLean,
  wellTier,
  WELL_RING_NAMES,
  type Mode,
  type Pitch,
  type PitchClass,
  type WellLayers,
} from '@toner/theory';
import { resumeAudio } from '../audio/context';
import { pluck } from '../audio/synth';
import { useSettings } from '../settings';

export const WELL_RINGS: Record<WellLayers, number[]> = { 1: [130], 2: [86, 140], 3: [66, 104, 142], 4: [56, 90, 120, 148] };
const RIM = 160;
const TWEEN_MS = 800;

/** Edge style by interval class: muted colours, hairlines. */
const EDGE: Record<number, { colour: string; name: string }> = {
  1: { colour: 'oklch(0.66 0.12 25)', name: 'a semitone: clash' },
  2: { colour: 'oklch(0.8 0.07 100)', name: 'a whole step' },
  3: { colour: 'oklch(0.71 0.08 310)', name: 'a minor third' },
  4: { colour: 'oklch(0.75 0.08 55)', name: 'a major third' },
  5: { colour: 'oklch(0.71 0.08 235)', name: 'a fifth or fourth' },
  6: { colour: 'oklch(0.62 0.13 20)', name: 'a tritone' },
};

type Level = 'mini' | 'medium' | 'large';
export interface WellMark {
  pc: PitchClass;
  kind: 'melody' | 'colour' | 'rub';
}
interface NoteG {
  pc: PitchClass;
  r: number;
  a: number;
  count: number;
}
interface Geometry {
  rings: number[];
  ringOp: number[];
  /** Angle and radius of each step above home's own place. */
  spokeA: number[];
  spokeR: number[];
  notes: NoteG[];
}

const toXY = (r: number, a: number): [number, number] => [r * Math.sin((a * Math.PI) / 180), -r * Math.cos((a * Math.PI) / 180)];
const f1 = (x: number) => Math.round(x * 10) / 10;
const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const shortest = (a0: number, a1: number) => {
  let d = (a1 - a0) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
};
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function geometry(pcs: PitchClass[], counts: Map<PitchClass, number>, key: { home: PitchClass; mode: Mode }, layers: WellLayers, spacing: number): Geometry {
  const R = WELL_RINGS[layers];
  const rOf = (pc: PitchClass) => R[wellTier(pc, key, layers)]!;
  const spokeA = Array.from({ length: 12 }, (_, i) => wellAngle(mod12(key.home + i), key, spacing));
  const spokeR = Array.from({ length: 12 }, (_, i) => rOf(mod12(key.home + i)));
  const notes = [...new Set(pcs.map(mod12))]
    .sort((a, b) => relative(a, key.home) - relative(b, key.home))
    .map((pc) => ({ pc, r: rOf(pc), a: spokeA[relative(pc, key.home)]!, count: Math.max(1, counts.get(pc) ?? 1) }));
  return { rings: [...R, ...Array(4 - R.length).fill(R[R.length - 1])], ringOp: [0, 1, 2, 3].map((i) => (i < R.length ? 1 : 0)), spokeA, spokeR, notes };
}

/** Blend two geometries. Chord notes follow the smallest voice leading from the old chord. */
function blend(from: Geometry, to: Geometry, e: number): Geometry {
  const mix = (a: number, b: number) => a + (b - a) * e;
  const vl = voiceLeading(
    from.notes.map((n) => n.pc),
    to.notes.map((n) => n.pc),
  );
  const notes = to.notes.map((n) => {
    const src = from.notes.find((m) => m.pc === (vl.moves.find((mv) => mv.to === n.pc)?.from ?? -1));
    if (!src) return { ...n, r: n.r * ease(e), count: n.count };
    const swing = src.pc === n.pc ? (22 * Math.sin(Math.PI * e) * (n.r - src.r)) / 80 : 0;
    return { pc: n.pc, r: mix(src.r, n.r), a: src.a + shortest(src.a, n.a) * e + swing, count: n.count };
  });
  return {
    rings: to.rings.map((r, i) => mix(from.rings[i]!, r)),
    ringOp: to.ringOp.map((o, i) => mix(from.ringOp[i]!, o)),
    spokeA: to.spokeA.map((a, i) => mix(from.spokeA[i]!, a)),
    spokeR: to.spokeR.map((r, i) => mix(from.spokeR[i]!, r)),
    notes,
  };
}

/** The geometry to draw this frame: glides from whatever was on screen to the new target. */
function useGlide(target: Geometry, signature: string): Geometry {
  const shown = useRef<Geometry>(target);
  const anim = useRef<{ from: Geometry; to: Geometry; t0: number; sig: string }>({ from: target, to: target, t0: -1e9, sig: signature });
  const [, tick] = useState(0);
  if (anim.current.sig !== signature) anim.current = { from: shown.current, to: target, t0: performance.now(), sig: signature };
  const e = reducedMotion() ? 1 : ease((performance.now() - anim.current.t0) / TWEEN_MS);
  const g = e >= 1 ? anim.current.to : blend(anim.current.from, anim.current.to, e);
  shown.current = g;
  useEffect(() => {
    if (e >= 1) return;
    const id = requestAnimationFrame(() => tick((n) => n + 1));
    return () => cancelAnimationFrame(id);
  });
  return g;
}

function Edge({ a, b, k, level }: { a: [number, number]; b: [number, number]; k: number; level: Level }) {
  const s = EDGE[k];
  if (!s) return null;
  const [x1, y1] = a;
  const [x2, y2] = b;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  const at = (u: number, o: number) => `${f1(x1 + dx * u + nx * o)} ${f1(y1 + dy * u + ny * o)}`;
  const w = level === 'mini' ? 2.4 : level === 'medium' ? 1.6 : 1;
  const common = { fill: 'none', stroke: s.colour, strokeWidth: w, strokeOpacity: 0.8 };
  const title = <title>{s.name}</title>;
  if (level === 'mini' || k === 2) return <path d={`M${at(0.1, 0)}L${at(0.9, 0)}`} {...common} strokeDasharray={k === 2 && level !== 'mini' ? `0.1 ${4 * w}` : undefined} strokeLinecap="round">{title}</path>;
  if (k === 5) return <path d={`M${at(0.1, -1.6 * w)}L${at(0.9, -1.6 * w)}M${at(0.1, 1.6 * w)}L${at(0.9, 1.6 * w)}`} {...common} strokeWidth={w * 0.9}>{title}</path>;
  if (k === 3 || k === 4) {
    const sg = k === 4 ? 1 : -1;
    const d = Array.from({ length: 37 }, (_, i) => {
      const u = 0.1 + (0.8 * i) / 36;
      return (i ? 'L' : 'M') + at(u, sg * 2.2 * w * Math.sin(((u - 0.1) / 0.8) * Math.PI * 3));
    }).join('');
    return <path d={d} {...common}>{title}</path>;
  }
  return <path d={`M${at(0.08, 0)}L${at(0.92, 0)}`} {...common} strokeDasharray={k === 6 ? `${5 * w} ${3 * w}` : undefined}>{title}</path>;
}

export function KeyWell({
  pcs,
  root,
  pitches,
  mode = 'major',
  size = 300,
  layers,
  spacing,
  interactive = false,
  label,
  marks = [],
}: {
  pcs: PitchClass[];
  root?: PitchClass;
  /** The voicing actually played, for doublings and for playback. */
  pitches?: readonly Pitch[];
  mode?: Mode;
  /** Width in CSS pixels; also picks the level of detail. */
  size?: number;
  /** Override the layers and spacing chosen in settings. */
  layers?: WellLayers;
  spacing?: number;
  /** Tap and hold to hear (large wells only). */
  interactive?: boolean;
  label?: string;
  /** Extra marks on the rim: a melody note (gold dot), an added colour tone such as a ninth (diamond), or a note that rubs against the chord (red ring). */
  marks?: readonly WellMark[];
}) {
  const { settings, names, also, colours } = useSettings();
  const home = settings.home;
  const key = { home, mode };
  const L = layers ?? settings.wellLayers;
  const w = spacing ?? settings.wellSpacing;
  const level: Level = size < 100 ? 'mini' : size < 220 ? 'medium' : 'large';
  const counts = useMemo(() => wellCounts(pitches ?? []), [pitches?.join(',')]);
  const members = [...new Set(pcs.map(mod12))];
  const target = useMemo(() => geometry(members, counts, key, L, w), [members.join(','), [...counts].join(';'), home, mode, L, w]);
  const g = useGlide(target, `${members.join(',')}|${[...counts].join(';')}|${home}|${mode}|${L}|${w}`);

  // playback
  const holdTimer = useRef<number | null>(null);
  const held = useRef(false);
  const chordPitches = (): number[] => (pitches && pitches.length ? [...pitches] : members.map((pc) => 60 + relative(pc, root ?? home) + (root ?? home)).map((p) => (p >= 72 ? p - 12 : p)).sort((a, b) => a - b));
  const play = async (ps: number[], gap: number, seconds = 2) => {
    const ctx = await resumeAudio();
    const t = ctx.currentTime + 0.02;
    ps.forEach((p, i) => pluck(ctx, p, settings.a4, t + i * gap, seconds, ctx.destination, 0.25));
  };
  /** A note on its own: every octave it sounds in the voicing, low to high, or near the voicing's middle when it isn't played. */
  const playNote = (pc: PitchClass) => {
    const copies = (pitches ?? []).filter((p) => mod12(p) === pc).sort((a, b) => a - b);
    if (copies.length) return void play(copies, 0.09, 1.8);
    const ps = chordPitches();
    const mid = ps.length ? (ps[0]! + ps[ps.length - 1]!) / 2 : 60;
    const near = pc + 12 * Math.round((mid - pc) / 12);
    void play([near], 0, 1.6);
  };
  const press = (e: PointerEvent) => {
    e.stopPropagation();
    held.current = false;
    holdTimer.current = window.setTimeout(() => {
      held.current = true;
      const ps = chordPitches();
      void play([...ps, ...ps.slice(0, -1).reverse()], 0.32, 1.2);
    }, 380);
  };
  const release = (e: PointerEvent) => {
    e.stopPropagation();
    if (holdTimer.current === null) return;
    window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
    if (!held.current) void play(chordPitches(), 0.035);
  };
  const cancel = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const big = level === 'large';
  const mini = level === 'mini';
  /** Notes and points can be tapped one by one on the larger sizes; a mini well is one button for the chord. */
  const tapNotes = interactive && !mini;
  const hearNote = (pc: PitchClass) => (e: MouseEvent) => {
    e.stopPropagation();
    playNote(pc);
  };
  const centreProps = {
    role: 'button',
    tabIndex: 0,
    'aria-label': 'Play the chord; hold to hear its notes one by one',
    onPointerDown: press,
    onPointerUp: release,
    onPointerLeave: cancel,
    onClick: (e: MouseEvent) => e.stopPropagation(),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        void play(chordPitches(), 0.035);
      }
    },
  } as const;
  const vb = mini ? 158 : 192;
  const pos = (n: { r: number; a: number }) => toXY(n.r, n.a);
  const notePos = new Map(g.notes.map((n) => [n.pc, pos(n)] as const));
  const ordered = g.notes.map((n) => n.pc);
  const pts = ordered.map((pc) => notePos.get(pc)!);
  const edges: [PitchClass, PitchClass][] = [];
  for (let i = 0; i < ordered.length; i++)
    for (let j = i + 1; j < ordered.length; j++) {
      const neighbours = j === i + 1 || (i === 0 && j === ordered.length - 1);
      const k = intervalClass(ordered[i]!, ordered[j]!);
      if (ordered.length > 4 && !neighbours && k !== 1 && k !== 6) continue;
      if (mini && !neighbours) continue;
      edges.push([ordered[i]!, ordered[j]!]);
    }
  const noteR = mini ? 25 : level === 'medium' ? 19 : 14.5;
  const labelSize = level === 'medium' ? 22 : 14;
  const aria = label ?? `${members.map((p) => names.pc(p)).join(' ')} against home ${names.pc(home)}`;

  return (
    <svg className={`key-well ${level}`} viewBox={`${-vb} ${-vb} ${2 * vb} ${2 * vb}`} width={size} height={size} role="img" aria-label={aria}>
      {/* rings, faint; the outermost of a layout is dashed */}
      {g.rings.map((r, i) =>
        g.ringOp[i]! > 0.01 ? (
          <circle key={i} r={f1(r)} fill="none" stroke={mini ? 'currentColor' : 'var(--accent)'} strokeOpacity={f1((mini ? (i === 0 ? 0.55 : 0.3) : i === 0 ? 0.42 : 0.24) * g.ringOp[i]!)} strokeWidth={mini ? 6 : level === 'medium' ? 1.6 : 1} strokeDasharray={i > 0 && i === L - 1 && !mini ? '3 4' : undefined} />
        ) : null,
      )}
      {!mini && <circle r={RIM} fill="none" stroke="var(--accent)" strokeOpacity="0.32" strokeWidth={level === 'medium' ? 1.6 : 1} />}
      {/* each step's own place: a spoke, a tick on the rim and a small dot on its ring */}
      {g.spokeA.map((a, i) => {
        const pc = mod12(home + i);
        const [x0, y0] = toXY(mini ? 40 : 30, a);
        const [x1, y1] = toXY(mini ? 150 : RIM - 6, a);
        const [dx, dy] = toXY(g.spokeR[i]!, a);
        const [t0x, t0y] = toXY(RIM, a);
        const [t1x, t1y] = toXY(RIM - 6, a);
        return (
          <g key={i}>
            <line x1={f1(x0)} y1={f1(y0)} x2={f1(x1)} y2={f1(y1)} stroke="var(--accent)" strokeOpacity={mini ? 0.1 : 0.12} strokeWidth={mini ? 2 : 1} />
            {!mini && <line x1={f1(t0x)} y1={f1(t0y)} x2={f1(t1x)} y2={f1(t1y)} stroke="var(--accent)" strokeOpacity="0.6" strokeWidth={i % 3 ? 1 : 2} />}
            {!mini && (
              <circle
                cx={f1(dx)}
                cy={f1(dy)}
                r={tapNotes ? (big ? 7 : 11) : level === 'medium' ? 4 : 2.6}
                fill="var(--accent)"
                fillOpacity={tapNotes ? 0.001 : 0.5}
                className={tapNotes ? 'well-spot' : undefined}
                onClick={tapNotes ? hearNote(pc) : undefined}
              >
                {tapNotes && <title>Hear {names.pc(pc)}</title>}
              </circle>
            )}
            {tapNotes && <circle cx={f1(dx)} cy={f1(dy)} r={big ? 2.6 : 4} fill="var(--accent)" fillOpacity={0.5} pointerEvents="none" />}
          </g>
        );
      })}
      {/* rim labels: numbers, with letters when asked for */}
      {!mini &&
        g.spokeA.map((a, i) => {
          const pc = mod12(home + i);
          const [lx, ly] = toXY(RIM + (level === 'medium' ? 16 : 13), a);
          const on = members.includes(pc);
          const inKey = wellTier(pc, key, 2) === 0;
          if (level === 'medium' && !on && i !== 0) return null;
          return (
            <text key={i} x={f1(lx)} y={f1(ly + labelSize * 0.36)} textAnchor="middle" className={`well-rim ${i === 0 ? 'home' : on ? 'on' : inKey ? '' : 'out'}`} fontSize={labelSize}>
              {names.pc(pc)}
              {also && big && <tspan className="well-letter" fontSize={labelSize * 0.75} dx="1.5">{also.pc(pc)}</tspan>}
            </text>
          );
        })}
      {/* the chord's shape */}
      {pts.length > 2 && <polygon points={pts.map((p) => p.map(f1).join(',')).join(' ')} fill={colours.pc(root ?? members[0] ?? home, home)} fillOpacity={mini ? 0.35 : 0.16} stroke="none" />}
      {edges.map(([a, b]) => (
        <Edge key={`${a}-${b}`} a={notePos.get(a)!} b={notePos.get(b)!} k={intervalClass(a, b)} level={level} />
      ))}
      {/* where notes outside the key lean */}
      {!mini &&
        g.notes.map((n) => {
          const to = wellLean(n.pc, key);
          if (to === null || members.includes(to)) return null;
          const a1 = g.spokeA[relative(to, home)]!;
          const r1 = g.spokeR[relative(to, home)]!;
          const da = shortest(n.a, a1);
          const arc = Array.from({ length: 12 }, (_, k) => toXY(n.r + ((r1 - n.r) * k) / 11 - 14 * Math.sin((Math.PI * k) / 11), n.a + (da * k) / 11));
          const seg = arc.slice(2, 11);
          const [ex, ey] = seg[seg.length - 1]!;
          const [px, py] = seg[seg.length - 2]!;
          const ang = Math.atan2(ey - py, ex - px);
          const ch = level === 'medium' ? 7 : 4.5;
          const [gx, gy] = toXY(r1, a1);
          return (
            <g key={`lean-${n.pc}`} opacity="0.75" stroke="var(--bad)" fill="none" strokeWidth={level === 'medium' ? 2 : 1.2} pointerEvents="none">
              <path d={`M${seg.map((p) => p.map(f1).join(' ')).join('L')}`} />
              <path d={`M${f1(ex - ch * Math.cos(ang - 0.5))} ${f1(ey - ch * Math.sin(ang - 0.5))}L${f1(ex)} ${f1(ey)}L${f1(ex - ch * Math.cos(ang + 0.5))} ${f1(ey - ch * Math.sin(ang + 0.5))}`} />
              <circle cx={f1(gx)} cy={f1(gy)} r={noteR * 0.8} stroke={colours.pc(to, home)} strokeDasharray="2 3" strokeWidth={1} />
            </g>
          );
        })}
      {/* the centre: tap for the chord, hold for its notes one by one */}
      {tapNotes && (
        <circle r={big ? 44 : 62} className="well-centre" fill="transparent" {...centreProps}>
          <title>Tap to hear the chord, hold to hear its notes</title>
        </circle>
      )}
      {/* rim marks: melody notes, colour tones, rubs */}
      {marks.map((m, i) => {
        const a = g.spokeA[relative(m.pc, home)]!;
        const [x, y] = toXY(mini ? 150 : RIM, a);
        const s = mini ? 18 : level === 'medium' ? 11 : 7;
        const c = m.kind === 'melody' ? 'var(--accent)' : m.kind === 'rub' ? 'var(--bad)' : colours.pc(m.pc, home);
        return m.kind === 'colour' ? (
          <path key={i} d={`M${f1(x)} ${f1(y - s)}L${f1(x + s)} ${f1(y)}L${f1(x)} ${f1(y + s)}L${f1(x - s)} ${f1(y)}Z`} fill={c} stroke="var(--stage)" strokeWidth={mini ? 3 : 1}><title>colour tone {names.pc(m.pc)}</title></path>
        ) : m.kind === 'rub' ? (
          <circle key={i} cx={f1(x)} cy={f1(y)} r={s} fill="none" stroke={c} strokeWidth={mini ? 4 : 1.5}><title>rubs: {names.pc(m.pc)}</title></circle>
        ) : (
          <circle key={i} cx={f1(x)} cy={f1(y)} r={s * 0.85} fill={c} stroke="var(--stage)" strokeWidth={mini ? 3 : 1}><title>melody {names.pc(m.pc)}</title></circle>
        );
      })}
      {/* notes: doubled notes get one thin ring per extra copy */}
      {g.notes.map((n) => {
        const [x, y] = pos(n);
        const isRoot = n.pc === root;
        return (
          <g
            key={n.pc}
            transform={`translate(${f1(x)} ${f1(y)})`}
            className={tapNotes ? 'well-note' : undefined}
            onClick={tapNotes ? hearNote(n.pc) : undefined}
            role={tapNotes ? 'button' : undefined}
            aria-label={tapNotes ? `Hear ${names.pc(n.pc)}` : undefined}
          >
            {Array.from({ length: n.count - 1 }, (_, k) => (
              <circle key={k} r={noteR + (mini ? 7 : 4) * (k + 1)} fill="none" stroke={colours.pc(n.pc, home)} strokeWidth={mini ? 2.4 : 1} strokeOpacity={0.8 - 0.2 * k} />
            ))}
            {isRoot && !mini && <RootMark x={x} y={y} r={noteR} medium={level === 'medium'} />}
            <circle r={noteR} fill={colours.pc(n.pc, home)} stroke={isRoot ? (mini ? 'var(--accent)' : 'var(--fg)') : 'var(--stage)'} strokeWidth={isRoot ? (mini ? 7 : 2) : mini ? 3 : 1.4} />
            {!mini && (
              <text y={labelSize * 0.36} textAnchor="middle" className="well-note-name" fontSize={level === 'medium' ? 20 : 12.5}>
                {names.pc(n.pc)}
              </text>
            )}
          </g>
        );
      })}
      {interactive && mini && <rect x={-vb} y={-vb} width={2 * vb} height={2 * vb} fill="transparent" className="well-centre" {...centreProps} />}
    </svg>
  );
}

/** The root's mark: a small gold chevron just outside the note, pointing in at it. */
function RootMark({ x, y, r, medium }: { x: number; y: number; r: number; medium: boolean }) {
  const L = Math.hypot(x, y) || 1;
  const ux = x / L;
  const uy = y / L;
  const d = r + (medium ? 9 : 5);
  const s = medium ? 9 : 8;
  const tip = [ux * d, uy * d];
  const back = [ux * (d + s), uy * (d + s)];
  const px = -uy * s;
  const py = ux * s;
  return (
    <path
      d={`M${f1(back[0]! + px)} ${f1(back[1]! + py)}L${f1(tip[0]!)} ${f1(tip[1]!)}L${f1(back[0]! - px)} ${f1(back[1]! - py)}`}
      fill="none"
      stroke="var(--accent)"
      strokeWidth={medium ? 3 : 2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      pointerEvents="none"
    >
      <title>root of the chord</title>
    </path>
  );
}

/** Layers and spacing for every key well, kept in settings. */
export function KeyWellControls() {
  const { settings, set } = useSettings();
  const spacings: [number, string][] = [
    [1, 'Even'],
    [0.55, 'Weighted'],
    [0.12, 'Key only'],
  ];
  return (
    <div className="well-controls">
      <span className="hint">Rings</span>
      <div className="seg small" role="group" aria-label="Rings">
        {([1, 2, 3, 4] as const).map((k) => (
          <button key={k} aria-pressed={settings.wellLayers === k} onClick={() => set({ wellLayers: k })} title={WELL_RING_NAMES[k].join(', then ')}>
            {k}
          </button>
        ))}
      </div>
      <span className="hint">Spacing</span>
      <div className="seg small" role="group" aria-label="Spacing">
        {spacings.map(([v, l]) => (
          <button key={l} aria-pressed={settings.wellSpacing === v} onClick={() => set({ wellSpacing: v })}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One line under a large well: what the rings mean right now. */
export function KeyWellLegend() {
  const { settings } = useSettings();
  return <p className="well-legend">Centre outwards: {WELL_RING_NAMES[settings.wellLayers].join(' → ')}. Tap the centre to hear the chord, hold for its notes, tap any point to hear that note.</p>;
}

