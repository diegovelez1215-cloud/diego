/* Focused, mocked tests for the persistent API-Sports quota guard.
 *
 * api/_shared.js uses ESM syntax inside a CommonJS package (Vercel bundles it as
 * ESM), so it cannot be imported directly by node under "type":"commonjs". We
 * load the real source by copying it to a temp .mjs module and importing that —
 * the guard has no relative imports, so this exercises the actual code.
 *
 * Both Redis (Upstash REST) and the upstream call are mocked:
 *   - global.fetch handles only Upstash REST (the guard's Redis transport).
 *   - the upstream API-Sports call is the injected `fetcher`, so we count calls.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHARED_SRC = path.join(__dirname, '..', 'api', '_shared.js');

const REDIS_URL = 'https://mock-redis.upstash.io';
const REDIS_TOKEN = 'mock-token';

function utcDate(now) { return new Date(now).toISOString().slice(0, 10); }

// Minimal in-memory Upstash REST interpreter for the commands the guard issues.
function makeRedis() {
  const store = new Map();
  function run(cmd) {
    const op = String(cmd[0]).toUpperCase();
    if (op === 'GET') return store.has(cmd[1]) ? store.get(cmd[1]) : null;
    if (op === 'DEL') { const had = store.delete(cmd[1]); return had ? 1 : 0; }
    if (op === 'MGET') return cmd.slice(1).map((k) => (store.has(k) ? store.get(k) : null));
    if (op === 'SET') {
      const key = cmd[1]; const val = cmd[2];
      const rest = cmd.slice(3).map((x) => String(x).toUpperCase());
      if (rest.includes('NX') && store.has(key)) return null; // lock contention
      store.set(key, val);
      return 'OK';
    }
    if (op === 'EVAL') {
      // ['EVAL', script, '2', gKey, rKey, gcap, rcap, ttl]
      const gKey = cmd[3], rKey = cmd[4];
      const gcap = Number(cmd[5]), rcap = Number(cmd[6]);
      let g = Number(store.get(gKey) || 0);
      let r = Number(store.get(rKey) || 0);
      if (g >= gcap) return [0, g, r, 'global'];
      if (r >= rcap) return [0, g, r, 'resource'];
      g += 1; store.set(gKey, String(g));
      r += 1; store.set(rKey, String(r));
      return [1, g, r, 'ok'];
    }
    throw new Error('unsupported redis op ' + op);
  }
  return { store, run };
}

async function loadGuard() {
  // Reset cross-instance globals so module-level/global maps start clean.
  delete globalThis.__wc26ApiSportsGood;
  delete globalThis.__wc26RouteCache;
  delete globalThis.__wc26RouteInflight;
  delete globalThis.__wc26RateBuckets;
  const src = fs.readFileSync(SHARED_SRC, 'utf8');
  const tmp = path.join(os.tmpdir(), `_shared_${Date.now()}_${Math.random().toString(36).slice(2)}.mjs`);
  fs.writeFileSync(tmp, src);
  return import(pathToFileURL(tmp).href);
}

function installRedis(redis, opts = {}) {
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith(REDIS_URL)) {
      if (opts.redisDown) throw new Error('redis network down');
      const body = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ result: redis.run(body) }) };
    }
    throw new Error('unexpected upstream fetch via global.fetch: ' + url);
  };
}

function withRedisEnv(on) {
  if (on) {
    process.env.KV_REST_API_URL = REDIS_URL;
    process.env.KV_REST_API_TOKEN = REDIS_TOKEN;
  } else {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  }
}

const NOW = Date.UTC(2026, 5, 27, 12, 0, 0); // fixed instant for deterministic keys
const DATE = utcDate(NOW);
const G_KEY = 'wc26:as:q:global:' + DATE;
const LIVE_KEY = 'wc26:as:q:live:' + DATE;
const CACHE_KEY = 'live:wc:all';

function liveOpts(fetcher, extra = {}) {
  return Object.assign({
    route: '/api/live',
    resource: 'live',
    cacheKey: CACHE_KEY,
    freshMs: 10 * 60 * 1000,
    now: () => NOW,
    buildEmpty: () => ({ configured: true, response: [], finished: [] }),
    validate: (b) => !!(b && Array.isArray(b.response) && Array.isArray(b.finished)),
    fetcher
  }, extra);
}

test('global request 61 is blocked with zero upstream calls', async () => {
  withRedisEnv(true);
  const redis = makeRedis();
  redis.store.set(G_KEY, '60');      // 60 already used today
  redis.store.set(LIVE_KEY, '40');   // live well under its own cap
  installRedis(redis);
  const { guardedApiSports } = await loadGuard();
  let calls = 0;
  const r = await guardedApiSports(liveOpts(async () => { calls++; return { configured: true, response: [], finished: [] }; }));
  assert.equal(calls, 0, 'no API-Sports call when global cap reached');
  assert.equal(redis.store.get(G_KEY), '60', 'global counter not incremented on refusal');
  assert.equal(r.sourceStatus, 'empty');
  assert.equal(r.isStale, false);
});

test('live request 57 is blocked while global capacity remains', async () => {
  withRedisEnv(true);
  const redis = makeRedis();
  redis.store.set(G_KEY, '56');     // global still has room (< 60)
  redis.store.set(LIVE_KEY, '56');  // live cap reached
  installRedis(redis);
  const { guardedApiSports } = await loadGuard();
  let calls = 0;
  const r = await guardedApiSports(liveOpts(async () => { calls++; return { configured: true, response: [], finished: [] }; }));
  assert.equal(calls, 0, 'no API-Sports call when live cap reached');
  assert.equal(redis.store.get(G_KEY), '56', 'global counter untouched when resource cap blocks');
  assert.equal(redis.store.get(LIVE_KEY), '56', 'live counter not incremented on refusal');
  assert.equal(r.quota.resourceUsed, 56);
  assert.equal(r.quota.resourceCap, 56);
});

test('fresh cache makes zero upstream calls and spends zero quota', async () => {
  withRedisEnv(true);
  const redis = makeRedis();
  redis.store.set(CACHE_KEY, JSON.stringify({ body: { configured: true, response: [{ id: 1 }], finished: [] }, storedAt: NOW - 60 * 1000 }));
  installRedis(redis);
  const { guardedApiSports } = await loadGuard();
  let calls = 0;
  const r = await guardedApiSports(liveOpts(async () => { calls++; return { configured: true, response: [], finished: [] }; }));
  assert.equal(calls, 0, 'fresh cache must not call upstream');
  assert.equal(redis.store.get(G_KEY), undefined, 'fresh cache read consumes no quota');
  assert.equal(r.sourceStatus, 'cache');
  assert.equal(r.isStale, false);
  assert.equal(r.body.response.length, 1);
});

test('concurrent cache misses produce exactly one upstream call', async () => {
  withRedisEnv(true);
  const redis = makeRedis();
  installRedis(redis);
  const { guardedApiSports } = await loadGuard();
  let calls = 0;
  const fetcher = async () => { calls++; await new Promise((res) => setTimeout(res, 10)); return { configured: true, response: [], finished: [] }; };
  const [a, b] = await Promise.all([
    guardedApiSports(liveOpts(fetcher)),
    guardedApiSports(liveOpts(fetcher))
  ]);
  assert.equal(calls, 1, 'distributed lock allows only one upstream call');
  assert.equal(redis.store.get(G_KEY), '1', 'exactly one reservation consumed');
  const statuses = [a.sourceStatus, b.sourceStatus].sort();
  assert.deepEqual(statuses, ['empty', 'fresh'], 'one fresh, one fell back');
});

test('upstream failure consumes one reservation and never retries', async () => {
  withRedisEnv(true);
  const redis = makeRedis();
  installRedis(redis);
  const { guardedApiSports } = await loadGuard();
  let calls = 0;
  const r = await guardedApiSports(liveOpts(async () => { calls++; throw new Error('provider_status_500'); }));
  assert.equal(calls, 1, 'exactly one attempt, no automatic retry');
  assert.equal(redis.store.get(G_KEY), '1', 'failed call consumes its reserved allowance');
  assert.equal(redis.store.get(LIVE_KEY), '1');
  assert.equal(r.isStale, false); // no prior good data -> safe empty fallback
  assert.equal(r.sourceStatus, 'empty');
});

test('absent Redis credentials make zero upstream calls (fail closed)', async () => {
  withRedisEnv(false);
  const redis = makeRedis();
  installRedis(redis); // any redis fetch would throw "unexpected" — must not happen
  const { guardedApiSports } = await loadGuard();
  let calls = 0;
  const r = await guardedApiSports(liveOpts(async () => { calls++; return { configured: true, response: [], finished: [] }; }));
  assert.equal(calls, 0, 'no upstream call without verifiable quota');
  assert.equal(r.sourceStatus, 'empty');
  assert.equal(r.isStale, false);
  withRedisEnv(false);
});
