import { SectionHeader } from '../ui/SectionHeader';
import { StatusMark } from '../ui/StatusMark';

const recordSections = [
  { title: 'Season identity', label: 'Profile', description: 'No chosen side or public identity yet.' },
  { title: 'Match predictions', label: 'Picks', description: 'No verified predictions or settlements.' },
  { title: 'Game history', label: 'Play', description: 'No practice or challenge runtime exists.' },
  { title: 'Personal records', label: 'Records', description: 'No verified performances to record.' },
  { title: 'Achievements', label: 'Milestones', description: 'No earned milestones or trophies.' },
];

export function YouRoute() {
  return (
    <section className="v2-route v2-you">
      <header className="v2-route-intro"><SectionHeader level={1} eyebrow="Identity ledger" title="You" description="A future football identity starts empty, private, and honest." /></header>
      <section className="v2-identity-stage" aria-labelledby="identity-title">
        <div className="v2-identity-stage__crest" aria-hidden="true"><span>U</span><b>26</b></div>
        <div className="v2-identity-stage__copy"><StatusMark tone="neutral">Local · Signed out</StatusMark><p className="v2-eyebrow">Season identity</p><h2 id="identity-title">No player is signed in</h2><p>There is no username, chosen team, rank, streak, level, or trophy attached to this device.</p></div>
        <div className="v2-identity-stage__state"><small>Current state</small><strong>Private foundation</strong><span>No account data stored</span></div>
      </section>
      <div className="v2-you-grid">
        <section className="v2-record-command" aria-labelledby="record-book-title">
          <SectionHeader eyebrow="Record book" title="Your season, when it exists" description="Each area stays visibly empty until a real product action can populate it." />
          <div id="record-book-title" className="v2-record-list">
            {recordSections.map((section, index) => <article className="v2-record-row" key={section.title}><span>{String(index + 1).padStart(2, '0')}</span><div><p>{section.label}</p><h3>{section.title}</h3><small>{section.description}</small></div><StatusMark tone="neutral">Empty</StatusMark></article>)}
          </div>
        </section>
        <aside className="v2-you-principles" aria-labelledby="identity-standard-title"><p className="v2-eyebrow">Identity standard</p><h2 id="identity-standard-title">Earned, never invented</h2><p>Future records will name their source, period, and authority. Local history will never masquerade as a verified global result.</p><dl><div><dt>Account</dt><dd>Not connected</dd></div><div><dt>Cloud records</dt><dd>Unavailable</dd></div><div><dt>Local activity</dt><dd>None</dd></div></dl></aside>
      </div>
    </section>
  );
}
