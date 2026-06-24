/* United 2026 · secure serverless proxy for The Odds API (real pre-match odds).
 *
 * Key stays private in Vercel env var ODDS_API_KEY (never in the browser).
 *
 * FREE-TIER MATH: The Odds API free plan = 500 requests / MONTH.
 *   We cache the response on Vercel's edge for 12 hours (s-maxage=43200),
 *   so no matter how many visitors, the real API is hit ~2x/day (~60/month) —
 *   comfortably inside the free limit.
 *
 * If the key is missing or the sport isn't live yet, returns an empty payload
 * and the app silently keeps using its built-in real odds + model. No breakage.
 */
import { cachedRoute, fetchJson } from './_shared.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=43200, stale-while-revalidate=600');
  const key = process.env.ODDS_API_KEY;
  if (!key) { res.status(200).json({ configured: false, response: [], fetchedAt: new Date().toISOString(), sourceStatus: 'missing-config' }); return; }
  await cachedRoute(req, res, {
    route: '/api/odds',
    provider: 'the-odds-api',
    cacheKey: 'odds:wc:h2h',
    ttlMs: 12 * 60 * 60000,
    staleMs: 24 * 60 * 60000,
    rateLimit: { limit: 30, windowMs: 60000 },
    fallback: { response: [] },
    fetcher: async function () {
    const url = 'https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds/?regions=us&markets=h2h&oddsFormat=american&apiKey=' + key;
    const got = await fetchJson(url, {}, 9000);
    const data = got.data;
    const slim = (Array.isArray(data) ? data : []).map(function (ev) {
      let h = null, d = null, a = null;
      const bm = ev.bookmakers && ev.bookmakers[0];
      if (bm && bm.markets) {
        const mk = bm.markets.find(function (m) { return m.key === 'h2h'; });
        if (mk && mk.outcomes) mk.outcomes.forEach(function (o) {
          if (o.name === ev.home_team) h = o.price;
          else if (o.name === ev.away_team) a = o.price;
          else d = o.price;
        });
      }
      return { home: ev.home_team, away: ev.away_team, h: h, d: d, a: a };
    }).filter(function (x) { return x.h != null && x.a != null && x.d != null; });
    return { configured: true, count: slim.length, response: slim, fetchedAt: new Date().toISOString() };
  }});
}
