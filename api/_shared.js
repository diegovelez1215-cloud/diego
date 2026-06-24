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

export { safeLog };
