import { describe, expect, it } from 'vitest';
import { formatStrum, parseStrum, patternBars, stepAt, stepsPerBar, STRUM_PATTERNS, strumPattern } from './index.js';

describe('strumming patterns', () => {
  it('parses and formats', () => {
    const r = parseStrum('>D - D U | - U D U');
    expect('steps' in r && r.steps.length).toBe(8);
    expect('steps' in r && r.steps[0]).toEqual({ stroke: 'D', accent: true });
    expect('error' in parseStrum('D Q')).toBe(true);
    expect('error' in parseStrum('  ')).toBe(true);
    const camp = strumPattern('campfire')!;
    expect(formatStrum(camp)).toBe('>D - D U - U D U');
    expect(formatStrum(strumPattern('boDiddley')!)).toContain('| ');
  });

  it('every library pattern fills whole bars', () => {
    const ids = new Set<string>();
    for (const p of STRUM_PATTERNS) {
      expect(p.steps.length % stepsPerBar(p), p.id).toBe(0);
      expect(ids.has(p.id), p.id).toBe(false);
      ids.add(p.id);
    }
    expect(patternBars(strumPattern('boDiddley')!)).toBe(2);
  });

  it('loops', () => {
    const q = strumPattern('skank')!;
    expect(stepAt(q, 5).stroke).toBe('X');
  });
});
