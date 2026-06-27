const root = globalThis;
const cache = root.__wc26RouteCache || (root.__wc26RouteCache = new Map());
const inflight = root.__wc26RouteInflight || (root.__wc26RouteInflight = new Map());
const buckets = root.__wc26RateBuckets || (root.__wc26RateBuckets = new Map());

function nowIso() {
  return new Date().toISOString();
}

function safeLog(event, fields = {}) {
  try {
    const clean = { event, at: nowIso() };
    Object.keys(fields).forEach((k) => {
      if (/key|token|secret|auth|header/i.test(k)) return;
      const v = fields[k];
      if (v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') clean[k] = v;
    });
    console.log(JSON.stringify(clean));
  } catch (_) {}
}

function requestId(req) {
  const xff = String(req.headers['x-forwarded-for'] || '');
  const ip = xff.split(',')[0].trim() || req.socket?.remoteAddress || 'anon';
  return ip.slice(0, 80);
}

function rateLimit(req, route, limit, windowMs) {
  const key = route + ':' + requestId(req);
  const t = Date.now();
  let b = buckets.get(key);
  if (!b || t > b.reset) b = { count: 0, reset: t + windowMs };
  b.count += 1;
  buckets.set(key, b);
  if (b.count <= limit) return { ok: true, remaining: limit - b.count };
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((b.reset - t) / 1000)) };
}

function decorate(body, item, sourceStatus) {
  const fetchedAt = item && item.fetchedAt ? item.fetchedAt : nowIso();
  const cacheAgeSeconds = item && item.storedAt ? Math.max(0, Math.round((Date.now() - item.storedAt) / 1000)) : 0;
  return Object.assign({}, body || {}, {
    fetchedAt,
    cacheAgeSeconds,
    isStale: sourceStatus === 'stale-fallback',
    sourceStatus
  });
}

export async function fetchJson(url, options = {}, timeoutMs = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, Object.assign({}, options, { signal: ctrl.signal }));
    let data = null;
    try { data = await r.json(); } catch (e) {
      const err = new Error('parse_failure');
      err.status = r.status;
      throw err;
    }
    if (!r.ok) {
      const err = new Error('provider_status_' + r.status);
      err.status = r.status;
      err.data = data;
      throw err;
    }
    return { status: r.status, data };
  } finally {
    clearTimeout(timer);
  }
}

export async function cachedRoute(req, res, opts) {
  const route = opts.route;
  const cacheKey = opts.cacheKey || route;
  const ttlMs = opts.ttlMs || 30000;
  const staleMs = opts.staleMs || ttlMs;
  const rl = opts.rateLimit || { limit: 90, windowMs: 60000 };
  const limited = rateLimit(req, route, rl.limit, rl.windowMs);
  if (!limited.ok) {
    safeLog('route_throttled', { route, retryAfterSeconds: limited.retryAfterSeconds });
    res.setHeader('Retry-After', String(limited.retryAfterSeconds));
    res.status(429).json({
      configured: true,
      error: 'throttled',
      sourceStatus: 'throttled',
      retryAfterSeconds: limited.retryAfterSeconds,
      fetchedAt: nowIso()
    });
    return;
  }

  const t = Date.now();
  const item = cache.get(cacheKey);
  if (item && t - item.storedAt <= ttlMs) {
    safeLog('route_cache_hit', { route, cacheAgeSeconds: Math.round((t - item.storedAt) / 1000) });
    res.status(200).json(decorate(item.body, item, 'cache'));
    return;
  }

  if (inflight.has(cacheKey)) {
    try {
      const body = await inflight.get(cacheKey);
      const cur = cache.get(cacheKey);
      safeLog('route_request_coalesced', { route });
      res.status(200).json(decorate(body, cur, 'coalesced'));
      return;
    } catch (_) {}
  }

  const p = (async () => {
    const started = Date.now();
    safeLog('provider_request_start', { route, provider: opts.provider });
    const body = await opts.fetcher();
    const stored = { body, storedAt: Date.now(), fetchedAt: body && body.fetchedAt ? body.fetchedAt : nowIso() };
    cache.set(cacheKey, stored);
    safeLog('provider_response_success', { route, provider: opts.provider, latencyMs: Date.now() - started });
    return body;
  })();

  inflight.set(cacheKey, p);
  try {
    const body = await p;
    const cur = cache.get(cacheKey);
    res.status(200).json(decorate(body, cur, 'fresh'));
  } catch (e) {
    const category = e && e.status === 429 ? 'rate_limit' : (e && e.name === 'AbortError' ? 'timeout' : (e && e.message === 'parse_failure' ? 'parse_failure' : 'provider_error'));
    safeLog('provider_error', { route, provider: opts.provider, category, status: e && e.status });
    if (item && t - item.storedAt <= staleMs) {
      safeLog('stale_fallback_use', { route, cacheAgeSeconds: Math.round((t - item.storedAt) / 1000) });
      res.status(200).json(decorate(Object.assign({}, item.body, { error: true, errorCategory: category }), item, 'stale-fallback'));
    } else {
      const fallback = typeof opts.fallback === 'function' ? opts.fallback(category) : (opts.fallback || {});
      res.status(200).json(Object.assign({ configured: true, error: true, errorCategory: category, fetchedAt: nowIso(), sourceStatus: 'error' }, fallback));
    }
  } finally {
    inflight.delete(cacheKey);
  }
}

/* ----------------------------------------------------------------------------
 * Persistent API-Sports quota guard (Upstash Redis REST, fail-closed).
 *
 * Every API-Sports upstream call must flow through guardedApiSports(). Before any
 * upstream call, ONE atomic Redis EVAL reserves both a global slot AND a
 * per-resource slot for the current UTC day. If either cap is hit, the request
 * is refused and ZERO API-Sports calls are made.
 *
 *   global cap : 60 attempted upstream calls / UTC day
 *   live cap   : 56 / UTC day
 *   schedule   : 4  / UTC day (reserved for future use; 56 + 4 = 60)
 *
 * Cache/lock behavior (shared across all Vercel instances via Redis):
 *   - fresh live cache window: >= 10 minutes (reads cost zero quota)
 *   - last-known-good retained: >= 24 hours (same key, long TTL)
 *   - short cache-miss lock so concurrent misses trigger ONE upstream call
 *   - failures consume their reserved allowance; no automatic retries
 *   - lock contention, quota refusal, failed/malformed upstream, unavailable or
 *     unconfigured Redis -> return stale last-known-good (clearly marked stale)
 *     or the safe empty fallback. Never label stale data as current.
 *   - missing/broken Redis makes ZERO API-Sports calls (fail closed).
 * --------------------------------------------------------------------------- */

const QUOTA_GLOBAL_CAP = 60;
const QUOTA_RES_CAPS = { live: 56, schedule: 4 };
const LIVE_FRESH_MS = 10 * 60 * 1000;      // fresh window: 10 minutes minimum
const GOOD_TTL_SECONDS = 24 * 60 * 60;     // last-known-good retained >= 24h
const LOCK_TTL_SECONDS = 12;               // short lock; > upstream timeout safety

const memGood = root.__wc26ApiSportsGood || (root.__wc26ApiSportsGood = new Map());

// Atomic reserve-both-or-nothing. Returns {allowed, g, r, reason}.
const RESERVE_LUA = [
  "local g = tonumber(redis.call('GET', KEYS[1]) or '0')",
  "local r = tonumber(redis.call('GET', KEYS[2]) or '0')",
  "local gc = tonumber(ARGV[1])",
  "local rc = tonumber(ARGV[2])",
  "local ttl = tonumber(ARGV[3])",
  "if g >= gc then return {0, g, r, 'global'} end",
  "if r >= rc then return {0, g, r, 'resource'} end",
  "g = redis.call('INCR', KEYS[1]); if g == 1 then redis.call('EXPIRE', KEYS[1], ttl) end",
  "r = redis.call('INCR', KEYS[2]); if r == 1 then redis.call('EXPIRE', KEYS[2], ttl) end",
  "return {1, g, r, 'ok'}"
].join('\n');

function redisConfigured() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function redisCmd(args) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: ctrl.signal
    });
    let j = null;
    try { j = await r.json(); } catch (e) { throw new Error('redis_parse'); }
    if (!r.ok || (j && j.error)) throw new Error('redis_error');
    return j ? j.result : null;
  } finally {
    clearTimeout(timer);
  }
}

function utcDate(now) { return new Date(now).toISOString().slice(0, 10); }

function secondsToUtcMidnight(now) {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
  return Math.max(60, Math.ceil((next - now) / 1000));
}

function quotaKeys(resource, now) {
  const date = utcDate(now);
  return { gKey: 'wc26:as:q:global:' + date, rKey: 'wc26:as:q:' + resource + ':' + date };
}

async function reserveQuota(resource, now) {
  const { gKey, rKey } = quotaKeys(resource, now);
  const rcap = QUOTA_RES_CAPS[resource] || 0;
  const ttl = secondsToUtcMidnight(now) + 60;
  const res = await redisCmd(['EVAL', RESERVE_LUA, '2', gKey, rKey, String(QUOTA_GLOBAL_CAP), String(rcap), String(ttl)]);
  const a = Array.isArray(res) ? res : [0, 0, 0, 'error'];
  return { allowed: Number(a[0]) === 1, g: Number(a[1]) || 0, r: Number(a[2]) || 0, reason: a[3] };
}

async function readUsage(resource, now) {
  const { gKey, rKey } = quotaKeys(resource, now);
  const res = await redisCmd(['MGET', gKey, rKey]);
  return { g: Number((res && res[0]) || 0), r: Number((res && res[1]) || 0) };
}

export async function guardedApiSports(opts) {
  const resource = opts.resource;
  const cacheKey = opts.cacheKey;
  const freshMs = opts.freshMs || LIVE_FRESH_MS;
  const now = (opts.now || Date.now)();
  const globalCap = QUOTA_GLOBAL_CAP;
  const resourceCap = QUOTA_RES_CAPS[resource] || 0;
  const empty = () => (typeof opts.buildEmpty === 'function' ? opts.buildEmpty() : {});

  function out(body, sourceStatus, storedAt, usage, nextRefreshAt) {
    const isStale = sourceStatus === 'stale-fallback';
    const ageSec = storedAt ? Math.max(0, Math.round((now - storedAt) / 1000)) : 0;
    return {
      body: body || empty(),
      sourceStatus,
      isStale,
      cacheAgeSeconds: ageSec,
      fetchedAt: storedAt ? new Date(storedAt).toISOString() : new Date(now).toISOString(),
      quota: {
        resource,
        globalUsed: usage ? usage.g : null,
        globalCap,
        resourceUsed: usage ? usage.r : null,
        resourceCap
      },
      nextRefreshAt: nextRefreshAt || (storedAt ? new Date(storedAt + freshMs).toISOString() : null)
    };
  }

  // FAIL CLOSED: without Redis we cannot verify quota atomically -> zero upstream.
  if (!redisConfigured()) {
    safeLog('quota_guard_redis_unconfigured', { route: opts.route, resource });
    const mem = memGood.get(cacheKey);
    if (mem) return out(mem.body, 'stale-fallback', mem.storedAt, null);
    return out(empty(), 'empty', null, null);
  }

  // 1) Fresh cache read (zero quota cost).
  let stored = null;
  try {
    const raw = await redisGet(cacheKey);
    if (raw) stored = JSON.parse(raw);
  } catch (e) {
    // Redis broken -> fail closed, serve in-memory stale or empty, zero upstream.
    safeLog('quota_guard_redis_unavailable', { route: opts.route, resource });
    const mem = memGood.get(cacheKey);
    if (mem) return out(mem.body, 'stale-fallback', mem.storedAt, null);
    return out(empty(), 'empty', null, null);
  }
  if (stored && (now - stored.storedAt) <= freshMs) {
    memGood.set(cacheKey, stored);
    const usage = await readUsage(resource, now).catch(() => null);
    return out(stored.body, 'cache', stored.storedAt, usage);
  }
  if (stored) memGood.set(cacheKey, stored);
  const staleNow = stored || memGood.get(cacheKey) || null;
  const nextMidnight = new Date(now + secondsToUtcMidnight(now) * 1000).toISOString();

  // 2) Short distributed lock so concurrent misses trigger ONE upstream call.
  const lockKey = 'wc26:as:lock:' + resource;
  const lockId = String(now) + ':' + Math.random().toString(36).slice(2);
  let locked = false;
  try { locked = await redisLock(lockKey, lockId, LOCK_TTL_SECONDS); }
  catch (e) { locked = false; }
  if (!locked) {
    safeLog('quota_guard_lock_contention', { route: opts.route, resource });
    if (staleNow) return out(staleNow.body, 'stale-fallback', staleNow.storedAt, null);
    return out(empty(), 'empty', null, null);
  }

  try {
    // 3) ONE atomic Redis op confirms BOTH global and resource allowance.
    let reserved;
    try { reserved = await reserveQuota(resource, now); }
    catch (e) {
      safeLog('quota_guard_reserve_unavailable', { route: opts.route, resource });
      if (staleNow) return out(staleNow.body, 'stale-fallback', staleNow.storedAt, null);
      return out(empty(), 'empty', null, null);
    }
    if (!reserved.allowed) {
      const usage = { g: reserved.g, r: reserved.r };
      safeLog('quota_guard_refused', { route: opts.route, resource, reason: reserved.reason, globalUsed: reserved.g, resourceUsed: reserved.r });
      if (staleNow) return out(staleNow.body, 'stale-fallback', staleNow.storedAt, usage, nextMidnight);
      return out(empty(), 'empty', null, usage, nextMidnight);
    }
    const usage = { g: reserved.g, r: reserved.r };

    // 4) Exactly one upstream call. No automatic retries.
    let body;
    try { body = await opts.fetcher(); }
    catch (e) {
      // Reservation already consumed; do not retry.
      safeLog('quota_guard_upstream_failed', { route: opts.route, resource, category: e && e.message });
      if (staleNow) return out(staleNow.body, 'stale-fallback', staleNow.storedAt, usage);
      return out(empty(), 'empty', null, usage);
    }
    if (typeof opts.validate === 'function' && !opts.validate(body)) {
      safeLog('quota_guard_upstream_malformed', { route: opts.route, resource });
      if (staleNow) return out(staleNow.body, 'stale-fallback', staleNow.storedAt, usage);
      return out(empty(), 'empty', null, usage);
    }

    const fresh = { body, storedAt: now };
    memGood.set(cacheKey, fresh);
    try { await redisSetGood(cacheKey, JSON.stringify(fresh)); } catch (e) {}
    return out(body, 'fresh', now, usage);
  } finally {
    try { await redisDel(lockKey); } catch (e) {}
  }
}

async function redisGet(key) { return redisCmd(['GET', key]); }
async function redisDel(key) { return redisCmd(['DEL', key]); }
async function redisLock(key, val, ttl) {
  const r = await redisCmd(['SET', key, val, 'NX', 'EX', String(ttl)]);
  return r === 'OK';
}
async function redisSetGood(key, val) {
  return redisCmd(['SET', key, val, 'EX', String(GOOD_TTL_SECONDS)]);
}

// Safe, non-secret snapshot for diagnostics. Only GETs -> zero quota cost.
export async function apiSportsQuotaSnapshot(resource = 'live', cacheKey = 'live:wc:all', freshMs = LIVE_FRESH_MS) {
  const snap = {
    redisConfigured: redisConfigured(),
    globalCap: QUOTA_GLOBAL_CAP,
    resourceCaps: Object.assign({}, QUOTA_RES_CAPS)
  };
  if (!snap.redisConfigured) return snap;
  try {
    const now = Date.now();
    const usage = await readUsage(resource, now);
    snap.resource = resource;
    snap.globalUsed = usage.g;
    snap.resourceUsed = usage.r;
    snap.resourceCap = QUOTA_RES_CAPS[resource] || 0;
    snap.nextResetAt = new Date(now + secondsToUtcMidnight(now) * 1000).toISOString();
    let storedAt = null;
    try {
      const raw = await redisGet(cacheKey);
      if (raw) { const s = JSON.parse(raw); storedAt = s.storedAt; }
    } catch (e) {}
    snap.cacheAgeSeconds = storedAt ? Math.max(0, Math.round((now - storedAt) / 1000)) : null;
    snap.cacheFresh = storedAt ? (now - storedAt) <= freshMs : false;
    snap.nextRefreshAt = storedAt ? new Date(storedAt + freshMs).toISOString() : null;
  } catch (e) {
    snap.readError = true;
  }
  return snap;
}

/* ----------------------------------------------------------------------------
 * Preview-only API-Sports R32 schedule contract probe.
 *
 * Determines whether the configured API-Sports plan can return NAMED future
 * FIFA World Cup 2026 Round-of-32 fixtures (league 1, season 2026, Round of 32).
 * It routes through guardedApiSports() on the reserved `schedule` quota lane,
 * makes at most one guarded upstream call, caches the normalized result for 24h,
 * and returns ONLY safe normalized evidence. The raw provider payload and the
 * API key never leave this function. Plan/season denial is normalized to a clear
 * `no_access` result rather than thrown.
 * --------------------------------------------------------------------------- */
export async function apiSportsR32Probe() {
  const PROBE = 'api-sports-r32';
  const empty = (providerStatus, httpStatus) => ({
    probe: PROBE,
    providerStatus: providerStatus,
    httpStatus: httpStatus == null ? null : httpStatus,
    r32FutureCount: 0,
    r32NamedCount: 0,
    samples: [],
    presence: { 'Germany-Paraguay': false, 'France-Sweden': false, 'Australia-Egypt': false, 'Argentina-Cape Verde': false }
  });

  const key = process.env.API_SPORTS_KEY;
  if (!key) {
    return { state: 'blocked', result: empty('unconfigured', null), quota: null, cacheAgeSeconds: 0, isStale: false, nextRefreshAt: null };
  }

  function isNamed(n) {
    if (!n) return false;
    const s = String(n).trim();
    if (!s) return false;
    return !/^(tbd|winner|runner|loser|to be|q\d|group |1st|2nd|w\d|l\d)/i.test(s);
  }
  function pairKey(a, b) {
    return [String(a).toLowerCase().trim(), String(b).toLowerCase().trim()].sort().join(' v ');
  }
  const TARGETS = {
    'Germany-Paraguay': ['germany', 'paraguay'],
    'France-Sweden': ['france', 'sweden'],
    'Australia-Egypt': ['australia', 'egypt'],
    'Argentina-Cape Verde': ['argentina', 'cape verde']
  };

  function normalize(arr, httpStatus, providerStatus) {
    if (!Array.isArray(arr)) return empty(providerStatus, httpStatus);
    const nowTs = Date.now();
    const future = arr.filter(function (f) {
      const st = f && f.fixture && f.fixture.status ? f.fixture.status.short : '';
      const dateStr = f && f.fixture ? f.fixture.date : '';
      const ts = dateStr ? Date.parse(dateStr) : NaN;
      const done = ['FT', 'AET', 'PEN', 'FINISHED'].indexOf(st) !== -1;
      return !done && (st === 'NS' || st === 'TBD' || (Number.isFinite(ts) && ts > nowTs));
    });
    const named = future.filter(function (f) {
      const h = f && f.teams && f.teams.home ? f.teams.home.name : '';
      const a = f && f.teams && f.teams.away ? f.teams.away.name : '';
      return isNamed(h) && isNamed(a);
    });
    const samples = named.slice(0, 4).map(function (f) {
      return { home: f.teams.home.name, away: f.teams.away.name, kickoff: (f.fixture && f.fixture.date) || null };
    });
    const present = new Set(named.map(function (f) { return pairKey(f.teams.home.name, f.teams.away.name); }));
    const presence = {};
    Object.keys(TARGETS).forEach(function (label) {
      const t = TARGETS[label];
      presence[label] = present.has([t[0], t[1]].sort().join(' v '));
    });
    return {
      probe: PROBE,
      providerStatus: providerStatus,
      httpStatus: httpStatus == null ? null : httpStatus,
      r32FutureCount: future.length,
      r32NamedCount: named.length,
      samples: samples,
      presence: presence
    };
  }

  const url = 'https://v3.football.api-sports.io/fixtures?league=1&season=2026&round=' + encodeURIComponent('Round of 32');
  const fetcher = async function () {
    let got;
    try {
      got = await fetchJson(url, { method: 'GET', headers: { 'x-apisports-key': key, 'Accept': 'application/json' } }, 9000);
    } catch (e) {
      const st = e && e.status;
      const denied = st === 401 || st === 403;
      return normalize(null, st || 0, denied ? 'no_access' : 'error');
    }
    const data = got.data;
    const errs = data && data.errors;
    const hasErr = errs && (Array.isArray(errs) ? errs.length > 0 : (typeof errs === 'object' ? Object.keys(errs).length > 0 : !!errs));
    if (hasErr) return normalize(null, got.status, 'no_access');
    if (!data || !Array.isArray(data.response)) return normalize(null, got.status, 'error');
    return normalize(data.response, got.status, 'ok');
  };

  const guarded = await guardedApiSports({
    route: '/api/diag',
    resource: 'schedule',
    cacheKey: 'schedule:wc:r32',
    freshMs: GOOD_TTL_SECONDS * 1000, // cache this probe for >= 24h
    buildEmpty: function () { return empty('unavailable', null); },
    validate: function (b) { return !!(b && b.probe === PROBE); },
    fetcher: fetcher
  });

  let state = 'blocked';
  if (guarded.sourceStatus === 'fresh') state = 'attempted';
  else if (guarded.sourceStatus === 'cache') state = 'cache-served';

  return {
    state: state,
    result: guarded.body,
    quota: guarded.quota,
    cacheAgeSeconds: guarded.cacheAgeSeconds,
    isStale: guarded.isStale,
    nextRefreshAt: guarded.nextRefreshAt
  };
}

export { safeLog, rateLimit };
