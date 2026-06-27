/* Verified fallback manifest for the currently confirmed 2026 FIFA World Cup
 * Round-of-32 pairings.
 *
 * PURPOSE: a DISPLAY-ONLY fallback. When the provider has the scheduled R32 match
 * but leaves one or both participant names blank, these manually-verified names
 * fill the gap so the bracket/Route Explorer can show the real teams.
 *
 * STRICT RULES (enforced by how the client consumes this — see ingestProviderKOFixtures):
 *   - Keyed by the app's STABLE World Cup match/slot number — never array index,
 *     never team-name search.
 *   - Only fills MISSING scheduled R32 participant names for its exact known slot.
 *   - A provider-named scheduled fixture always wins over this manifest.
 *   - A provider final result always wins and is never overwritten.
 *   - Never creates scores, never marks a match final, never advances a team,
 *     never alters standings, group qualification, Player Leaders, or SIM state.
 *   - Tagged source 'verified_fixture' so it stays distinguishable from provider data.
 *
 * Only the independently confirmed slots are listed. Every other R32 slot is left
 * out on purpose, so it remains pending/projected until confirmed. No third-place
 * pairings are inferred.
 */

export const OFFICIAL_R32_SOURCE = 'verified_fixture';

// slot number -> confirmed pairing (team names resolve via the app's name index).
export const OFFICIAL_R32_FIXTURES = {
  73: { home: 'South Africa', away: 'Canada' },
  74: { home: 'Germany', away: 'Paraguay' },
  75: { home: 'Netherlands', away: 'Morocco' },
  76: { home: 'Brazil', away: 'Japan' },
  77: { home: 'France', away: 'Sweden' },
  78: { home: 'Ivory Coast', away: 'Norway' },
  81: { home: 'United States', away: 'Bosnia-Herzegovina' },
  86: { home: 'Argentina', away: 'Cape Verde' },
  88: { home: 'Australia', away: 'Egypt' }
};

// Emit synthetic SCHEDULED fixtures carrying the explicit stable slot number, so
// the existing officialKOFixtures ingestion path keys them by slot. status TIMED +
// no scores => treated strictly as a scheduled (display-only) fixture.
export function verifiedR32ScheduledFixtures() {
  return Object.keys(OFFICIAL_R32_FIXTURES).map(function (num) {
    const p = OFFICIAL_R32_FIXTURES[num];
    return {
      num: +num,
      home: p.home,
      away: p.away,
      gh: null,
      ga: null,
      stage: 'ROUND_OF_32',
      status: 'TIMED',
      kind: 'scheduled',
      source: OFFICIAL_R32_SOURCE,
      verified: true
    };
  });
}
