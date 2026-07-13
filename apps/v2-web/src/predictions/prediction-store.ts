import type { FixtureSummary } from '../domain/contracts';
import {
  PREDICTION_SCHEMA_VERSION,
  PREDICTION_STORAGE_KEY,
  drawAllowed,
  hasResolvedParticipants,
  type LocalPrediction,
  type PredictionConfidence,
  type PredictionOutcome,
  type PredictionStore,
} from './contracts';
import { canChooseOutcome, isLockedAtKickoff } from './prediction-bridge';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export type StoreRead = Readonly<{
  store: PredictionStore;
  rejected: number;
  reason: 'ok' | 'malformed' | 'future-version';
}>;

export type ConfirmInput = Readonly<{
  fixtureId: number;
  outcome: PredictionOutcome;
  confidence?: PredictionConfidence;
}>;

export type ConfirmResult =
  | Readonly<{ accepted: true; store: PredictionStore; record: LocalPrediction }>
  | Readonly<{ accepted: false; reason: 'unknown-fixture' | 'unresolved-fixture' | 'invalid-outcome' | 'locked' }>;

const EMPTY_STORE: PredictionStore = Object.freeze({ version: PREDICTION_SCHEMA_VERSION, records: Object.freeze([]) });

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value ? value : null;
}

function validConfidence(value: unknown): value is PredictionConfidence {
  return value === 1 || value === 2 || value === 3;
}

function validOutcome(value: unknown): value is PredictionOutcome {
  return value === 'home' || value === 'away' || value === 'draw';
}

function validateStoredRecord(value: unknown, fixtures: readonly FixtureSummary[]): LocalPrediction | null {
  if (!isRecord(value) || !Number.isSafeInteger(value.fixtureId)) return null;
  const fixture = fixtures.find((candidate) => candidate.id === value.fixtureId);
  if (!fixture || !hasResolvedParticipants(fixture) || !validOutcome(value.outcome)) return null;
  if (!canChooseOutcome(fixture, value.outcome) || (value.outcome === 'draw' && !drawAllowed(fixture))) return null;
  const confirmedAt = parseTimestamp(value.confirmedAt);
  if (!confirmedAt || Date.parse(confirmedAt) >= fixture.kickoffEpoch) return null;
  if (value.kickoffEpoch !== fixture.kickoffEpoch) return null;
  if (value.confidence != null && !validConfidence(value.confidence)) return null;
  return Object.freeze({
    fixtureId: fixture.id,
    outcome: value.outcome,
    ...(value.confidence == null ? {} : { confidence: value.confidence }),
    confirmedAt,
    kickoffEpoch: fixture.kickoffEpoch,
  });
}

export function sanitizePredictionStore(value: unknown, fixtures: readonly FixtureSummary[]): StoreRead {
  if (!isRecord(value)) return Object.freeze({ store: EMPTY_STORE, rejected: 0, reason: 'malformed' });
  if (typeof value.version !== 'number' || !Number.isSafeInteger(value.version) || value.version > PREDICTION_SCHEMA_VERSION) {
    return Object.freeze({ store: EMPTY_STORE, rejected: 0, reason: 'future-version' });
  }
  if (value.version !== PREDICTION_SCHEMA_VERSION || !Array.isArray(value.records)) {
    return Object.freeze({ store: EMPTY_STORE, rejected: 0, reason: 'malformed' });
  }

  const duplicates = new Set<number>();
  const seen = new Set<number>();
  const valid: LocalPrediction[] = [];
  let rejected = 0;
  for (const raw of value.records) {
    const record = validateStoredRecord(raw, fixtures);
    if (!record) { rejected++; continue; }
    if (seen.has(record.fixtureId)) { duplicates.add(record.fixtureId); continue; }
    seen.add(record.fixtureId);
    valid.push(record);
  }
  const records = valid.filter((record) => {
    if (!duplicates.has(record.fixtureId)) return true;
    rejected++;
    return false;
  }).sort((a, b) => a.fixtureId - b.fixtureId);
  return Object.freeze({
    store: Object.freeze({ version: PREDICTION_SCHEMA_VERSION, records: Object.freeze(records) }),
    rejected,
    reason: 'ok',
  });
}

export function readPredictionStore(storage: StorageLike | null | undefined, fixtures: readonly FixtureSummary[]): StoreRead {
  if (!storage) return Object.freeze({ store: EMPTY_STORE, rejected: 0, reason: 'malformed' });
  try {
    const raw = storage.getItem(PREDICTION_STORAGE_KEY);
    if (!raw) return Object.freeze({ store: EMPTY_STORE, rejected: 0, reason: 'ok' });
    return sanitizePredictionStore(JSON.parse(raw), fixtures);
  } catch {
    return Object.freeze({ store: EMPTY_STORE, rejected: 0, reason: 'malformed' });
  }
}

export function writePredictionStore(storage: StorageLike | null | undefined, store: PredictionStore): void {
  if (!storage) return;
  try { storage.setItem(PREDICTION_STORAGE_KEY, JSON.stringify(store)); } catch { /* local-only persistence is non-fatal */ }
}

export function confirmPrediction(current: PredictionStore, fixtures: readonly FixtureSummary[], input: ConfirmInput, now = Date.now()): ConfirmResult {
  const fixture = fixtures.find((candidate) => candidate.id === input.fixtureId) || null;
  if (!fixture) return Object.freeze({ accepted: false, reason: 'unknown-fixture' });
  if (!hasResolvedParticipants(fixture)) return Object.freeze({ accepted: false, reason: 'unresolved-fixture' });
  if (!canChooseOutcome(fixture, input.outcome)) return Object.freeze({ accepted: false, reason: 'invalid-outcome' });
  if (isLockedAtKickoff(fixture, now)) return Object.freeze({ accepted: false, reason: 'locked' });
  const record = Object.freeze({
    fixtureId: fixture.id,
    outcome: input.outcome,
    ...(input.confidence == null ? {} : { confidence: input.confidence }),
    confirmedAt: new Date(now).toISOString(),
    kickoffEpoch: fixture.kickoffEpoch,
  });
  const records = [...current.records.filter((candidate) => candidate.fixtureId !== fixture.id), record].sort((a, b) => a.fixtureId - b.fixtureId);
  return Object.freeze({ accepted: true, record, store: Object.freeze({ version: PREDICTION_SCHEMA_VERSION, records: Object.freeze(records) }) });
}
