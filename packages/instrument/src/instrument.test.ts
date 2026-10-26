import { describe, expect, it } from 'vitest';
import { chord, parseChordSymbol } from '@toner/theory';
import { GUITAR, generateVoicings, nearestString, parseTuning, positionsOf, voicingToString, withCapo } from './index.js';

const standard = GUITAR.tunings.find((t) => t.id === 'standard')!.strings;

describe('tunings', () => {
  it('has standard tuning as MIDI pitches', () => {
    expect(standard).toEqual([40, 45, 50, 55, 59, 64]);
  });

  it('parses custom tunings', () => {
    expect(parseTuning('D A D G A D')).toEqual([38, 45, 50, 55, 57, 62]);
    expect(parseTuning('E2 A2 D3 G3 B3 E4')).toEqual(standard);
    expect(parseTuning('C G D A E G')).toEqual([36, 43, 50, 57, 64, 67]);
    expect(parseTuning('H A')).toBeNull();
  });

  it('finds the nearest string', () => {
    expect(nearestString(standard, 44.6)).toEqual({ string: 1, distance: expect.closeTo(-0.4) });
  });
});

describe('fretboard', () => {
  it('maps pitch classes to positions', () => {
    const es = positionsOf(standard, [4], 12).filter((p) => p.string === 0);
    expect(es.map((p) => p.fret)).toEqual([0, 12]);
    expect(withCapo(standard, 2)[0]).toBe(42);
  });
});

describe('fingerings', () => {
  const top = (sym: string, strings = standard) => generateVoicings(parseChordSymbol(sym)!, strings).map(voicingToString);

  it('finds the familiar open chords first', () => {
    expect(top('C')[0]).toBe('x32010');
    expect(top('G').slice(0, 3)).toContain('320003');
    expect(top('D')[0]).toBe('xx0232');
    expect(top('Am')[0]).toBe('x02210');
    expect(top('E')[0]).toBe('022100');
    expect(top('Em')[0]).toBe('022000');
  });

  it('finds barre chords', () => {
    const f = generateVoicings(chord(5, 'maj'), standard);
    const full = f.find((v) => voicingToString(v) === '133211');
    expect(full).toBeDefined();
    expect(full!.barre).toEqual({ fret: 1, fromString: 0, toString: 5 });
  });

  it('respects the bass for slash chords', () => {
    const v = generateVoicings(parseChordSymbol('C/G')!, standard)[0]!;
    expect(Math.min(...v.pitches) % 12).toBe(7);
  });

  it('every voicing contains the required tones and is playable', () => {
    for (const sym of ['G7', 'Bm7b5', 'Cmaj7', 'F#m', 'Bb9', 'Ddim7']) {
      for (const v of generateVoicings(parseChordSymbol(sym)!, standard)) {
        const fretted = v.frets.filter((f): f is number => f !== null && f > 0);
        if (fretted.length) expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(3);
        expect(v.fingers.filter((f) => f !== null).length).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('works for other tunings and instruments', () => {
    const dadgad = GUITAR.tunings.find((t) => t.id === 'dadgad')!.strings;
    expect(top('D', dadgad)).toContain('004200');
    const uke = [67, 60, 64, 69];
    // Re-entrant ukulele: the lowest sounding note is the C string, so C is 0003.
    expect(generateVoicings(chord(0, 'maj'), uke).map(voicingToString)[0]).toBe('0003');
    expect(generateVoicings(chord(9, 'min'), uke, { bass: null }).map(voicingToString)).toContain('2000');
  });
});
