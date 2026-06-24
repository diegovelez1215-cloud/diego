/* United 2026 · secure serverless proxy for REAL World Cup scorers & assists.
 *
 * Pulls the official Golden Boot + assists leaders from Football-Data.org's
 * /competitions/WC/scorers endpoint — the SAME free key that already powers
 * /api/results. (API-Sports' free plan returns an empty player list for the
 * World Cup, which is why the stat tables looked frozen.)
 *
 * Key stays private in the Vercel env var FOOTBALL_DATA_KEY (never in browser).
 *
 * FREE TIER: 10 requests/minute. Edge-cached 10 min here, so the real API is
 * hit at most ~6×/hour regardless of traffic.
 *
 * If the key is missing the app silently keeps using its built-in real list.
 */
import { cachedRoute, fetchJson, safeLog } from './_shared.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=1800');
  const key = process.env.FOOTBALL_DATA_KEY;
  if (!key) { res.status(200).json({ configured: false, goals: [], assists: [], fetchedAt: new Date().toISOString(), sourceStatus: 'missing-config' }); return; }

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

    function nameOf(x) { return x && x.player ? (x.player.name || '') : ''; }
    function teamOf(x) { return x && x.team ? (x.team.name || x.team.shortName || '') : ''; }

    const goals = rows
      .map(x => ({ player: nameOf(x), team: teamOf(x), n: (x.goals || 0) }))
      .filter(x => x.player && x.n > 0);

    // Football-Data exposes assists for many competitions; if its free tier
    // returns null assists the list is simply empty and the app falls back.
    const assists = rows
      .map(x => ({ player: nameOf(x), team: teamOf(x), n: (x.assists || 0) }))
      .filter(x => x.player && x.n > 0)
      .sort((a, b) => b.n - a.n);

    if (goals.length) safeLog('scorers_confirmation', { provider: 'football-data', route: '/api/scorers', goals: goals.length, assists: assists.length });
    return { configured: true, goals: goals, assists: assists, fetchedAt: new Date().toISOString() };
  }});
}
