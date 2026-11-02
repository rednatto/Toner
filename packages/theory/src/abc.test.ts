import { describe, expect, it } from 'vitest';
import { chordTimeline, indexAbc, parseAbc, parseAbcKey, parseAbcMeter, splitAbcTunes, validateSong } from './index.js';

const pitches = (abc: string) => parseAbc(abc).song.parts![0]!.notes.map((n) => n.pitch);
const tune = (body: string, head = 'M:4/4\nL:1/8\nK:C') => `X:1\nT:Test\n${head}\n${body}`;

describe('ABC keys and metres', () => {
  it('spells key signatures from the tonic', () => {
    expect(parseAbcKey('G')).toMatchObject({ home: 7, mode: 'major', signature: [0, 0, 0, 1, 0, 0, 0] });
    expect(parseAbcKey('Dmix')).toMatchObject({ home: 2, mode: 'major', scale: 'mixolydian', signature: [0, 0, 0, 1, 0, 0, 0] });
    expect(parseAbcKey('Ador')).toMatchObject({ home: 9, mode: 'minor', scale: 'dorian', signature: [0, 0, 0, 1, 0, 0, 0] });
    expect(parseAbcKey('Gm')!.signature).toEqual([0, 0, -1, 0, 0, 0, -1]);
    expect(parseAbcKey('Bb')!.signature).toEqual([0, 0, -1, 0, 0, 0, -1]);
    expect(parseAbcKey('F#m')!.signature).toEqual([1, 0, 0, 1, 1, 0, 0]);
    expect(parseAbcKey('E minor')).toMatchObject({ home: 4, mode: 'minor' });
    expect(parseAbcKey('D exp ^f')!.signature).toEqual([0, 0, 0, 1, 0, 0, 0]);
    expect(parseAbcKey('xyz')).toBeNull();
  });

  it('reads metres', () => {
    expect(parseAbcMeter('C')).toEqual({ beats: 4, unit: 4 });
    expect(parseAbcMeter('C|')).toEqual({ beats: 2, unit: 2 });
    expect(parseAbcMeter('6/8')).toEqual({ beats: 6, unit: 8 });
    expect(parseAbcMeter('(2+2+3)/8')).toEqual({ beats: 7, unit: 8 });
  });
});

describe('ABC notes', () => {
  it('reads octaves, accidentals and the key signature', () => {
    expect(pitches(tune("C c C, c' |"))).toEqual([60, 72, 48, 84]);
    expect(pitches(tune('F ^F =F _B |', 'M:4/4\nL:1/8\nK:G'))).toEqual([66, 66, 65, 70]);
    // An accidental lasts to the end of the bar.
    expect(pitches(tune('^c c | c', 'M:4/4\nL:1/8\nK:C'))).toEqual([73, 73, 72]);
  });

  it('reads lengths, broken rhythm, ties and tuplets', () => {
    const notes = parseAbc(tune('A2 B/ c/ d>e f<g | (3abc d4- d2 z |')).song.parts![0]!.notes;
    expect(notes.map((n) => [n.start, n.duration])).toEqual(
      [
        [0, 1],
        [1, 0.25],
        [1.25, 0.25],
        [1.5, 0.75],
        [2.25, 0.25],
        [2.5, 0.25],
        [2.75, 0.75],
        [3.5, 1 / 3],
        [3.833333, 1 / 3],
        [4.166667, 1 / 3],
        [4.5, 3],
      ].map(([s, d]) => [s, Math.round(d! * 1e6) / 1e6]),
    );
  });

  it('stacks notes in brackets', () => {
    const notes = parseAbc(tune('[CEG]2 [C2E2]|')).song.parts![0]!.notes;
    expect(notes.map((n) => [n.start, n.pitch])).toEqual([
      [0, 60],
      [0, 64],
      [0, 67],
      [1, 60],
      [1, 64],
    ]);
  });

  it('keeps grace notes, decorations, slurs and annotations without moving the beat', () => {
    const r = parseAbc(tune('{g}A ~B !trill!c (de) "^Slowly"f .g "_p"a |'));
    const notes = r.song.parts![0]!.notes;
    expect(notes.map((n) => [n.start, n.pitch])).toEqual([69, 71, 72, 74, 76, 77, 79, 81].map((p, i) => [i * 0.5, p]));
    expect(notes[0]!.grace).toEqual([79]);
    expect(notes.map((n) => n.marks ?? [])).toEqual([[], ['roll'], ['trill'], [], [], [], ['staccato'], ['p']]);
    expect(notes[3]!.slur).toBe(1);
    expect(notes[4]!.slur).toBe(1);
    expect(notes[5]!.slur).toBeUndefined();
    expect(r.song.sections[0]!.bars[0]!.annotations).toEqual([{ beat: 2.5, text: 'Slowly' }]);
    expect(r.warnings).toEqual([]);
  });

  it('reads the decorations older collections write as text', () => {
    const notes = parseAbc(tune('"~"A "tr"B ">"c "H"d "f"e "cresc."f |')).song.parts![0]!.notes;
    expect(notes.map((n) => n.marks ?? [])).toEqual([['roll'], ['trill'], ['accent'], ['fermata'], ['f'], []]);
  });

  it('keeps grace accidentals and grace groups', () => {
    const notes = parseAbc(tune('{^fg}A {/B}c |')).song.parts![0]!.notes;
    expect(notes.map((n) => n.grace)).toEqual([[78, 79], [71]]);
  });

  it('keeps an unknown decoration by name and hairpins as text', () => {
    const r = parseAbc(tune('!wedge!A !crescendo(!B c !crescendo)!d |'));
    expect(r.song.parts![0]!.notes[0]!.marks).toEqual(['wedge']);
    expect(r.song.sections[0]!.bars[0]!.annotations).toEqual([
      { beat: 0.5, text: 'crescendo' },
      { beat: 1.5, text: 'crescendo' },
    ]);
  });

  it('follows inline key and metre changes', () => {
    const r = parseAbc(tune('F2 F2 | [K:G] F2 F2 | [M:3/4] F2 F2 F2 |'));
    expect(r.song.parts![0]!.notes.map((n) => n.pitch)).toEqual([65, 65, 66, 66, 66, 66, 66]);
    expect(r.song.sections[0]!.bars[2]!.timeSignature).toEqual({ beats: 3, unit: 4 });
  });
});

describe('ABC tunes', () => {
  const reel = `X: 7
T: The Test Reel
T: Second Title
C: Trad.
R: reel
B: "Test Book"
Z: Transcribed by Someone
M: C|
L: 1/8
K: D
A|:"D"d2 fd "G"B2 gB|"D"A2 fA "A7"e2 ce|"D"d2 fd "G"B2 g2|1"A"f2 e2 d3 A:|2"A"f2 e2 d4||
|:"D"fa a2 "G"gb b2|"D"af "A"ed d4:|`;

  it('keeps header fields for attribution', () => {
    const r = parseAbc(reel);
    expect(r.info).toMatchObject({ index: 7, titles: ['The Test Reel', 'Second Title'], composer: 'Trad.', rhythm: 'reel', book: 'Test Book', transcription: 'Transcribed by Someone', key: 'D' });
    expect(r.song).toMatchObject({ title: 'The Test Reel', home: 2, mode: 'major', timeSignature: { beats: 2, unit: 2 }, source: 'Test Book' });
    expect(validateSong(r.song)).toEqual([]);
  });

  it('turns repeats and endings into an arrangement', () => {
    const { song } = parseAbc(reel);
    expect(song.sections.map((s) => [s.id, s.bars.length])).toEqual([
      ['A', 4],
      ['A1', 1],
      ['A2', 1],
      ['B', 2],
    ]);
    expect(song.arrangement).toEqual(['A', 'A1', 'A', 'A2', 'B', 'B']);
    // The pickup is a short bar.
    expect(song.sections[0]!.bars[0]!.beats).toBe(0.25);
    expect(song.sections[0]!.bars[1]!.beats).toBeUndefined();
  });

  it('reads chord symbols at their beats', () => {
    const { song } = parseAbc(reel);
    const bar = song.sections[0]!.bars[1]!;
    expect(bar.chords).toEqual([
      { beat: 0, chord: { root: 2, quality: 'maj' } },
      { beat: 1, chord: { root: 7, quality: 'maj' } },
    ]);
    const timeline = chordTimeline(song);
    expect(timeline[0]).toMatchObject({ start: 0.25, chord: { root: 2 } });
    expect(timeline.at(-1)).toMatchObject({ chord: { root: 9 }, section: 'B' });
  });

  it('lays the melody out in play order', () => {
    const { song } = parseAbc(reel);
    const notes = song.parts![0]!.notes;
    // Pickup A, then the first strain twice, then the second strain twice.
    expect(notes[0]).toMatchObject({ start: 0, pitch: 69 });
    expect(notes[1]).toMatchObject({ start: 0.25, pitch: 74 });
    const total = 0.25 + 3 * 2 + 2 + 0.25 + 3 * 2 + 2 + 4 * 2;
    const end = Math.max(...notes.map((n) => n.start + n.duration));
    expect(end).toBeCloseTo(total);
  });

  it('defaults the tempo by tune type and converts it to the beat', () => {
    expect(parseAbc(reel).song.tempo).toBe(100); // 200 quarters a minute in cut time
    expect(parseAbc(tune('A|', 'M:6/8\nQ:3/8=120\nK:G')).song.tempo).toBe(360);
  });

  it('splits and indexes files of tunes', () => {
    const file = `% a comment\n\n${reel}\n\nX:8\nT:Another\nR:jig\nK:Em\nE|\n`;
    expect(splitAbcTunes(file)).toHaveLength(2);
    expect(indexAbc(file).map((e) => [e.index, e.title, e.key, e.rhythm])).toEqual([
      [7, 'The Test Reel', 'D', 'reel'],
      [8, 'Another', 'Em', 'jig'],
    ]);
  });

  it('follows D.C. al Fine', () => {
    const { song } = parseAbc(tune('|:A4 B4|"Fine"c8:|d4 e4|f8 "D.C."|]'));
    expect(song.sections.map((s) => s.id)).toEqual(['A', 'B']);
    expect(song.sections[0]!.bars[1]!.marks).toEqual(['fine']);
    expect(song.sections[1]!.bars[1]!.marks).toEqual(['dc']);
    // A twice, B, then back to the start without the repeat, stopping at Fine.
    expect(song.arrangement).toEqual(['A', 'A', 'B', 'A']);
  });

  it('follows D.S. al Coda, splitting sections at the signs', () => {
    const { song } = parseAbc(tune('A8|S B8|"to coda"c8|d8 !D.S.!||O e8|f8|]'));
    expect(song.sections.map((s) => s.id)).toEqual(['A', 'A.2', 'A.3', 'B']);
    expect(song.arrangement).toEqual(['A', 'A.2', 'A.3', 'A.2', 'B']);
    const starts = song.parts![0]!.notes.map((n) => n.pitch);
    expect(starts).toEqual([69, 71, 72, 74, 71, 72, 76, 77]);
  });

  it('puts a sign written after the final bar line on the bar before', () => {
    const { song } = parseAbc(tune('A8|B8| "D.C."'));
    expect(song.sections[0]!.bars.at(-1)!.marks).toEqual(['dc']);
    expect(song.arrangement).toEqual(['A', 'A']);
  });

  it('numbers slurs afresh on each pass of a repeat', () => {
    const notes = parseAbc(tune('|:(AB) c2 d4:|')).song.parts![0]!.notes;
    expect(notes.filter((n) => n.slur).map((n) => n.slur)).toEqual([1, 1, 2, 2]);
  });

  it('warns about what it skips instead of failing', () => {
    const r = parseAbc(tune('A B c ¤ d |'));
    expect(r.song.parts![0]!.notes).toHaveLength(4);
    expect(r.warnings).toEqual(['skipped "¤"']);
    expect(() => parseAbc('X:1\nT:No key\nABC')).toThrow();
  });
});
