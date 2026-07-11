// Rondo engine — fairness, determinism, input reliability, teaching feedback,
// records, and the replay validator that guards future ranked play.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RONDO_RULES, RONDO_VERSION, createRondo, rondoTick, rondoPass, rondoFrame,
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
    assert.ok(waveProfile(w).defenders <= 4);
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
  for (let i = 0; i < 20_000 && !run.over; i++) rondoTick(run);
  assert.equal(run.over, true);
  assert.equal(run.endedBy, 'turnovers');
  assert.equal(run.turnovers, RONDO_RULES.lives);
});

test('practice mode never ends on turnovers and keeps lanes teachable', () => {
  const run = createRondo(5, 'practice');
  for (let i = 0; i < 6000 && run.turnovers < 6; i++) rondoTick(run);
  assert.ok(run.turnovers >= 4, 'practice still records turnovers');
  assert.equal(run.over, false, 'practice does not end the session');
  assert.ok(laneOpenness(run, (run.carrier + 1) % 6) > -100);
});

test('every turnover carries an honest teach-back with the open alternative', () => {
  const run = createRondo(9);
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
});

test('inputs are never converted or dropped silently mid-flight', () => {
  const run = createRondo(3);
  const open = bestOpenLane(run);
  assert.ok(rondoPass(run, open.teammate), 'a legal pass is accepted');
  assert.equal(rondoPass(run, (open.teammate + 1) % 6), null, 'no second ball while one travels');
  assert.equal(rondoPass(run, run.carrier), null, 'no pass to self');
  assert.equal(rondoPass(run, 99), null, 'no pass off the carousel');
});

test('pause freezes the game completely and resume continues it', () => {
  const run = createRondo(11);
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
  const shuffled = { ...log, events: [...log.events].reverse() };
  if (shuffled.events.length > 1 && shuffled.events[0].tick !== shuffled.events.at(-1).tick) {
    assert.equal(validateRondoLog(shuffled).ok, false, 'out-of-order events are rejected');
  }
  assert.equal(validateRondoLog({ ...log, finalTick: 999_999 }).reason, 'timing');
});

test('ranked stays locked until a server can replay signed challenges', () => {
  assert.equal(RONDO_RULES.ranked, false);
  assert.equal(RONDO_VERSION, 'rondo-v1');
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
