import type { Tactics } from './contracts';

export const TOURNAMENT_STORAGE_KEY = 'u26v2.your-world-cup.campaign';
export const TOURNAMENT_VERSION = 4;

export type TournamentStage = 'groups' | 'round-of-32' | 'round-of-16' | 'quarterfinal' | 'semifinal' | 'final' | 'complete' | 'eliminated';
export type TournamentTeam = Readonly<{ id: string; name: string; code: string; rating: number; color: string }>;
export type TournamentFixture = Readonly<{
  id: string; stage: Exclude<TournamentStage, 'complete' | 'eliminated'>; round: number; group?: string;
  home: string; away: string; played?: boolean; homeGoals?: number; awayGoals?: number;
  homePenalties?: number; awayPenalties?: number; winner?: string; recap?: string;
}>;
export type Standing = Readonly<{ team: string; played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; goalDifference: number; points: number }>;
export type TournamentCampaign = Readonly<{
  version: 4; id: string; seed: number; nation: string; tactics: Tactics; screen: 'opening' | 'nation' | 'draw' | 'wall' | 'tactics' | 'match' | 'result';
  groups: Readonly<Record<string, readonly string[]>>; fixtures: readonly TournamentFixture[]; activeFixtureId: string | null;
  stage: TournamentStage; history: readonly string[]; trophy: boolean; eliminated: boolean;
}>;

const colors = ['#75aadb', '#07854e', '#dc3d42', '#f0c420', '#e85d04', '#3459a6', '#fff6df', '#7c3f98', '#e32b57', '#3e9c6d', '#ce3d2f', '#1d77a8'];
const nationRows = [
  ['Argentina', 'ARG'], ['Nigeria', 'NGA'], ['Poland', 'POL'], ['New Zealand', 'NZL'], ['Mexico', 'MEX'], ['Japan', 'JPN'], ['Brazil', 'BRA'], ['Canada', 'CAN'], ['United States', 'USA'], ['France', 'FRA'], ['Spain', 'ESP'], ['Germany', 'GER'],
  ['England', 'ENG'], ['Italy', 'ITA'], ['Portugal', 'POR'], ['Netherlands', 'NED'], ['Belgium', 'BEL'], ['Croatia', 'CRO'], ['Uruguay', 'URU'], ['Colombia', 'COL'], ['Ecuador', 'ECU'], ['Chile', 'CHI'], ['Peru', 'PER'], ['Paraguay', 'PAR'],
  ['Morocco', 'MAR'], ['Senegal', 'SEN'], ['Egypt', 'EGY'], ['Ghana', 'GHA'], ['Cameroon', 'CMR'], ['South Korea', 'KOR'], ['Australia', 'AUS'], ['Saudi Arabia', 'KSA'], ['Iran', 'IRN'], ['Qatar', 'QAT'], ['Costa Rica', 'CRC'], ['Panama', 'PAN'],
  ['Jamaica', 'JAM'], ['Honduras', 'HON'], ['Switzerland', 'SUI'], ['Denmark', 'DEN'], ['Serbia', 'SRB'], ['Turkey', 'TUR'], ['Ukraine', 'UKR'], ['Austria', 'AUT'], ['Czechia', 'CZE'], ['Norway', 'NOR'], ['Algeria', 'ALG'], ['Tunisia', 'TUN'],
] as const;

const hash = (value: string) => [...value].reduce((result, char) => Math.imul(result ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261);
const random = (seed: number, key: string) => (hash(`${seed}:${key}`) % 10000) / 10000;
const byId = (teams: readonly TournamentTeam[], id: string) => teams.find((team) => team.id === id)!;

export const TOURNAMENT_TEAMS: readonly TournamentTeam[] = Object.freeze(nationRows.map(([name, code], index) => Object.freeze({
  id: code.toLowerCase(), name, code, rating: 68 + (hash(code) % 25), color: colors[index % colors.length],
})));

const groupLetters = 'ABCDEFGHIJKL'.split('');
const pairs: readonly (readonly [number, number])[] = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];

function orderedTeams(seed: number, selected: string) {
  const selectedTeam = TOURNAMENT_TEAMS.find((team) => team.id === selected) ?? TOURNAMENT_TEAMS[0];
  const others = TOURNAMENT_TEAMS.filter((team) => team.id !== selectedTeam.id).slice().sort((a, b) => random(seed, a.id) - random(seed, b.id));
  return [selectedTeam, ...others];
}

export function createTournamentCampaign(seed = 26062026, nation = 'arg'): TournamentCampaign {
  const teams = orderedTeams(seed, nation);
  const groups = Object.fromEntries(groupLetters.map((letter, index) => [letter, Object.freeze(teams.slice(index * 4, index * 4 + 4).map((team) => team.id))])) as Record<string, readonly string[]>;
  const fixtures = groupLetters.flatMap((group) => pairs.map(([homeIndex, awayIndex], round) => Object.freeze({
    id: `g-${group}-${round + 1}`, stage: 'groups' as const, round: Math.floor(round / 2) + 1, group,
    home: groups[group][homeIndex], away: groups[group][awayIndex],
  })));
  return Object.freeze({ version: TOURNAMENT_VERSION, id: `your-world-cup-${seed}`, seed, nation, tactics: { shape: '4-3-3-wide', press: 'balanced', finalThird: 'wings' } as Tactics, screen: 'opening', groups: Object.freeze(groups), fixtures: Object.freeze(fixtures), activeFixtureId: null, stage: 'groups', history: Object.freeze([]), trophy: false, eliminated: false });
}

export function groupStandings(campaign: TournamentCampaign, group: string): readonly Standing[] {
  const table = new Map(campaign.groups[group].map((team) => [team, { team, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 }]));
  for (const fixture of campaign.fixtures) {
    if (fixture.group !== group || !fixture.played) continue;
    const home = table.get(fixture.home)!; const away = table.get(fixture.away)!;
    const hg = fixture.homeGoals!; const ag = fixture.awayGoals!;
    home.played++; away.played++; home.goalsFor += hg; home.goalsAgainst += ag; away.goalsFor += ag; away.goalsAgainst += hg;
    if (hg > ag) { home.wins++; away.losses++; home.points += 3; } else if (hg < ag) { away.wins++; home.losses++; away.points += 3; } else { home.draws++; away.draws++; home.points++; away.points++; }
  }
  for (const row of table.values()) row.goalDifference = row.goalsFor - row.goalsAgainst;
  return Object.freeze([...table.values()].sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.team.localeCompare(b.team)).map((row) => Object.freeze(row)));
}

function nonPlayerResult(campaign: TournamentCampaign, fixture: TournamentFixture) {
  const home = byId(TOURNAMENT_TEAMS, fixture.home); const away = byId(TOURNAMENT_TEAMS, fixture.away);
  const bias = (home.rating - away.rating) / 22 + random(campaign.seed, `${fixture.id}:home`) - .48;
  const homeGoals = Math.max(0, Math.min(5, Math.floor(1.25 + bias + random(campaign.seed, `${fixture.id}:hg`) * 2)));
  const awayGoals = Math.max(0, Math.min(5, Math.floor(1.12 - bias + random(campaign.seed, `${fixture.id}:ag`) * 2)));
  return { homeGoals, awayGoals };
}

function knockoutResult(campaign: TournamentCampaign, fixture: TournamentFixture, score?: { homeGoals: number; awayGoals: number }) {
  const result = score ?? nonPlayerResult(campaign, fixture);
  let homeGoals = result.homeGoals; let awayGoals = result.awayGoals; let homePenalties: number | undefined; let awayPenalties: number | undefined;
  if (homeGoals === awayGoals) {
    const homeExtra = random(campaign.seed, `${fixture.id}:extra-home`) > .66 ? 1 : 0;
    const awayExtra = random(campaign.seed, `${fixture.id}:extra-away`) > .66 ? 1 : 0;
    homeGoals += homeExtra; awayGoals += awayExtra;
    if (homeGoals === awayGoals) {
      const roll = random(campaign.seed, `${fixture.id}:pens`);
      homePenalties = roll > .5 ? 5 : 4; awayPenalties = roll > .5 ? 4 : 5;
    }
  }
  const winner = homeGoals > awayGoals || (homeGoals === awayGoals && homePenalties! > awayPenalties!) ? fixture.home : fixture.away;
  return { homeGoals, awayGoals, homePenalties, awayPenalties, winner };
}

function completeFixture(campaign: TournamentCampaign, fixture: TournamentFixture, playerScore?: { homeGoals: number; awayGoals: number }) {
  const result = fixture.stage === 'groups' ? (playerScore ?? nonPlayerResult(campaign, fixture)) : knockoutResult(campaign, fixture, playerScore);
  const score = result as { homeGoals: number; awayGoals: number; homePenalties?: number; awayPenalties?: number; winner?: string };
  return Object.freeze({ ...fixture, ...score, played: true, recap: `${byId(TOURNAMENT_TEAMS, fixture.home).code} ${score.homeGoals}–${score.awayGoals} ${byId(TOURNAMENT_TEAMS, fixture.away).code}${score.homePenalties != null ? ` (${score.homePenalties}–${score.awayPenalties} pens)` : ''}` });
}

function replaceFixtures(campaign: TournamentCampaign, updates: readonly TournamentFixture[]) {
  const map = new Map(updates.map((fixture) => [fixture.id, fixture]));
  return Object.freeze(campaign.fixtures.map((fixture) => map.get(fixture.id) ?? fixture));
}

function advanceGroupRound(campaign: TournamentCampaign, current: TournamentFixture, playerScore: { homeGoals: number; awayGoals: number }) {
  const updates: TournamentFixture[] = [];
  for (const fixture of campaign.fixtures.filter((item) => item.stage === 'groups' && item.round === current.round && !item.played)) updates.push(completeFixture(campaign, fixture, fixture.id === current.id ? playerScore : undefined));
  return { ...campaign, fixtures: replaceFixtures(campaign, updates) } as TournamentCampaign;
}

function qualifiers(campaign: TournamentCampaign) {
  const firstSecond = groupLetters.flatMap((group) => groupStandings(campaign, group).slice(0, 2).map((row) => row.team));
  const thirds = groupLetters.map((group) => groupStandings(campaign, group)[2]).sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.team.localeCompare(b.team)).slice(0, 8).map((row) => row.team);
  return [...firstSecond, ...thirds];
}

function nextRoundFixtures(campaign: TournamentCampaign, stage: Exclude<TournamentStage, 'groups' | 'complete' | 'eliminated'>, entrants: readonly string[]) {
  return entrants.reduce<TournamentFixture[]>((fixtures, team, index) => index % 2 ? fixtures : [...fixtures, Object.freeze({ id: `${stage}-${index / 2 + 1}`, stage, round: 1, home: team, away: entrants[index + 1] })], []);
}

function playerFixture(campaign: TournamentCampaign) { return campaign.fixtures.find((fixture) => !fixture.played && (fixture.home === campaign.nation || fixture.away === campaign.nation)) ?? null; }

export function openNextMatch(campaign: TournamentCampaign): TournamentCampaign {
  const fixture = playerFixture(campaign);
  return Object.freeze({ ...campaign, activeFixtureId: fixture?.id ?? null, screen: fixture ? 'tactics' : 'wall' });
}

export function completeActiveMatch(campaign: TournamentCampaign, score: { homeGoals: number; awayGoals: number }): TournamentCampaign {
  const active = campaign.fixtures.find((fixture) => fixture.id === campaign.activeFixtureId);
  if (!active || active.played) return campaign;
  let next = active.stage === 'groups' ? advanceGroupRound(campaign, active, score) : { ...campaign, fixtures: replaceFixtures(campaign, [completeFixture(campaign, active, score)]) } as TournamentCampaign;
  const playerResult = next.fixtures.find((fixture) => fixture.id === active.id)!;
  const playerWon = playerResult.stage === 'groups' ? true : playerResult.winner === next.nation;
  const history = Object.freeze([...next.history, playerResult.recap!]);
  if (!playerWon) return Object.freeze({ ...next, history, activeFixtureId: null, stage: 'eliminated', eliminated: true, screen: 'result' });
  if (active.stage === 'groups') {
    const groupsDone = next.fixtures.filter((fixture) => fixture.stage === 'groups').every((fixture) => fixture.played);
    if (!groupsDone) return Object.freeze({ ...next, history, activeFixtureId: null, screen: 'result' });
    const qualified = qualifiers(next).includes(next.nation);
    if (!qualified) return Object.freeze({ ...next, history, activeFixtureId: null, stage: 'eliminated', eliminated: true, screen: 'result' });
    next = { ...next, fixtures: Object.freeze([...next.fixtures, ...nextRoundFixtures(next, 'round-of-32', qualifiers(next))]), stage: 'round-of-32' } as TournamentCampaign;
  } else {
    const stageFixtures = next.fixtures.filter((fixture) => fixture.stage === active.stage);
    for (const fixture of stageFixtures.filter((fixture) => !fixture.played)) next = { ...next, fixtures: replaceFixtures(next, [completeFixture(next, fixture)]) } as TournamentCampaign;
    const winners = next.fixtures.filter((fixture) => fixture.stage === active.stage).map((fixture) => fixture.winner!);
    if (active.stage === 'final') return Object.freeze({ ...next, history, activeFixtureId: null, stage: 'complete', trophy: true, screen: 'result' });
    const stageOrder: Record<string, Exclude<TournamentStage, 'groups' | 'complete' | 'eliminated'>> = { 'round-of-32': 'round-of-16', 'round-of-16': 'quarterfinal', quarterfinal: 'semifinal', semifinal: 'final' };
    const following = stageOrder[active.stage];
    next = { ...next, fixtures: Object.freeze([...next.fixtures, ...nextRoundFixtures(next, following, winners)]), stage: following } as TournamentCampaign;
  }
  return Object.freeze({ ...next, history, activeFixtureId: null, screen: 'result' });
}

export function fixtureForActive(campaign: TournamentCampaign) { return campaign.fixtures.find((fixture) => fixture.id === campaign.activeFixtureId) ?? null; }
export function teamFor(id: string) { return byId(TOURNAMENT_TEAMS, id); }

export function validateCampaign(value: unknown): value is TournamentCampaign {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TournamentCampaign>;
  return candidate.version === TOURNAMENT_VERSION && typeof candidate.seed === 'number' && typeof candidate.nation === 'string' && Array.isArray(candidate.fixtures) && candidate.fixtures.every((fixture) => fixture && typeof fixture.id === 'string' && typeof fixture.home === 'string' && typeof fixture.away === 'string' && fixture.home !== fixture.away);
}

export function readTournamentCampaign(storage: Pick<Storage, 'getItem'>): TournamentCampaign | null {
  try {
    const raw = storage.getItem(TOURNAMENT_STORAGE_KEY); if (!raw) return null;
    const parsed = JSON.parse(raw); if (validateCampaign(parsed)) return parsed;
    // V3 was the one-fixture prototype. Preserve its selected nation and seed while safely restarting on the full, versioned tournament graph.
    if (parsed?.version === 3 && typeof parsed.seed === 'number' && typeof parsed.nation === 'string' && TOURNAMENT_TEAMS.some((team) => team.name === parsed.nation)) {
      const team = TOURNAMENT_TEAMS.find((candidate) => candidate.name === parsed.nation)!;
      return Object.freeze({ ...createTournamentCampaign(parsed.seed, team.id), screen: 'wall' as const });
    }
    return null;
  } catch { return null; }
}
export function writeTournamentCampaign(storage: Pick<Storage, 'setItem'>, campaign: TournamentCampaign) { storage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(campaign)); }
export function resetTournamentCampaign(storage: Pick<Storage, 'removeItem'>) { storage.removeItem(TOURNAMENT_STORAGE_KEY); }
