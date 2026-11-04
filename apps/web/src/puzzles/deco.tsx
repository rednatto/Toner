/**
 * The few art deco strokes the puzzles use: thin gold structure, a curl where
 * a line sets off and a chevron where it turns. Kept sparse and low-opacity
 * so note colour carries the meaning.
 */
import type { HarmonicFunction } from '@toner/theory';

export const GOLD = 'oklch(0.84 0.12 85)';

/** Background tints for a chord's job: teal home, ochre away, red tension, violet outside. */
export const FN_TINT: Record<HarmonicFunction, string> = {
  home: 'oklch(0.42 0.07 195)',
  away: 'oklch(0.44 0.08 85)',
  tension: 'oklch(0.42 0.12 25)',
  outside: 'oklch(0.38 0.1 305)',
};

/** A small chevron pointing along a direction (dx, dy), centred at (x, y). */
export function Chevron({ x, y, dx, dy, size = 5, opacity = 0.7 }: { x: number; y: number; dx: number; dy: number; size?: number; opacity?: number }) {
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  const px = -uy;
  const py = ux;
  const d = `M${x - ux * size + px * size * 0.8} ${y - uy * size + py * size * 0.8}L${x} ${y}L${x - ux * size - px * size * 0.8} ${y - uy * size - py * size * 0.8}`;
  return <path d={d} fill="none" stroke={GOLD} strokeOpacity={opacity} strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" />;
}

/** A swirl tail: a small spiral that ends at (x, y), opening to the left. */
export function Curl({ x, y, r = 5, opacity = 0.55 }: { x: number; y: number; r?: number; opacity?: number }) {
  let d = '';
  for (let k = 0; k <= 24; k++) {
    const t = k / 24;
    const a = Math.PI * 0.5 + t * Math.PI * 1.6;
    const rr = r * (1 - t * 0.75);
    const px = x - r + rr * Math.cos(a) + r * 0;
    const py = y - rr * Math.sin(a) + r * 0;
    d += (k ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1);
  }
  return <path d={d} fill="none" stroke={GOLD} strokeOpacity={opacity} strokeWidth={0.9} strokeLinecap="round" />;
}

/** The corner fans of a deco frame, drawn faintly inside a rectangle. */
export function DecoFrame({ w, h, inset = 6 }: { w: number; h: number; inset?: number }) {
  const fan = (cx: number, cy: number, sx: number, sy: number) =>
    [0, 1, 2, 3].map((k) => {
      const a = (k / 3) * (Math.PI / 2);
      const r = 18;
      return <line key={k} x1={cx} y1={cy} x2={cx + sx * r * Math.cos(a)} y2={cy + sy * r * Math.sin(a)} stroke={GOLD} strokeOpacity={0.22} strokeWidth={0.7} />;
    });
  return (
    <g pointerEvents="none">
      <rect x={inset} y={inset} width={w - inset * 2} height={h - inset * 2} rx={6} fill="none" stroke={GOLD} strokeOpacity={0.18} strokeWidth={0.7} />
      {fan(inset, inset, 1, 1)}
      {fan(w - inset, inset, -1, 1)}
      {fan(inset, h - inset, 1, -1)}
      {fan(w - inset, h - inset, -1, -1)}
    </g>
  );
}

/** Number first, the letter small beside it. */
export function NumLetter({ x, y, num, letter, size = 11, anchor = 'middle', fill = 'var(--fg)', weight = 400 }: { x: number; y: number; num: string; letter?: string | null; size?: number; anchor?: 'start' | 'middle' | 'end'; fill?: string; weight?: number }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} fill={fill} fontWeight={weight} className="num-letter">
      {num}
      {letter && letter !== num && (
        <tspan fontSize={size * 0.72} fillOpacity={0.7} dx={1.5}>
          {letter}
        </tspan>
      )}
    </text>
  );
}
