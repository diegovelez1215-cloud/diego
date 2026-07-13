import { describe, expect, it } from 'vitest';
import { canonicalTournamentSnapshot } from '../domain/tournament-bridge';
import { PREDICTION_SCHEMA_VERSION, PREDICTION_STORAGE_KEY } from './contracts';
import { confirmPrediction, readPredictionStore, sanitizePredictionStore, writePredictionStore } from './prediction-store';

const fixtures = canonicalTournamentSnapshot().fixtures;
const opener = fixtures.find((fixture) => fixture.id === 1)!;
const unresolved = fixtures.find((fixture) => fixture.id === 73)!;

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (key: string) => data.get(key) || null, setItem: (key: string, value: string) => data.set(key, value), raw: () => data.get(PREDICTION_STORAGE_KEY) };
}

describe('V2 prediction local store', () => {
  it('rejects unknown fixtures and unresolved slots', () => {
    const empty = { version: 1 as const, records: [] };
    expect(confirmPrediction(empty, fixtures, { fixtureId: 99999, outcome: 'home' }, opener.kickoffEpoch - 1)).toEqual({ accepted: false, reason: 'unknown-fixture' });
    expect(confirmPrediction(empty, fixtures, { fixtureId: unresolved.id, outcome: 'home' }, unresolved.kickoffEpoch - 1)).toEqual({ accepted: false, reason: 'unresolved-fixture' });
  });

  it('enforces draw eligibility and exact kickoff locking', () => {
    const empty = { version: 1 as const, records: [] };
    expect(confirmPrediction(empty, fixtures, { fixtureId: opener.id, outcome: 'draw' }, opener.kickoffEpoch - 1).accepted).toBe(true);
    const knockoutLike = fixtures.find((fixture) => fixture.stage === 'r32')!;
    expect(confirmPrediction(empty, fixtures, { fixtureId: knockoutLike.id, outcome: 'draw' }, knockoutLike.kickoffEpoch - 1)).not.toMatchObject({ accepted: true });
    expect(confirmPrediction(empty, fixtures, { fixtureId: opener.id, outcome: 'home' }, opener.kickoffEpoch)).toEqual({ accepted: false, reason: 'locked' });
  });

  it('allows pre-kickoff edits but fails closed after kickoff', () => {
    const empty = { version: 1 as const, records: [] };
    const first = confirmPrediction(empty, fixtures, { fixtureId: opener.id, outcome: 'home', confidence: 1 }, opener.kickoffEpoch - 2_000);
    expect(first.accepted).toBe(true);
    if (!first.accepted) return;
    const edited = confirmPrediction(first.store, fixtures, { fixtureId: opener.id, outcome: 'away', confidence: 3 }, opener.kickoffEpoch - 1);
    expect(edited).toMatchObject({ accepted: true, record: { outcome: 'away', confidence: 3 } });
    expect(confirmPrediction(first.store, fixtures, { fixtureId: opener.id, outcome: 'away' }, opener.kickoffEpoch)).toEqual({ accepted: false, reason: 'locked' });
  });

  it('writes only the versioned local payload after explicit confirmation', () => {
    const storage = memory();
    const result = confirmPrediction({ version: 1, records: [] }, fixtures, { fixtureId: opener.id, outcome: 'home', confidence: 2 }, opener.kickoffEpoch - 10);
    expect(storage.raw()).toBeUndefined();
    if (!result.accepted) throw new Error('expected valid prediction');
    writePredictionStore(storage, result.store);
    const persisted = JSON.parse(storage.raw()!);
    expect(persisted).toEqual({ version: 1, records: [{ fixtureId: 1, outcome: 'home', confidence: 2, confirmedAt: new Date(opener.kickoffEpoch - 10).toISOString(), kickoffEpoch: opener.kickoffEpoch }] });
    expect(JSON.stringify(persisted)).not.toMatch(/score|provider|payload|official|profile|fingerprint/i);
  });

  it('sanitizes malformed and future-version storage safely', () => {
    expect(readPredictionStore(memory({ [PREDICTION_STORAGE_KEY]: '{nope' }), fixtures)).toMatchObject({ reason: 'malformed', store: { records: [] } });
    expect(sanitizePredictionStore({ version: 2, records: [] }, fixtures)).toMatchObject({ reason: 'future-version', store: { records: [] } });
    expect(sanitizePredictionStore({ version: 1, records: [{ fixtureId: 1, outcome: 'home', confirmedAt: 'wrong', kickoffEpoch: opener.kickoffEpoch }] }, fixtures)).toMatchObject({ rejected: 1, store: { records: [] } });
  });

  it('rejects post-kickoff, unknown, invalid-draw, kickoff-mismatch, and duplicate-conflict records', () => {
    const valid = { fixtureId: opener.id, outcome: 'home', confirmedAt: '2026-06-10T12:00:00.000Z', kickoffEpoch: opener.kickoffEpoch };
    const result = sanitizePredictionStore({ version: 1, records: [
      valid,
      { ...valid, outcome: 'away' },
      { ...valid, fixtureId: 9999 },
      { ...valid, confirmedAt: new Date(opener.kickoffEpoch).toISOString() },
      { ...valid, kickoffEpoch: opener.kickoffEpoch - 1 },
    ] }, fixtures);
    expect(result.store.records).toEqual([]);
    expect(result.rejected).toBeGreaterThanOrEqual(4);
  });
});
