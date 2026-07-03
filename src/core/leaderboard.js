// United 2026 — global leaderboard client (Supabase v2, authenticated).
//
// One worldwide competition, two boards:
//   * Picks — official-pick points, settled ONLY server-side from validated
//     official finals (see api/settle.js + supabase/migrations). The browser
//     never writes standings, settlement, rank movement, or anyone else's
//     rows; RLS with auth.uid() ownership enforces that at the database.
//   * Arcade — Match Lab / My World Cup game ladder. Fully separate table;
//     it can never touch official points or accuracy.
//
// The PUBLIC anon key ships in the browser by design and is bounded by RLS.
// The service-role key exists only in server env vars — never here.
//
// Truth rules:
//   * Nothing here fabricates people, movement, points, or activity. Boards
//     are whatever the database really returns; movement compares ranks we
//     genuinely observed earlier; empty/offline/error states stay honest.
//   * The "updated" stamp is the real time of the last successful fetch.
//   * Auth session tokens live in one whitelisted storage key. They are
//     credentials, not official truth — no fixtures, scores, or standings
//     are ever persisted locally.

let supabaseConfig = null;
let supabaseConfigStatus = 'idle';
let supabaseConfigPromise = null;

function configLooksPublic(c) {
  return c && /^https:\/\/[^/]+\.supabase\.co$/.test(String(c.url || ''))
    && String(c.anonKey || '').length > 20;
}

function notifyConfigReady() {
  if (typeof window !== 'undefined' && typeof window.Event === 'function') {
    window.dispatchEvent(new window.Event('u26:leaderboard-config'));
  }
}

function ensureConfig() {
  if (supabaseConfigPromise) return supabaseConfigPromise;
  if (typeof fetch !== 'function') {
    supabaseConfigStatus = 'failed';
    return Promise.resolve(null);
  }
  supabaseConfigStatus = 'loading';
  supabaseConfigPromise = fetch('/api/leaderboard-config', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((c) => {
      if (!configLooksPublic(c)) {
        supabaseConfig = null;
        supabaseConfigStatus = 'failed';
        return null;
      }
      supabaseConfig = { url: c.url.replace(/\/$/, ''), anonKey: c.anonKey };
      supabaseConfigStatus = 'ready';
      return supabaseConfig;
    })
    .catch(() => {
      supabaseConfig = null;
      supabaseConfigStatus = 'failed';
      return null;
    })
    .finally(notifyConfigReady);
  return supabaseConfigPromise;
}

if (typeof window !== 'undefined') ensureConfig();

export function boardConfigured() {
  ensureConfig();
  return !!supabaseConfig;
}

async function requireConfig() {
  const c = supabaseConfig || await ensureConfig();
  if (!c) throw new Error('leaderboard backend not configured');
  return c;
}

/* ================= auth session (whitelisted storage key) ================= */

export const AUTH_KEY = 'u26v2.auth';

function storage() {
  try { return window.localStorage; } catch { return null; }
}

export function loadSession() {
  const ls = storage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(AUTH_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.access_token && s.user && s.user.id ? s : null;
  } catch { return null; }
}

function saveSession(session) {
  const ls = storage();
  if (!ls) return;
  try {
    if (!session) ls.removeItem(AUTH_KEY);
    else {
      ls.setItem(AUTH_KEY, JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token || null,
        expires_at: session.expires_at
          || Math.floor(Date.now() / 1000) + (session.expires_in || 3600),
        user: { id: session.user.id, email: session.user.email || null },
      }));
    }
  } catch { /* quota — non-fatal */ }
}

export function signOut() { saveSession(null); }

export function currentUser() {
  const s = loadSession();
  return s ? s.user : null;
}

function authHeaders(anonKey, token) {
  return {
    apikey: anonKey,
    Authorization: 'Bearer ' + (token || anonKey),
    'Content-Type': 'application/json',
  };
}

/** Sign-in step 1: email a 6-digit code (creates the account when new). */
export async function requestEmailCode(email) {
  const cfg = await requireConfig();
  const r = await fetch(`${cfg.url}/auth/v1/otp`, {
    method: 'POST',
    headers: authHeaders(cfg.anonKey),
    body: JSON.stringify({ email, create_user: true }),
  });
  if (!r.ok) throw new Error('otp request failed: ' + r.status);
  return true;
}

/** Sign-in step 2: verify the code; stores the session on success. */
export async function verifyEmailCode(email, token) {
  const cfg = await requireConfig();
  const r = await fetch(`${cfg.url}/auth/v1/verify`, {
    method: 'POST',
    headers: authHeaders(cfg.anonKey),
    body: JSON.stringify({ type: 'email', email, token }),
  });
  if (!r.ok) throw new Error('verify failed: ' + r.status);
  const session = await r.json();
  if (!session || !session.access_token || !session.user) throw new Error('verify: bad session');
  saveSession(session);
  return session.user;
}

async function refreshSession() {
  const cfg = await requireConfig();
  const s = loadSession();
  if (!s || !s.refresh_token) return null;
  const r = await fetch(`${cfg.url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: authHeaders(cfg.anonKey),
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });
  if (!r.ok) { saveSession(null); return null; }
  const session = await r.json();
  if (!session || !session.access_token) { saveSession(null); return null; }
  saveSession(session);
  return loadSession();
}

/** Authenticated REST call; transparently refreshes an expired token once. */
async function rest(path, init = {}) {
  const cfg = await requireConfig();
  let s = loadSession();
  if (s && s.expires_at && s.expires_at * 1000 < Date.now() + 30_000) {
    s = await refreshSession();
  }
  if (!s) throw new Error('signed-out');
  const doFetch = (token) => fetch(`${cfg.url}/rest/v1/${path}`, {
    ...init,
    headers: { ...authHeaders(cfg.anonKey, token), ...(init.headers || {}) },
  });
  let r = await doFetch(s.access_token);
  if (r.status === 401) {
    s = await refreshSession();
    if (!s) throw new Error('signed-out');
    r = await doFetch(s.access_token);
  }
  if (!r.ok) throw new Error('board request failed: ' + r.status);
  return r;
}

/* ================= pure helpers (unit-tested) ================= */

export function validDisplayName(name) {
  const n = String(name || '').trim();
  return n.length >= 2 && n.length <= 24 && /^[\p{L}\p{N} .'-]+$/u.test(n);
}

/** Preset avatars — a profile choice, never an invented person. */
export const AVATARS = ['⚽', '🦁', '🦅', '⚡', '🔥', '🐺', '🌟', '🧤', '🎯', '👑', '🛡️', '🐆'];

export function normalizeBoardRow(row) {
  return {
    userId: row.user_id,
    name: String(row.display_name || '').trim(),
    avatar: row.avatar || null,
    points: Math.max(0, Math.round(row.points || 0)),
    accuracy: row.accuracy == null ? null : Math.round(Number(row.accuracy)),
    streak: Math.max(0, Math.round(row.streak || 0)),
    bestStreak: Math.max(0, Math.round(row.best_streak || 0)),
    exact: Math.max(0, Math.round(row.exact || 0)),
    correct: Math.max(0, Math.round(row.correct || 0)),
    total: Math.max(0, Math.round(row.total || 0)),
    roundStage: row.round_stage || null,
    roundPoints: Math.max(0, Math.round(row.round_points || 0)),
    roundCorrect: Math.max(0, Math.round(row.round_correct || 0)),
    roundTotal: Math.max(0, Math.round(row.round_total || 0)),
    rank: row.rank == null ? null : Number(row.rank),
    joinedAt: row.joined_at || null,
  };
}

export function normalizeArcadeRow(row) {
  return {
    userId: row.user_id,
    name: String(row.display_name || '').trim(),
    avatar: row.avatar || null,
    points: Math.max(0, Math.round(row.points || 0)),
    wins: Math.max(0, Math.round(row.wins || 0)),
    played: Math.max(0, Math.round(row.played || 0)),
    streak: Math.max(0, Math.round(row.streak || 0)),
    rank: row.rank == null ? null : Number(row.rank),
    at: row.updated_at || null,
  };
}

/** Honest movement vs ranks we really observed earlier (never fabricated). */
export function rankMovement(rows, prevRanks) {
  return rows.map((m) => {
    const prev = prevRanks ? prevRanks[m.userId] : undefined;
    if (prev == null) return { ...m, move: 'new' };
    if (prev > m.rank) return { ...m, move: 'up', delta: prev - m.rank };
    if (prev < m.rank) return { ...m, move: 'down', delta: m.rank - prev };
    return { ...m, move: 'hold' };
  });
}

export function ranksOf(rows) {
  const out = {};
  for (const m of rows) if (m.userId && m.rank != null) out[m.userId] = m.rank;
  return out;
}

/** Honest freshness copy for the header stamp. Never claims "live". */
export function updatedLabel(fetchedAt, nowMs = Date.now()) {
  if (!fetchedAt) return null;
  const age = nowMs - fetchedAt;
  if (age < 60_000) return 'Updated just now';
  if (age < 60 * 60_000) return `Updated ${Math.floor(age / 60_000)}m ago`;
  return `Updated ${Math.floor(age / 3_600_000)}h ago`;
}

/** True while a successful sync is recent enough to honestly badge as fresh. */
export function freshlySynced(fetchedAt, nowMs = Date.now()) {
  return !!fetchedAt && nowMs - fetchedAt < 60_000;
}

/**
 * Genuine recent activity, from real facts only: profiles that really joined
 * (created_at) and fixtures that really settled (results rows the server
 * wrote from official finals). Nothing invented, nothing simulated.
 */
export function boardActivity(rows, settled, { limit = 6 } = {}) {
  const joins = (rows || [])
    .filter((m) => m.joinedAt)
    .map((m) => ({ t: m.joinedAt, text: `${m.name} joined the leaderboard` }));
  const finals = (settled || [])
    .map((s) => ({ t: s.at, text: s.text }));
  return [...joins, ...finals]
    .filter((a) => a.t && !Number.isNaN(Date.parse(a.t)))
    .sort((a, b) => Date.parse(b.t) - Date.parse(a.t))
    .slice(0, limit);
}

/** Map a local pick to the picks-table row shape. */
export function pickRow(userId, fixtureId, pick) {
  return {
    user_id: userId,
    fixture_id: Number(fixtureId),
    side: pick.side,
    gh: pick.gh == null ? null : Number(pick.gh),
    ga: pick.ga == null ? null : Number(pick.ga),
    conf: Number(pick.conf) || 1,
  };
}

/** Arcade ladder row from the locally derived ledger (game score only). */
export function arcadeRow(userId, ledger) {
  return {
    user_id: userId,
    points: Math.max(0, Math.round(ledger.points || 0)),
    wins: Math.max(0, Math.round(ledger.wins || 0)),
    played: Math.max(0, Math.round(ledger.played || 0)),
    streak: Math.max(0, Math.round(ledger.streak || 0)),
  };
}

/* ================= network (views own the state machine) ================= */

const TOP_LIMIT = 50;

export async function fetchPicksBoard() {
  const r = await rest(`leaderboard_v2?select=*&order=rank.asc&limit=${TOP_LIMIT}`, { method: 'GET' });
  return (await r.json()).map(normalizeBoardRow);
}

/** My own row (with global rank) even when I'm outside the visible top list. */
export async function fetchMyBoardRow(userId) {
  const r = await rest(`leaderboard_v2?select=*&user_id=eq.${encodeURIComponent(userId)}`, { method: 'GET' });
  const rows = await r.json();
  return rows.length ? normalizeBoardRow(rows[0]) : null;
}

export async function fetchArcadeLadder() {
  const r = await rest(`arcade_ladder_v2?select=*&order=rank.asc&limit=${TOP_LIMIT}`, { method: 'GET' });
  return (await r.json()).map(normalizeArcadeRow);
}

export async function fetchMyProfile() {
  const user = currentUser();
  if (!user) return null;
  const r = await rest(`profiles?select=*&id=eq.${encodeURIComponent(user.id)}`, { method: 'GET' });
  const rows = await r.json();
  return rows.length ? rows[0] : null;
}

export async function upsertMyProfile({ displayName, avatar }) {
  const user = currentUser();
  if (!user) throw new Error('signed-out');
  await rest('profiles?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      id: user.id,
      display_name: String(displayName).trim(),
      avatar: avatar || null,
      updated_at: new Date().toISOString(),
    }),
  });
  return true;
}

/** Upsert one of MY OWN picks. The database rejects post-kickoff writes. */
export async function pushPick(fixtureId, pick) {
  const user = currentUser();
  if (!user) return false;
  try {
    await rest('picks?on_conflict=user_id,fixture_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(pickRow(user.id, fixtureId, pick)),
    });
    return true;
  } catch { return false; }
}

/** Sync every local pick whose real kickoff is still in the future. */
export async function pushEligiblePicks(picks, isPreKickoff) {
  const user = currentUser();
  if (!user) return 0;
  let n = 0;
  for (const [idStr, pick] of Object.entries(picks || {})) {
    const id = Number(idStr);
    if (!isPreKickoff(id)) continue;
    if (await pushPick(id, pick)) n++;
  }
  return n;
}

export async function pushArcadeScore(ledger) {
  const user = currentUser();
  if (!user) return false;
  try {
    await rest('arcade_scores?on_conflict=user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ ...arcadeRow(user.id, ledger), updated_at: new Date().toISOString() }),
    });
    return true;
  } catch { return false; }
}
