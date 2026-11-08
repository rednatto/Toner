/**
 * Labelled recordings of chord shapes ("takes"), kept in this browser's
 * IndexedDB and exported as a zip of WAV files plus a labels.json manifest.
 * They serve twice: as an honest test set for the baseline detector on this
 * mic and guitar, and as training data for a small model later.
 */
import type { Chord } from '@toner/theory';

export interface TakeMeta {
  id: string;
  /** null for a "no chord" take: room noise, muted strings, talking. */
  chord: Chord | null;
  /** Conventional symbol, for humans reading labels.json. */
  symbol: string;
  /** Fret per string, low to high; null = muted. Empty for "no chord". */
  frets: (number | null)[];
  /** Open-string MIDI pitches, low to high. */
  tuning: number[];
  capo: number;
  /** What the player was asked to do: 'strum', 'pick', 'four', … */
  style: string;
  sampleRate: number;
  seconds: number;
  device: string;
  /** ISO time the take was recorded. */
  recordedAt: string;
  /** Seconds into the take of the first strum, when it was detected. */
  firstOnset: number | null;
}

export interface Take extends TakeMeta {
  /** Mono samples, 16-bit. */
  pcm: Int16Array;
}

export function toPcm16(samples: ArrayLike<number>): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    out[i] = Math.round(s < 0 ? s * 0x8000 : s * 0x7fff);
  }
  return out;
}

export function fromPcm16(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i]! / 0x8000;
  return out;
}

/** A mono 16-bit PCM WAV file. */
export function encodeWav(pcm: Int16Array, sampleRate: number): Uint8Array {
  const data = pcm.length * 2;
  const buf = new ArrayBuffer(44 + data);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + data, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, data, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, pcm[i]!, true);
  return new Uint8Array(buf);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A zip archive with every file stored uncompressed (WAV barely compresses anyway). */
export function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, f.data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, f.data.length, true);
    cd.setUint32(24, f.data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0;
  for (const a of all) {
    out.set(a, p);
    p += a.length;
  }
  return out;
}

/** File name for a take inside the export: label first so a folder listing groups them. */
export function takeFileName(t: TakeMeta): string {
  const label = t.chord ? `${t.chord.root}-${t.chord.quality}` : 'N';
  return `takes/${label}/${t.id}.wav`;
}

/** The export: one WAV per take and a manifest describing them all. */
export function exportTakes(takes: Take[]): Uint8Array {
  const manifest = {
    format: 'toner-chord-takes',
    version: 1,
    note: 'Labels use Z12 pitch classes (C = 0) and Toner chord quality ids; chord null means no chord.',
    takes: takes.map(({ pcm: _pcm, ...meta }) => ({ ...meta, file: takeFileName(meta) })),
  };
  return zip([
    { name: 'labels.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) },
    ...takes.map((t) => ({ name: takeFileName(t), data: encodeWav(t.pcm, t.sampleRate) })),
  ]);
}

// ---------------------------------------------------------------------------
// IndexedDB storage. Optional: when it is unavailable takes live in memory only.

const DB = 'toner-takes';
const STORE = 'takes';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function loadTakes(): Promise<Take[]> {
  try {
    const all = await tx<Take[]>('readonly', (s) => s.getAll() as IDBRequest<Take[]>);
    return all.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  } catch {
    return [];
  }
}

export async function saveTake(t: Take): Promise<boolean> {
  try {
    await tx('readwrite', (s) => s.put(t));
    return true;
  } catch {
    return false;
  }
}

export async function deleteTake(id: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(id));
  } catch {
    // Nothing stored.
  }
}

export async function clearTakes(): Promise<void> {
  try {
    await tx('readwrite', (s) => s.clear());
  } catch {
    // Nothing stored.
  }
}
