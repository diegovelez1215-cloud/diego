import { describe, expect, it } from 'vitest';
import { completeActiveMatch, createTournamentCampaign, fixtureForActive, groupStandings, openNextMatch, TOURNAMENT_STORAGE_KEY, validateCampaign } from './tournament';

describe('Your World Cup fictional tournament domain', () => {
  it('creates a deterministic 48-team, 12-group, three-match schedule with no duplicate or self fixtures', () => {
    const first = createTournamentCampaign(42, 'arg'); const same = createTournamentCampaign(42, 'arg'); const different = createTournamentCampaign(43, 'arg');
    expect(first.groups).toEqual(same.groups); expect(first.groups).not.toEqual(different.groups);
    expect(Object.keys(first.groups)).toHaveLength(12); expect(Object.values(first.groups).flat()).toHaveLength(48);
    expect(first.fixtures).toHaveLength(72); expect(new Set(first.fixtures.map((fixture) => fixture.id)).size).toBe(72);
    expect(first.fixtures.every((fixture) => fixture.home !== fixture.away)).toBe(true);
    expect(first.fixtures.filter((fixture) => fixture.home === 'arg' || fixture.away === 'arg')).toHaveLength(3);
  });

  it('settles every group match exactly once and applies points, goal difference, goals scored, then team code', () => {
    let campaign = createTournamentCampaign(42, 'arg');
    for (let match = 0; match < 3; match++) { campaign = openNextMatch(campaign); const fixture = fixtureForActive(campaign)!; campaign = completeActiveMatch(campaign, { homeGoals: fixture.home === 'arg' ? 3 : 0, awayGoals: fixture.away === 'arg' ? 3 : 0 }); }
    expect(campaign.fixtures.filter((fixture) => fixture.stage === 'groups' && fixture.played)).toHaveLength(72);
    const table = groupStandings(campaign, Object.entries(campaign.groups).find(([, teams]) => teams.includes('arg'))![0]);
    expect(table.every((row, index) => index === 0 || row.points <= table[index - 1].points)).toBe(true);
    expect(table.reduce((total, row) => total + row.played, 0)).toBe(12);
  });

  it('creates a deterministic no-draw knockout and progresses a winning selected nation to a trophy', () => {
    let campaign = createTournamentCampaign(4, 'arg');
    for (let guard = 0; guard < 10 && !campaign.trophy && !campaign.eliminated; guard++) {
      campaign = openNextMatch(campaign); const fixture = fixtureForActive(campaign)!;
      campaign = completeActiveMatch(campaign, { homeGoals: fixture.home === 'arg' ? 5 : 0, awayGoals: fixture.away === 'arg' ? 5 : 0 });
    }
    expect(campaign.trophy).toBe(true); expect(campaign.eliminated).toBe(false); expect(campaign.fixtures.filter((fixture) => fixture.stage === 'round-of-32')).toHaveLength(16);
    expect(campaign.fixtures.filter((fixture) => fixture.stage !== 'groups' && fixture.played).every((fixture) => fixture.winner && fixture.winner !== '')).toBe(true);
  });

  it('uses the one permitted isolated storage key and rejects malformed campaigns', () => {
    expect(TOURNAMENT_STORAGE_KEY).toBe('u26v2.your-world-cup.campaign');
    expect(validateCampaign(createTournamentCampaign())).toBe(true); expect(validateCampaign({ version: 4, fixtures: [{ id: 'x', home: 'arg', away: 'arg' }] })).toBe(false);
  });
});
