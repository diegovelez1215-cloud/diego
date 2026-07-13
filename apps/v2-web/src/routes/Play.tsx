const lanes = [
  { name: 'Daily challenge', description: 'One seeded run, same for everyone.', state: 'Planned', icon: 'calendar' },
  { name: 'Practice', description: 'Unranked training, no clock.', state: 'Planned', icon: 'practice' },
  { name: 'Predictions', description: 'Call every canonical fixture.', state: 'Next up', icon: 'prediction', accent: true },
  { name: 'Ranked', description: 'Server-verified competition.', state: 'Locked', icon: 'lock' },
];

function LaneIcon({ name }: { name: string }) {
  if (name === 'calendar') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M7 4v4M17 4v4M5 11h5v5H5zM14 11h5M14 16h5M5 20h14" /></svg>;
  if (name === 'practice') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18 18 5M8 5h10v10M5 12v7h7" /></svg>;
  if (name === 'prediction') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="10" width="12" height="10" /><path d="M9 10V7a3 3 0 0 1 6 0v3" /></svg>;
}

export function PlayRoute() {
  return (
    <section className="v2-route v2-play">
      <h1 className="v2-page-title">Play</h1>
      <section className="v2-play-flagship" aria-labelledby="flagship-title">
        <svg className="v2-tactical-diagram" viewBox="0 0 360 180" aria-label="Counter Attack tactical chalkboard diagram" role="img">
          <path className="v2-tactical-pitch" d="M10 10h340v160H10zM10 90h340M180 10v160M180 60a30 30 0 1 0 0 60 30 30 0 0 0 0-60ZM10 48h58v84H10M350 48h-58v84h58" />
          <path className="v2-tactical-run" d="M74 132c48-3 75-30 103-57 24-24 56-34 100-27l-17-13m17 13-15 16" />
          <circle className="v2-tactical-ball" cx="70" cy="133" r="5" />
        </svg>
        <div className="v2-play-flagship__copy"><span>In development</span><h2 id="flagship-title">Counter Attack</h2><p>Turn the break into a goal before the defense recovers.</p></div>
      </section>
      <div className="v2-mode-list" aria-label="Future play modes">
        {lanes.map((lane) => <article className="v2-mode-row" key={lane.name}><LaneIcon name={lane.icon} /><div><h2>{lane.name}</h2><p>{lane.description}</p></div><span data-accent={lane.accent ? 'true' : undefined}>{lane.state}</span></article>)}
      </div>
      <p className="v2-route-footnote">United never shows imitation gameplay, scores, or ranks.</p>
    </section>
  );
}
