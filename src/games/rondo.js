// United 2026 — Rondo pure game engine.
// The possession carousel: keep the ball alive under a live press. Every
// entity moves on a fixed deterministic tick; the only input is a pass
// command (tap a teammate / press its number). No result is ever forced,
// no side gets a hidden boost, and the full run replays from seed + the
// tick-stamped pass log, so a future server validator can settle ranked
// play authoritatively. Ranked submission stays disabled until then.

import { createSeededRng, hashSeed } from '../core/soccer-engine.js';

// v4 gives the defense deterministic pass-habit memory. Old event logs
// stay deliberately invalid rather than silently replaying under new AI.
export const RONDO_VERSION = 'rondo-v4';

export const RONDO_RULES = Object.freeze({
  tickMs: 100,            // one logic tick = 100ms of game time
  lives: 3,               // challenge run ends on the third turnover
  teammates: 6,           // discs on the carousel, numbered 1..6
  passSpeed: 4.8,         // field units per tick — still nearly 2× the fastest presser
  maxDefenderSpeed: 2.6,  // hard cap: pressers can never outrun the ball
  interceptRadius: 5.4,   // an honest, visible ball-lane reach — never a hidden roll
  tackleRadius: 5.2,      // a presser this close to the carrier starts the tackle count
  tackleTicks: 8,         // 0.8s of continuous contact before a tackle lands
  oneTouchTicks: 8,       // release within 0.8s of receiving = one-touch
  passesPerWave: 5,       // pressure arrives before a long warm-up can form
  maxWave: 10,            // 50 passes is the last, survival-level band
  ranked: false,          // fail-closed until signed server challenges exist
});

/* Presser parameters per wave. Speed and count rise, but the reaction
   window (tackleTicks) and the ball's speed advantage never shrink:
   difficulty is more pressure and less space, never worse input. The unit
   caps at six pressers — intelligence, not bodies, carries the late game. */
export function waveProfile(wave) {
  const w = Math.max(1, Math.min(RONDO_RULES.maxWave, Math.floor(wave) || 1));
  const defenders = [3, 4, 4, 5, 5, 5, 6, 6, 6, 6][w - 1];
  return Object.freeze({
    wave: w,
    defenders,
    speed: Math.min(RONDO_RULES.maxDefenderSpeed, 2.0 + w * 0.08),
    ringRadius: Math.max(20, 36 - w * 1.6),                 // useful space tightens gradually
    retargetTicks: Math.max(3, 6 - Math.floor(w / 3)),      // roles read the next picture sooner
    trapTicks: Math.max(5, 8 - Math.floor(w / 3)),          // a trap always shows for ≥5 ticks
  });
}

export const RONDO_DEFENDER_ROLES = Object.freeze(['chaser', 'lane-cutter', 'shadow', 'trap', 'late-pressure']);
const DEFENDER_ROLES = Object.freeze(['chaser', 'lane-cutter', 'shadow', 'trap', 'late-pressure', 'lane-cutter']);

function profileFor(run) {
  const base = waveProfile(run.wave);
  if (run.mode !== 'practice') return base;
  // Practice keeps the same readable football problems, but leaves more room
  // and never adds the late chaos role. Nothing about input becomes easier.
  return Object.freeze({
    ...base,
    defenders: Math.min(3, base.defenders),
    speed: fixed(Math.max(1.35, base.speed - 0.28)),
    ringRadius: base.ringRadius + 3,
    retargetTicks: base.retargetTicks + 2,
    trapTicks: base.trapTicks + 3,
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
  // A teammate keeps the same angular identity for the whole run. Waves only
  // tighten the circle; they never teleport all six outlets to new places.
  const rng = createSeededRng(hashSeed(`${seed}:ring`) || 1);
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
    let x = 50; let y = 50; let attempts = 0;
    do {
      x = fixed(50 + (rng() - 0.5) * 30);
      y = fixed(50 + (rng() - 0.5) * 30);
      attempts += 1;
    } while (attempts < 40 && run.defenders.some((d) => dist(d, { x, y }) < 11));
    run.defenders.push({
      id: i + 1,
      role: DEFENDER_ROLES[i],
      x,
      y,
      targetKind: 'carrier',
      laneTo: 0,
      targetTo: 0,
      trapPhase: 'show',
      trapAt: run.tick + 8,
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
    queuedTo: null,           // one visible next-pass command while ball travels
    started: false,           // the press begins with the player's first touch
    history: [],              // recent completed passes — the defense's memory
    habit: null,              // deterministic read of that memory (see readHabits)
    readAnnounced: false,     // the "press is reading you" line fires once
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
  spawnDefenders(run, profileFor(run).defenders);
  return run;
}

function pushLog(run, text) {
  run.log.unshift(text);
  if (run.log.length > 6) run.log.length = 6;
}

/* ---- pass-habit memory ----------------------------------------------- */

const HABIT_WINDOW = 8;   // completed passes the defense can remember
const HABIT_RECENT = 6;   // window for receiver-favoritism and variety

/** Deterministic read of the recent pass log. Pure bookkeeping — no dice. */
function readHabits(run) {
  const h = run.history;
  const recent = h.slice(-HABIT_RECENT);
  const counts = new Map();
  for (const p of recent) counts.set(p.to, (counts.get(p.to) || 0) + 1);
  let favorite = -1; let favCount = 0;
  for (const [to, c] of counts) if (c > favCount) { favorite = to; favCount = c; }
  let returns = 0; // A→B→A give-and-gos anywhere in memory
  for (let i = 1; i < h.length; i++) if (h[i].to === h[i - 1].from) returns += 1;
  let safeStreak = 0; // consecutive picks of the visibly safest lane
  for (let i = h.length - 1; i >= 0 && h[i].safest; i--) safeStreak += 1;
  let shortStreak = 0; // consecutive short-side balls
  for (let i = h.length - 1; i >= 0 && h[i].short; i--) shortStreak += 1;
  return Object.freeze({
    favorite: favCount >= 3 ? favorite : -1,
    favCount,
    returnTo: h.length ? h[h.length - 1].from : -1,
    returns,
    safeStreak,
    shortStreak,
    variety: counts.size,
    varied: recent.length >= 4 && counts.size >= 4,
  });
}

/** What the defense is currently allowed to key on. Null while the opening
    passes stay readable, and always null in practice — practice teaches
    lanes, it never hunts habits. Exposed so the UI and tests share one
    truth about when adaptation is live. */
export function defenseReads(run) {
  if (!run || run.mode !== 'challenge') return null;
  if (run.passes < 3 || !run.habit) return null; // adaptation begins with pass 4
  return run.habit;
}

/** Openness of the lane carrier→teammate right now: the smallest margin any
    presser has on the travelling ball, in field units. Visible to the player
    (practice hints) and used verbatim for teach-back — never a hidden roll. */
export function laneOpenness(run, to, fromIndex = run.carrier) {
  if (to === fromIndex || to < 0 || to >= run.positions.length) return -1;
  const from = run.positions[fromIndex];
  const target = run.positions[to];
  let margin = Infinity;
  for (const d of run.defenders) {
    // margin = current distance to the lane minus how far the presser can
    // close while the ball is in flight (worst case, straight at the lane)
    const flightTicks = dist(from, target) / RONDO_RULES.passSpeed;
    const reach = segmentDistance(d, from, target) - profileFor(run).speed * flightTicks;
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
  // Possession ends here, so any buffered next pass dies with it: a tap made
  // during the old possession must never fire against the new one.
  run.queuedTo = null;
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
  // the defense remembers what just happened — and only what just happened
  run.history.push({
    from: ball.from,
    to: ball.to,
    safest: ball.openAtLaunch.teammate === ball.to,
    short: distance < 40,
  });
  if (run.history.length > HABIT_WINDOW) run.history.shift();
  run.habit = readHabits(run);
  // a genuine switch forces the whole unit to re-read the picture: stale
  // goals persist for a few extra ticks, which is the player's real opening
  if (switchBall) {
    const recover = profileFor(run).retargetTicks + 3;
    for (const d of run.defenders) d.retargetAt = Math.max(d.retargetAt, run.tick + recover);
  }
  const reads = defenseReads(run);
  if (!run.readAnnounced && reads && (reads.favorite >= 0 || reads.returns >= 2 || reads.safeStreak >= 3)) {
    run.readAnnounced = true;
    pushLog(run, 'The press is reading your pattern — switch it up.');
  }
  // wave step-up: more press, less space — announced, never silent
  const nextWave = Math.min(RONDO_RULES.maxWave, 1 + Math.floor(run.passes / RONDO_RULES.passesPerWave));
  if (nextWave > run.wave) {
    run.wave = nextWave;
    run.positions = ringPositions(run.seed, nextWave);
    spawnDefenders(run, profileFor(run).defenders);
    pushLog(run, `Wave ${nextWave} — the press steps up.`);
  }
  // A tap made during flight becomes the next one-touch pass. This keeps
  // quick players in rhythm and makes every accepted touch visibly matter.
  const queued = run.queuedTo;
  run.queuedTo = null;
  if (Number.isInteger(queued) && queued !== run.carrier) launchPass(run, queued, false);
}

function pointOnLane(from, to, amount) {
  return { x: from.x + (to.x - from.x) * amount, y: from.y + (to.y - from.y) * amount };
}

/* Where the defense reads from: the carrier — or, once a travelling ball has
   committed to its line, the teammate about to receive it. Pressers shift
   during flight like a real unit instead of marking a picture that is
   already gone, but they need to see the pass before they can react. */
function pressFocus(run) {
  return run.ball && run.ball.progress >= 0.45 ? run.ball.to : run.carrier;
}

function rankedLanes(run, focus = pressFocus(run)) {
  const lanes = [];
  for (let i = 0; i < run.positions.length; i++) {
    if (i !== focus) lanes.push({ teammate: i, margin: laneOpenness(run, i, focus), distance: dist(run.positions[focus], run.positions[i]) });
  }
  return lanes.sort((a, b) => b.margin - a.margin || b.distance - a.distance || a.teammate - b.teammate);
}

/* Role targeting. Before pass 4 (and always in practice) every read is the
   honest geometric one. From pass 4 in challenge, roles start keying on the
   player's own recent habits — repetition earns anticipation, and a varied
   player faces only the geometry. No dice decide an outcome; the seeded
   rngAi only varies which honest lane a role stands on. */
function chooseRoleTarget(run, d, lanes, focus) {
  const safest = lanes[0] || { teammate: (focus + 1) % run.positions.length };
  const nextSafest = lanes[1] || safest;
  const thirdSafest = lanes[2] || nextSafest;
  const reads = defenseReads(run);
  const habit = reads && !reads.varied ? reads : null; // variety switches the hunt off
  if (d.role === 'chaser') return { kind: 'carrier', to: focus };
  if (d.role === 'lane-cutter') {
    if (d.id > 2) return { kind: 'lane', to: nextSafest.teammate }; // second cutter stays geometric
    // the first cutter steps onto the lane the player keeps leaning on
    if (habit && habit.favorite >= 0 && habit.favorite !== focus) return { kind: 'lane', to: habit.favorite };
    return { kind: 'lane', to: safest.teammate };
  }
  if (d.role === 'shadow') {
    // the shadow denies the outlet the player keeps choosing…
    if (habit && habit.favorite >= 0 && habit.favorite !== focus) return { kind: 'shadow', to: habit.favorite };
    // …and a player who always takes the freebie loses the freebie: the
    // shadow doubles the safest lane the cutter is already stepping onto
    if (habit && habit.safeStreak >= 3) return { kind: 'shadow', to: safest.teammate };
    return { kind: 'shadow', to: nextSafest.teammate };
  }
  if (d.role === 'trap') {
    // an established give-and-go makes the return ball the obvious target —
    // still behind a visible ≥5-tick wind-up before the trap may close
    if (habit && habit.returns >= 2 && habit.returnTo >= 0 && habit.returnTo !== focus) {
      return { kind: 'trap', to: habit.returnTo };
    }
    const choice = (run.rngAi() < 0.62 ? thirdSafest : nextSafest).teammate;
    return { kind: 'trap', to: choice };
  }
  // Late pressure: a second closing angle. Against a short-side habit it
  // squeezes the nearest outlet instead of a ranked lane.
  if (habit && habit.shortStreak >= 3) {
    let nearest = safest; let best = Infinity;
    for (const lane of lanes) if (lane.distance < best) { best = lane.distance; nearest = lane; }
    return { kind: 'late', to: nearest.teammate };
  }
  const to = (run.rngAi() < 0.55 ? nextSafest : thirdSafest).teammate;
  return { kind: 'late', to };
}

function roleGoal(run, d) {
  const carrier = run.positions[pressFocus(run)];
  const receiver = run.positions[d.targetTo] || carrier;
  if (d.role === 'chaser') return carrier;
  if (d.role === 'lane-cutter') {
    // coordination: while the chaser is pressing the carrier, the cutter
    // tightens toward the exit instead of chasing the same ball
    const chaser = run.defenders[0];
    const pressing = chaser && chaser.role === 'chaser' && dist(chaser, carrier) < RONDO_RULES.tackleRadius * 2;
    return pointOnLane(carrier, receiver, pressing ? 0.42 : 0.5);
  }
  if (d.role === 'shadow') return pointOnLane(carrier, receiver, 0.78);
  if (d.role === 'trap') {
    if (d.trapPhase === 'snap') return pointOnLane(carrier, receiver, 0.5);
    // the wind-up is honest: while showing, the trap stands visibly OFF the
    // lane it intends to jump, one step to the side of the receiver
    const p = pointOnLane(carrier, receiver, 0.86);
    const dx = receiver.x - carrier.x; const dy = receiver.y - carrier.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x - (dy / len) * 6, y: p.y + (dx / len) * 6 };
  }
  return pointOnLane(carrier, receiver, 0.32);
}

function moveDefenders(run) {
  const profile = profileFor(run);
  const focus = pressFocus(run);
  const lanes = rankedLanes(run, focus);
  for (const d of run.defenders) {
    if (d.role === 'trap' && d.trapPhase === 'show' && run.tick >= d.trapAt) {
      d.trapPhase = 'snap';
      d.retargetAt = run.tick; // readable tell has elapsed; now it closes normally
    }
    if (run.tick >= d.retargetAt) {
      d.retargetAt = run.tick + profile.retargetTicks;
      if (d.role === 'trap' && d.trapPhase === 'snap') {
        d.trapPhase = 'show';
        d.trapAt = run.tick + profile.trapTicks;
      }
      const target = chooseRoleTarget(run, d, lanes, focus);
      d.targetKind = target.kind;
      d.targetTo = target.to;
      d.laneTo = target.to;
    }
    const goal = roleGoal(run, d);
    const dd = dist(d, goal);
    if (dd > 0.5) {
      const roleStep = d.role === 'late-pressure' ? profile.speed * 0.96 : profile.speed;
      const step = Math.min(roleStep, dd);
      d.x = fixed(clamp(d.x + ((goal.x - d.x) / dd) * step, 6, 94));
      d.y = fixed(clamp(d.y + ((goal.y - d.y) / dd) * step, 8, 92));
    }
  }
}

function interceptionCause(ball, d) {
  if (d.role === 'trap' && d.trapPhase === 'snap' && d.targetTo === ball.to) return 'trap-triggered';
  if (d.role === 'lane-cutter' && d.targetTo === ball.to) return 'lane-cutter-stepped-across';
  if (d.role === 'shadow' && d.targetTo === ball.to) return 'shadow-removed-safe-outlet';
  if (ball.launchMargin <= RONDO_RULES.interceptRadius) return 'lane-already-closed';
  return 'risky-pass-intercepted';
}

/** Advance exactly one logic tick. Deterministic: same seed + same
    tick-stamped pass commands ⇒ identical state, always. */
export function rondoTick(run) {
  if (!run || run.over || run.paused) return run;
  if (!run.started) return run;
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
      // a trap can only close after its visible wind-up has snapped — while
      // it is still showing, the ball passes it untouched, by rule
      if (d.role === 'trap' && d.trapPhase !== 'snap') continue;
      if (dist(d, ball) <= RONDO_RULES.interceptRadius) {
        const open = ball.openAtLaunch;
        const cause = interceptionCause(ball, d);
        turnover(run, {
          kind: 'cut', by: d.id, at: { x: ball.x, y: ball.y }, to: ball.to,
          role: d.role, cause, openTeammate: open.teammate, openMargin: open.margin,
        });
        pushLog(run, `Cut out by ${d.role} — ${cause.replaceAll('-', ' ')}.`);
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
          role: d.role, cause: 'held-too-long', openTeammate: open.teammate, openMargin: open.margin,
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

/** Send the ball to teammate index `to`. A legal tap during flight becomes
    the visible next-pass buffer; paused, ended, self and invalid inputs are
    rejected without changing the run. */
function launchPass(run, target, record = true) {
  const openAtLaunch = bestOpenLane(run);
  const margin = laneOpenness(run, target);
  run.started = true;
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
  if (!record) return { tick: run.tick, to: target, buffered: true };
  const event = { tick: run.tick, to: target };
  run.events.push(event);
  return event;
}

export function rondoPass(run, to) {
  if (!run || run.over || run.paused) return null;
  const target = Math.floor(Number(to));
  if (!(target >= 0 && target < run.positions.length)) return null;
  if (run.ball) {
    if (target === run.ball.to) return null;
    run.queuedTo = target;
    const event = { tick: run.tick, to: target };
    run.events.push(event);
    return event;
  }
  if (target === run.carrier) return null;
  return launchPass(run, target);
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
  run.queuedTo = null; // a finished run can never owe a pass
  return run;
}

/** Everything the renderer needs for one frame — no hidden extras. */
export function rondoFrame(run) {
  const profile = profileFor(run);
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
    queuedTo: run.queuedTo,
    started: run.started,
    defenders: run.defenders.map((d) => ({
      id: d.id, role: d.role, targetTo: d.targetTo, trapPhase: d.trapPhase,
      x: d.x, y: d.y, closing: d.closeTicks > 0,
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
    if (replay.over) return { ok: false, reason: 'event' };
    lastTick = e.tick;
    if (!rondoPass(replay, e.to)) return { ok: false, reason: 'event' };
  }
  while (cursor < log.finalTick && !replay.over) { rondoTick(replay); cursor += 1; }
  if (cursor !== log.finalTick) return { ok: false, reason: 'timing' };
  if (replay.score !== log.score) return { ok: false, reason: 'score', expected: replay.score };
  return { ok: true, score: replay.score, summary: rondoSummary(replay) };
}
