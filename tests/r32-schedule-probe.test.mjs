/* Focused, mocked tests for the Preview-only API-Sports R32 schedule probe.
 *
 * api/diag.js and api/_shared.js use ESM syntax inside a CommonJS package
 * (Vercel bundles them as ESM), so node under "type":"commonjs" cannot import
 * them directly. We copy both into a temp dir (rewriting diag's relative import
 * to the temp _shared.mjs) and import the real handler. Redis (Upstash REST) and
 * the upstream API-Sports call are both mocked through global.fetch; the upstream
 * call is counted to prove single-flight and cache behavior.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHARED = path.join(__dirname, '..', 'api', '_shared.js');
const DIAG = path.join(__dirname, '..', 'api', 'diag.js');

const REDIS_URL = 'https://mock-redis.upstash.io';
const KEY_SENTINEL = 'APISPORTS_SECRET_SENTINEL';
const RAW_REFEREE_SENTINEL = 'RAW_SENTINEL_REFEREE';
const RAW_PLAN_SENTINEL = 'RAW_PLAN_SENTINEL';
const TOKEN = 'tkn';

function utcDate(now) { return new Date(now).toISOString().slice(0, 10); }

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
      if (rest.includes('NX') && store.has(key)) return null;
      store.set(key, val);
      return 'OK';
    }
    if (op === 'EVAL') {
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

const SUCCESS_PAYLOAD = {
  results: 2,
  errors: [],
  response: [
    { fixture: { id: 1, date: '2030-06-01T18:00:00+00:00', status: { short: 'NS' }, referee: RAW_REFEREE_SENTINEL }, teams: { home: { name: 'Germany' }, away: { name: 'Paraguay' } }, league: { id: 1, round: 'Round of 32' } },
    { fixture: { id: 2, date: '2030-06-02T18:00:00+00:00', status: { short: 'NS' } }, teams: { home: { name: 'France' }, away: { name: 'Sweden' } }, league: { id: 1, round: 'Round of 32' } }
  ]
};
const DENIAL_PAYLOAD = { results: 0, errors: { plan: 'Free plans do not have access to this season. ' + RAW_PLAN_SENTINEL }, response: [] };

let upstreamCalls = 0;
let upstreamMode = 'success';

function installFetch(redis) {
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith(REDIS_URL)) {
      const body = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ result: redis.run(body) }) };
    }
    if (u.includes('api-sports.io')) {
      upstreamCalls++;
      const payload = upstreamMode === 'denial' ? DENIAL_PAYLOAD : SUCCESS_PAYLOAD;
      return { ok: true, status: 200, json: async () => payload };
    }
    throw new Error('unexpected fetch: ' + u);
  };
}

function setEnv({ env, redis = true, key = true }) {
  process.env.DIAG_TOKEN = TOKEN;
  if (env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = env;
  if (redis) { process.env.KV_REST_API_URL = REDIS_URL; process.env.KV_REST_API_TOKEN = 'mock'; }
  else { delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN; }
  if (key) process.env.API_SPORTS_KEY = KEY_SENTINEL; else delete process.env.API_SPORTS_KEY;
}

async function loadDiag() {
  delete globalThis.__wc26ApiSportsGood;
  delete globalThis.__wc26RouteCache;
  delete globalThis.__wc26RouteInflight;
  delete globalThis.__wc26RateBuckets;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r32probe-'));
  fs.writeFileSync(path.join(dir, '_shared.mjs'), fs.readFileSync(SHARED, 'utf8'));
  const diagSrc = fs.readFileSync(DIAG, 'utf8').replace(/'\.\/_shared\.js'/g, "'./_shared.mjs'");
  fs.writeFileSync(path.join(dir, 'diag.mjs'), diagSrc);
  const mod = await import(pathToFileURL(path.join(dir, 'diag.mjs')).href);
  return mod.default;
}

function makeRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.body = o; return res; };
  return res;
}

function probeReq() { return { query: { token: TOKEN, probe: 'api-sports-r32' }, headers: {} }; }

test('probe is disabled (404) outside Preview, with zero upstream calls', async () => {
  upstreamCalls = 0; upstreamMode = 'success';
  setEnv({ env: 'production' });
  const redis = makeRedis(); installFetch(redis);
  const handler = await loadDiag();
  const res = makeRes();
  await handler(probeReq(), res);
  assert.equal(res.statusCode, 404);
  assert.match(String(res.body.note || ''), /unavailable/);
  assert.equal(upstreamCalls, 0, 'no upstream call when probe disabled');
});

test('probe uses the schedule quota lane, not live', async () => {
  upstreamCalls = 0; upstreamMode = 'success';
  setEnv({ env: 'preview' });
  const redis = makeRedis(); installFetch(redis);
  const handler = await loadDiag();
  const res = makeRes();
  await handler(probeReq(), res);
  const date = utcDate(Date.now());
  assert.equal(res.body.state, 'attempted');
  assert.equal(redis.store.get('wc26:as:q:schedule:' + date), '1', 'schedule lane reserved');
  assert.equal(redis.store.get('wc26:as:q:live:' + date), undefined, 'live lane untouched');
  assert.equal(res.body.quota.resource, 'schedule');
  assert.equal(res.body.quota.resourceCap, 4);
  assert.equal(upstreamCalls, 1);
});

test('provider access denial becomes a safe no_access result, not an exception', async () => {
  upstreamCalls = 0; upstreamMode = 'denial';
  setEnv({ env: 'preview' });
  const redis = makeRedis(); installFetch(redis);
  const handler = await loadDiag();
  const res = makeRes();
  await handler(probeReq(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.state, 'attempted');
  assert.equal(res.body.result.providerStatus, 'no_access');
  assert.equal(res.body.result.r32FutureCount, 0);
  assert.equal(JSON.stringify(res.body).includes(RAW_PLAN_SENTINEL), false, 'raw provider error text not leaked');
});

test('probe never returns secrets or raw provider payload', async () => {
  upstreamCalls = 0; upstreamMode = 'success';
  setEnv({ env: 'preview' });
  const redis = makeRedis(); installFetch(redis);
  const handler = await loadDiag();
  const res = makeRes();
  await handler(probeReq(), res);
  const s = JSON.stringify(res.body);
  assert.equal(s.includes(KEY_SENTINEL), false, 'API key not present');
  assert.equal(s.toLowerCase().includes('x-apisports-key'), false, 'no auth header echoed');
  assert.equal(s.includes(RAW_REFEREE_SENTINEL), false, 'raw provider payload field not present');
  // Sanity: it DID normalize useful evidence.
  assert.equal(res.body.result.r32NamedCount, 2);
  assert.equal(res.body.result.presence['Germany-Paraguay'], true);
  assert.equal(res.body.result.presence['France-Sweden'], true);
  assert.equal(res.body.result.presence['Australia-Egypt'], false);
});

test('second probe is served from cache without another upstream call', async () => {
  upstreamCalls = 0; upstreamMode = 'success';
  setEnv({ env: 'preview' });
  const redis = makeRedis(); installFetch(redis);
  const handler = await loadDiag();
  const res1 = makeRes();
  await handler(probeReq(), res1);
  assert.equal(res1.body.state, 'attempted');
  assert.equal(upstreamCalls, 1);
  const res2 = makeRes();
  await handler(probeReq(), res2);
  assert.equal(res2.body.state, 'cache-served');
  assert.equal(upstreamCalls, 1, 'cached probe makes no additional upstream call');
});
