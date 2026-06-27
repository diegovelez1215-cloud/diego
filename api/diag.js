/* Protected diagnostics: never exposes secrets.
 * Enable by setting DIAG_TOKEN in Vercel and calling /api/diag?token=...
 * Without the token it returns 404 so public production users cannot discover it.
 */
import { apiSportsQuotaSnapshot, apiSportsR32Probe } from './_shared.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const token = process.env.DIAG_TOKEN;
  const given = (req.query && req.query.token) || req.headers['x-diag-token'];
  if (!token || given !== token) {
    res.status(404).json({ ok: false, note: 'diagnostic unavailable' });
    return;
  }

  // Opt-in, Preview-only API-Sports R32 schedule contract probe. Hidden (404) in
  // Production. Routes through the guarded `schedule` quota lane and returns only
  // safe normalized evidence — never the API key or raw provider payload.
  if (req.query && req.query.probe === 'api-sports-r32') {
    const probeEnv = process.env.VERCEL_ENV || '';
    if (probeEnv !== 'preview') {
      res.status(404).json({ ok: false, note: 'probe unavailable' });
      return;
    }
    let probe;
    try {
      probe = await apiSportsR32Probe();
    } catch (e) {
      probe = { state: 'blocked', result: { probe: 'api-sports-r32', providerStatus: 'error' }, quota: null, cacheAgeSeconds: 0, isStale: false, nextRefreshAt: null };
    }
    res.status(200).json({
      ok: true,
      probe: 'api-sports-r32',
      environment: probeEnv,
      checkedAt: new Date().toISOString(),
      state: probe.state,
      result: probe.result,
      quota: probe.quota,
      cacheAgeSeconds: probe.cacheAgeSeconds,
      isStale: probe.isStale,
      nextRefreshAt: probe.nextRefreshAt
    });
    return;
  }

  // Safe, non-secret view of the API-Sports quota guard. Reads only (zero quota).
  let apiSportsQuota = { redisConfigured: false };
  try { apiSportsQuota = await apiSportsQuotaSnapshot('live', 'live:wc:all'); } catch (e) { apiSportsQuota = { redisConfigured: false, readError: true }; }

  const env = process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown';
  const now = new Date().toISOString();
  const endpoints = [
    { path: '/api/live', provider: 'API-Sports fixtures?live=all', env: 'API_SPORTS_KEY', feature: 'Live scores, match status, live card', cache: 'no-store response plus in-function coalescing; stale fallbacks marked sourceStatus=stale-fallback', polling: 'central coordinator: 45s live, 60s held, 2-5m near kickoff, paused in background/offline' },
    { path: '/api/results', provider: 'Football-Data WC matches', env: 'FOOTBALL_DATA_KEY', feature: 'Finished results, standings, official bracket confirmation', cache: 'no-store response plus in-function coalescing; stale fallbacks marked sourceStatus=stale-fallback', polling: 'central coordinator: 10m normally, one controlled focus/resume refresh' },
    { path: '/api/scorers', provider: 'Football-Data WC scorers', env: 'FOOTBALL_DATA_KEY', feature: 'Golden Boot and assists leaders', cache: 's-maxage=1800 stale-while-revalidate=1800 plus in-function coalescing/stale fallback', polling: 'central coordinator: on demand, then 30-60m' },
    { path: '/api/odds', provider: 'The Odds API World Cup h2h', env: 'ODDS_API_KEY', feature: 'Pre-match odds overlay', cache: 's-maxage=43200 stale-while-revalidate=600', polling: 'on Play open then every 30 minutes' },
    { path: '/api/matchstats', provider: 'disabled RapidAPI/FotMob', env: null, feature: 'Local modeled match profile fallback', cache: 's-maxage=3600 stale-while-revalidate=3600', polling: 'none' },
    { path: '/api/matchday', provider: 'disabled RapidAPI/FotMob', env: null, feature: 'Compatibility no-op', cache: 's-maxage=3600 stale-while-revalidate=3600', polling: 'none' },
    { path: '/api/rapid', provider: 'disabled RapidAPI', env: null, feature: 'Compatibility no-op', cache: 's-maxage=3600 stale-while-revalidate=3600', polling: 'none' }
  ].map(function (e) {
    return Object.assign({}, e, {
      configured: e.env ? !!process.env[e.env] : false,
      latestHttpStatus: 'see Vercel runtime logs',
      latestLatencyMs: 'see Vercel runtime logs',
      latestSuccessfulFetchTime: 'not persisted in serverless memory',
      cacheAge: 'see response Age/x-vercel-cache headers',
      staleOrFresh: 'see response Age/x-vercel-cache headers',
      latestErrorCategory: 'see structured function logs'
    });
  });

  res.status(200).json({
    ok: true,
    environment: env,
    production: env === 'production',
    checkedAt: now,
    apiSportsQuota: apiSportsQuota,
    diagnostics: endpoints
  });
}
