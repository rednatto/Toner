import { useState } from 'react';
import { HarmonisePuzzle } from './HarmonisePuzzle';
import { MelodyPuzzle } from './MelodyPuzzle';

type Tab = 'harmonise' | 'melody';

/** Small harmony puzzles, apart from the main views: chords under a tune, and a tune through chords. */
export function Puzzles() {
  const [tab, setTab] = useState<Tab>('harmonise');
  return (
    <section className="page puzzles">
      <div className="seg tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'harmonise'} aria-pressed={tab === 'harmonise'} onClick={() => setTab('harmonise')}>
          Chords for a tune
        </button>
        <button role="tab" aria-selected={tab === 'melody'} aria-pressed={tab === 'melody'} onClick={() => setTab('melody')}>
          A tune through chords
        </button>
      </div>
      {tab === 'harmonise' ? <HarmonisePuzzle /> : <MelodyPuzzle />}
    </section>
  );
}
