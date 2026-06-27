/* United 2026 · secure serverless proxy for Football-Data.org.
 *
 * WHY THIS EXISTS:
 *   API-Sports' FREE plan can serve LIVE in-play games but BLOCKS finished
 *   2026 results. Football-Data.org's free tier DOES cover the FIFA World Cup
 *   (finished scores, fixtures, standings) — so we use it to keep the app's
 *   results fully up to date by itself, even when no one is watching live.
 *
 * SETUP (one time, free):
 *   1. Sign up at https://www.football-data.org/client/register  (free, instant)
 *   2. Copy your API token.
 *   3. In Vercel → Project → Settings → Environment Variables, add:
 *        FOOTBALL_DATA_KEY = <your token>
 *   4. Redeploy. Done — finished results now auto-sync.
 *
 * FREE TIER: 10 requests/minute. Edge-cached/cached here, so the real API is
 * hit at most ~6×/hour regardless of traffic. No daily cap to worry about.
 *
 * If the key is missing, returns an empty (valid) payload and the app simply
 * keeps using its built-in results — nothing breaks.
 */
import { cachedRoute, fetchJson, safeLog } from './_shared.js';

export default async function handler(req, res) {
  // Official results drive standings, qualifiers, and bracket truth. Do not let
  // browser or edge cache replay stale official truth; cachedRoute only coalesces
  // within the live server process and marks stale fallbacks explicitly.
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const key = process.env.FOOTBALL_DATA_KEY;
  if (!key) { res.status(200).json({ configured: false, finished: [], live: [], hold: [], fetchedAt: new Date().toISOString(), sourceStatus: 'missing-config' }); return; }

  await cachedRoute(req, res, {
    route: '/api/results',
    provider: 'football-data',
    cacheKey: 'results:wc:matches',
    ttlMs: 10 * 60000,
    staleMs: 30 * 60000,
    rateLimit: { limit: 120, windowMs: 60000 },
    fallback: { finished: [], live: [], hold: [], scheduled: [] },
    fetcher: async function () {
    const url = 'https://api.football-data.org/v4/competitions/WC/matches';
    const got = await fetchJson(url, { headers: { 'X-Auth-Token': key } }, 9000);
    const data = got.data;
    const matches = Array.isArray(data && data.matches) ? data.matches : [];

    function slim(m) {
      const ft = m.score && m.score.fullTime ? m.score.fullTime : {};
      return {
        providerId: m.id || null,
        home: m.homeTeam ? (m.homeTeam.name || m.homeTeam.shortName || '') : '',
        away: m.awayTeam ? (m.awayTeam.name || m.awayTeam.shortName || '') : '',
        gh: (ft.home == null ? null : ft.home),
        ga: (ft.away == null ? null : ft.away),
        winner: m.score ? (m.score.winner || '') : '', // HOME_TEAM | AWAY_TEAM | DRAW (decides KO ties incl. penalties)
        status: m.status || '',
        stage: m.stage || '',
        matchday: m.matchday || null,
        utcDate: m.utcDate || ''
      };
    }

    const finished = [];
    const live = [];
    const hold = [];
    const scheduled = [];
    matches.forEach(function (m) {
      const s = slim(m);
      if (m.status === 'FINISHED') { if (s.gh != null && s.ga != null) finished.push(s); }
      else if (m.status === 'IN_PLAY' || m.status === 'PAUSED') live.push(s);
      else if (m.status === 'SUSPENDED' || m.status === 'POSTPONED' || m.status === 'CANCELLED') hold.push(s);
      else scheduled.push(s);
    });

    if (finished.length) safeLog('final_result_confirmation', { provider: 'football-data', route: '/api/results', count: finished.length });
    return { configured: true, count: finished.length, finished: finished, live: live, hold: hold, scheduled: scheduled, fetchedAt: new Date().toISOString() };
  }});
}
