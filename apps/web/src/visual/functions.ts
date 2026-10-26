import type { HarmonicFunction } from '@toner/theory';

/** Colour for a chord's job in the key: home at rest, away neutral, tension warm, outside hot. */
export function functionColour(fn: HarmonicFunction): string {
  return fn === 'home' ? 'var(--good)' : fn === 'tension' ? 'var(--warn)' : fn === 'outside' ? 'var(--bad)' : 'var(--line)';
}
