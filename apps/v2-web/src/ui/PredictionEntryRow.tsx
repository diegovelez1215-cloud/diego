import type { MouseEvent } from 'react';
import type { PredictionFixtureState } from '../predictions/contracts';

type EntryView = Readonly<{ detail: string; action: 'Open' | 'Edit' | 'View' }>;

function entryView(state: PredictionFixtureState, call: string | null): EntryView {
  if (state === 'confirmed') return { detail: `${call ? `Your call: ${call} · ` : ''}Editable until kickoff · Device-local`, action: 'Edit' };
  if (state === 'locked') return { detail: 'Locked at kickoff · Device-local', action: 'View' };
  if (state === 'pending') return { detail: 'Waiting for official final · Device-local', action: 'View' };
  if (state === 'correct') return { detail: 'Graded · Correct · Device-local', action: 'View' };
  if (state === 'incorrect') return { detail: 'Graded · Incorrect · Device-local', action: 'View' };
  return { detail: 'Make a prediction · Saved only on this device', action: 'Open' };
}

export function PredictionEntryRow({ fixtureId, state, call, onNavigate }: {
  fixtureId: number;
  state: PredictionFixtureState;
  call: string | null;
  onNavigate: (path: string) => void;
}) {
  const path = `/v2/predictions/${fixtureId}`;
  const view = entryView(state, call);

  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(path);
  }

  return (
    <a className="v2-prediction-entry" data-state={state} href={path} onClick={open}>
      <span><strong>Prediction</strong><small>{view.detail}</small></span>
      <span className="v2-prediction-entry__action" aria-hidden="true">{view.action}</span>
    </a>
  );
}
