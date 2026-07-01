// United 2026 — rAF render scheduler.
// Renders are queued, deduped by view key, and flushed in a single animation
// frame. Tab taps NEVER render synchronously through this — they flip
// visibility classes and, at most, enqueue a refresh for stale content.

let raf = typeof requestAnimationFrame === 'function'
  ? (fn) => requestAnimationFrame(fn)
  : (fn) => setTimeout(fn, 16);

/** Test seam: swap in a manually-flushed queue. Never runs jobs immediately. */
export function setRaf(fn) { raf = fn; }

const queue = new Map(); // key -> job
let scheduled = false;

export function schedule(key, job) {
  queue.set(key, job);
  if (scheduled) return;
  scheduled = true;
  raf(flush);
}

function flush() {
  scheduled = false;
  const jobs = [...queue.values()];
  queue.clear();
  for (const job of jobs) {
    try { job(); } catch (e) { console.error('[render]', e); }
  }
}

export function pendingCount() { return queue.size; }
