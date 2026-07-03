// United 2026 — provider refresh policy (pure, testable).
// One shared snapshot, no waste: fast polling only while a validated official
// match is live AND the app is visible; slow polling otherwise; scorer/stat
// data on a much longer clock than live scores; a visibility return refreshes
// only when the snapshot is actually due. Freshness is never sacrificed just
// to save calls — live football always polls at the live cadence.

export const LIVE_POLL_MS = 60 * 1000;        // validated live match on screen
export const IDLE_POLL_MS = 5 * 60 * 1000;    // tournament quiet
export const SCORER_TTL_MS = 15 * 60 * 1000;  // player stats move slowly

export function pollDelay(anyLive) {
  return anyLive ? LIVE_POLL_MS : IDLE_POLL_MS;
}

/** Is the core results/live snapshot due for a refresh? */
export function snapshotDue(nowMs, lastFetchedMs, anyLive) {
  if (!lastFetchedMs) return true;
  return nowMs - lastFetchedMs >= pollDelay(anyLive);
}

/** Is the scorer/stat feed due? Longer TTL than live scores. */
export function scorersDue(nowMs, lastFetchedMs) {
  if (!lastFetchedMs) return true;
  return nowMs - lastFetchedMs >= SCORER_TTL_MS;
}
