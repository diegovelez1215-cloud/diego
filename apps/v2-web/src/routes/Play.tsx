import { SectionHeader } from '../ui/SectionHeader';
import { StatusMark } from '../ui/StatusMark';

const lanes = [
  { name: 'Practice', kicker: 'Learn the break', description: 'Unranked training once the verified game runtime exists.', state: 'In development' },
  { name: 'Daily challenge', kicker: 'Same football problem', description: 'A future seeded challenge with server replay authority.', state: 'Not available' },
  { name: 'Predictions', kicker: 'Call the tournament', description: 'Canonical fixtures with official lock and settlement boundaries.', state: 'Future release' },
  { name: 'Ranked', kicker: 'Verified competition', description: 'Locked until engine parity, security, and replay gates pass.', state: 'Locked' },
];

export function PlayRoute() {
  return (
    <section className="v2-route v2-play">
      <header className="v2-route-intro"><SectionHeader level={1} eyebrow="Football lab" title="Play" description="One flagship football idea, built carefully enough to earn the start button." /></header>
      <section className="v2-play-stage" aria-labelledby="flagship-title">
        <div className="v2-play-stage__pitch" aria-hidden="true"><span className="v2-player v2-player--one" /><span className="v2-player v2-player--two" /><span className="v2-player v2-player--three" /><span className="v2-player v2-player--four" /><i /></div>
        <div className="v2-play-stage__copy">
          <StatusMark tone="pending">Concept preview · Not playable</StatusMark>
          <p className="v2-eyebrow">Flagship in development</p>
          <h2 id="flagship-title">Counter<br />Attack</h2>
          <p>Turn the break into a goal before the defense recovers. Continuous movement, passing lanes, and finishing are the intended football fantasy.</p>
          <div className="v2-play-stage__facts"><span><small>Runtime</small><strong>Not yet built</strong></span><span><small>Availability</small><strong>In development</strong></span></div>
        </div>
      </section>
      <div className="v2-play-grid">
        <section className="v2-mode-command" aria-labelledby="mode-command-title">
          <SectionHeader eyebrow="Product structure" title="Four distinct lanes" description="Availability and authority stay explicit until each lane is real." />
          <div id="mode-command-title" className="v2-mode-list">
            {lanes.map((lane, index) => <article className="v2-mode-row" key={lane.name}><span className="v2-mode-row__number">{String(index + 1).padStart(2, '0')}</span><div><p>{lane.kicker}</p><h3>{lane.name}</h3><small>{lane.description}</small></div><StatusMark tone="pending">{lane.state}</StatusMark></article>)}
          </div>
        </section>
        <aside className="v2-play-manifesto" aria-labelledby="play-standard-title">
          <p className="v2-eyebrow">Launch standard</p><h2 id="play-standard-title">No imitation gameplay</h2><p>United will not show a fake score, timer, rank, reward, or playable control while Counter Attack is still being developed.</p>
          <ul><li><strong>Practice</strong><span>Unranked and teachable</span></li><li><strong>Daily</strong><span>Seeded and comparable</span></li><li><strong>Ranked</strong><span>Server-authoritative only</span></li></ul>
        </aside>
      </div>
    </section>
  );
}
