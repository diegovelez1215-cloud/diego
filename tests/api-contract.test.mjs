import test from 'node:test';
import assert from 'node:assert/strict';

import resultsHandler from '../api/results.js';
import liveHandler from '../api/live.js';
import scorersHandler from '../api/scorers.js';

async function call(handler, envPatch = {}) {
  const previous = {};
  for (const [k, v] of Object.entries(envPatch)) {
    previous[k] = process.env[k];
    if (v == null) delete process.env[k];
    else process.env[k] = v;
  }
  let statusCode = 200;
  let body = null;
  const headers = {};
  const req = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };
  const res = {
    setHeader(k, v) { headers[String(k).toLowerCase()] = v; },
    status(n) { statusCode = n; return this; },
    json(x) { body = x; return this; },
  };
  try {
    await handler(req, res);
    return { statusCode, headers, body };
  } finally {
    for (const [k, v] of Object.entries(previous)) {
      if (v == null) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('/api/results missing config has a complete safe contract', async () => {
  const r = await call(resultsHandler, { FOOTBALL_DATA_KEY: null });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.configured, false);
  assert.equal(r.body.sourceStatus, 'missing-config');
  assert.equal(r.body.isStale, false);
  assert.equal(r.body.count, 0);
  assert.deepEqual([r.body.finished, r.body.live, r.body.hold, r.body.scheduled].map(Array.isArray), [true, true, true, true]);
});

test('/api/live missing config has a complete safe contract', async () => {
  const r = await call(liveHandler, { API_SPORTS_KEY: null });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.configured, false);
  assert.equal(r.body.sourceStatus, 'missing-config');
  assert.equal(r.body.isStale, false);
  assert.deepEqual([r.body.response, r.body.finished, r.body.hold, r.body.scheduled].map(Array.isArray), [true, true, true, true]);
});

test('/api/scorers missing config exposes no invented player leaders', async () => {
  const r = await call(scorersHandler, { FOOTBALL_DATA_KEY: null });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.configured, false);
  assert.equal(r.body.sourceStatus, 'missing-config');
  assert.equal(r.body.isStale, false);
  assert.deepEqual(r.body.goals, []);
  assert.deepEqual(r.body.assists, []);
});
