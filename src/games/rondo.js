// United 2026 — Rondo pure game engine.
// The possession carousel: keep the ball alive under a live press. Every
// entity moves on a fixed deterministic tick; the only input is a pass
// command (tap a teammate / press its number). No result is ever forced,
// no side gets a hidden boost, and the full run replays from seed + the
// tick-stamped pass log, so a future server validator can settle ranked
// play authoritatively. Ranked submission stays disabled until then.

import { createSeededRng, hashSeed } from '../core/soccer-engine.js';

export const RONDO_VERSION = 'rondo-v1';

export const RONDO_RULES = Object.freeze({
  tickMs: 100,            // one logic tick = 100ms of game time
  lives: 3,               // challenge run ends on the third turnover
  teammates: 6,           // discs on the carousel, numbered 1..6
  passSpeed: 5.6,         // field units per tick — always faster than any presser
  maxDefenderSpeed: 2.6,  // hard cap: pressers can never outrun the ball
  interceptRadius: 4.4,   // a presser this close to the travelling ball cuts it
  tackleRadius: 5.2,      // a presser this close to the carrier starts the tackle count
  tackleTicks: 3,         // full ticks in range before a tackle lands (reaction window)
  oneTouchTicks: 8,       // release within 0.8s of receiving = one-touch
  passesPerWave: 8,       // completed passes to step the press up
  maxWave: 6,             // pressure stops escalating here — mastery is score, not survival cliff
  ranked: false,          // fail-closed until signed server challenges exist
});

/* Presser parameters per wave. Speed and count rise, but the reaction
   window (tackleTicks) and the ball's speed advantage never shrink:
   difficulty is more pressure and less space, never worse input. */
export function waveProfile(wave) {
  const w = Math.max(1, Math.min(RONDO_RULES.maxWave, Math.floor(wave) || 1));
  return Object.freeze({
    wave: w,
    defenders: Math.min(4, 1 + Math.ceil(w / 2)),           // 2,2,3,3,4,4
    speed: Math.min(RONDO_RULES.maxDefenderSpeed, 1.55 + w * 0.17),
    ringRadius: Math.max(30, 40 - w * 1.5),                 // the circle tightens
    retargetTicks: Math.max(8, 14 - w),                     // pressers re-read quicker
  });
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, Number(n) || 0)); }
function fixed(n) { return Math.round(n * 100) / 100; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

/** Distance from point p to segment a→b. */
function segmentDistance(p, a, b) {
  const abx = b.x - a.x; const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return dist(p, a);
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / len2, 0, 1);
  return dist(p, { x: a.x + abx * t, y: a.y + aby * t });
}

/** Teammate ring for a wave — deterministic from seed, always min-spaced. */
export function ringPositions(seed, wave) {
  const profile = waveProfile(wave);
  const rng = createSeededRng(hashSeed(`${seed}:ring:${profile.wave}`) || 1);
  const baseAngle = rng() * Math.PI * 2;
  const positions = [];
  for (let i = 0; i < RONDO_RULES.teammates; i++) {
    const angle = baseAngle + (i / RONDO_RULES.teammates) * Math.PI * 2 + (rng() - 0.5) * 0.22;
    positions.push({
      x: fixed(clamp(50 + Math.cos(angle) * profile.ringRadius, 8, 92)),
      y: fixed(clamp(50 + Math.sin(angle) * profile.ringRadius, 10, 90)),
    });
  }
  return positions;
}

function spawnDefenders(run, count) {
  const rng = run.rngSpawn;
  while (run.defenders.length < count) {
    const i = run.defenders.length;
    run.defenders.push({
      id: i + 1,
      x: fixed(50 + (rng() - 0.5) * 16),
      y: fixed(50 + (rng() - 0.5) * 16),
      targetKind: 'carrier',   // 'carrier' | 'lane'
      laneTo: 0,
      retargetAt: run.tick + 2,
      closeTicks: 0,
    });
  }
}

export function createRondo(seed, mode = 'challenge') {
  const s = (Number(seed) || hashSeed(`rondo:${mode}`)) >>> 0 || 1;
  const run = {
    version: RONDO_VERSION,
    seed: s,
    mode: mode === 'practice' ? 'practice' : 'challenge',
    tick: 0,
    wave: 1,
    positions: ringPositions(s, 1),
    carrier: 0,
    receivedAt: 0,
    defenders: [],
    rngAi: createSeededRng(hashSeed(`${s}:ai`) || 1),
    rngSpawn: createSeededRng(hashSeed(`${s}:spawn`) || 2),
    ball: null,               // { from, to, x, y, progress } while travelling
    passes: 0,
    score: 0,
    chain: 0,
    bestChain: 0,
    splits: 0,
    switches: 0,
    turnovers: 0,
    lives: RONDO_RULES.lives,
    events: [],               // tick-stamped pass commands, for replay validation
    log: [],                  // human feed (latest first, capped)
    lastOutcome: null,        // teach-back for the most recent resolution
    paused: false,
    over: false,
    endedBy: null,            // 'turnovers' | 'exit'
  };
  spawnDefenders(run, waveProfile(1).defenders);
  return run;
}

function pushLog(run, text) {
  run.log.unshift(text);
  if (run.log.length > 6) run.log.length = 6;
}

/** Openness of the lane carrier→teammate right now: the smallest margin any
    presser has on the travelling ball, in field units. Visible to the player
    (practice hints) and used verbatim for teach-back — never a hidden roll. */
export function laneOpenness(run, to) {
  if (to === run.carrier || to < 0 || to >= run.positions.length) return -1;
  const from = run.positions[run.carrier];
  const target = run.positions[to];
  let margin = Infinity;
  for (const d of run.defenders) {
    // margin = current distance to the lane minus how far the presser can
    // close while the ball is in flight (worst case, straight at the lane)
    const flightTicks = dist(from, target) / RONDO_RULES.passSpeed;
    const reach = segmentDistance(d, from, target) - waveProfile(run.wave).speed * flightTicks;
    margin = Math.min(margin, reach);
  }
  return fixed(margin === Infinity ? 99 : margin);
}

/** The safest open teammate at this instant — the honest teaching answer. */
export function bestOpenLane(run) {
  let best = -1; let bestMargin = -Infinity;
  for (let i = 0; i < run.positions.length; i++) {
    if (i === run.carrier) continue;
    const margin = laneOpenness(run, i);
    if (margin > bestMargin) { bestMargin = margin; best = i; }
  }
  return { teammate: best, margin: fixed(bestMargin) };
}

function turnover(run, cause) {
  run.turnovers += 1;
  run.chain = 0;
  run.lastOutcome = cause;
  if (run.mode === 'challenge') {
    run.lives = Math.max(0, RONDO_RULES.lives - run.turnovers);
    if (run.turnovers >= RONDO_RULES.lives) {
      run.over = true;
      run.endedBy = 'turnovers';
    }
  }
  // possession resets: ball returns to the teammate furthest from any presser
  const open = bestOpenLane(run);
  run.carrier = open.teammate >= 0 ? open.teammate : 0;
  run.receivedAt = run.tick;
  run.ball = null;
  for (const d of run.defenders) d.closeTicks = 0;
}

function completePass(run) {
  const ball = run.ball;
  const from = run.positions[ball.from];
  const to = run.positions[ball.to];
  const distance = dist(from, to);
  const oneTouch = ball.launchedWithin <= RONDO_RULES.oneTouchTicks;
  const split = ball.launchMargin < 7;      // threaded past a live presser
  const switchBall = distance > 55;          // the long diagonal
  let points = 10 + Math.ceil(distance / 12);
  if (oneTouch) {
    run.chain += 1;
    points += 8 + Math.min(10, run.chain) * 4;
  } else {
    run.chain = 0;
  }
  if (split) { points += 25; run.splits += 1; }
  if (switchBall) { points += 12; run.switches += 1; }
  run.bestChain = Math.max(run.bestChain, run.chain);
  run.passes += 1;
  run.score += points;
  run.carrier = ball.to;
  run.receivedAt = run.tick;
  run.ball = null;
  run.lastOutcome = {
    kind: 'pass', points, oneTouch, split, switch: switchBall, chain: run.chain, to: ball.to,
  };
  // wave step-up: more press, less space — announced, never silent
  const nextWave = Math.min(RONDO_RULES.maxWave, 1 + Math.floor(run.passes / RONDO_RULES.passesPerWave));
  if (nextWave > run.wave) {
    run.wave = nextWave;
    run.positions = ringPositions(run.seed, nextWave);
    spawnDefenders(run, waveProfile(nextWave).defenders);
    pushLog(run, `Wave ${nextWave} — the press steps up.`);
  }
}

function moveDefenders(run) {
  const profile = waveProfile(run.wave);
  const carrierPos = run.positions[run.carrier];
  let nearest = null; let nearestDist = Infinity;
  for (const d of run.defenders) {
    const dd = dist(d, carrierPos);
    if (dd < nearestDist) { nearestDist = dd; nearest = d; }
  }
  for (const d of run.defenders) {
    if (run.tick >= d.retargetAt) {
      d.retargetAt = run.tick + profile.retargetTicks;
      if (d === nearest) {
        d.targetKind = 'carrier';
      } else {
        // shadow a lane: lean toward the carrier's most-used outlets
        d.targetKind = run.rngAi() < 0.72 ? 'lane' : 'carrier';
        d.laneTo = Math.floor(run.rngAi() * run.positions.length);
        if (d.laneTo === run.carrier) d.laneTo = (d.laneTo + 1) % run.positions.length;
      }
    }
    let goal;
    if (d.targetKind === 'carrier') {
      goal = carrierPos;
    } else {
      const lane = run.positions[d.laneTo] || carrierPos;
      goal = { x: (carrierPos.x + lane.x) / 2, y: (carrierPos.y + lane.y) / 2 };
    }
    const dd = dist(d, goal);
    if (dd > 0.5) {
      const step = Math.min(profile.speed, dd);
      d.x = fixed(clamp(d.x + ((goal.x - d.x) / dd) * step, 6, 94));
      d.y = fixed(clamp(d.y + ((goal.y - d.y) / dd) * step, 8, 92));
    }
  }
}

/** Advance exactly one logic tick. Deterministic: same seed + same
    tick-stamped pass commands ⇒ identical state, always. */
export function rondoTick(run) {
  if (!run || run.over || run.paused) return run;
  run.tick += 1;
  moveDefenders(run);

  if (run.ball) {
    // ball in flight: advance, then check the cut
    const ball = run.ball;
    const from = run.positions[ball.from];
    const to = run.positions[ball.to];
    const total = Math.max(0.001, dist(from, to));
    ball.progress = Math.min(1, ball.progress + RONDO_RULES.passSpeed / total);
    ball.x = fixed(from.x + (to.x - from.x) * ball.progress);
    ball.y = fixed(from.y + (to.y - from.y) * ball.progress);
    for (const d of run.defenders) {
      if (dist(d, ball) <= RONDO_RULES.interceptRadius) {
        const open = ball.openAtLaunch;
        turnover(run, {
          kind: 'cut', by: d.id, at: { x: ball.x, y: ball.y }, to: ball.to,
          openTeammate: open.teammate, openMargin: open.margin,
        });
        pushLog(run, `Cut out by presser ${d.id} — the lane closed in flight.`);
        return run;
      }
    }
    if (ball.progress >= 1) {
      completePass(run);
      const o = run.lastOutcome;
      pushLog(run, `${o.split ? 'Split pass!' : o.switch ? 'Big switch.' : 'Kept alive.'} +${o.points}${o.chain > 1 ? ` · chain ×${o.chain}` : ''}`);
    }
    return run;
  }

  // ball at feet: pressers close on the carrier
  const carrierPos = run.positions[run.carrier];
  for (const d of run.defenders) {
    if (dist(d, carrierPos) <= RONDO_RULES.tackleRadius) {
      d.closeTicks += 1;
      if (d.closeTicks >= RONDO_RULES.tackleTicks) {
        const open = bestOpenLane(run);
        turnover(run, {
          kind: 'tackled', by: d.id, heldTicks: run.tick - run.receivedAt,
          openTeammate: open.teammate, openMargin: open.margin,
        });
        pushLog(run, `Tackled — the ball stayed too long.`);
        return run;
      }
    } else {
      d.closeTicks = 0;
    }
  }
  return run;
}

/** The one input: send the ball to teammate index `to`. Ignored while the
    ball is travelling, while paused, or when the run is over — a tap is
    never silently converted into something else. */
export function rondoPass(run, to) {
  if (!run || run.over || run.paused || run.ball) return null;
  const target = Math.floor(Number(to));
  if (!(target >= 0 && target < run.positions.length) || target === run.carrier) return null;
  const openAtLaunch = bestOpenLane(run);
  const margin = laneOpenness(run, target);
  run.ball = {
    from: run.carrier,
    to: target,
    x: run.positions[run.carrier].x,
    y: run.positions[run.carrier].y,
    progress: 0,
    launchedWithin: run.tick - run.receivedAt,
    launchMargin: margin,
    openAtLaunch,
  };
  for (const d of run.defenders) d.closeTicks = 0;
  const event = { tick: run.tick, to: target };
  run.events.push(event);
  return event;
}

export function togglePauseRondo(run) {
  if (!run || run.over) return run;
  run.paused = !run.paused;
  return run;
}

export function endRondoRun(run, reason = 'exit') {
  if (!run || run.over) return run;
  run.over = true;
  run.endedBy = reason;
  return run;
}

/** Everything the renderer needs for one frame — no hidden extras. */
export function rondoFrame(run) {
  const profile = waveProfile(run.wave);
  const carrierPos = run.positions[run.carrier];
  let pressure = 0;
  for (const d of run.defenders) {
    const dd = dist(d, carrierPos);
    pressure = Math.max(pressure, clamp(1 - (dd - RONDO_RULES.tackleRadius) / 24, 0, 1));
  }
  return {
    tick: run.tick,
    wave: run.wave,
    profile,
    positions: run.positions,
    carrier: run.carrier,
    ball: run.ball ? { x: run.ball.x, y: run.ball.y, to: run.ball.to } : null,
    defenders: run.defenders.map((d) => ({
      id: d.id, x: d.x, y: d.y, closing: d.closeTicks > 0,
    })),
    pressure: fixed(pressure),
    holdTicks: run.ball ? 0 : run.tick - run.receivedAt,
    oneTouchOpen: !run.ball && (run.tick - run.receivedAt) <= RONDO_RULES.oneTouchTicks,
  };
}

export function rondoSummary(run) {
  const score = Math.max(0, Math.round(run?.score || 0));
  const grade = score >= 900 ? 'Carousel master'
    : score >= 600 ? 'Tempo dictator'
      : score >= 380 ? 'Press resistant'
        : score >= 180 ? 'Finding rhythm'
          : 'First touches';
  return {
    score,
    passes: run?.passes || 0,
    bestChain: run?.bestChain || 0,
    splits: run?.splits || 0,
    switches: run?.switches || 0,
    wave: run?.wave || 1,
    turnovers: run?.turnovers || 0,
    grade,
    endedBy: run?.endedBy || null,
  };
}

/** Fold a finished run into the local record. Day-scoped bests plus all-time
    bests; every number derives from runs that actually happened. */
export function rondoRecordAfter(previous, run, dateKey) {
  const s = rondoSummary(run);
  const prev = previous || {};
  const sameDay = prev.dateKey === dateKey;
  const challenge = run?.mode === 'challenge';
  return {
    dateKey,
    played: (prev.played || 0) + 1,
    attemptsToday: (sameDay ? prev.attemptsToday || 0 : 0) + (challenge ? 1 : 0),
    bestToday: challenge ? Math.max(sameDay ? prev.bestToday || 0 : 0, s.score) : (sameDay ? prev.bestToday || 0 : 0),
    bestScore: challenge ? Math.max(prev.bestScore || 0, s.score) : (prev.bestScore || 0),
    bestPractice: !challenge ? Math.max(prev.bestPractice || 0, s.score) : (prev.bestPractice || 0),
    bestChain: Math.max(prev.bestChain || 0, s.bestChain),
    bestWave: Math.max(prev.bestWave || 0, challenge ? s.wave : 0),
    last: { mode: run.mode, seed: run.seed, score: s.score, passes: s.passes, wave: s.wave, grade: s.grade },
  };
}

export function rondoEventLog(run) {
  return {
    gameVersion: RONDO_VERSION,
    ruleVersion: RONDO_VERSION,
    seed: run.seed,
    mode: run.mode,
    finalTick: run.tick,
    events: run.events.map((e) => ({ tick: e.tick, to: e.to })),
    score: run.score,
  };
}

/** Pure replay validator suitable for a server route. Rejects version, seed,
    ordering, timing and score tampering. Not exposed as a ranked submit
    button until the server owns signed challenges (RONDO_RULES.ranked). */
export function validateRondoLog(log) {
  if (!log || log.gameVersion !== RONDO_VERSION || log.ruleVersion !== RONDO_VERSION) return { ok: false, reason: 'version' };
  if (!Number.isInteger(log.seed) || log.seed <= 0 || !Array.isArray(log.events)) return { ok: false, reason: 'challenge' };
  if (!Number.isInteger(log.finalTick) || log.finalTick < 0 || log.finalTick > 90_000) return { ok: false, reason: 'timing' };
  const replay = createRondo(log.seed, log.mode);
  let cursor = 0;
  let lastTick = -1;
  for (const e of log.events) {
    if (!Number.isInteger(e.tick) || e.tick < lastTick || e.tick > log.finalTick) return { ok: false, reason: 'timing' };
    while (cursor < e.tick && !replay.over) { rondoTick(replay); cursor += 1; }
    if (replay.over) break;
    lastTick = e.tick;
    if (!rondoPass(replay, e.to)) return { ok: false, reason: 'event' };
  }
  while (cursor < log.finalTick && !replay.over) { rondoTick(replay); cursor += 1; }
  if (replay.score !== log.score) return { ok: false, reason: 'score', expected: replay.score };
  return { ok: true, score: replay.score, summary: rondoSummary(replay) };
}
