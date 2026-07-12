import type {
  BracketMatch,
  BracketRound,
  FixtureParticipant,
  FixtureStatus,
  FixtureSummary,
  GroupRow,
  GroupTable,
  KnockoutFinal,
  NormalizedOfficialOverlayInput,
  OfficialOverlayApplication,
  OfficialScore,
  OfficialSourceState,
  OverlayValidationResult,
  TeamSummary,
  TournamentSnapshot,
  TournamentStage,
} from './contracts';

// The V1 modules remain the authority. These imports are intentionally kept
// behind this read-only facade until their TypeScript migration is characterized.
// @ts-expect-error V1 is JavaScript; this bridge supplies the public types.
import { allFixtures, fixture, fixturesOnDay, loserFeeds, resolveSlots, teamFlag, teamName, winnerFeeds, computeStandings } from '../../../../src/core/canonical-truth.js';
// @ts-expect-error V1 is JavaScript; this bridge supplies the public types.
import { buildOverlay } from '../../../../src/core/provider-overlay.js';
// @ts-expect-error V1 is JavaScript; this bridge supplies the public types.
import { fixtureModel, groupsModel, knockoutModel } from '../../../../src/data/tournament-model.js';

type V1Fixture = Readonly<{
  id: number;
  stage: TournamentStage;
  group?: string;
  home: string;
  away: string;
  kickoff: string;
  epoch: number;
  day: string;
  venue: string;
}>;

type V1Overlay = {
  providerState: 'ok' | 'partial' | 'unavailable';
  fetchedAt: string | null;
  rejected: number;
  standings: unknown;
  slots: Map<number, { home: string | null; away: string | null }>;
};

const EMPTY_OVERLAY = buildOverlay({}) as V1Overlay;

function team(code: string): TeamSummary {
  return Object.freeze({ kind: 'team', code, name: teamName(code), flag: teamFlag(code) });
}

const PROGRESSION_STAGE_NAMES: Record<TournamentStage, string> = {
  group: 'Group stage',
  r32: 'Round of 32',
  r16: 'Round of 16',
  qf: 'Quarter-final',
  sf: 'Semi-final',
  bronze: 'Third-place match',
  final: 'Final',
};

function progressionLabel(spec: string): string {
  let match: RegExpExecArray | null;
  if ((match = /^1([A-L])$/.exec(spec))) return `Group ${match[1]} winner`;
  if ((match = /^2([A-L])$/.exec(spec))) return `Group ${match[1]} runner-up`;
  if ((match = /^3:([A-L]+)$/.exec(spec))) return `Best third-place team · Groups ${match[1].split('').join('/')}`;
  if ((match = /^([WL])(\d+)$/.exec(spec))) {
    const source = fixture(Number(match[2])) as V1Fixture | null;
    if (!source) return match[1] === 'W' ? 'Previous match winner' : 'Previous match runner-up';
    const stageFixtures = (allFixtures() as V1Fixture[]).filter((candidate) => candidate.stage === source.stage);
    const position = stageFixtures.findIndex((candidate) => candidate.id === source.id) + 1;
    const outcome = match[1] === 'W' ? 'winner' : 'runner-up';
    return `${PROGRESSION_STAGE_NAMES[source.stage]} ${position} ${outcome}`;
  }
  return 'Qualification path pending';
}

function participant(side: { code: string | null; name: string; flag: string; pending: boolean }, spec: string): FixtureParticipant {
  return side.pending || !side.code
    ? Object.freeze({ kind: 'unresolved', label: progressionLabel(spec) })
    : Object.freeze({ kind: 'team', code: side.code, name: side.name, flag: side.flag });
}

function score(home: number | null, away: number | null): OfficialScore | null {
  return home == null || away == null ? null : Object.freeze({ home, away });
}

function statusFor(model: { status: string; min: number | null; gh: number | null; ga: number | null; scoreKnown: boolean }): FixtureStatus {
  const officialScore = model.scoreKnown ? score(model.gh, model.ga) : null;
  if (model.status === 'final' && officialScore) return Object.freeze({ kind: 'final', score: officialScore });
  if (model.status === 'live') {
    return Object.freeze({ kind: 'live', minute: model.min, score: officialScore, scoreState: officialScore ? 'available' : 'pending' });
  }
  if (model.status === 'hold') return Object.freeze({ kind: 'pending', reason: 'on-hold', score: null });
  return Object.freeze({ kind: 'scheduled', score: null });
}

function projectFixture(raw: V1Fixture, overlay: V1Overlay): FixtureSummary {
  const model = fixtureModel(raw, overlay) as {
    id: number; stage: TournamentStage; stageName: string; group?: string; epoch: number; day: string; time: string;
    venueCity: string; stadium: string; home: { code: string | null; name: string; flag: string; pending: boolean };
    away: { code: string | null; name: string; flag: string; pending: boolean }; status: string; min: number | null;
    gh: number | null; ga: number | null; scoreKnown: boolean; winner: 'home' | 'away' | 'draw' | null;
  };
  return Object.freeze({
    id: model.id,
    stage: model.stage,
    stageName: model.stageName,
    group: model.group || null,
    kickoff: raw.kickoff,
    kickoffEpoch: model.epoch,
    tournamentDay: model.day,
    kickoffLabel: model.time,
    venue: model.venueCity,
    stadium: model.stadium,
    home: participant(model.home, raw.home),
    away: participant(model.away, raw.away),
    status: statusFor(model),
    winner: model.winner,
  });
}

function sourceFor(overlay: V1Overlay): OfficialSourceState {
  if (overlay.providerState === 'ok') return Object.freeze({ kind: 'verified', fetchedAt: overlay.fetchedAt });
  if (overlay.providerState === 'partial') return Object.freeze({ kind: 'partial', fetchedAt: overlay.fetchedAt });
  return Object.freeze({ kind: 'unavailable', fetchedAt: null });
}

function projectGroups(overlay: V1Overlay): readonly GroupTable[] {
  return Object.freeze((groupsModel(overlay) as Array<{ group: string; complete: boolean; rows: Array<{ rank: number; code: string; p: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; pts: number }> }>).map((group) => {
    const rows: readonly GroupRow[] = Object.freeze(group.rows.map((row) => Object.freeze({
      rank: row.rank,
      team: team(row.code),
      played: row.p,
      won: row.w,
      drawn: row.d,
      lost: row.l,
      goalsFor: row.gf,
      goalsAgainst: row.ga,
      goalDifference: row.gd,
      points: row.pts,
    })));
    const played = rows.reduce((total, row) => total + row.played, 0);
    return Object.freeze({ group: group.group, state: group.complete ? 'complete' : played === 0 ? 'not-started' : 'provisional', rows });
  }));
}

function projectBracket(overlay: V1Overlay): readonly BracketRound[] {
  const model = knockoutModel(overlay) as { rounds: Array<{ stage: Exclude<TournamentStage, 'group'>; name: string; list: V1Fixture[] }> };
  return Object.freeze(model.rounds.map((round) => Object.freeze({
    stage: round.stage,
    name: round.name,
    matches: Object.freeze(round.list.map((item): BracketMatch => {
      const raw = fixture(item.id) as V1Fixture;
      const next = winnerFeeds(raw.id) as { id: number; side: 'home' | 'away' } | null;
      const loser = loserFeeds(raw.id) as { id: number; side: 'home' | 'away' } | null;
      return Object.freeze({
        fixture: projectFixture(raw, overlay),
        winnerFeeds: next ? Object.freeze({ fixtureId: next.id, side: next.side }) : null,
        loserFeeds: loser ? Object.freeze({ fixtureId: loser.id, side: loser.side }) : null,
      });
    })),
  })));
}

function snapshotFor(overlay: V1Overlay): TournamentSnapshot {
  return Object.freeze({
    source: sourceFor(overlay),
    fixtures: Object.freeze((allFixtures() as V1Fixture[]).map((raw) => projectFixture(raw, overlay))),
    groups: projectGroups(overlay),
    bracket: projectBracket(overlay),
    rejectedProviderEntries: overlay.rejected,
  });
}

export function canonicalTournamentSnapshot(): TournamentSnapshot {
  return snapshotFor(EMPTY_OVERLAY);
}

export function canonicalFixtures(): readonly FixtureSummary[] {
  return canonicalTournamentSnapshot().fixtures;
}

export function fixtureById(id: number): FixtureSummary | null {
  const raw = fixture(id) as V1Fixture | null;
  return raw ? projectFixture(raw, EMPTY_OVERLAY) : null;
}

export function fixturesOnTournamentDay(day: string): readonly FixtureSummary[] {
  return Object.freeze((fixturesOnDay(day) as V1Fixture[]).map((raw) => projectFixture(raw, EMPTY_OVERLAY)));
}

export function teamSummary(code: string): TeamSummary | null {
  const found = (allFixtures() as Array<V1Fixture & { home?: string; away?: string }>).some((raw) => raw.home === code || raw.away === code);
  return found ? team(code) : null;
}

function finalsMap(finals: ReadonlyMap<number, OfficialScore>): Map<number, { gh: number; ga: number }> {
  return new Map([...finals.entries()].map(([id, value]) => [id, { gh: value.home, ga: value.away }]));
}

export function groupStandingsFromFinals(finals: ReadonlyMap<number, OfficialScore>): readonly GroupTable[] {
  const standings = computeStandings(finalsMap(finals)) as { groups: Record<string, Array<{ code: string; p: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; pts: number }>>; complete: Record<string, boolean> };
  return Object.freeze(Object.keys(standings.groups).sort().map((group) => {
    const rows = Object.freeze(standings.groups[group].map((row, index) => Object.freeze({
      rank: index + 1, team: team(row.code), played: row.p, won: row.w, drawn: row.d, lost: row.l,
      goalsFor: row.gf, goalsAgainst: row.ga, goalDifference: row.gd, points: row.pts,
    })));
    const played = rows.reduce((total, row) => total + row.played, 0);
    return Object.freeze({ group, state: standings.complete[group] ? 'complete' : played === 0 ? 'not-started' : 'provisional', rows });
  }));
}

export function knockoutSlotsFromFinals(groupFinals: ReadonlyMap<number, OfficialScore>, knockoutFinals: ReadonlyMap<number, KnockoutFinal> = new Map()): ReadonlyMap<number, Readonly<{ home: TeamSummary | null; away: TeamSummary | null }>> {
  const standings = computeStandings(finalsMap(groupFinals));
  const winners = new Map([...knockoutFinals.entries()].map(([id, final]) => [id, { winner: final.winner }]));
  const slots = resolveSlots(standings, winners) as Map<number, { home: string | null; away: string | null }>;
  return new Map([...slots.entries()].map(([id, sides]) => [id, Object.freeze({ home: sides.home ? team(sides.home) : null, away: sides.away ? team(sides.away) : null })]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function providerPayload(value: unknown): boolean {
  if (value == null) return true;
  if (!isRecord(value)) return false;
  return ['finished', 'live', 'hold', 'scheduled', 'response'].every((key) => value[key] == null || Array.isArray(value[key]));
}

export function normalizeOfficialOverlayInput(value: unknown): OverlayValidationResult {
  if (!isRecord(value)) return Object.freeze({ accepted: false, reason: 'not-an-object' });
  if ('finals' in value || 'simulation' in value || 'play' in value || value.mode === 'sim') {
    return Object.freeze({ accepted: false, reason: 'simulation-or-play-state' });
  }
  if (value.source !== 'official-provider') return Object.freeze({ accepted: false, reason: 'wrong-source' });
  if (!providerPayload(value.results) || !providerPayload(value.live)) {
    return Object.freeze({ accepted: false, reason: 'invalid-provider-shape' });
  }
  return Object.freeze({ accepted: true, value: Object.freeze({
    source: 'official-provider',
    ...(value.results == null ? {} : { results: value.results as NormalizedOfficialOverlayInput['results'] }),
    ...(value.live == null ? {} : { live: value.live as NormalizedOfficialOverlayInput['live'] }),
  }) });
}

export function applyOfficialOverlay(value: unknown): OfficialOverlayApplication {
  const normalized = normalizeOfficialOverlayInput(value);
  if (!normalized.accepted) return Object.freeze({ accepted: false, reason: normalized.reason });
  return Object.freeze({ accepted: true, snapshot: snapshotFor(buildOverlay(normalized.value) as V1Overlay) });
}
