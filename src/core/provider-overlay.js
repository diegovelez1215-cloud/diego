// United 2026 — validated provider overlay.
// Provider data may contribute ONLY live status, score, clock, and finality —
// and only after it is matched to a canonical fixture. Anything that fails
// validation (stale fallback, unconfigured provider, unmatched fixture,
// identity conflict) is REJECTED, never displayed.

import {
  allFixtures, resolveTeamCode, computeStandings, resolveSlots,
} from './canonical-truth.js';

const ACCEPTED_SOURCE = new Set(['fresh', 'cache', 'coalesced', 'ok']);
const MATCH_WINDOW_MS = 15 * 60 * 1000; // provider kickoff must sit within ±15 min

export const EMPTY_OVERLAY = Object.freeze({
  version: 0,
  providerState: 'unavailable',
  fetchedAt: null,
  byFixture: new Map(),
  standings: computeStandings(new Map()),
  slots: resolveSlots(computeStandings(new Map()), new Map()),
  rejected: 0,
});

/** True when a payload is trustworthy enough to touch the UI at all. */
export function payloadAccepted(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.configured === false) return false;
  if (payload.isStale === true) return false;
  if (payload.sourceStatus && !ACCEPTED_SOURCE.has(payload.sourceStatus)) return false;
  return true;
}

function classify(status) {
  const s = String(status || '').toUpperCase();
  if (['FINISHED', 'FT', 'AET', 'PEN', 'FULL_TIME'].includes(s)) return 'final';
  if (['IN_PLAY', 'PAUSED', 'LIVE', '1H', '2H', 'HT', 'ET', 'BT', 'P', 'HALFTIME',
    'EXTRA_TIME', 'PENALTY_SHOOTOUT', 'BREAK'].includes(s)) return 'live';
  if (['SUSPENDED', 'POSTPONED', 'CANCELLED', 'ABANDONED', 'SUSP', 'INT', 'PST',
    'CANC', 'ABD', 'INTERRUPTED', 'DELAYED'].includes(s)) return 'hold';
  return 'scheduled';
}

/**
 * Match one slim provider entry to a canonical fixture.
 * Match requires BOTH teams to resolve to the canonical fixture's (resolved)
 * teams, or — only when canonical slots are still unresolved — an exact-window
 * kickoff match in the same stage class. Identity always stays canonical.
 * @returns {fixture, flipped} or null
 */
function matchToCanonical(entry, fixtures, slots) {
  const utc = Date.parse(entry.utcDate || entry.date || '');
  const hc = resolveTeamCode(entry.home);
  const ac = resolveTeamCode(entry.away);
  let timeCandidate = null;
  for (const f of fixtures) {
    const s = slots.get(f.id) || { home: null, away: null };
    if (hc && ac && s.home && s.away) {
      if (s.home === hc && s.away === ac) return { fixture: f, flipped: false, byIdentity: true };
      if (s.home === ac && s.away === hc) return { fixture: f, flipped: true, byIdentity: true };
      continue; // fully-identified fixtures must match by identity, not by time
    }
    // Time-window matching exists ONLY for knockout fixtures with at least one
    // unresolved slot. A fully-resolved fixture must match by identity or not
    // at all — an unresolvable provider name there is rejected, never guessed.
    if (s.home && s.away) continue;
    if (Number.isFinite(utc) && Math.abs(utc - f.epoch) <= MATCH_WINDOW_MS && f.stage !== 'group') {
      // Unresolved knockout slot: accept by exact kickoff window, but reject on
      // any identity conflict with a partially-resolved side.
      if (s.home && hc && s.home !== hc && s.home !== ac) continue;
      if (s.away && ac && s.away !== ac && s.away !== hc) continue;
      const flipped = !!(s.home && ac && s.home === ac) || !!(s.away && hc && s.away === hc);
      if (!timeCandidate) timeCandidate = { fixture: f, flipped, byIdentity: false };
    }
  }
  return timeCandidate;
}

function orient(entry, flipped) {
  const gh = entry.gh == null ? null : Number(entry.gh);
  const ga = entry.ga == null ? null : Number(entry.ga);
  let winner = null;
  const w = String(entry.winner || '').toUpperCase();
  if (w === 'HOME_TEAM') winner = 'home';
  else if (w === 'AWAY_TEAM') winner = 'away';
  else if (w === 'DRAW') winner = 'draw';
  if (!flipped) return { gh, ga, winner };
  return {
    gh: ga, ga: gh,
    winner: winner === 'home' ? 'away' : winner === 'away' ? 'home' : winner,
  };
}

let _version = 0;

/**
 * Build a validated overlay from raw /api/results and /api/live payloads.
 * Two-pass: finals first (they resolve knockout identity), then everything else.
 */
export function buildOverlay({ results, live } = {}) {
  const fixtures = allFixtures();
  const byFixture = new Map();
  let rejected = 0;
  const resultsOk = payloadAccepted(results);
  const liveOk = payloadAccepted(live);
  if (!resultsOk && !liveOk) {
    return { ...EMPTY_OVERLAY, version: ++_version, providerState: 'unavailable' };
  }

  // Pass 1 — finals from /api/results build derived standings + slots.
  const groupFinals = new Map();
  const koFinals = new Map();
  let slots = resolveSlots(computeStandings(new Map()), new Map());
  if (resultsOk && Array.isArray(results.finished)) {
    const koPending = [];
    slots = resolveSlots(computeStandings(groupFinals), koFinals);
    for (const entry of results.finished) {
      const hit = matchToCanonical(entry, fixtures, slots);
      if (!hit || !hit.byIdentity) { koPending.push(entry); continue; }
      const o = orient(entry, hit.flipped);
      if (o.gh == null || o.ga == null) { rejected++; continue; }
      if (!o.winner) o.winner = o.gh > o.ga ? 'home' : o.gh < o.ga ? 'away' : 'draw';
      if (hit.fixture.stage === 'group') {
        groupFinals.set(hit.fixture.id, o);
        byFixture.set(hit.fixture.id, { status: 'final', ...o, min: null });
      } else {
        koPending.push(entry);
      }
    }

    // KO finals can depend on group third-place assignment or earlier KO finals;
    // recompute slots each pass and keep unresolved finals pending until their
    // canonical participants genuinely resolve.
    let pending = koPending;
    for (let round = 0; round < 8 && pending.length; round++) {
      const standings = computeStandings(groupFinals);
      slots = resolveSlots(standings, koFinals);
      const still = [];
      for (const entry of pending) {
        const hit = matchToCanonical(entry, fixtures, slots);
        // TRUTH RULE: a FINAL score requires two resolved canonical identities.
        // A final that only matches by kickoff window is retried on the next
        // resolution pass (slots may resolve) and rejected if identity never
        // materializes — a score can never sit beside an unresolved slot.
        if (!hit || !hit.byIdentity) { still.push(entry); continue; }
        const o = orient(entry, hit.flipped);
        if (o.gh == null || o.ga == null) { rejected++; continue; }
        if (!o.winner) o.winner = o.gh > o.ga ? 'home' : o.gh < o.ga ? 'away' : 'draw';
        if (hit.fixture.stage === 'group') groupFinals.set(hit.fixture.id, o);
        else koFinals.set(hit.fixture.id, o);
        byFixture.set(hit.fixture.id, { status: 'final', ...o, min: null });
      }
      if (still.length === pending.length) { rejected += still.length; break; }
      pending = still;
    }
  }
  const standings = computeStandings(groupFinals);
  slots = resolveSlots(standings, koFinals);

  // Pass 2 — live + hold + scheduled confirmations overlay status/score/clock only.
  const overlayNonFinal = (entry, statusOverride) => {
    const hit = matchToCanonical(entry, fixtures, slots);
    if (!hit) { rejected++; return; }
    const existing = byFixture.get(hit.fixture.id);
    if (existing && existing.status === 'final') return; // finality wins
    const o = orient(entry, hit.flipped);
    const status = statusOverride || classify(entry.kind || entry.status);
    if (status === 'scheduled' && !existing) return; // nothing to add: canonical already owns schedule
    // TRUTH RULE: an unresolved slot stays scoreless. Live status and clock may
    // attach by kickoff window, but goals require resolved identity.
    const scoreAllowed = hit.byIdentity === true;
    byFixture.set(hit.fixture.id, {
      status,
      gh: scoreAllowed ? o.gh : null,
      ga: scoreAllowed ? o.ga : null,
      winner: null,
      min: entry.min == null ? null : Number(entry.min),
    });
  };
  if (resultsOk) {
    for (const e of results.live || []) overlayNonFinal(e, 'live');
    for (const e of results.hold || []) overlayNonFinal(e, 'hold');
  }
  if (liveOk) {
    for (const e of live.response || []) overlayNonFinal(e, 'live');
    for (const e of live.finished || []) {
      // late finals from the live provider: same validation path — finality
      // requires resolved identity, exactly like /api/results finals
      const hit = matchToCanonical(e, fixtures, slots);
      if (!hit || !hit.byIdentity) { rejected++; continue; }
      const o = orient(e, hit.flipped);
      if (o.gh == null || o.ga == null) { rejected++; continue; }
      if (!byFixture.has(hit.fixture.id) || byFixture.get(hit.fixture.id).status !== 'final') {
        byFixture.set(hit.fixture.id, { status: 'final', ...o, winner: o.winner || (o.gh > o.ga ? 'home' : o.gh < o.ga ? 'away' : 'draw'), min: null });
      }
    }
  }

  return {
    version: ++_version,
    providerState: resultsOk ? 'ok' : 'partial',
    fetchedAt: (resultsOk && results.fetchedAt) || (liveOk && live.fetchedAt) || null,
    byFixture, standings, slots, rejected,
  };
}
