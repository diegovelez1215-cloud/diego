import { Metric } from '../ui/Metric';
import { SectionHeader } from '../ui/SectionHeader';
import { StatePanel } from '../ui/StatePanel';
import { StatusMark } from '../ui/StatusMark';

const recordSections = [
  { title: 'Prediction history', description: 'Verified picks and settlements will appear here after the Picks package exists.' },
  { title: 'Game history', description: 'Practice and verified challenge runs will appear only after a game runtime exists.' },
  { title: 'Season identity', description: 'A future signed-in profile may hold a chosen side, privacy controls, and season records.' },
];

export function YouRoute() {
  return (
    <section className="v2-route v2-you">
      <SectionHeader level={1} eyebrow="Identity and records" title="You" description="A truthful record book foundation with no invented player identity." />
      <section className="v2-identity-band" aria-labelledby="identity-title">
        <div className="v2-local-mark" aria-hidden="true">U26</div>
        <div><StatusMark tone="neutral">Local foundation</StatusMark><h2 id="identity-title">No player is signed in</h2><p>Authentication and cloud identity are outside this package. Nothing here claims a username, level, streak, trophy, or global rank.</p></div>
      </section>
      <dl className="v2-metric-row v2-metric-row--identity" aria-label="Future personal record categories">
        <Metric label="Records" value="—" note="No verified games" />
        <Metric label="Predictions" value="—" note="No verified picks" />
        <Metric label="Season" value="—" note="No identity" />
      </dl>
      <section className="v2-record-ledger" aria-labelledby="record-book-title">
        <SectionHeader eyebrow="Record book" title="Your future history" description="Empty states stay empty until the corresponding product and authority exist." />
        <div id="record-book-title">
          {recordSections.map((section) => <div className="v2-record-row" key={section.title}><div><h3>{section.title}</h3><p>{section.description}</p></div><StatusMark tone="neutral">Empty</StatusMark></div>)}
        </div>
      </section>
      <StatePanel compact kind="empty" eyebrow="Privacy-safe foundation" title="No account data is stored here" description="Identity, authentication, migrations, and Supabase writes are intentionally absent." />
    </section>
  );
}
