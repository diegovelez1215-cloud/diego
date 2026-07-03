// United 2026 — Picks League client (restored Supabase foundation).
//
// This revives the app's original shared leaderboard backend: one `scores`
// table on Supabase, reached over PostgREST with the project's PUBLIC anon
// key. The anon key is designed to ship in the browser; every operation it
// can perform is bounded by the table's row-level-security policies. The
// service-role key is never present anywhere in this codebase.
//
// Truth rules:
//   • League Points are derived exclusively from validated OFFICIAL results
//     (gradePredictions over the canonical overlay). Settlement is idempotent
//     by construction — the total is re-derived from the same official truth
//     every time, so posting twice can never double-count.
//   • The rows carry legacy column names (`bankroll`, `roi`, `champ`) from
//     the original schema. They are mapped here, once, to what they now
//     mean: League Points, pick accuracy %, and the member's champion call.
//     No money exists in this product.
//   • Nothing here fabricates people, movement, or activity. Standings are
//     whatever the table really contains; rank movement comes from ranks we
//     genuinely observed earlier; empty and offline states stay empty.
//   • Real tournament truth NEVER flows from this module into the overlay —
//     it is a scoreboard for members, not a source of fixtures or scores.
//
// Rooms: a league is an invite code. Posted names are "CODE|DisplayName" —
// exactly the scheme the original schema used — so one PostgREST filter
// returns a private room and no schema change is required.

const SUPA_URL = 'https://pzjedlfdrbbblrgrpgff.supabase.co';
// Public anon key (browser-safe by design; scoped by RLS. NOT a secret,
// NOT the service role — the service role key must never ship to clients).
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6amVkbGZkcmJiYmxyZ3JwZ2ZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3OTAwNjMsImV4cCI6MjA5NzM2NjA2M30.RSHT6w-xdagKmim16TLuxRQZ0SRg52P88PhpC15oFNc';

export function leagueConfigured() {
  return /^https:\/\//.test(SUPA_URL) && SUPA_ANON.length > 20;
}

function headers() {
  return {
    apikey: SUPA_ANON,
    Authorization: 'Bearer ' + SUPA_ANON,
    'Content-Type': 'application/json',
  };
}

/* ---------------- identity ---------------- */

export function validMemberName(name) {
  const n = String(name || '').trim();
  return n.length >= 2 && n.length <= 24 && /^[\p{L}\p{N} .'-]+$/u.test(n) && !n.includes('|');
}

export function validRoomCode(code) {
  return /^[A-Z0-9]{4,8}$/.test(String(code || ''));
}

export function makeRoomCode(rng = Math.random) {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L ambiguity
  let c = '';
  for (let i = 0; i < 5; i++) c += abc[Math.floor(rng() * abc.length)];
  return c;
}

/** Posted names are "CODE|DisplayName" inside a room, bare name otherwise. */
export function postedName(name, code) {
  return code ? `${code}|${name}` : name;
}

export function displayName(raw) {
  const s = String(raw || '');
  const i = s.indexOf('|');
  return i >= 0 ? s.slice(i + 1) : s;
}

export function roomOf(raw) {
  const s = String(raw || '');
  const i = s.indexOf('|');
  return i >= 0 ? s.slice(0, i) : null;
}

/* ---------------- row mapping (legacy columns → honest meaning) ---------------- */

/** Build my row from officially-settled pick facts. Deterministic in, deterministic out. */
export function memberRow({ name, code, points, accuracy, champion }) {
  return {
    name: postedName(name, code),
    bankroll: Math.max(0, Math.round(points || 0)),          // legacy column: League Points
    roi: accuracy == null ? 0 : Math.round(accuracy),        // legacy column: pick accuracy %
    champ: champion || null,                                 // member's official champion call
  };
}

export function fromRow(row) {
  return {
    key: displayName(row.name).trim().toLowerCase(),
    name: displayName(row.name),
    room: roomOf(row.name),
    points: Math.max(0, Math.round(row.bankroll || 0)),
    accuracy: row.roi == null ? null : Math.round(row.roi),
    champion: row.champ || null,
    at: row.created_at || null,
  };
}

/** One row per visible member (newest wins), sorted by points. Pure. */
export function dedupeStandings(rows) {
  const by = new Map();
  for (const r of rows || []) {
    const m = fromRow(r);
    if (!m.name) continue;
    const cur = by.get(m.key);
    if (!cur) { by.set(m.key, m); continue; }
    const ta = Date.parse(m.at || 0) || 0;
    const tb = Date.parse(cur.at || 0) || 0;
    if (ta > tb || (ta === tb && m.points > cur.points)) by.set(m.key, m);
  }
  return [...by.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

/** Honest movement vs the last ranks we really observed (never fabricated). */
export function rankMovement(standings, prevRanks) {
  return standings.map((m, i) => {
    const prev = prevRanks ? prevRanks[m.key] : undefined;
    if (prev == null) return { ...m, move: 'new' };
    if (prev > i + 1) return { ...m, move: 'up', delta: prev - (i + 1) };
    if (prev < i + 1) return { ...m, move: 'down', delta: (i + 1) - prev };
    return { ...m, move: 'hold' };
  });
}

export function ranksOf(standings) {
  const out = {};
  standings.forEach((m, i) => { out[m.key] = i + 1; });
  return out;
}

/* ---------------- network (browser only; views own the state machine) ---------------- */

async function rest(path, init) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, { ...init, headers: { ...headers(), ...(init && init.headers) } });
  if (!r.ok) throw new Error('league request failed: ' + r.status);
  return r;
}

/** Fetch a room's standings (or the open board when no code). */
export async function fetchStandings(code) {
  const filter = code ? `&name=like.${encodeURIComponent(code + '|')}*` : '';
  const r = await rest(`scores?select=*&order=bankroll.desc&limit=300${filter}`, { method: 'GET' });
  return dedupeStandings(await r.json());
}

/**
 * Upsert my row — one row per posted name, updated in place. Only MY OWN
 * identity is ever written from this client; other members' rows are
 * untouchable from the UI (and should be locked down further by RLS —
 * see docs/PICKS_LEAGUE.md for the strengthening migration).
 */
export async function postMemberRow(row) {
  try {
    await rest('scores?on_conflict=name', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row),
    });
    return true;
  } catch {
    // legacy fallback: plain insert when the unique index is missing;
    // dedupeStandings keeps the board clean either way
    try {
      await rest('scores', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(row),
      });
      return true;
    } catch { return false; }
  }
}
