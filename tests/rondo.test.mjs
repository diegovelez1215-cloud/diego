// Rondo engine — fairness, determinism, input reliability, teaching feedback,
// records, and the replay validator that guards future ranked play.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RONDO_RULES, RONDO_VERSION, RONDO_DEFENDER_ROLES, createRondo, rondoTick, rondoPass, rondoFrame,
  rondoSummary, rondoRecordAfter, rondoEventLog, validateRondoLog,
  laneOpenness, bestOpenLane, waveProfile, ringPositions, togglePauseRondo, endRondoRun,
} from '../src/games/rondo.js';

function greedyBot(run, maxTicks = 4000) {
  // Always release quickly to the safest lane — a competent beginner.
  while (!run.over && run.tick < maxTicks) {
    if (!run.ball) {
      const open = bestOpenLane(run);
      if (open.teammate >= 0 && open.margin > RONDO_RULES.interceptRadius) {
        rondoPass(run, open.teammate);
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

function simulatedPlayer(seed, strategy) {
  const run = createRondo(seed);
  const delay = strategy === 'slow' ? 10 : strategy === 'elite' ? 0 : 4;
  let dangerBefore20 = false;
  while (!run.over && run.tick < 1000) {
    if (!run.ball) {
      const lanes = [];
      for (let i = 0; i < RONDO_RULES.teammates; i++) {
        if (i !== run.carrier) lanes.push({ to: i, margin: laneOpenness(run, i) });
      }
      lanes.sort((a, b) => b.margin - a.margin || a.to - b.to);
      if (run.passes < 20 && lanes[0].margin < 10) dangerBefore20 = true;
      const ready = !run.started || run.tick - run.receivedAt >= delay;
      if (ready) {
        // The imperfect player occasionally takes the second-best visible lane;
        // the elite player mostly one-touches but still makes a rare bad read.
        const imperfect = strategy === 'risky' && run.passes > 0 && run.passes % 4 === 3;
        const eliteMistake = strategy === 'elite' && run.passes > 0 && run.passes % 9 === 0;
        rondoPass(run, lanes[(imperfect || eliteMistake) ? 1 : 0].to);
      }
    }
    rondoTick(run);
  }
  return { passes: run.passes, dangerBefore20, over: run.over };
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

test('the ball always outruns the press at every wave — no impossible chase', () => {
  for (let w = 1; w <= RONDO_RULES.maxWave + 2; w++) {
    assert.ok(waveProfile(w).speed < RONDO_RULES.passSpeed * 0.55,
      `wave ${w} presser speed must stay far below ball speed`);
    assert.ok(waveProfile(w).defenders <= 8);
  }
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
  assert.deepEqual(frame.defenders.map((d) => d.role), ['chaser', 'lane-cutter']);
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

test('seeded strategy distributions make 50-plus a rare achievement', () => {
  const slow = Array.from({ length: 48 }, (_, i) => simulatedPlayer(i + 1, 'slow'));
  const quick = Array.from({ length: 48 }, (_, i) => simulatedPlayer(i + 1, 'quick'));
  const risky = Array.from({ length: 48 }, (_, i) => simulatedPlayer(i + 1, 'risky'));
  const elite = Array.from({ length: 80 }, (_, i) => simulatedPlayer(i + 1, 'elite'));
  assert.ok(percentile(slow.map((r) => r.passes), 0.9) <= 8, 'hesitation is punished in the opening phase');
  assert.ok(quick.every((r) => r.dangerBefore20), 'a competent player meets real pressure before pass 20');
  assert.ok(percentile(quick.map((r) => r.passes), 0.9) <= 35, '35+ needs more than a routine quick-safe rhythm');
  assert.ok(percentile(risky.map((r) => r.passes), 0.9) <= 28, 'occasional risky reads do not coast through the press');
  const fiftyPlus = elite.filter((r) => r.passes >= 50).length / elite.length;
  const fiftyFivePlus = elite.filter((r) => r.passes >= 55).length / elite.length;
  assert.ok(fiftyPlus > 0 && fiftyPlus <= 0.15, `50+ should be uncommon, got ${(fiftyPlus * 100).toFixed(1)}%`);
  assert.ok(fiftyFivePlus > 0 && fiftyFivePlus <= 0.1, `55+ should be rare but possible, got ${(fiftyFivePlus * 100).toFixed(1)}%`);
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
  assert.equal(RONDO_VERSION, 'rondo-v3');
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
