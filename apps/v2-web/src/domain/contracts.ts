export type TournamentStage = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'bronze' | 'final';

export type TeamSummary = Readonly<{
  kind: 'team';
  code: string;
  name: string;
  flag: string;
}>;

export type UnresolvedSlot = Readonly<{
  kind: 'unresolved';
  label: string;
}>;

export type FixtureParticipant = TeamSummary | UnresolvedSlot;

export type OfficialScore = Readonly<{
  home: number;
  away: number;
}>;

export type FixtureStatus =
  | Readonly<{ kind: 'scheduled'; score: null }>
  | Readonly<{ kind: 'live'; minute: number | null; score: OfficialScore | null; scoreState: 'available' | 'pending' }>
  | Readonly<{ kind: 'final'; score: OfficialScore }>
  | Readonly<{ kind: 'pending'; reason: 'on-hold' | 'score-pending'; score: null }>
  | Readonly<{ kind: 'unavailable'; reason: 'provider-unavailable' | 'provider-partial'; score: null }>;

export type FixtureSummary = Readonly<{
  id: number;
  stage: TournamentStage;
  stageName: string;
  group: string | null;
  kickoff: string;
  kickoffEpoch: number;
  tournamentDay: string;
  kickoffLabel: string;
  venue: string;
  stadium: string;
  home: FixtureParticipant;
  away: FixtureParticipant;
  status: FixtureStatus;
  winner: 'home' | 'away' | 'draw' | null;
}>;

export type GroupRow = Readonly<{
  rank: number;
  team: TeamSummary;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}>;

export type GroupTable = Readonly<{
  group: string;
  state: 'not-started' | 'provisional' | 'complete';
  rows: readonly GroupRow[];
}>;

export type BracketMatch = Readonly<{
  fixture: FixtureSummary;
  winnerFeeds: Readonly<{ fixtureId: number; side: 'home' | 'away' }> | null;
  loserFeeds: Readonly<{ fixtureId: number; side: 'home' | 'away' }> | null;
}>;

export type BracketRound = Readonly<{
  stage: Exclude<TournamentStage, 'group'>;
  name: string;
  matches: readonly BracketMatch[];
}>;

export type OfficialSourceState =
  | Readonly<{ kind: 'verified'; fetchedAt: string | null }>
  | Readonly<{ kind: 'partial'; fetchedAt: string | null }>
  | Readonly<{ kind: 'unavailable'; fetchedAt: null }>;

export type TournamentSnapshot = Readonly<{
  source: OfficialSourceState;
  fixtures: readonly FixtureSummary[];
  groups: readonly GroupTable[];
  bracket: readonly BracketRound[];
  rejectedProviderEntries: number;
}>;

export type ProviderFixtureInput = Readonly<{
  home?: unknown;
  away?: unknown;
  gh?: unknown;
  ga?: unknown;
  winner?: unknown;
  status?: unknown;
  kind?: unknown;
  min?: unknown;
  utcDate?: unknown;
  date?: unknown;
}>;

export type ProviderResultsInput = Readonly<{
  configured?: boolean;
  sourceStatus?: string;
  isStale?: boolean;
  fetchedAt?: string;
  finished?: readonly ProviderFixtureInput[];
  live?: readonly ProviderFixtureInput[];
  hold?: readonly ProviderFixtureInput[];
  scheduled?: readonly ProviderFixtureInput[];
}>;

export type ProviderLiveInput = Readonly<{
  configured?: boolean;
  sourceStatus?: string;
  isStale?: boolean;
  fetchedAt?: string;
  response?: readonly ProviderFixtureInput[];
  finished?: readonly ProviderFixtureInput[];
}>;

export type NormalizedOfficialOverlayInput = Readonly<{
  source: 'official-provider';
  results?: ProviderResultsInput;
  live?: ProviderLiveInput;
}>;

export type OverlayValidationResult =
  | Readonly<{ accepted: true; value: NormalizedOfficialOverlayInput }>
  | Readonly<{ accepted: false; reason: 'not-an-object' | 'wrong-source' | 'simulation-or-play-state' | 'invalid-provider-shape' }>;

export type OverlayRejectionReason = Extract<OverlayValidationResult, { accepted: false }>['reason'];

export type OfficialOverlayApplication =
  | Readonly<{ accepted: true; snapshot: TournamentSnapshot }>
  | Readonly<{ accepted: false; reason: OverlayRejectionReason }>;

export type KnockoutFinal = Readonly<{ winner: 'home' | 'away' }>;
