/**
 * App-wide display settings: how notes are named, where home is, and which
 * colour scheme is used. Kept in memory, with browser storage only as a
 * convenience so a reload remembers them.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Naming, type NamingMode, type PitchClass } from '@toner/theory';
import { instrument } from '@toner/instrument';
import { scheme, type ColourScheme } from './visual/schemes';

export interface Settings {
  naming: NamingMode;
  home: PitchClass;
  scheme: string;
  instrument: string;
  tuning: string;
  a4: number;
  /** Strumming pattern id practised in the metronome, 'custom', or '' for none. */
  strum: string;
  /** Chord progression id practised in the metronome, 'custom', or '' for none. */
  progression: string;
  /** This device's measured round trip from the latency test, in ms (0 = not measured). */
  latencyMs: number;
}

const DEFAULTS: Settings = { naming: 'home', home: 0, scheme: 'fifths', instrument: 'guitar', tuning: 'standard', a4: 440, strum: '', progression: '', latencyMs: 0 };
const KEY = 'toner.settings';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

interface Ctx {
  settings: Settings;
  set: (patch: Partial<Settings>) => void;
  names: Naming;
  /** Letter names, for secondary labels when the main naming is numeric. */
  letters: Naming;
  colours: ColourScheme;
}

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      // Storage is optional.
    }
  }, [settings]);
  const value = useMemo<Ctx>(
    () => ({
      settings,
      set: (patch) => setSettings((s) => ({ ...s, ...patch })),
      names: new Naming({ mode: settings.naming, home: settings.home }),
      letters: new Naming({ mode: 'letters', home: settings.home }),
      colours: scheme(settings.scheme),
    }),
    [settings],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Ctx {
  const c = useContext(SettingsContext);
  if (!c) throw new Error('useSettings outside SettingsProvider');
  return c;
}

/** The chosen instrument profile and tuning. */
export function useStrings() {
  const { settings } = useSettings();
  const profile = instrument(settings.instrument);
  const tuning = profile.tunings.find((t) => t.id === settings.tuning) ?? profile.tunings[0]!;
  return { profile, tuning };
}
