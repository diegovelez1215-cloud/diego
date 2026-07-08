/* United 2026 · secure serverless proxy for verified World Cup scorers.
 *
 * Uses Football-Data.org's official /competitions/WC/scorers endpoint through
 * the same private FOOTBALL_DATA_KEY as /api/results. If the provider returns
 * no assists, the frontend shows an honest unavailable state.
 *
 * SOURCE SEMANTICS (proved 2026-07-08 against docs + live preview payload):
 * the provider's scorer table is ranked by GOALS and cut off at `limit`, and
 * assists only exist as a field on those goal-ranked rows. With limit=30 the
 * live feed bottomed out at 2 goals, so every 0–1 goal player — including
 * pure assist leaders — was invisible and the Assists card was quietly wrong.
 * We therefore request a limit large enough to cover every realistic goal
 * scorer, rebuild assists from that full verified row set, and report scope
 * honestly: `truncated` flags a response that still hit the row cap, and
 * `assistScope` reminds clients that assists come from scorer rows only, so
 * an assist-only player with zero goals can never be ranked here.
 */
import { cachedRoute, fetchJson, safeLog } from './_shared.js';

// Large enough that the WC scorer table ends before the cap (≈140 scorers in
// a 48-team tournament); small enough to stay one cheap provider call.
export const SCORER_LIMIT = 200;

/**
 * Pure normalization of provider scorer rows (exported for tests).
 * Goals and assists are read verbatim per row — never derived, never
 * fabricated. Assists sort by verified assist count (goal rank is ignored),
 * with goals then name as stable tiebreakers.
 */
export function normalizeScorers(rows) {
  const name = (x) => (x && x.player ? (x.player.name || '') : '');
  const team = (x) => (x && x.team ? (x.team.name || x.team.shortName || '') : '');

  const goals = rows
    .map((x) => ({ player: name(x), team: team(x), n: Number(x && x.goals ? x.goals : 0) }))
    .filter((x) => x.player && x.n > 0)
    .sort((a, b) => b.n - a.n || a.player.localeCompare(b.player));

  const assists = rows
    .map((x) => ({
      player: name(x),
      team: team(x),
      n: Number(x && x.assists ? x.assists : 0),
      g: Number(x && x.goals ? x.goals : 0)
    }))
    .filter((x) => x.player && x.n > 0)
    .sort((a, b) => b.n - a.n || b.g - a.g || a.player.localeCompare(b.player));

  // The provider cannot rank a player who never scored; when the row set also
  // hits the request cap, even the goal-scorer coverage is incomplete.
  const truncated = rows.length >= SCORER_LIMIT;
  if (goals.length) safeLog('scorers_confirmation', { provider: 'football-data', route: '/api/scorers', rows: rows.length, goals: goals.length, assists: assists.length, truncated });
  return {
    configured: true,
    goals,
    assists,
    assistScope: 'scorer-rows',
    truncated,
    fetchedAt: new Date().toISOString()
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const key = process.env.FOOTBALL_DATA_KEY;
  if (!key) {
    res.status(200).json({
      configured: false,
      goals: [],
      assists: [],
      fetchedAt: new Date().toISOString(),
      sourceStatus: 'missing-config',
      isStale: false
    });
    return;
  }

  await cachedRoute(req, res, {
    route: '/api/scorers',
    provider: 'football-data',
    cacheKey: 'scorers:wc',
    ttlMs: 30 * 60000,
    staleMs: 60 * 60000,
    rateLimit: { limit: 30, windowMs: 60000 },
    fallback: { goals: [], assists: [] },
    fetcher: async function () {
      const url = 'https://api.football-data.org/v4/competitions/WC/scorers?limit=' + SCORER_LIMIT;
      const got = await fetchJson(url, { headers: { 'X-Auth-Token': key, 'Accept': 'application/json' } }, 9000);
      const data = got.data;
      const rows = Array.isArray(data && data.scorers) ? data.scorers : [];
      return normalizeScorers(rows);
    }
  });
}
