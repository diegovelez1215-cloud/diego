/* United 2026 · secure serverless proxy for API-Sports (football).
 *
 * Your API key stays private in the Vercel env var API_SPORTS_KEY.
 *
 * IMPORTANT (API-Sports Free plan reality):
 *   - The Free plan BLOCKS querying fixtures by league+season for 2026
 *     ("Free plans do not have access to this season").
 *   - BUT the `fixtures?live=all` endpoint DOES work and returns every match
 *     currently in play across the world — including the FIFA World Cup.
 *   So we fetch live=all and keep only the real FIFA World Cup (league id 1).
 *
 * FIFA World Cup = league id 1.  (id 15 is the *Club* World Cup — not us.)
 *
 * Returns:
 *   response[] — World Cup games in play right now (powers the live card/strip)
 *   finished[] — any WC game the feed still lists at FT/AET/PEN (rare, bonus)
 *
 * QUOTA: short edge + in-function cache. Live consumers can poll every
 * 30-60s during active states, while Vercel cache/coalescing shields upstream.
 */
import { fetchJson, guardedApiSports, rateLimit, safeLog } from './_shared.js';

const WC_LEAGUE_ID = 1;
const LIVE_CODES = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'IN_PLAY', 'PAUSED', 'HALFTIME', 'BREAK', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'];
const HOLD_CODES = ['SUSP', 'INT', 'PST', 'CANC', 'ABD', 'TBD', 'DELAYED', 'SUSPENDED', 'POSTPONED', 'CANCELLED', 'ABANDONED', 'INTERRUPTED'];
const DONE_CODES = ['FT', 'AET', 'PEN', 'FINISHED', 'FULL_TIME'];

function statusKey(v) {
  return String(v || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function safeKind(status) {
  const short = statusKey(status && status.short);
  const long = statusKey(status && status.long);
  if (DONE_CODES.indexOf(short) !== -1 || DONE_CODES.indexOf(long) !== -1) return 'final';
  if (HOLD_CODES.indexOf(short) !== -1 || HOLD_CODES.indexOf(long) !== -1) return 'hold';
  if (LIVE_CODES.indexOf(short) !== -1 || LIVE_CODES.indexOf(long) !== -1) return 'live';
  return 'scheduled';
}

function slimFootballData(m) {
  const ft = m.score && m.score.fullTime ? m.score.fullTime : {};
  const status = String(m.status || '');
  return {
    id: m.id || null,
    home: m.homeTeam ? (m.homeTeam.name || m.homeTeam.shortName || '') : '',
    away: m.awayTeam ? (m.awayTeam.name || m.awayTeam.shortName || '') : '',
    gh: (ft.home == null ? null : ft.home),
    ga: (ft.away == null ? null : ft.away),
    min: null,
    status: status,
    statusLong: status,
    kind: safeKind({ short: status, long: status }),
    date: m.utcDate || ''
  };
}

export default async function handler(req, res) {
  // Browser / edge caches must not serve live truth. The quota guard coalesces
  // upstream requests across instances, and uncertain provider data fails closed.
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const key = process.env.API_SPORTS_KEY;
  if (!key) { res.status(200).json({ configured: false, response: [], finished: [], fetchedAt: new Date().toISOString(), sourceStatus: 'missing-config' }); return; }

  function slim(f) {
    return {
      id: f.fixture ? f.fixture.id : null,
      home: f.teams && f.teams.home ? f.teams.home.name : '',
      away: f.teams && f.teams.away ? f.teams.away.name : '',
      gh: f.goals ? f.goals.home : null,
      ga: f.goals ? f.goals.away : null,
      min: f.fixture && f.fixture.status ? f.fixture.status.elapsed : null,
      status: f.fixture && f.fixture.status ? f.fixture.status.short : '',
      statusLong: f.fixture && f.fixture.status ? (f.fixture.status.safeLabel || f.fixture.status.long || '') : '',
      kind: f.fixture && f.fixture.status ? (f.fixture.status.safeKind || '') : '',
      date: f.fixture ? f.fixture.date : ''
    };
  }

  // Per-IP throttle (unchanged behavior); the upstream quota guard is separate.
  const limited = rateLimit(req, '/api/live', 90, 60000);
  if (!limited.ok) {
    safeLog('route_throttled', { route: '/api/live', retryAfterSeconds: limited.retryAfterSeconds });
    res.setHeader('Retry-After', String(limited.retryAfterSeconds));
    res.status(429).json({
      configured: true,
      error: 'throttled',
      sourceStatus: 'throttled',
      retryAfterSeconds: limited.retryAfterSeconds,
      fetchedAt: new Date().toISOString()
    });
    return;
  }

  // Every API-Sports upstream call for /api/live flows through this one guarded
  // helper. Reads from cache cost zero quota; refusals/failures fall back to the
  // last-known-good response (clearly marked stale) or the safe empty fallback.
  const guarded = await guardedApiSports({
    route: '/api/live',
    resource: 'live',
    cacheKey: 'live:wc:all',
    freshMs: 10 * 60 * 1000,
    buildEmpty: function () { return { configured: true, response: [], finished: [] }; },
    validate: function (body) { return !!(body && Array.isArray(body.response) && Array.isArray(body.finished)); },
    fetcher: async function () {
    const got = await fetchJson('https://v3.football.api-sports.io/fixtures?live=all', {
      method: 'GET',
      headers: { 'x-apisports-key': key, 'Accept': 'application/json' }
    }, 9000);
    const data = got.data;
    if (!data || !Array.isArray(data.response)) {
      const err = new Error('malformed_response');
      throw err;
    }
    const all = data.response;

    // Keep ONLY the real FIFA World Cup (league id 1).
    const wc = all.filter(function (f) { return f.league && f.league.id === WC_LEAGUE_ID; });

    const live = [];
    const finished = [];
    wc.forEach(function (f) {
      const code = f.fixture && f.fixture.status ? f.fixture.status.short : '';
      const long = f.fixture && f.fixture.status ? (f.fixture.status.long || '') : '';
      f._safeKind = safeKind(f.fixture && f.fixture.status);
      if (f._safeKind) f.fixture.status.safeKind = f._safeKind;
      if (long && f.fixture && f.fixture.status) f.fixture.status.safeLabel = long;
      if (f._safeKind === 'final') finished.push(slim(f));
      else if (f._safeKind === 'live' || f._safeKind === 'hold') live.push(slim(f));
    });

    const sources = {
      apiSportsTotal: all.length,
      apiSportsWorldCup: wc.length,
      apiSportsLiveCandidates: live.length,
      footballDataChecked: false,
      footballDataLiveCandidates: 0
    };

    const fdKey = process.env.FOOTBALL_DATA_KEY;
    if (!live.length && fdKey) {
      try {
        const fd = await fetchJson('https://api.football-data.org/v4/competitions/WC/matches', {
          headers: { 'X-Auth-Token': fdKey }
        }, 9000);
        sources.footballDataChecked = true;
        const matches = Array.isArray(fd.data && fd.data.matches) ? fd.data.matches : [];
        matches.forEach(function (m) {
          const s = safeKind({ short: m.status, long: m.status });
          if (s === 'live' || s === 'hold') live.push(slimFootballData(m));
          else if (s === 'final') {
            const f = slimFootballData(m);
            if (f.gh != null && f.ga != null) finished.push(f);
          }
        });
        sources.footballDataLiveCandidates = live.length;
      } catch (e) {
        sources.footballDataChecked = true;
        sources.footballDataError = e && e.status ? 'status_' + e.status : (e && e.name === 'AbortError' ? 'timeout' : 'unavailable');
      }
    }

    return { configured: true, response: live, finished: finished, sources: sources, fetchedAt: new Date().toISOString() };
  }});

  // Emit safe metadata only (used/cap, cache age, freshness, next refresh). The
  // body carries its own fetchedAt; we never relabel stale data as current.
  const payload = Object.assign({}, guarded.body, {
    sourceStatus: guarded.sourceStatus,
    isStale: guarded.isStale,
    cacheAgeSeconds: guarded.cacheAgeSeconds,
    fetchedAt: guarded.fetchedAt,
    quota: guarded.quota,
    nextRefreshAt: guarded.nextRefreshAt
  });
  res.status(200).json(payload);
}
