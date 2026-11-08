import { describe, expect, it } from 'vitest';
import { generateVoicings, GUITAR } from '@toner/instrument';
import { defaultDetectorOptions } from './chroma';
import { scoreTake, summarise } from './score';
import { rng, strum } from './synthGuitar';
import { crc32, encodeWav, exportTakes, fromPcm16, toPcm16, zip, type Take } from './takes';

describe('takes export', () => {
  it('crc32 matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('round-trips samples through 16-bit PCM', () => {
    const back = fromPcm16(toPcm16([0, 0.5, -0.5, 1, -1, 2]));
    expect(back[1]).toBeCloseTo(0.5, 3);
    expect(back[4]).toBe(-1);
    expect(back[5]).toBeCloseTo(1, 3);
  });

  it('writes a WAV header', () => {
    const w = encodeWav(new Int16Array(10), 48000);
    const v = new DataView(w.buffer);
    expect(new TextDecoder().decode(w.slice(0, 4))).toBe('RIFF');
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint32(40, true)).toBe(20);
    expect(w.length).toBe(64);
  });

  it('writes a zip whose directory points at each file', () => {
    const z = zip([
      { name: 'a.txt', data: new TextEncoder().encode('hello') },
      { name: 'b/c.txt', data: new TextEncoder().encode('world!') },
    ]);
    const v = new DataView(z.buffer);
    const end = z.length - 22;
    expect(v.getUint32(end, true)).toBe(0x06054b50);
    expect(v.getUint16(end + 10, true)).toBe(2);
    const cd = v.getUint32(end + 16, true);
    expect(v.getUint32(cd, true)).toBe(0x02014b50);
    // Second local header follows the first file.
    expect(v.getUint32(30 + 5 + 5, true)).toBe(0x04034b50);
  });

  it('exports labels.json with every take', () => {
    const take: Take = {
      id: 't1', chord: { root: 9, quality: 'min' }, symbol: 'Am', frets: [null, 0, 2, 2, 1, 0], tuning: [40, 45, 50, 55, 59, 64], capo: 0,
      style: 'strum', sampleRate: 48000, seconds: 0.01, device: 'test', recordedAt: '2026-11-08T00:00:00Z', firstOnset: 0, pcm: new Int16Array(480),
    };
    const z = exportTakes([take]);
    const text = new TextDecoder().decode(z);
    expect(text).toContain('"symbol": "Am"');
    expect(text).toContain('takes/9-min/t1.wav');
    expect(text).not.toContain('"pcm"');
  });
});


describe('scoring takes', () => {
  const strings = GUITAR.tunings[0]!.strings;
  it('scores a right take, a wrong label and a quiet "no chord" take', () => {
    const am = generateVoicings({ root: 9, quality: 'min' }, strings)[0]!;
    const audio = strum(am.pitches, { sampleRate: 48000, seconds: 1.5 });
    const o = defaultDetectorOptions(48000);
    const r = rng(3);
    const hiss = Float64Array.from({ length: 48000 }, () => (r() * 2 - 1) * 0.001);
    const scores = [
      scoreTake({ id: 'a', chord: { root: 9, quality: 'min' }, samples: audio, sampleRate: 48000 }, o),
      scoreTake({ id: 'b', chord: { root: 0, quality: 'maj' }, samples: audio, sampleRate: 48000 }, o),
      scoreTake({ id: 'n', chord: null, samples: hiss, sampleRate: 48000 }, o),
    ];
    expect(scores[0]!.verdict).toBe('exact');
    expect(scores[0]!.frameAccuracy).toBeGreaterThan(0.8);
    expect(scores[1]!.verdict).toBe('related');
    expect(scores[2]!.verdict).toBe('quiet-ok');
    const s = summarise(scores);
    expect(s.exact).toBe(2);
    expect(s.confusions).toHaveLength(1);
  });
});
