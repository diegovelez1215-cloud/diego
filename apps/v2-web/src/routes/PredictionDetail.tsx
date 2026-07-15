import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { TournamentSnapshot } from '../domain/contracts';
import type { LocalPrediction, PredictionConfidence, PredictionOutcome } from '../predictions/contracts';
import { drawAllowed, hasResolvedParticipants } from '../predictions/contracts';
import { gradePrediction, isEligibleFixture, isLockedAtKickoff, predictionNow, predictionState } from '../predictions/prediction-bridge';
import { confirmPrediction, writePredictionStore } from '../predictions/prediction-store';
import { Flag } from '../ui/Flag';

function participantName(participant: TournamentSnapshot['fixtures'][number]['home']) {
  return participant.kind === 'team' ? participant.name : participant.label;
}

function outcomeName(outcome: PredictionOutcome, fixture: TournamentSnapshot['fixtures'][number]) {
  if (outcome === 'draw') return 'Draw';
  return outcome === 'home' ? participantName(fixture.home) : participantName(fixture.away);
}

function statusCopy(state: ReturnType<typeof predictionState>) {
  if (state === 'correct') return 'Graded correct from the validated official final.';
  if (state === 'incorrect') return 'Graded incorrect from the validated official final.';
  if (state === 'pending') return 'Kickoff has passed. This pick is waiting for a validated official final.';
  if (state === 'locked') return 'Kickoff has passed. New picks and edits are locked.';
  if (state === 'confirmed') return 'Confirmed locally. You can edit it until kickoff.';
  return 'Scheduled. Confirm a result before the official kickoff.';
}

const settledCorrectGrades = new Set<number>();

function GradeSentence({ fixtureId, state, children }: { fixtureId: number; state: 'correct' | 'incorrect'; children: ReactNode }) {
  const [settle] = useState(() => {
    if (state !== 'correct' || settledCorrectGrades.has(fixtureId)) return false;
    settledCorrectGrades.add(fixtureId);
    return true;
  });
  return <p className="v2-prediction-grade" data-grade-state={state} data-grade-settle={settle ? 'true' : undefined}>{children}</p>;
}

export function PredictionDetailRoute({ fixtureId, snapshot, records, onRecordsChange, onBack }: {
  fixtureId: number;
  snapshot: TournamentSnapshot;
  records: readonly LocalPrediction[];
  onRecordsChange: () => void;
  onBack: () => void;
}) {
  const fixture = snapshot.fixtures.find((candidate) => candidate.id === fixtureId);
  const record = records.find((candidate) => candidate.fixtureId === fixtureId);
  const [editing, setEditing] = useState(!record);
  const [outcome, setOutcome] = useState<PredictionOutcome | null>(record?.outcome || null);
  const [confidence, setConfidence] = useState<PredictionConfidence>(record?.confidence || 1);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const confirmTrigger = useRef<HTMLButtonElement>(null);
  const editTrigger = useRef<HTMLButtonElement>(null);
  const confirmDialog = useRef<HTMLDivElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);

  const cancelConfirmation = useCallback(() => {
    setConfirming(false);
    requestAnimationFrame(() => confirmTrigger.current?.focus());
  }, []);

  useEffect(() => {
    if (!confirming) return;
    cancelButton.current?.focus();
    function keepFocus(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelConfirmation();
        return;
      }
      if (event.key !== 'Tab') return;
      const first = cancelButton.current;
      const last = confirmButton.current;
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === confirmDialog.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', keepFocus);
    return () => document.removeEventListener('keydown', keepFocus);
  }, [cancelConfirmation, confirming]);

  if (!fixture) {
    return <section className="v2-route v2-prediction-detail"><button className="v2-back-button" type="button" onClick={onBack}>← Back to predictions</button><h1 className="v2-page-title">Prediction not found</h1><p>This fixture is not in the canonical tournament registry.</p></section>;
  }
  const activeFixture = fixture;

  const now = predictionNow();
  const locked = isLockedAtKickoff(fixture, now);
  const resolved = hasResolvedParticipants(fixture);
  const eligible = isEligibleFixture(fixture, now);
  const state = predictionState(fixture, record, now);
  const grade = record ? gradePrediction(record, fixture) : null;
  const canEdit = !!record && !locked && resolved;
  const canStart = !record && eligible;
  const choices: PredictionOutcome[] = drawAllowed(fixture) ? ['home', 'draw', 'away'] : ['home', 'away'];

  function savePrediction() {
    if (!outcome) return;
    const result = confirmPrediction({ version: 1, records }, snapshot.fixtures, { fixtureId: activeFixture.id, outcome, confidence }, predictionNow());
    if (!result.accepted) {
      setConfirming(false);
      setMessage(result.reason === 'locked' ? 'Kickoff has passed, so this prediction was not saved.' : 'This prediction is no longer valid for this fixture.');
      requestAnimationFrame(() => confirmTrigger.current?.focus());
      return;
    }
    writePredictionStore(window.localStorage, result.store);
    setConfirming(false);
    setEditing(false);
    setMessage('Prediction confirmed locally.');
    onRecordsChange();
    requestAnimationFrame(() => editTrigger.current?.focus());
  }

  return (
    <section className="v2-route v2-prediction-detail">
      <button className="v2-back-button" type="button" onClick={onBack}>← Back to predictions</button>
      <header className="v2-prediction-detail__header">
        <p className="v2-eyebrow">{fixture.stageName}</p>
        <h1 className="v2-page-title">Make a prediction</h1>
        <p><time dateTime={fixture.kickoff}>{fixture.kickoff}</time> · {fixture.venue} · {fixture.stadium}</p>
      </header>
      <section className="v2-prediction-fixture" aria-label="Canonical fixture">
        <div><Flag code={fixture.home.kind === 'team' ? fixture.home.code : undefined} size="stage" /><strong>{participantName(fixture.home)}</strong></div>
        <span>v</span>
        <div><Flag code={fixture.away.kind === 'team' ? fixture.away.code : undefined} size="stage" /><strong>{participantName(fixture.away)}</strong></div>
      </section>
      <p className="v2-prediction-status" data-state={state} role="status">{statusCopy(state)}</p>
      {grade && grade.state !== 'pending' ? <GradeSentence fixtureId={fixture.id} state={grade.state}>Official result: {outcomeName(grade.officialWinner!, fixture)}. Your call: {outcomeName(record!.outcome, fixture)}.</GradeSentence> : null}
      {!resolved ? <section className="v2-prediction-empty"><h2>Participants are unresolved</h2><p>United will not offer a team pick until both canonical slots are resolved.</p></section> : null}
      {(canStart || (editing && canEdit)) ? <form className="v2-prediction-form" onSubmit={(event) => { event.preventDefault(); if (!outcome) { setMessage('Choose a result before confirming.'); return; } setConfirming(true); }}>
        <fieldset>
          <legend>Choose a result</legend>
          <div className="v2-outcome-choices">
            {choices.map((choice) => <label key={choice} data-selected={outcome === choice ? 'true' : 'false'}>
              <input type="radio" name="outcome" value={choice} checked={outcome === choice} onChange={() => setOutcome(choice)} />
              <span>{outcomeName(choice, fixture)}</span>
            </label>)}
          </div>
        </fieldset>
        <fieldset>
          <legend>Confidence</legend>
          <div className="v2-confidence-choices">
            {([1, 2, 3] as const).map((level) => <label key={level} data-selected={confidence === level ? 'true' : 'false'}>
              <input type="radio" name="confidence" value={level} checked={confidence === level} onChange={() => setConfidence(level)} />
              <span>{level === 1 ? 'Low' : level === 2 ? 'Medium' : 'High'}</span>
            </label>)}
          </div>
        </fieldset>
        {message ? <p className="v2-form-message" role="alert">{message}</p> : null}
        <button ref={confirmTrigger} type="submit" className="v2-button v2-button--primary">Review prediction</button>
      </form> : null}
      {record && !editing && canEdit ? <button ref={editTrigger} type="button" className="v2-button v2-button--quiet" onClick={() => { setOutcome(record.outcome); setConfidence(record.confidence || 1); setMessage(null); setEditing(true); }}>Edit prediction</button> : null}
      {!record && !canStart && resolved && !locked ? <p className="v2-form-message" role="status">This fixture is not available for a new prediction.</p> : null}
      {message && !(canStart || (editing && canEdit)) ? <p className="v2-form-message" role="status">{message}</p> : null}
      {confirming && outcome ? <div className="v2-confirm-layer" role="presentation"><div className="v2-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="prediction-confirm-title" aria-describedby="prediction-confirm-description" tabIndex={-1} ref={confirmDialog}>
        <p className="v2-eyebrow">Confirm local prediction</p>
        <h2 id="prediction-confirm-title">{outcomeName(outcome, fixture)}</h2>
        <p id="prediction-confirm-description">This is saved only on this device and locks at the official kickoff.</p>
        <div><button ref={cancelButton} type="button" className="v2-button v2-button--quiet" onClick={cancelConfirmation}>Cancel</button><button ref={confirmButton} type="button" className="v2-button v2-button--primary" onClick={savePrediction}>Confirm prediction</button></div>
      </div></div> : null}
      <p className="v2-route-footnote">Device-local only. Signing in never uploads or changes this prediction.</p>
    </section>
  );
}
