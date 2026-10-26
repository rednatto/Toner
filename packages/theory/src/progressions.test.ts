import { describe, expect, it } from 'vitest';
import { chordQuality, chordTension, degreeChord, degreeName, parseProgression, parseRoman, PROGRESSIONS } from './index.js';

describe('progressions', () => {
  it('reads roman numerals relative to home', () => {
    expect(parseRoman('V')).toEqual({ offset: 7, quality: 'maj' });
    expect(parseRoman('vi')).toEqual({ offset: 9, quality: 'min' });
    expect(parseRoman('♭VII')).toEqual({ offset: 10, quality: 'maj' });
    expect(parseRoman('bIII')).toEqual({ offset: 3, quality: 'maj' });
    expect(parseRoman('#iv°')).toEqual({ offset: 6, quality: 'dim' });
    expect(parseRoman('V7')).toEqual({ offset: 7, quality: 'dom7' });
    expect(parseRoman('ii7')).toEqual({ offset: 2, quality: 'min7' });
    expect(parseRoman('iiø7')).toEqual({ offset: 2, quality: 'm7b5' });
    expect(parseRoman('Imaj7')).toEqual({ offset: 0, quality: 'maj7' });
    expect(parseRoman('Vi')).toBeNull();
    expect(parseRoman('X')).toBeNull();
    expect(parseRoman('V13b')).toBeNull();
  });

  it('parses a progression with bar lines and reports errors', () => {
    const r = parseProgression('I | V | vi | IV');
    expect('degrees' in r && r.degrees.map((d) => d.offset)).toEqual([0, 7, 9, 5]);
    expect('error' in parseProgression('I Q V')).toBe(true);
    expect('error' in parseProgression('  ')).toBe(true);
  });

  it('places chords from home', () => {
    expect(degreeChord({ offset: 7, quality: 'dom7' }, 9)).toEqual({ root: 4, quality: 'dom7' });
  });

  it('names degrees back as roman numerals', () => {
    for (const t of ['I', 'ii7', 'V7', '♭VII', 'iiø7', 'vii°', 'Imaj7', 'IVsus4', 'iv6']) {
      expect(degreeName(parseRoman(t)!)).toBe(t);
    }
  });

  it('has a valid library', () => {
    const ids = new Set<string>();
    for (const p of PROGRESSIONS) {
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
      expect(p.degrees.length).toBeGreaterThan(0);
      for (const d of p.degrees) expect(chordQuality(d.quality).id).toBe(d.quality);
    }
    expect(new Set(PROGRESSIONS.map((p) => p.style)).size).toBeGreaterThanOrEqual(6);
  });

  it('orders chords from inside to outside', () => {
    const key = { home: 0, mode: 'major' as const };
    const t = (root: number, quality: string) => chordTension({ root, quality }, key);
    expect(t(0, 'maj')).toBe(0);
    expect(t(0, 'maj')).toBeLessThan(t(9, 'min'));
    expect(t(9, 'min')).toBeLessThan(t(5, 'maj'));
    expect(t(5, 'maj')).toBeLessThan(t(7, 'maj'));
    expect(t(7, 'maj')).toBeLessThan(t(7, 'dom7'));
    expect(t(7, 'dom7')).toBeLessThan(t(1, 'maj'));
  });
});
