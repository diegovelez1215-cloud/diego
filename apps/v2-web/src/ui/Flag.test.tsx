import { describe, expect, it } from 'vitest';
import { canonicalTournamentSnapshot } from '../domain/tournament-bridge';
import { FLAG_CODE_MAP } from './Flag';

describe('local canonical flag coverage', () => {
  it('maps every canonical group team exactly once to a local sprite symbol', () => {
    const canonicalCodes = [...new Set(canonicalTournamentSnapshot().groups.flatMap((group) => group.rows.map((row) => row.team.code)))].sort();
    expect(canonicalCodes).toHaveLength(48);
    expect(Object.keys(FLAG_CODE_MAP).sort()).toEqual(canonicalCodes);
    expect(new Set(Object.values(FLAG_CODE_MAP)).size).toBe(48);
  });
});
