import { SectionHeader } from '../ui/SectionHeader';
import { StatePanel } from '../ui/StatePanel';
import { StatusMark } from '../ui/StatusMark';

const concepts = [
  { name: 'Practice', description: 'Unranked learning and free play, once a verified runtime exists.', state: 'No runtime' },
  { name: 'Ranked', description: 'Server-authoritative challenges only after replay parity and security gates.', state: 'Locked' },
  { name: 'Predictions', description: 'Official-fixture calls with authoritative lock and settlement boundaries.', state: 'Future package' },
];

export function PlayRoute() {
  return (
    <section className="v2-route v2-play">
      <SectionHeader level={1} eyebrow="Football actions" title="Play" description="A focused home for future practice, competition, and verified predictions." />
      <section className="v2-flagship-slot" aria-labelledby="flagship-title">
        <div className="v2-pitch-mark" aria-hidden="true"><span /><i /><b /></div>
        <div className="v2-flagship-copy"><StatusMark tone="pending">Under construction</StatusMark><p className="v2-eyebrow">Flagship game slot</p><h2 id="flagship-title">Counter Attack</h2><p>Continuous transition football is planned here. There is no playable runtime in this package.</p></div>
      </section>
      <StatePanel compact kind="unavailable" eyebrow="Daily challenge" title="Unavailable until the game runtime is verified" description="No timer, attempt count, score, rank, reward, or start control is displayed." />
      <section className="v2-concept-ledger" aria-labelledby="play-structure-title">
        <SectionHeader eyebrow="Approved future structure" title="Modes with distinct authority" description="Each concept remains separate until its own truth and runtime boundary exists." />
        <div id="play-structure-title">
          {concepts.map((concept, index) => <div className="v2-concept-row" key={concept.name}><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{concept.name}</h3><p>{concept.description}</p></div><StatusMark tone="pending">{concept.state}</StatusMark></div>)}
        </div>
      </section>
      <section className="v2-support-ledger" aria-labelledby="supporting-modes-title">
        <SectionHeader eyebrow="Supporting modes" title="A short future catalog" />
        <ul id="supporting-modes-title"><li><strong>Penalty Rush</strong><span>Possible unranked skill mode after quality review</span></li><li><strong>Match Lab</strong><span>Future unranked football sandbox</span></li><li><strong>My World Cup</strong><span>Later long-form tournament experience</span></li></ul>
      </section>
    </section>
  );
}
