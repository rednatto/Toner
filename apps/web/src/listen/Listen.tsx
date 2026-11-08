import { useState } from 'react';
import { LiveView } from './LiveView';
import { RecordView } from './RecordView';

type Tab = 'live' | 'record';

/** Chord listening playground: name the chord as it rings, and record labelled takes to test and train on. */
export function Listen() {
  const [tab, setTab] = useState<Tab>('live');
  return (
    <section className="page listen">
      <div className="seg" role="group" aria-label="Mode">
        <button aria-pressed={tab === 'live'} onClick={() => setTab('live')}>
          Hear chords
        </button>
        <button aria-pressed={tab === 'record'} onClick={() => setTab('record')}>
          Record takes
        </button>
      </div>
      {tab === 'live' ? <LiveView /> : <RecordView />}
    </section>
  );
}
