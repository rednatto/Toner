import { describe, expect, it } from 'vitest';
import {
  analyzeChord,
  applyMoves,
  centsBetween,
  chord,
  chordPcs,
  chordSteps,
  detectKey,
  detectKeyFromChords,
  diatonicChords,
  freqToPitch,
  fromPcs,
  identifyChord,
  intervalClass,
  intervalVector,
  invert,
  L,
  modes,
  Naming,
  nearestPitch,
  normalForm,
  P,
  parseChordSymbol,
  parseNoteName,
  parsePitchName,
  pitchToFreq,
  plrPath,
  primeForm,
  R,
  romanNumeral,
  scalePcs,
  scaleSteps,
  scalesContaining,
  signedStep,
  symmetries,
  toPcs,
  transpose,
  transposeSet,
  triadPcs,
  voiceLeading,
} from './index.js';

describe('pitch', () => {
  it('works in Z12', () => {
    expect(transpose(11, 3)).toBe(2);
    expect(transpose(0, -1)).toBe(11);
    expect(invert(4)).toBe(8);
    expect(invert(4, 7)).toBe(3);
    expect(intervalClass(0, 7)).toBe(5);
    expect(signedStep(11, 0)).toBe(1);
    expect(signedStep(0, 10)).toBe(-2);
  });

  it('converts frequencies', () => {
    expect(pitchToFreq(69)).toBeCloseTo(440);
    expect(freqToPitch(82.4069)).toBeCloseTo(40, 3);
    expect(pitchToFreq(69, 432)).toBeCloseTo(432);
    expect(centsBetween(441, 440)).toBeCloseTo(3.93, 1);
    const n = nearestPitch(445);
    expect(n.pitch).toBe(69);
    expect(n.cents).toBeCloseTo(19.56, 1);
  });
});

describe('pitch-class sets', () => {
  const major = fromPcs([0, 4, 7]);

  it('round-trips and rotates', () => {
    expect(toPcs(major)).toEqual([0, 4, 7]);
    expect(toPcs(transposeSet(major, 5))).toEqual([0, 5, 9]);
    expect(toPcs(transposeSet(major, -1))).toEqual([3, 6, 11]);
  });

  it('computes normal and prime form', () => {
    expect(normalForm(fromPcs([7, 11, 2]))).toEqual([7, 11, 2]);
    expect(primeForm(major)).toEqual([0, 3, 7]);
    expect(primeForm(fromPcs([0, 3, 7]))).toEqual([0, 3, 7]);
    expect(primeForm(fromPcs([0, 4, 7, 10]))).toEqual([0, 2, 5, 8]);
    expect(primeForm(fromPcs([0, 2, 4, 5, 7, 9, 11]))).toEqual([0, 1, 3, 5, 6, 8, 10]);
  });

  it('computes interval vectors', () => {
    expect(intervalVector(major)).toEqual([0, 0, 1, 1, 1, 0]);
    expect(intervalVector(fromPcs([0, 2, 4, 5, 7, 9, 11]))).toEqual([2, 5, 4, 3, 6, 1]);
  });

  it('finds symmetries', () => {
    const dim7 = fromPcs([0, 3, 6, 9]);
    expect(symmetries(dim7).filter((s) => s.kind === 'T').map((s) => s.n)).toEqual([0, 3, 6, 9]);
    expect(symmetries(major).filter((s) => s.kind === 'T')).toHaveLength(1);
    // A major triad is not inversionally symmetric; a diminished triad is (around 6: 0↔6, 3↔3).
    expect(symmetries(major).some((s) => s.kind === 'I')).toBe(false);
    expect(symmetries(fromPcs([0, 3, 6])).some((s) => s.kind === 'I' && s.n === 6)).toBe(true);
  });
});

describe('chords', () => {
  it('builds chords as steps', () => {
    expect(chordPcs(chord(7, 'dom7'))).toEqual([7, 11, 2, 5]);
    expect(chordSteps('dom7')).toEqual([4, 3, 3]);
    expect(chordSteps('min')).toEqual([3, 4]);
  });

  it('identifies chords', () => {
    expect(identifyChord([0, 4, 7])[0]!.chord).toEqual({ root: 0, quality: 'maj' });
    expect(identifyChord([9, 0, 4])[0]!.chord).toEqual({ root: 9, quality: 'min' });
    expect(identifyChord([7, 11, 2, 5])[0]!.chord).toEqual({ root: 7, quality: 'dom7' });
    // A dominant seventh with no fifth is still a dominant seventh.
    expect(identifyChord([7, 11, 5])[0]!.chord).toEqual({ root: 7, quality: 'dom7' });
    // C6 and Am7 are the same notes; the bass decides.
    expect(identifyChord([0, 4, 7, 9], 0)[0]!.chord).toEqual({ root: 0, quality: '6' });
    expect(identifyChord([0, 4, 7, 9], 9)[0]!.chord).toEqual({ root: 9, quality: 'min7' });
    // First inversion C major.
    expect(identifyChord([0, 4, 7], 4)[0]!.chord).toEqual({ root: 0, quality: 'maj', bass: 4 });
  });

  it('parses chord symbols', () => {
    expect(parseChordSymbol('Am7')).toEqual({ root: 9, quality: 'min7' });
    expect(parseChordSymbol('F#maj7/C#')).toEqual({ root: 6, quality: 'maj7', bass: 1 });
    expect(parseChordSymbol('Bb')).toEqual({ root: 10, quality: 'maj' });
    expect(parseChordSymbol('Esus4')).toEqual({ root: 4, quality: 'sus4' });
    expect(parseChordSymbol('Xm')).toBeNull();
  });
});

describe('scales', () => {
  it('lists notes and steps', () => {
    expect(scalePcs({ root: 2, type: 'major' })).toEqual([2, 4, 6, 7, 9, 11, 1]);
    expect(scaleSteps('major')).toEqual([2, 2, 1, 2, 2, 2, 1]);
    expect(scaleSteps('blues')).toEqual([3, 2, 1, 1, 3, 2]);
  });

  it('finds modes', () => {
    const m = modes({ root: 0, type: 'major' });
    expect(m.map((x) => x.type)).toEqual(['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor', 'locrian']);
  });

  it('builds diatonic chords', () => {
    const triads = diatonicChords({ root: 0, type: 'major' });
    expect(triads.map((t) => t.chord?.quality)).toEqual(['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim']);
    const sevenths = diatonicChords({ root: 0, type: 'major' }, 4);
    expect(sevenths.map((t) => t.chord?.quality)).toEqual(['maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7', 'm7b5']);
  });

  it('finds scales containing notes', () => {
    const found = scalesContaining([0, 3, 5, 7, 10]);
    expect(found.slice(0, 2)).toContainEqual({ root: 0, type: 'minorPentatonic' });
    expect(found.slice(0, 2)).toContainEqual({ root: 3, type: 'majorPentatonic' });
    expect(scalesContaining([0, 3, 5, 7, 10], 0)[0]).toEqual({ root: 0, type: 'minorPentatonic' });
  });
});

describe('keys and function', () => {
  const C = { home: 0, mode: 'major' as const };
  const Am = { home: 9, mode: 'minor' as const };

  it('labels function and roman numerals', () => {
    expect(analyzeChord(chord(7, 'dom7'), C)).toMatchObject({ offset: 7, function: 'tension', diatonic: true, roman: 'V7' });
    expect(analyzeChord(chord(5, 'maj'), C).function).toBe('away');
    expect(analyzeChord(chord(9, 'min'), C)).toMatchObject({ function: 'home', roman: 'vi' });
    const bVI = analyzeChord(chord(8, 'maj'), C);
    expect(bVI).toMatchObject({ function: 'outside', borrowed: true, roman: '♭VI' });
    expect(romanNumeral(chord(11, 'm7b5'), C)).toBe('viiø7');
    // Major V in minor (E major in A minor) is tension even though G♯ is outside the natural minor scale.
    expect(analyzeChord(chord(4, 'maj'), Am)).toMatchObject({ offset: 7, function: 'tension', roman: 'V' });
    expect(analyzeChord(chord(5, 'maj'), Am).roman).toBe('VI');
  });

  it('detects keys', () => {
    const cMajorScale = [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1];
    expect(detectKey(cMajorScale)[0]!.key).toEqual(C);
    const prog = ['G', 'D', 'Em', 'C'].map((s) => parseChordSymbol(s)!);
    expect(detectKeyFromChords(prog)[0]!.key).toEqual({ home: 7, mode: 'major' });
  });
});

describe('tonnetz', () => {
  const Cmaj = { root: 0, minor: false };

  it('applies P, L, R', () => {
    expect(triadPcs(P(Cmaj))).toEqual([0, 3, 7]);
    expect(L(Cmaj)).toEqual({ root: 4, minor: true });
    expect(R(Cmaj)).toEqual({ root: 9, minor: true });
    for (const t of [Cmaj, { root: 9, minor: true }]) {
      expect(P(P(t))).toEqual(t);
      expect(L(L(t))).toEqual(t);
      expect(R(R(t))).toEqual(t);
    }
  });

  it('finds short PLR paths', () => {
    expect(plrPath(Cmaj, Cmaj)).toEqual([]);
    expect(plrPath(Cmaj, { root: 9, minor: true })).toEqual(['R']);
    const path = plrPath(Cmaj, { root: 6, minor: false });
    expect(applyMoves(Cmaj, path.join(''))).toEqual({ root: 6, minor: false });
  });
});

describe('voice leading', () => {
  it('finds the smallest motion', () => {
    // C major → A minor: only G moves to A.
    expect(voiceLeading([0, 4, 7], [9, 0, 4]).distance).toBe(2);
    // G7 → C: B→C, F→E, D→C or E.
    expect(voiceLeading([7, 11, 2, 5], [0, 4, 7]).distance).toBe(4);
  });
});

describe('notation', () => {
  it('names notes in each mode', () => {
    const home = new Naming({ mode: 'home', home: 7 });
    expect(home.pc(7)).toBe('0');
    expect(home.pc(2)).toBe('7');
    expect(home.chord(chord(2, 'dom7'))).toBe('7⟨4 3 3⟩');
    expect(new Naming({ mode: 'absolute', home: 7 }).pc(2)).toBe('2');
    const letters = new Naming({ mode: 'letters', home: 5 });
    expect(letters.pc(10)).toBe('B♭');
    expect(letters.chord(chord(10, 'maj7', 2))).toBe('B♭maj7/D');
    expect(new Naming({ mode: 'letters', home: 7 }).pc(6)).toBe('F♯');
  });

  it('parses names', () => {
    expect(parseNoteName('Eb')).toBe(3);
    expect(parseNoteName('F♯')).toBe(6);
    expect(parsePitchName('E2')).toBe(40);
    expect(parsePitchName('A4')).toBe(69);
    expect(parsePitchName('B#3')).toBe(60);
  });
});
