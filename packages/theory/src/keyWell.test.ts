import { describe, expect, it } from 'vitest';
import { wellAngle, wellCounts, wellLean, wellSlices, wellTier } from './index.js';

const C = { home: 0, mode: 'major' as const };
const Am = { home: 9, mode: 'minor' as const };

describe('key well', () => {
  it('puts notes on rings by how at home they are', () => {
    const rings = (layers: 1 | 2 | 3 | 4) => Array.from({ length: 12 }, (_, pc) => wellTier(pc, C, layers)).join('');
    expect(rings(1)).toBe('000000000000');
    expect(rings(2)).toBe('010100101010');
    // 3, 8 and 10 are borrowed from C minor; 1 and 6 are outside both
    expect(rings(3)).toBe('020100201010');
    expect(rings(4)).toBe('031201302121');
  });

  it('follows the minor home chord', () => {
    expect(wellTier(9, Am, 4)).toBe(0);
    expect(wellTier(0, Am, 4)).toBe(0); // 3 above home
    expect(wellTier(1, Am, 4)).toBe(2); // the major third, borrowed from A major
  });

  it('is the even clock at spacing 1', () => {
    for (let pc = 0; pc < 12; pc++) expect(wellAngle(pc, C, 1)).toBeCloseTo(pc * 30);
    expect(wellAngle(2, { home: 2, mode: 'major' })).toBeCloseTo(0);
  });

  it('spreads the key towards an even seven-step clock as spacing falls', () => {
    expect(wellSlices(C, 0.5)).toEqual([1, 0.25, 1, 0.5, 1, 1, 0.25, 1, 0.5, 1, 0.5, 1]);
    const key = [0, 2, 4, 5, 7, 9, 11].map((pc) => wellAngle(pc, C, 0.001));
    key.forEach((a, i) => expect(a).toBeCloseTo((360 / 7) * i, 0));
    // order round the rim never changes
    const angles = Array.from({ length: 12 }, (_, pc) => wellAngle(pc, C, 0.4));
    angles.slice(1).forEach((a, i) => expect(a).toBeGreaterThan(angles[i]!));
  });

  it('leans outside notes a semitone into the key', () => {
    expect(wellLean(6, C)).toBe(7);
    expect(wellLean(1, C)).toBe(0);
    expect(wellLean(10, C)).toBe(9);
    expect(wellLean(3, C)).toBe(4);
    expect(wellLean(4, C)).toBeNull();
  });

  it('counts doublings in a voicing', () => {
    expect([...wellCounts([48, 52, 55, 60, 64])].sort()).toEqual([
      [0, 2],
      [4, 2],
      [7, 1],
    ]);
  });
});
