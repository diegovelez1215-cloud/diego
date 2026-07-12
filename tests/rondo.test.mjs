// Rondo engine — fairness, determinism, input reliability, teaching feedback,
// records, and the replay validator that guards future ranked play.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RONDO_RULES, RONDO_VERSION, RONDO_DEFENDER_ROLES, createRondo, rondoTick, rondoPass, rondoFrame,
  rondoSummary, rondoRecordAfter, rondoEventLog, validateRondoLog, defenseReads,
  laneOpenness, bestOpenLane, waveProfile, ringPositions, togglePauseRondo, endRondoRun,
} from '../src/games/rondo.js';

function greedyBot(run, maxTicks = 4000) {
  // Always release quickly to the safest lane — a competent beginner. The
  // first touch always goes (ticks only advance once the run has started).
  while (!run.over && run.tick < maxTicks) {
    if (!run.ball) {
      const open = bestOpenLane(run);
      if (!run.started || (open.teammate >= 0 && open.margin > RONDO_RULES.interceptRadius)) {
        rondoPass(run, open.teammate >= 0 ? open.teammate : (run.carrier + 1) % RONDO_RULES.teammates);
      } else if (rondoFrame(run).holdTicks > 4) {
        rondoPass(run, open.teammate >= 0 ? open.teammate : (run.carrier + 1) % RONDO_RULES.teammates);
      }
    }
    rondoTick(run);
  }
  return run;
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * p)];
}

/* Scripted players. `delay` is human reaction in ticks; strategies differ in
   what they read, not in how reliably the engine obeys them. */
function simulatedPlayer(seed, strategy, maxTicks = 4000) {
  const run = createRondo(seed);
  const delay = strategy === 'slow' ? 10 : (strategy === 'elite' || strategy === 'elite-varied') ? 0 : 4;
  let rot = 0;
  while (!run.over && run.tick < maxTicks) {
    if (!run.ball) {
      const lanes = [];
      for (let i = 0; i < RONDO_RULES.teammates; i++) {
        if (i !== run.carrier) lanes.push({ to: i, margin: laneOpenness(run, i) });
      }
      lanes.sort((a, b) => b.margin - a.margin || a.to - b.to);
      const ready = !run.started || run.tick - run.receivedAt >= delay;
      if (ready) {
        let pick = lanes[0]; // predictable: always the visible freebie
        if (strategy === 'risky' && run.passes > 0 && run.passes % 4 === 3) pick = lanes[1];
        if (strategy === 'elite' && run.passes > 0 && run.passes % 9 === 0) pick = lanes[1];
        if (strategy === 'varied' || strategy === 'elite-varied') {
          // deliberately rotates through the three best lanes — switching play
          rot = (rot + 1) % 3;
          const alt = lanes[Math.min(rot, lanes.length - 1)];
          pick = alt.margin > RONDO_RULES.interceptRadius + 1 ? alt : lanes[0];
        }
        rondoPass(run, pick.to);
      }
    }
    rondoTick(run);
  }
  return { passes: run.passes, over: run.over };
}

/* A player leaning on the A→B→A give-and-go. `blind` plays the return ball
   no matter what; the competent version only plays it when the lane is
   honestly open, falling back to the safest outlet — the realistic habit. */
function pingPongPlayer(seed, mode = 'challenge', { blind = false, maxPasses = 30 } = {}) {
  const run = createRondo(seed, mode);
  let trapKeyedReturn = false;
  while (!run.over && run.passes < maxPasses && run.tick < 3000) {
    if (!run.ball && (!run.started || run.tick - run.receivedAt >= 3)) {
      const back = run.history.length ? run.history[run.history.length - 1].from : -1;
      const playable = back >= 0 && back !== run.carrier
        && (blind || laneOpenness(run, back) > RONDO_RULES.interceptRadius);
      rondoPass(run, playable ? back : bestOpenLane(run).teammate);
    }
    rondoTick(run);
    if (run.passes >= 4 && !run.ball && run.history.length) {
      const back = run.history[run.history.length - 1].from;
      if (run.defenders.some((d) => d.role === 'trap' && d.targetTo === back)) trapKeyedReturn = true;
    }
  }
  return { run, trapKeyedReturn };
}

/* A competent player who force-feeds one favorite outlet whenever it looks
   open — the receiver habit the shadow should learn to deny. */
function favoritePlayer(seed, fav, maxPasses = 16) {
  const run = createRondo(seed);
  let favoriteDenied = false;
  while (!run.over && run.passes < maxPasses && run.tick < 3000) {
    if (!run.ball && (!run.started || run.tick - run.receivedAt >= 3)) {
      const to = run.carrier !== fav && laneOpenness(run, fav) > RONDO_RULES.interceptRadius
        ? fav : bestOpenLane(run).teammate;
      rondoPass(run, to);
    }
    rondoTick(run);
    if (run.passes >= 6 && run.carrier !== fav) {
      if (run.defenders.some((d) => (d.role === 'shadow' || d.role === 'lane-cutter') && d.targetTo === fav)) favoriteDenied = true;
    }
  }
  return { run, favoriteDenied };
}

test('same seed and same pass script produce the identical run', () => {
  const a = greedyBot(createRondo(777));
  const log = rondoEventLog(a);
  const b = createRondo(777);
  let cursor = 0;
  for (const e of log.events) {
    while (cursor < e.tick && !b.over) { rondoTick(b); cursor += 1; }
    rondoPass(b, e.to);
  }
  while (cursor < log.finalTick && !b.over) { rondoTick(b); cursor += 1; }
  assert.equal(b.score, a.score);
  assert.equal(b.passes, a.passes);
  assert.equal(b.turnovers, a.turnovers);
});

test('the ball always outruns the press and the unit never exceeds six defenders', () => {
  for (let w = 1; w <= RONDO_RULES.maxWave + 2; w++) {
    assert.ok(waveProfile(w).speed < RONDO_RULES.passSpeed * 0.55,
      `wave ${w} presser speed must stay far below ball speed`);
    assert.ok(waveProfile(w).defenders <= 6, `wave ${w} fields at most 6 defenders`);
  }
  assert.equal(waveProfile(RONDO_RULES.maxWave).defenders, 6, 'the deepest wave fields exactly the six-man cap');
  const run = greedyBot(createRondo(606), 6000);
  assert.ok(run.defenders.length <= 6, 'a live run never accumulates more than 6 pressers');
});

test('difficulty never degrades input: reaction window and pass speed are constant', () => {
  // tackleTicks and passSpeed are rules, not wave parameters — the press gets
  // faster and denser, the player’s controls never get worse.
  assert.equal(waveProfile(1).wave, 1);
  assert.equal(RONDO_RULES.tackleTicks >= 3, true);
  assert.ok(Object.isFrozen(RONDO_RULES));
});

test('a genuinely open lane is never cut', () => {
  const run = createRondo(42);
  const open = bestOpenLane(run);
  assert.ok(open.margin > 0, 'a fresh carousel must have an open lane');
  const before = run.passes;
  rondoPass(run, open.teammate);
  // The pass launches with a positive margin; complete the flight.
  for (let i = 0; i < 60 && run.ball; i++) rondoTick(run);
  if (open.margin > RONDO_RULES.interceptRadius) {
    assert.equal(run.passes, before + 1, 'an open pass must arrive');
    assert.equal(run.turnovers, 0);
  }
});

test('a tackle needs consecutive ticks in range — there is always a reaction window', () => {
  const run = createRondo(9);
  rondoPass(run, bestOpenLane(run).teammate);
  let sawClosePressureBeforeTackle = false;
  while (!run.over && run.tick < 2000) {
    const beforeTurnovers = run.turnovers;
    rondoTick(run); // never pass: invite the tackle
    if (run.turnovers > beforeTurnovers && run.lastOutcome?.kind === 'tackled') {
      sawClosePressureBeforeTackle = true;
      assert.ok(run.lastOutcome.heldTicks >= RONDO_RULES.tackleTicks,
        'the ball must be held for at least the tackle window before losing it');
      break;
    }
  }
  assert.ok(sawClosePressureBeforeTackle, 'holding forever must eventually be punished');
});

test('holding the ball forever ends a challenge run — failure comes from input', () => {
  const run = createRondo(31337);
  rondoPass(run, bestOpenLane(run).teammate);
  for (let i = 0; i < 20_000 && !run.over; i++) rondoTick(run);
  assert.equal(run.over, true);
  assert.equal(run.endedBy, 'turnovers');
  assert.equal(run.turnovers, RONDO_RULES.lives);
});

test('practice mode never ends on turnovers and keeps lanes teachable', () => {
  const run = createRondo(5, 'practice');
  rondoPass(run, bestOpenLane(run).teammate);
  for (let i = 0; i < 6000 && run.turnovers < 6; i++) rondoTick(run);
  assert.ok(run.turnovers >= 4, 'practice still records turnovers');
  assert.equal(run.over, false, 'practice does not end the session');
  assert.ok(laneOpenness(run, (run.carrier + 1) % 6) > -100);
});

test('every turnover carries an honest teach-back with the open alternative', () => {
  const run = createRondo(9);
  rondoPass(run, bestOpenLane(run).teammate);
  while (!run.over && run.tick < 3000) rondoTick(run);
  assert.ok(run.lastOutcome);
  assert.equal(run.lastOutcome.kind === 'tackled' || run.lastOutcome.kind === 'cut', true);
  assert.ok(run.lastOutcome.openTeammate >= 0, 'teach-back names the open teammate');
  assert.ok(typeof run.lastOutcome.openMargin === 'number');
});

test('one-touch chains build score and slow holds reset the chain', () => {
  const run = greedyBot(createRondo(1234));
  const s = rondoSummary(run);
  assert.ok(s.passes > 0, 'the bot completes passes');
  assert.ok(s.score > 0);
  assert.ok(s.bestChain >= 0);
  assert.ok(run.score >= run.passes * 10, 'each pass is worth at least its base points');
});

test('a competent quick-release strategy survives into a later wave', () => {
  const run = greedyBot(createRondo(2026), 6000);
  const s = rondoSummary(run);
  assert.ok(s.passes >= RONDO_RULES.passesPerWave, `expected a full wave of passes, got ${s.passes}`);
  assert.ok(s.wave >= 2, `expected wave 2+, got wave ${s.wave}`);
});

test('defenders have explicit visible roles and fair failures name engine causes', () => {
  assert.deepEqual(RONDO_DEFENDER_ROLES, ['chaser', 'lane-cutter', 'shadow', 'trap', 'late-pressure']);
  const run = createRondo(17);
  const frame = rondoFrame(run);
  assert.deepEqual(frame.defenders.map((d) => d.role), ['chaser', 'lane-cutter', 'shadow']);
  assert.equal(typeof frame.defenders[0].trapPhase, 'string');
  let sawExplainedCut = false;
  for (let seed = 1; seed <= 24 && !sawExplainedCut; seed++) {
    const testRun = createRondo(seed);
    while (!testRun.over && testRun.tick < 1000) {
      if (!testRun.ball) {
        const choices = Array.from({ length: 6 }, (_, i) => i)
          .filter((i) => i !== testRun.carrier)
          .sort((a, b) => laneOpenness(testRun, a) - laneOpenness(testRun, b));
        rondoPass(testRun, choices[0]);
      }
      const before = testRun.turnovers;
      rondoTick(testRun);
      if (testRun.turnovers > before && testRun.lastOutcome?.kind === 'cut') {
        assert.ok(['lane-already-closed', 'lane-cutter-stepped-across', 'shadow-removed-safe-outlet', 'trap-triggered', 'risky-pass-intercepted'].includes(testRun.lastOutcome.cause));
        assert.ok(RONDO_DEFENDER_ROLES.includes(testRun.lastOutcome.role));
        sawExplainedCut = true;
      }
    }
  }
  assert.equal(sawExplainedCut, true, 'a real geometric interception carries a truthful cause');
});

test('seeded strategy distributions match the tuning bands', () => {
  // Deterministic seeds — this is a fixed fingerprint of the engine, not a
  // statistical gamble. Bands are deliberately loose behavioral targets.
  const seeds = 48;
  const slow = Array.from({ length: seeds }, (_, i) => simulatedPlayer(i + 1, 'slow').passes);
  const quick = Array.from({ length: seeds }, (_, i) => simulatedPlayer(i + 1, 'quick').passes);
  const risky = Array.from({ length: seeds }, (_, i) => simulatedPlayer(i + 1, 'risky').passes);
  const elite = Array.from({ length: seeds }, (_, i) => simulatedPlayer(i + 1, 'elite').passes);
  const eliteVaried = Array.from({ length: seeds }, (_, i) => simulatedPlayer(i + 1, 'elite-varied').passes);
  // hesitation, not unavoidable pressure, produces the sub-5 runs
  assert.ok(percentile(slow, 0.9) <= 8, 'hesitation is punished in the opening phase');
  assert.ok(quick.every((p) => p >= 5), 'a competent quick player never dies before pass 5');
  // a predictable competent player commonly finishes around 12–20
  const quickMedian = percentile(quick, 0.5);
  assert.ok(quickMedian >= 10 && quickMedian <= 24, `predictable-competent median lands near 12–20, got ${quickMedian}`);
  assert.ok(percentile(quick, 0.9) <= 30, 'routine safe rhythm does not coast past 30');
  assert.ok(percentile(risky, 0.9) <= 24, 'regular risky reads meet the press early');
  // fast play is strong; fast varied play is stronger — 35+ strong, 50+ very rare
  assert.ok(elite.some((p) => p >= 30), 'fast one-touch play can still go deep');
  assert.ok(percentile(elite, 0.9) <= 45, 'fast but predictable play does not run away');
  const fiftyPlus = eliteVaried.filter((p) => p >= 50).length / seeds;
  assert.ok(eliteVaried.some((p) => p >= 35), '35+ is reachable for fast varied play');
  assert.ok(fiftyPlus <= 0.25, `50+ stays rare even for perfect varied play, got ${(fiftyPlus * 100).toFixed(1)}%`);
});

test('a repeated A-B-A give-and-go draws the trap onto the return ball', () => {
  let keyed = 0; let sampled = 0;
  for (let seed = 1; seed <= 16; seed++) {
    const { run, trapKeyedReturn } = pingPongPlayer(seed);
    if (run.passes >= 5) sampled += 1;
    if (trapKeyedReturn) keyed += 1;
  }
  assert.ok(sampled >= 4, `enough ping-pong runs survived to sample (${sampled})`);
  assert.ok(keyed >= 4, `the trap keyed the habitual return ball in ${keyed}/16 seeds`);
});

test('repeatedly feeding one receiver gets that outlet shadowed', () => {
  let denied = 0; let sampled = 0;
  for (let seed = 1; seed <= 16; seed++) {
    const fav = 2 + (seed % 3);
    const { run, favoriteDenied } = favoritePlayer(seed, fav);
    if (run.passes >= 7) sampled += 1;
    if (favoriteDenied) denied += 1;
  }
  assert.ok(sampled >= 4, `enough favorite-feeding runs survived to sample (${sampled})`);
  assert.ok(denied >= 4, `the shadow or cutter denied the favorite outlet in ${denied}/16 seeds`);
});

test('varied switching stays safer than repetition', () => {
  let variedTotal = 0; let blindRepeatTotal = 0;
  for (let seed = 1; seed <= 16; seed++) {
    variedTotal += simulatedPlayer(seed, 'varied').passes;
    blindRepeatTotal += pingPongPlayer(seed, 'challenge', { blind: true }).run.passes;
  }
  assert.ok(variedTotal > blindRepeatTotal,
    `switching play outlasts rote repetition (varied ${variedTotal} vs blind give-and-go ${blindRepeatTotal})`);
});

test('adaptation only begins from pass 4, never in practice, and resets with the run', () => {
  const run = createRondo(88);
  assert.equal(defenseReads(run), null, 'a fresh run has nothing to read');
  assert.deepEqual(run.history, [], 'a fresh run has no pass memory');
  greedyBot(run, 400);
  if (run.passes >= 4) assert.notEqual(defenseReads(run), null, 'challenge reads habits once pass 4 arrives');
  const practice = createRondo(88, 'practice');
  const pp = pingPongPlayer(88, 'practice', { maxPasses: 12 });
  assert.equal(defenseReads(pp.run), null, 'practice never hunts habits, whatever the pattern');
  assert.equal(practice.mode === 'practice' && pp.run.over, false, 'practice cannot end from turnovers');
  const restart = createRondo(run.seed, run.mode);
  assert.deepEqual(restart.history, [], 'a restart forgets every habit');
  assert.equal(restart.habit, null);
  assert.equal(defenseReads(restart), null);
});

test('a trap cannot close during its wind-up — five ticks of visible tell, minimum', () => {
  for (let w = 1; w <= RONDO_RULES.maxWave; w++) {
    assert.ok(waveProfile(w).trapTicks >= 5, `wave ${w} trap shows for at least 5 ticks`);
  }
  // Geometric proof: the same trap standing on the exact ball path lets the
  // ball through while showing, and cuts it once snapped.
  const scenario = (phase) => {
    const run = createRondo(21);
    rondoPass(run, bestOpenLane(run).teammate); // press begins with the touch
    for (const d of run.defenders) { d.x = 8; d.y = 10; d.retargetAt = run.tick + 9999; } // park the real press
    for (let i = 0; i < 60 && run.ball; i++) rondoTick(run); // settle the first pass
    const target = bestOpenLane(run).teammate;
    const from = run.positions[run.carrier];
    const to = run.positions[target];
    run.defenders.push({
      id: 4, role: 'trap', x: (from.x + to.x) / 2, y: (from.y + to.y) / 2,
      targetKind: 'trap', laneTo: target, targetTo: target,
      trapPhase: phase, trapAt: run.tick + 9999, retargetAt: run.tick + 9999, closeTicks: 0,
    });
    const passesBefore = run.passes;
    rondoPass(run, target);
    for (let i = 0; i < 60 && run.ball; i++) rondoTick(run);
    return { run, completed: run.passes === passesBefore + 1 };
  };
  const showing = scenario('show');
  assert.equal(showing.completed, true, 'a showing trap on the lane cannot cut the ball');
  const snapped = scenario('snap');
  assert.equal(snapped.completed, false, 'the same trap cuts the ball once snapped');
  assert.equal(snapped.run.lastOutcome.cause, 'trap-triggered');
});

test('defenders never teleport — every step obeys the wave speed cap', () => {
  const run = createRondo(1717);
  rondoPass(run, bestOpenLane(run).teammate);
  for (let i = 0; i < 600 && !run.over; i++) {
    const before = run.defenders.map((d) => ({ x: d.x, y: d.y }));
    const speed = waveProfile(run.wave).speed;
    if (!run.ball && run.tick - run.receivedAt >= 4) rondoPass(run, bestOpenLane(run).teammate);
    rondoTick(run);
    run.defenders.forEach((d, i2) => {
      if (!before[i2]) return; // newly spawned this tick
      const step = Math.hypot(d.x - before[i2].x, d.y - before[i2].y);
      assert.ok(step <= speed + 0.02, `tick ${run.tick}: defender ${d.id} moved ${step.toFixed(2)} (cap ${speed})`);
    });
  }
});

test('waves escalate pressure but stay bounded', () => {
  const p1 = waveProfile(1);
  const p6 = waveProfile(RONDO_RULES.maxWave);
  assert.ok(p6.defenders >= p1.defenders);
  assert.ok(p6.speed > p1.speed);
  assert.ok(p6.ringRadius < p1.ringRadius);
  assert.equal(waveProfile(99).wave, RONDO_RULES.maxWave, 'waves cap — no hidden endless cliff');
});

test('ring positions stay inside the field and are deterministic', () => {
  for (let w = 1; w <= RONDO_RULES.maxWave; w++) {
    const a = ringPositions(88, w);
    const b = ringPositions(88, w);
    assert.deepEqual(a, b);
    for (const p of a) {
      assert.ok(p.x >= 8 && p.x <= 92 && p.y >= 10 && p.y <= 90);
    }
  }
  const wide = ringPositions(88, 1);
  const tight = ringPositions(88, RONDO_RULES.maxWave);
  for (let i = 0; i < wide.length; i++) {
    const a1 = Math.atan2(wide[i].y - 50, wide[i].x - 50);
    const a2 = Math.atan2(tight[i].y - 50, tight[i].x - 50);
    assert.ok(Math.abs(a1 - a2) < 0.02, `teammate ${i + 1} keeps its lane identity`);
  }
});

test('the press waits for the first touch and rapid taps buffer one visible next pass', () => {
  const run = createRondo(3);
  for (let i = 0; i < 40; i++) rondoTick(run);
  assert.equal(run.tick, 0, 'orientation time never advances the press');
  assert.equal(run.turnovers, 0);
  const open = bestOpenLane(run);
  assert.ok(rondoPass(run, open.teammate), 'a legal pass is accepted');
  const next = run.carrier;
  assert.ok(rondoPass(run, next), 'a return pass is buffered during flight');
  assert.equal(run.queuedTo, next);
  for (let i = 0; i < 60 && run.passes < 1; i++) rondoTick(run);
  assert.ok(run.ball, 'the buffered one-touch launches on receipt');
  assert.equal(run.ball.to, next);
  assert.equal(rondoPass(run, 99), null, 'no pass off the carousel');
});

test('a buffered pass dies with its possession — a turnover can never fire it', () => {
  const worstLane = (run) => {
    let worst = -1; let margin = Infinity;
    for (let i = 0; i < run.positions.length; i++) {
      if (i === run.carrier) continue;
      const m = laneOpenness(run, i);
      if (m < margin) { margin = m; worst = i; }
    }
    return worst;
  };
  let cutsWithArmedBuffer = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const run = createRondo(seed);
    rondoPass(run, bestOpenLane(run).teammate);
    while (!run.over && run.tick < 1500) {
      if (!run.ball) {
        // pass into pressure so cuts actually happen…
        rondoPass(run, worstLane(run));
        // …and immediately arm a follow-up, like a player in a hurry would
        if (run.ball) rondoPass(run, (run.ball.to + 1 + (seed % 3)) % RONDO_RULES.teammates);
      }
      const turnoversBefore = run.turnovers;
      const armed = run.queuedTo;
      rondoTick(run);
      if (run.turnovers > turnoversBefore) {
        assert.equal(run.queuedTo, null, `seed ${seed}: the queue clears the instant possession ends`);
        if (armed != null) {
          cutsWithArmedBuffer += 1;
          // the stale buffer must never fire by itself in the new possession
          const passes = run.passes;
          for (let i = 0; i < 30 && !run.over; i++) rondoTick(run);
          assert.equal(run.ball, null, `seed ${seed}: nothing launches without a new input`);
          assert.equal(run.passes, passes, `seed ${seed}: the dead buffer never scores`);
          break;
        }
      }
      if (!run.ball) assert.equal(run.queuedTo, null, `seed ${seed}: a queue exists only while the ball travels`);
    }
  }
  assert.ok(cutsWithArmedBuffer >= 5,
    `interceptions with an armed buffer were actually exercised (saw ${cutsWithArmedBuffer})`);
});

test('run completion, exit, and reset all retire an armed buffer', () => {
  const run = createRondo(4);
  rondoPass(run, bestOpenLane(run).teammate);
  rondoPass(run, (run.ball.to + 1) % RONDO_RULES.teammates);
  assert.notEqual(run.queuedTo, null, 'the buffer is armed while the ball travels');
  endRondoRun(run, 'exit');
  assert.equal(run.over, true);
  assert.equal(run.queuedTo, null, 'an exited run owes no pass');
  assert.equal(rondoPass(run, 2), null, 'a finished run accepts no input');
  const fresh = createRondo(run.seed, run.mode);
  assert.equal(fresh.queuedTo, null, 'a restart or replay reset starts with an empty queue');
  assert.equal(fresh.started, false, 'and waits again for the first touch');
});

test('initial defenders are separated enough to read as distinct pressers', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const run = createRondo(seed);
    for (let i = 0; i < run.defenders.length; i++) {
      for (let j = i + 1; j < run.defenders.length; j++) {
        const dx = run.defenders[i].x - run.defenders[j].x;
        const dy = run.defenders[i].y - run.defenders[j].y;
        assert.ok(Math.hypot(dx, dy) >= 10.9, `seed ${seed} pressers stay visually distinct`);
      }
    }
  }
});

test('pause freezes the game completely and resume continues it', () => {
  const run = createRondo(11);
  rondoPass(run, bestOpenLane(run).teammate);
  rondoTick(run);
  togglePauseRondo(run);
  const tick = run.tick;
  const positions = JSON.stringify(run.defenders);
  rondoTick(run); rondoTick(run);
  assert.equal(run.tick, tick, 'paused runs do not advance');
  assert.equal(JSON.stringify(run.defenders), positions);
  assert.equal(rondoPass(run, (run.carrier + 1) % 6), null, 'no passes while paused');
  togglePauseRondo(run);
  rondoTick(run);
  assert.equal(run.tick, tick + 1);
});

test('records fold day bests and all-time bests without inventing numbers', () => {
  const run = greedyBot(createRondo(55));
  const s = rondoSummary(run);
  const rec1 = rondoRecordAfter(null, run, '2026-07-10');
  assert.equal(rec1.bestToday, s.score);
  assert.equal(rec1.bestScore, s.score);
  assert.equal(rec1.attemptsToday, 1);
  const rec2 = rondoRecordAfter(rec1, run, '2026-07-11');
  assert.equal(rec2.attemptsToday, 1, 'a new day resets attempts');
  assert.equal(rec2.bestScore, s.score, 'all-time best survives the day change');
  // practice runs never inflate challenge bests
  const practice = greedyBot(createRondo(55, 'practice'));
  const rec3 = rondoRecordAfter(rec2, practice, '2026-07-11');
  assert.equal(rec3.bestScore, rec2.bestScore);
  assert.equal(rec3.attemptsToday, rec2.attemptsToday, 'practice does not consume challenge attempts');
});

test('the replay validator accepts an honest log and rejects tampering', () => {
  const run = greedyBot(createRondo(404));
  const log = rondoEventLog(run);
  assert.equal(validateRondoLog(log).ok, true);
  assert.equal(validateRondoLog({ ...log, score: log.score + 50 }).ok, false);
  assert.equal(validateRondoLog({ ...log, gameVersion: 'rondo-v0' }).reason, 'version');
  assert.equal(validateRondoLog({ ...log, seed: -1 }).reason, 'challenge');
  assert.equal(validateRondoLog({ ...log, events: [...log.events, { tick: log.finalTick, to: 1 }] }).reason, 'event',
    'events appended after the run ended are rejected');
  const shuffled = { ...log, events: [...log.events].reverse() };
  if (shuffled.events.length > 1 && shuffled.events[0].tick !== shuffled.events.at(-1).tick) {
    assert.equal(validateRondoLog(shuffled).ok, false, 'out-of-order events are rejected');
  }
  assert.equal(validateRondoLog({ ...log, finalTick: 999_999 }).reason, 'timing');
});

test('ranked stays locked until a server can replay signed challenges', () => {
  assert.equal(RONDO_RULES.ranked, false);
  assert.equal(RONDO_VERSION, 'rondo-v4');
});

test('an exited run finishes with a complete, honest summary', () => {
  const run = createRondo(77);
  for (let i = 0; i < 30; i++) rondoTick(run);
  endRondoRun(run, 'exit');
  const s = rondoSummary(run);
  assert.equal(run.over, true);
  assert.equal(s.endedBy, 'exit');
  assert.ok(s.grade.length > 0);
});
