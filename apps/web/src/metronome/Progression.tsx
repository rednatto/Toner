import { useMemo } from 'react';
import { analyzeChord, degreeChord, triadFamily, degreeName, parseProgression, progression, PROGRESSIONS, type Chord, type Degree, type Mode } from '@toner/theory';
import { generateVoicings, type Voicing } from '@toner/instrument';
import { ChordDiagram } from '../library/ChordDiagram';
import { useSettings, useStrings } from '../settings';
import { functionColour } from '../visual/functions';
import type { ScheduledClick } from './engine';

export interface PracticeChord {
  degree: Degree;
  chord: Chord;
  voicing: Voicing | null;
}

export interface PracticeProgression {
  name: string;
  mode: Mode;
  chords: PracticeChord[];
  perBar: 1 | 2;
  notes?: string;
}

/** The progression chosen in settings (or typed), placed at home and voiced on the current instrument. */
export function usePracticeProgression(customText: string, perBarOverride: 1 | 2 | null): { progression: PracticeProgression | null; error: string | null } {
  const { settings } = useSettings();
  const { tuning, profile } = useStrings();
  return useMemo(() => {
    let base: { name: string; mode: Mode; degrees: Degree[]; perBar: 1 | 2; notes?: string } | null = null;
    if (settings.progression === 'custom') {
      const r = parseProgression(customText);
      if ('error' in r) return { progression: null, error: r.error };
      base = { name: 'Custom', mode: r.degrees.some((d) => d.offset === 0 && triadFamily(d.quality) === 'minor') ? 'minor' : 'major', degrees: r.degrees, perBar: 1 };
    } else {
      const p = progression(settings.progression);
      if (!p) return { progression: null, error: null };
      base = { name: p.name, mode: p.mode, degrees: p.degrees, perBar: p.chordsPerBar, ...(p.notes ? { notes: p.notes } : {}) };
    }
    const voiced = new Map<string, Voicing | null>();
    const chords = base.degrees.map((degree) => {
      const chord = degreeChord(degree, settings.home);
      const key = `${chord.root}:${chord.quality}`;
      if (!voiced.has(key)) voiced.set(key, generateVoicings(chord, tuning.strings, { maxFret: Math.min(12, profile.frets), limit: 1 })[0] ?? null);
      return { degree, chord, voicing: voiced.get(key)! };
    });
    return { progression: { name: base.name, mode: base.mode, chords, perBar: perBarOverride ?? base.perBar, ...(base.notes ? { notes: base.notes } : {}) }, error: null };
  }, [settings.progression, settings.home, customText, perBarOverride, tuning.strings.join(','), profile.frets]);
}

/** Pick a progression to practise against, grouped by style, or type one in roman numerals. */
export function ProgressionPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">None</option>
      {[...new Set(PROGRESSIONS.map((p) => p.style))].map((style) => (
        <optgroup key={style} label={style}>
          {PROGRESSIONS.filter((p) => p.style === style).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}: {p.degrees.map(degreeName).join(' ')}
            </option>
          ))}
        </optgroup>
      ))}
      <option value="custom">Custom…</option>
    </select>
  );
}

/**
 * The chord chart while practising: the whole progression as a row of bars
 * with the sounding chord lit, and the chord now and the chord coming next as
 * diagrams, so the change can be prepared before it arrives.
 */
export function ChordLane({ progression: p, now, running }: { progression: PracticeProgression; now: ScheduledClick | null; running: boolean }) {
  const { settings, names } = useSettings();
  const { tuning } = useStrings();
  const n = p.chords.length;
  const current = running && now?.chord !== undefined ? now.chord : 0;
  const next = (current + 1) % n;
  const key = { home: settings.home, mode: p.mode };
  const label = (c: PracticeChord) => degreeName(c.degree);
  const bars = Math.ceil(n / p.perBar);
  return (
    <div className="chord-lane">
      <div className="chord-chart" role="list" aria-label="Progression">
        {Array.from({ length: bars }, (_, b) => (
          <div key={b} className="chart-bar" role="listitem">
            {p.chords.slice(b * p.perBar, b * p.perBar + p.perBar).map((c, k) => {
              const i = b * p.perBar + k;
              const fn = analyzeChord(c.chord, key).function;
              return (
                <span key={k} className={`chart-chord fn-${fn} ${i === current && running ? 'on' : ''} ${i === next && running ? 'next' : ''}`} style={{ borderBottomColor: functionColour(fn) }}>
                  <b>{label(c)}</b>
                  <small>{names.chord(c.chord)}</small>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="now-next">
        {[current, next].map((i, k) => {
          const c = p.chords[i]!;
          return (
            <div key={k} className={k === 0 ? 'now' : 'coming'}>
              <div className="now-head">
                <small>{k === 0 ? (running ? 'Now' : 'First') : 'Next'}</small>
                <b>{label(c)}</b>
                <span>{names.chord(c.chord)}</span>
              </div>
              {c.voicing ? <ChordDiagram voicing={c.voicing} strings={tuning.strings} title={names.chord(c.chord)} /> : <p className="hint">No easy voicing in this tuning.</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
