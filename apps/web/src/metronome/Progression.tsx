import { useMemo } from 'react';
import { analyzeChord, degreeChord, triadFamily, degreeName, parseProgression, progression, PROGRESSIONS, type Chord, type Degree, type Mode } from '@toner/theory';
import { generateVoicings, type Voicing } from '@toner/instrument';
import { strumPitches } from '../audio/strum';
import { ChordDiagram } from '../library/ChordDiagram';
import { useSettings, useStrings, voicingKey } from '../settings';
import { functionColour } from '../visual/functions';
import type { ScheduledClick } from './engine';

export interface PracticeChord {
  degree: Degree;
  chord: Chord;
  /** Playable fingerings, easiest first. */
  voicings: Voicing[];
  /** The one chosen (remembered per chord and tuning). */
  voicing: Voicing | null;
  choice: number;
  /** Where the choice is remembered in settings. */
  key: string;
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
    const voiced = new Map<string, Voicing[]>();
    const chords = base.degrees.map((degree) => {
      const chord = degreeChord(degree, settings.home);
      const key = voicingKey(tuning.strings, chord.root, chord.quality);
      if (!voiced.has(key)) voiced.set(key, generateVoicings(chord, tuning.strings, { maxFret: Math.min(12, profile.frets), limit: 8 }));
      const voicings = voiced.get(key)!;
      const choice = voicings.length ? Math.min(settings.voicings[key] ?? 0, voicings.length - 1) : 0;
      return { degree, chord, voicings, voicing: voicings[choice] ?? null, choice, key };
    });
    return { progression: { name: base.name, mode: base.mode, chords, perBar: perBarOverride ?? base.perBar, ...(base.notes ? { notes: base.notes } : {}) }, error: null };
  }, [settings.progression, settings.home, settings.voicings, customText, perBarOverride, tuning.strings.join(','), profile.frets]);
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
 * The chord chart while practising: the whole progression as bars of
 * clickable chords. While playing, the sounding chord is lit and the next one
 * outlined; while stopped, tapping a chord (or stepping with the arrows)
 * focuses it, plays it, and playback starts from there. Below, the chord in
 * focus and the one after it as diagrams, each with its other fingerings a
 * tap away.
 */
export function ChordLane({
  progression: p,
  now,
  running,
  focus,
  onFocus,
}: {
  progression: PracticeProgression;
  now: ScheduledClick | null;
  running: boolean;
  focus: number;
  onFocus: (i: number) => void;
}) {
  const { settings, set, names, also } = useSettings();
  const { tuning } = useStrings();
  const n = p.chords.length;
  // A click scheduled before the progression changed can name a chord the new one doesn't have; wrap it.
  const current = running && now?.chord !== undefined ? now.chord % n : Math.min(focus, n - 1);
  const next = (current + 1) % n;
  const key = { home: settings.home, mode: p.mode };
  const bars = Math.ceil(n / p.perBar);
  const play = (c: PracticeChord) => c.voicing && void strumPitches(c.voicing.pitches, settings.a4);
  const choose = (i: number) => {
    if (running) return;
    onFocus(i);
    play(p.chords[i]!);
  };
  const fingering = (c: PracticeChord, step: number) => {
    const choice = (c.choice + step + c.voicings.length) % c.voicings.length;
    set({ voicings: { ...settings.voicings, [c.key]: choice } });
    const v = c.voicings[choice];
    if (v && !running) void strumPitches(v.pitches, settings.a4);
  };
  return (
    <div className="chord-lane">
      <div className="chord-chart" role="list" aria-label="Progression">
        {Array.from({ length: bars }, (_, b) => (
          <div key={b} className="chart-bar" role="listitem">
            {p.chords.slice(b * p.perBar, b * p.perBar + p.perBar).map((c, k) => {
              const i = b * p.perBar + k;
              const fn = analyzeChord(c.chord, key).function;
              return (
                <button
                  key={k}
                  className={`chart-chord fn-${fn} ${i === current ? 'on' : ''} ${i === next && running ? 'next' : ''}`}
                  style={{ borderBottomColor: functionColour(fn) }}
                  onClick={() => choose(i)}
                  title={running ? 'Stop to step through the chords' : 'Show and play this chord; Start begins here'}
                >
                  <b>{degreeName(c.degree)}</b>
                  <small>{names.chord(c.chord)}</small>
                  {also && <small>{also.chord(c.chord)}</small>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {!running && (
        <div className="step-through">
          <button onClick={() => choose((current - 1 + n) % n)} aria-label="Previous chord">
            ‹ Previous
          </button>
          <span className="hint">
            Chord {current + 1} of {n}
          </span>
          <button onClick={() => choose(next)} aria-label="Next chord">
            Next ›
          </button>
        </div>
      )}
      <div className="now-next">
        {[current, next].map((i, k) => {
          const c = p.chords[i]!;
          return (
            <div key={k} className={k === 0 ? 'now' : 'coming'}>
              <div className="now-head">
                <small>{k === 0 ? (running ? 'Now' : 'This') : 'Next'}</small>
                <b>{degreeName(c.degree)}</b>
                <span>{names.chord(c.chord)}</span>
                {also && <span className="muted">{also.chord(c.chord)}</span>}
              </div>
              {c.voicing ? (
                <>
                  <ChordDiagram voicing={c.voicing} strings={tuning.strings} title={names.chord(c.chord)} onPlay={() => play(c)} />
                  {c.voicings.length > 1 && (
                    <div className="fingering-pick">
                      <button onClick={() => fingering(c, -1)} aria-label="Previous fingering">
                        ‹
                      </button>
                      <small>
                        Fingering {c.choice + 1}/{c.voicings.length}
                      </small>
                      <button onClick={() => fingering(c, 1)} aria-label="Next fingering">
                        ›
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="hint">No easy voicing in this tuning.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
