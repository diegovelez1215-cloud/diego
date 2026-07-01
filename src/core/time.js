// United 2026 — tournament time.
// Today/Tomorrow are defined by Puerto Rico local time (AST, fixed UTC-4, no
// DST). During the tournament window U.S. Eastern equals AST, so canonical
// kickoffs (stored with a -04:00 offset) bucket cleanly by AST calendar day.

const OFFSET_MS = -4 * 3600 * 1000; // AST is UTC-4, always.

let _now = () => Date.now();

/** Test seam. Production never calls this. */
export function setClock(fn) { _now = typeof fn === 'function' ? fn : (() => Date.now()); }
export function now() { return _now(); }

/** Epoch ms for a canonical kickoff ISO string ("2026-07-01T20:00:00-04:00"). */
export function kickoffEpoch(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** AST calendar-day key ("2026-07-01") for an epoch instant. */
export function dayKey(epochMs) {
  return new Date(epochMs + OFFSET_MS).toISOString().slice(0, 10);
}

export function todayKey() { return dayKey(now()); }
export function tomorrowKey() { return dayKey(now() + 24 * 3600 * 1000); }

/** "8:00 PM" in AST for a kickoff epoch. */
export function formatKickoffTime(epochMs) {
  const d = new Date(epochMs + OFFSET_MS);
  let h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + String(m).padStart(2, '0') + ' ' + ap;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Wed, Jul 1" for a day key. */
export function formatDayKey(key) {
  const d = new Date(key + 'T12:00:00Z');
  return DAYS[d.getUTCDay()] + ', ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate();
}
