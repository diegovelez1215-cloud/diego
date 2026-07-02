/* United 2026 · secure serverless proxy for verified World Cup scorers.
 *
 * Uses Football-Data.org's official /competitions/WC/scorers endpoint through
 * the same private FOOTBALL_DATA_KEY as /api/results. If the provider returns
 * no assists, the frontend shows an honest unavailable state.
 */
import { cachedRoute, fetchJson, safeLog } from './_shared.js';

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
      const url = 'https://api.football-data.org/v4/competitions/WC/scorers?limit=30';
      const got = await fetchJson(url, { headers: { 'X-Auth-Token': key, 'Accept': 'application/json' } }, 9000);
      const data = got.data;
      const rows = Array.isArray(data && data.scorers) ? data.scorers : [];

      const goals = rows
        .map((x) => ({
          player: x && x.player ? (x.player.name || '') : '',
          team: x && x.team ? (x.team.name || x.team.shortName || '') : '',
          n: Number(x && x.goals ? x.goals : 0)
        }))
        .filter((x) => x.player && x.n > 0)
        .sort((a, b) => b.n - a.n || a.player.localeCompare(b.player));

      const assists = rows
        .map((x) => ({
          player: x && x.player ? (x.player.name || '') : '',
          team: x && x.team ? (x.team.name || x.team.shortName || '') : '',
          n: Number(x && x.assists ? x.assists : 0)
        }))
        .filter((x) => x.player && x.n > 0)
        .sort((a, b) => b.n - a.n || a.player.localeCompare(b.player));

      if (goals.length) safeLog('scorers_confirmation', { provider: 'football-data', route: '/api/scorers', goals: goals.length, assists: assists.length });
      return { configured: true, goals: goals, assists: assists, fetchedAt: new Date().toISOString() };
    }
  });
}
