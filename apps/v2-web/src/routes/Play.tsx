import type { MouseEvent } from 'react';

const lanes = [
  { name: 'Counter Attack', description: 'A continuous break from turnover to finish.', state: 'In development', icon: 'practice' },
  { name: 'Daily challenge', description: 'One seeded run, same for everyone.', state: 'Planned', icon: 'calendar' },
  { name: 'Ranked', description: 'Server-verified competition.', state: 'Locked', icon: 'lock' },
] as const;

function LaneIcon({ name }: { name: string }) {
  if (name === 'calendar') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M7 4v4M17 4v4M5 11h5v5H5zM14 11h5M14 16h5M5 20h14" /></svg>;
  if (name === 'practice') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18 18 5M8 5h10v10M5 12v7h7" /></svg>;
  if (name === 'prediction') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="10" width="12" height="10" /><path d="M9 10V7a3 3 0 0 1 6 0v3" /></svg>;
}

export function PlayRoute({ predictions, onNavigate }: { predictions: Readonly<{ eligible: number; pending: number; graded: number; correct: number }>; onNavigate: (path: string) => void }) {
  function openPredictions(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate('/v2/predictions');
  }
  return (
    <section className="v2-route v2-play">
      <h1 className="v2-page-title">Play</h1>
      <section className="v2-play-flagship" aria-labelledby="flagship-title">
        <svg className="v2-tactical-diagram" viewBox="0 0 360 180" aria-label="Rondo tactical chalkboard diagram" role="img">
          <path className="v2-tactical-pitch" d="M10 10h340v160H10zM10 90h340M180 10v160M180 60a30 30 0 1 0 0 60 30 30 0 0 0 0-60Z" />
          <path className="v2-tactical-run" d="M78 128 170 48 282 122 78 128m92-80 12 15m-12-15-16 7m128 67-17-1m17 1-9 14" />
          <circle className="v2-tactical-ball" cx="78" cy="128" r="5" />
          <circle className="v2-tactical-player" cx="170" cy="48" r="7" />
          <circle className="v2-tactical-player" cx="282" cy="122" r="7" />
          <circle className="v2-tactical-press" cx="184" cy="94" r="8" />
        </svg>
        <div className="v2-play-flagship__copy">
          <span>Next build</span>
          <h2 id="flagship-title">Rondo</h2>
          <p>Keep the ball moving. Read the press before it reads you.</p>
          <div className="v2-play-flagship__action-slot"><strong>Gameplay route not yet available</strong><small>The launch slot is reserved for the next dedicated build.</small></div>
        </div>
      </section>
      <div className="v2-mode-list" aria-label="Play modes">
        {lanes.map((lane) => <article className="v2-mode-row" data-interactive="false" data-state={lane.state.toLowerCase().replace(' ', '-')} key={lane.name}><LaneIcon name={lane.icon} /><div><h2>{lane.name}</h2><p>{lane.description}</p></div><span>{lane.state}</span></article>)}
        <a className="v2-mode-row v2-mode-row--action" data-interactive="true" href="/v2/predictions" onClick={openPredictions}>
          <LaneIcon name="prediction" /><div><h2>Predictions</h2><p>{predictions.eligible} eligible · {predictions.pending} pending · {predictions.graded} graded · {predictions.correct} correct</p></div><span>Open</span>
        </a>
      </div>
      <p className="v2-route-footnote">Predictions are local to this device. Rondo and Counter Attack remain unavailable until their real routes exist.</p>
    </section>
  );
}
