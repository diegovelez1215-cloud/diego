/* United 2026 · server-side official settlement for the global leaderboard.
 *
 * WHAT THIS DOES:
 *   Reads finished FIFA World Cup results from Football-Data.org (the same
 *   provider the app's live-truth pipeline uses), validates every final
 *   through the SAME canonical matching code the client trusts
 *   (src/core/provider-overlay.js — identity-resolved finals only), then
 *   upserts one settlement row per fixture into the Supabase `results`
 *   table with the service-role key.
 *
 * SECURITY:
 *   * The service-role key lives ONLY in Vercel env vars. It never ships to
 *     a browser; no client bundle imports this file.
 *   * The route itself requires a bearer secret (CRON_SECRET or
 *     SETTLE_SECRET) so nobody else can trigger provider fetches.
 *   * Browsers cannot write `results` at all: the table has no client
 *     insert/update policies — settlement exists only on this path.
 *
 * IDEMPOTENCE:
 *   Settlement upserts by fixture_id primary key with values derived from
 *   canonical official truth. Running it twice writes the same rows, and
 *   leaderboard points are DERIVED from these rows in a view — never
 *   incremented — so duplicate settlement cannot duplicate points.
 *
 * SETUP (Vercel → Project → Settings → Environment Variables):
 *   FOOTBALL_DATA_KEY         (already used by /api/results)
 *   SUPABASE_URL              e.g. https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY (server-only; NEVER expose to clients)
 *   CRON_SECRET               (Vercel Cron sends it automatically) and/or
 *   SETTLE_SECRET             (for manual curl runs)
 */
import { timingSafeEqual } from 'node:crypto';
import { buildOverlay } from '../src/core/provider-overlay.js';
import { fetchJson, safeLog } from './_shared.js';

function tokenMatches(token, secret) {
  const a = Buffer.from(String(token));
  const b = Buffer.from(String(secret));
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(req) {
  const header = String(req.headers && req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const accepted = [process.env.CRON_SECRET, process.env.SETTLE_SECRET].filter(Boolean);
  return accepted.length > 0 && token != null
    && accepted.some((secret) => tokenMatches(token, secret));
}

/** Slim a Football-Data match to the exact shape /api/results emits. */
function slim(m) {
  const ft = m.score && m.score.fullTime ? m.score.fullTime : {};
  return {
    providerId: m.id || null,
    home: m.homeTeam ? (m.homeTeam.name || m.homeTeam.shortName || '') : '',
    away: m.awayTeam ? (m.awayTeam.name || m.awayTeam.shortName || '') : '',
    gh: ft.home == null ? null : ft.home,
    ga: ft.away == null ? null : ft.away,
    winner: m.score ? (m.score.winner || '') : '',
    status: m.status || '',
    stage: m.stage || '',
    utcDate: m.utcDate || '',
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (!process.env.CRON_SECRET && !process.env.SETTLE_SECRET) {
    res.status(503).json({ configured: false, reason: 'no settlement secret configured' });
    return;
  }
  if (!authorized(req)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const fdKey = process.env.FOOTBALL_DATA_KEY;
  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!fdKey || !supaUrl || !supaKey) {
    res.status(503).json({
      configured: false,
      missing: [
        !fdKey && 'FOOTBALL_DATA_KEY',
        !supaUrl && 'SUPABASE_URL',
        !supaKey && 'SUPABASE_SERVICE_ROLE_KEY',
      ].filter(Boolean),
    });
    return;
  }

  // 1) Official provider truth — finished matches only.
  let matches;
  try {
    const got = await fetchJson(
      'https://api.football-data.org/v4/competitions/WC/matches',
      { headers: { 'X-Auth-Token': fdKey } },
      9000,
    );
    matches = Array.isArray(got.data && got.data.matches) ? got.data.matches : [];
  } catch (e) {
    safeLog('settle_provider_failure', { status: e.status || null });
    res.status(502).json({ error: 'provider unavailable', settled: 0 });
    return;
  }
  const finished = matches
    .filter((m) => m.status === 'FINISHED')
    .map(slim)
    .filter((s) => s.gh != null && s.ga != null);

  // 2) Validate through the SAME canonical pipeline the app trusts.
  //    Only identity-resolved finals survive; unmatched entries are rejected.
  const overlay = buildOverlay({
    results: {
      configured: true,
      sourceStatus: 'fresh',
      isStale: false,
      finished,
      live: [],
      hold: [],
      scheduled: [],
      fetchedAt: new Date().toISOString(),
    },
  });
  const rows = [];
  for (const [fixtureId, ov] of overlay.byFixture) {
    if (ov.status !== 'final' || !ov.winner || ov.gh == null || ov.ga == null) continue;
    rows.push({ fixture_id: fixtureId, gh: ov.gh, ga: ov.ga, winner: ov.winner });
  }

  // 3) Idempotent upsert of settlement records (service role, server-only).
  if (rows.length) {
    try {
      const r = await fetch(`${supaUrl.replace(/\/$/, '')}/rest/v1/results?on_conflict=fixture_id`, {
        method: 'POST',
        headers: {
          apikey: supaKey,
          Authorization: 'Bearer ' + supaKey,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(rows),
      });
      if (!r.ok) {
        safeLog('settle_upsert_failure', { status: r.status });
        res.status(502).json({ error: 'settlement write failed', settled: 0 });
        return;
      }
    } catch {
      res.status(502).json({ error: 'settlement write failed', settled: 0 });
      return;
    }
  }

  safeLog('settle_ok', { settled: rows.length, rejected: overlay.rejected });
  res.status(200).json({
    settled: rows.length,
    rejected: overlay.rejected,
    fetchedAt: new Date().toISOString(),
  });
}
