import { useEffect, useState } from 'react';
import { mod12, NAMING_MODES, type NamingMode } from '@toner/theory';
import { Latency } from './latency/Latency';
import { Library } from './library/Library';
import { Metronome } from './metronome/Metronome';
import { useSettings } from './settings';
import { Tuner } from './tuner/Tuner';
import { SCHEMES } from './visual/schemes';

const PAGES = {
  tuner: { title: 'Tuner', render: () => <Tuner /> },
  practice: { title: 'Practice', render: () => <Metronome /> },
  library: { title: 'Library', render: () => <Library /> },
  latency: { title: 'Latency', render: () => <Latency /> },
} as const;
type Page = keyof typeof PAGES;

function pageFromHash(): Page {
  const h = window.location.hash.slice(1);
  if (h === 'metronome') return 'practice';
  return h in PAGES ? (h as Page) : 'tuner';
}

export function App() {
  const [page, setPage] = useState<Page>(pageFromHash);
  const { settings, set, letters } = useSettings();

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div className="app">
      <header>
        <a className="brand" href="#tuner">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={28} height={28} />
          Toner
        </a>
        <nav>
          {(Object.keys(PAGES) as Page[]).map((p) => (
            <a key={p} href={`#${p}`} aria-current={page === p ? 'page' : undefined}>
              {PAGES[p].title}
            </a>
          ))}
        </nav>
        <div className="prefs">
          <label>
            Names
            <select value={settings.naming} onChange={(e) => set({ naming: e.target.value as NamingMode })}>
              {NAMING_MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          {settings.naming !== 'letters' && (
            <label className="check">
              <input type="checkbox" checked={settings.alsoLetters} onChange={(e) => set({ alsoLetters: e.target.checked })} /> + letters
            </label>
          )}
          <label>
            Home
            <select value={settings.home} onChange={(e) => set({ home: Number(e.target.value) })}>
              {Array.from({ length: 12 }, (_, pc) => (
                <option key={pc} value={pc}>
                  {letters.pc(pc)} ({mod12(pc)})
                </option>
              ))}
            </select>
          </label>
          <label>
            Colours
            <select value={settings.scheme} onChange={(e) => set({ scheme: e.target.value })}>
              {SCHEMES.map((s) => (
                <option key={s.id} value={s.id} title={s.description}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      <main>{PAGES[page].render()}</main>
    </div>
  );
}
