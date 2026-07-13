import type { MouseEvent } from 'react';
import type { TournamentSnapshot } from '../domain/contracts';
import type { LocalPrediction } from '../predictions/contracts';
import { predictionCounts, predictionFixtures, predictionNow, predictionState } from '../predictions/prediction-bridge';
import { Flag } from '../ui/Flag';

function dayLabel(day: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${day}T12:00:00Z`));
}

function outcomeLabel(record: LocalPrediction, fixture: TournamentSnapshot['fixtures'][number]) {
  if (record.outcome === 'draw') return 'Draw';
  const team = record.outcome === 'home' ? fixture.home : fixture.away;
  return team.kind === 'team' ? team.name : 'Unresolved side';
}

function stateLabel(state: ReturnType<typeof predictionState>) {
  if (state === 'correct') return 'Graded · Correct';
  if (state === 'incorrect') return 'Graded · Incorrect';
  if (state === 'pending') return 'Pending grade';
  if (state === 'confirmed') return 'Confirmed';
  if (state === 'locked') return 'Locked';
  return 'Scheduled';
}

export function PredictionsRoute({ snapshot, records, onNavigate }: { snapshot: TournamentSnapshot; records: readonly LocalPrediction[]; onNavigate: (path: string) => void }) {
  const now = predictionNow();
  const byFixture = new Map(records.map((record) => [record.fixtureId, record]));
  const fixtures = predictionFixtures(snapshot, records, now);
  const counts = predictionCounts(snapshot, records, now);
  const days = [...new Set(fixtures.map((fixture) => fixture.tournamentDay))].sort();

  function follow(event: MouseEvent<HTMLAnchorElement>, fixtureId: number) {
    event.preventDefault();
    onNavigate(`/v2/predictions/${fixtureId}`);
  }

  return (
    <section className="v2-route v2-predictions">
      <header className="v2-predictions__intro">
        <p className="v2-eyebrow">Local prediction record</p>
        <h1 className="v2-page-title">Predictions</h1>
        <p>Choose a result before the official kickoff. Results are graded only when an official final is validated.</p>
      </header>
      <dl className="v2-prediction-counts" aria-label="Local prediction facts">
        <div><dt>Eligible</dt><dd>{counts.eligible}</dd></div>
        <div><dt>Pending</dt><dd>{counts.pending}</dd></div>
        <div><dt>Graded</dt><dd>{counts.graded}</dd></div>
        <div><dt>Correct</dt><dd>{counts.correct}</dd></div>
      </dl>
      {!days.length ? (
        <section className="v2-prediction-empty" aria-labelledby="prediction-empty-title">
          <h2 id="prediction-empty-title">No eligible fixtures right now</h2>
          <p>New predictions appear only for resolved canonical fixtures before their official kickoff.</p>
        </section>
      ) : days.map((day) => (
        <section className="v2-prediction-day" key={day} aria-labelledby={`prediction-day-${day}`}>
          <header><h2 id={`prediction-day-${day}`}>{dayLabel(day)}</h2></header>
          {fixtures.filter((fixture) => fixture.tournamentDay === day).map((fixture) => {
            const record = byFixture.get(fixture.id);
            const state = predictionState(fixture, record, now);
            return <a className="v2-prediction-row" data-state={state} href={`/v2/predictions/${fixture.id}`} onClick={(event) => follow(event, fixture.id)} key={fixture.id}>
              <time dateTime={fixture.kickoff}>{fixture.kickoffLabel}</time>
              <span className="v2-prediction-row__teams">
                <span><Flag code={fixture.home.kind === 'team' ? fixture.home.code : undefined} /><strong>{fixture.home.kind === 'team' ? fixture.home.name : fixture.home.label}</strong></span>
                <span><Flag code={fixture.away.kind === 'team' ? fixture.away.code : undefined} /><strong>{fixture.away.kind === 'team' ? fixture.away.name : fixture.away.label}</strong></span>
              </span>
              <span className="v2-prediction-row__record">
                <b>{record ? outcomeLabel(record, fixture) : fixture.stageName}</b>
                <small>{stateLabel(state)}</small>
              </span>
            </a>;
          })}
        </section>
      ))}
      <p className="v2-route-footnote">This record is saved only on this device. It never changes the tournament.</p>
    </section>
  );
}
