import type { MouseEvent } from 'react';

const recordSections = [
  { name: 'Predictions', description: 'Settled picks appear here.', icon: 'M4 12h5l2 4 3-9 2 5h4' },
  { name: 'Games', description: 'Runs and replays appear here.', icon: 'M5 17V9a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v8M8 10h4M10 8v4M16 10h.01' },
  { name: 'Records', description: 'Personal bests appear here.', icon: 'M6 4h12v16H6zM9 8h6M9 12h6M9 16h4' },
  { name: 'Achievements', description: 'Earned milestones appear here.', icon: 'M7 4h10v4a5 5 0 0 1-10 0V4ZM12 13v4M8 20h8' },
];

export function YouRoute({ predictions, onNavigate }: { predictions: Readonly<{ pending: number; graded: number; correct: number; hasPredictions: boolean; history: readonly Readonly<{ fixtureId: number; fixtureLabel: string; state: 'pending' | 'correct' | 'incorrect' }>[] }>; onNavigate: (path: string) => void }) {
  function follow(event: MouseEvent<HTMLAnchorElement>) { event.preventDefault(); onNavigate('/v2/'); }
  return (
    <section className="v2-route v2-you">
      <h1 className="v2-page-title">You</h1>
      <section className="v2-identity-band" aria-labelledby="identity-title">
        <div className="v2-identity-crest" aria-hidden="true"><span>U</span><b>26</b></div>
        <div><h2 id="identity-title">Your United record</h2><p>Signed out. Prediction history stays on this device.</p><span>Local · Private</span></div>
      </section>
      <section className="v2-you-predictions" aria-labelledby="your-predictions-title">
        <header><h2 id="your-predictions-title">Predictions</h2><span>Local to this device</span></header>
        {!predictions.hasPredictions ? <p>No predictions yet. Confirm a pre-kickoff call to start this local history.</p> : <>
          <p>{predictions.pending} pending · {predictions.graded} graded · {predictions.correct} correct</p>
          <ul>{predictions.history.map((entry) => {
            const label = entry.state === 'pending' ? 'Pending grade' : entry.state === 'correct' ? 'Correct' : 'Incorrect';
            return <li key={entry.fixtureId}><span>{entry.fixtureLabel}</span><b data-state={entry.state}>{label}</b></li>;
          })}</ul>
        </>}
      </section>
      <div className="v2-record-list">
        {recordSections.map((record) => <article className="v2-record-row" key={record.name}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={record.icon} /></svg><div><h2>{record.name}</h2><p>{record.description}</p></div><span>—</span></article>)}
      </div>
      <a className="v2-follow-row" href="/v2/" onClick={follow}>Follow the tournament →</a>
      <p className="v2-route-footnote">Records will always name their source and authority.</p>
    </section>
  );
}
