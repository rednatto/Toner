import { describe, expect, it } from 'vitest';
import {
  accentsFromGrouping,
  chordTimeline,
  defaultAccents,
  defaultGrouping,
  parseGrouping,
  parseSong,
  parseTimeSignature,
  tapTempo,
  transposeSong,
  validateSong,
  type Song,
} from './index.js';

describe('rhythm', () => {
  it('groups beats', () => {
    expect(defaultGrouping({ beats: 4, unit: 4 })).toEqual([1, 1, 1, 1]);
    expect(defaultGrouping({ beats: 6, unit: 8 })).toEqual([3, 3]);
    expect(defaultGrouping({ beats: 12, unit: 8 })).toEqual([3, 3, 3, 3]);
    expect(defaultGrouping({ beats: 7, unit: 8 })).toEqual([2, 2, 3]);
    expect(defaultGrouping({ beats: 5, unit: 8 })).toEqual([2, 3]);
    expect(parseGrouping('3+2+2', 7)).toEqual([3, 2, 2]);
    expect(parseGrouping('3+3', 7)).toBeNull();
  });

  it('derives accents', () => {
    expect(defaultAccents({ beats: 4, unit: 4 })).toEqual([3, 1, 1, 1]);
    expect(defaultAccents({ beats: 6, unit: 8 })).toEqual([3, 1, 1, 2, 1, 1]);
    expect(accentsFromGrouping([2, 2, 3])).toEqual([3, 1, 2, 1, 2, 1, 1]);
  });

  it('parses time signatures and taps', () => {
    expect(parseTimeSignature('7/8')).toEqual({ beats: 7, unit: 8 });
    expect(parseTimeSignature('4/3')).toBeNull();
    expect(tapTempo([0, 0.5, 1.0, 1.5])).toBeCloseTo(120);
    expect(tapTempo([0])).toBeNull();
  });
});

const song: Song = {
  format: 'toner-song',
  version: 1,
  title: 'Test',
  tempo: 100,
  timeSignature: { beats: 4, unit: 4 },
  home: 7,
  mode: 'major',
  sections: [
    {
      id: 'v',
      name: 'Verse',
      bars: [
        { chords: [{ beat: 0, chord: { root: 7, quality: 'maj' } }] },
        { chords: [{ beat: 0, chord: { root: 2, quality: 'maj' } }, { beat: 2, chord: { root: 4, quality: 'min' } }] },
      ],
    },
    { id: 'c', name: 'Chorus', bars: [{ chords: [{ beat: 0, chord: { root: 0, quality: 'maj7' } }] }] },
  ],
  arrangement: ['v', 'c', 'v'],
  parts: [{ name: 'riff', notes: [{ start: 0, duration: 1, pitch: 55, hint: { string: 6, fret: 3 } }] }],
};

describe('song format', () => {
  it('validates', () => {
    expect(validateSong(song)).toEqual([]);
    expect(validateSong({ ...song, arrangement: ['x'] })).toContain('arrangement refers to unknown section "x"');
    const bad = parseSong('{"format":"toner-song","version":1,"title":"x","tempo":90,"timeSignature":{"beats":4,"unit":4},"sections":[{"id":"a","bars":[{"chords":[{"beat":0,"chord":{"root":3,"quality":"weird"}}]}]}]}');
    expect('errors' in bad && bad.errors[0]).toContain('unknown');
    expect('errors' in parseSong('nope')).toBe(true);
  });

  it('transposes', () => {
    const up = transposeSong(song, 5);
    expect(up.home).toBe(0);
    expect(up.sections[0]!.bars[1]!.chords[1]!.chord).toEqual({ root: 9, quality: 'min' });
    expect(up.parts![0]!.notes[0]).toEqual({ start: 0, duration: 1, pitch: 60 });
  });

  it('builds a timeline in arrangement order', () => {
    const tl = chordTimeline(song);
    expect(tl.map((e) => e.start)).toEqual([0, 4, 6, 8, 12, 16, 18]);
    expect(tl[3]!.section).toBe('c');
  });
});
