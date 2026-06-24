/* Protected diagnostics: never exposes secrets.
 * Enable by setting DIAG_TOKEN in Vercel and calling /api/diag?token=...
 * Without the token it returns 404 so public production users cannot discover it.
 */
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const token = process.env.DIAG_TOKEN;
  const given = (req.query && req.query.token) || req.headers['x-diag-token'];
  if (!token || given !== token) {
    res.status(404).json({ ok: false, note: 'diagnostic unavailable' });
    return;
  }

  const env = process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown';
  const now = new Date().toISOString();
  const endpoints = [
    { path: '/api/live', provider: 'API-Sports fixtures?live=all', env: 'API_SPORTS_KEY', feature: 'Live scores, match status, live card', cache: 's-maxage=30 stale-while-revalidate=60 plus in-function coalescing/stale fallback', polling: 'central coordinator: 45s live, 60s held, 2-5m near kickoff, paused in background/offline' },
    { path: '/api/results', provider: 'Football-Data WC matches', env: 'FOOTBALL_DATA_KEY', feature: 'Finished results, standings, official bracket confirmation', cache: 's-maxage=600 stale-while-revalidate=300 plus in-function coalescing/stale fallback', polling: 'central coordinator: 10m normally, one controlled focus/resume refresh' },
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
    diagnostics: endpoints
  });
}
