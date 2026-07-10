// United 2026 — Shot Lab pure game engine.
// Direct inputs become a deterministic ball flight. No result is forced and
// no user/team identity is accepted by the scoring model. The event log is
// replayable by a future server validator; ranked submission stays disabled
// until that validator and signed challenge tokens are deployed.

import { createSeededRng, hashSeed } from '../core/soccer-engine.js';

export const SHOT_LAB_VERSION = 'shot-lab-v1';
export const SHOT_LAB_RULES = Object.freeze({
  practiceShots: 8,
  timedShots: 12,
  timedMs: 45_000,
  ranked: false,
});

export const SHOT_TYPES = Object.freeze({
  drive: Object.freeze({ label: 'Drive', curve: 0.65, lift: 0, power: 0.78 }),
  finesse: Object.freeze({ label: 'Finesse', curve: 1.25, lift: -2, power: 0.66 }),
  chip: Object.freeze({ label: 'Chip', curve: 0.42, lift: -12, power: 0.56 }),
});

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, Number(n))); }
function fixed(n) { return Math.round(n * 100) / 100; }
function validMode(mode) { return mode === 'timed' ? 'timed' : 'practice'; }

function defaultInput() {
  return { aim: { x: 70, y: 28 }, contact: { x: 0, y: 0 }, power: 0.72, curve: 0, shotType: 'drive' };
}

export function createShotLab(seed, mode = 'practice') {
  const s = (Number(seed) || hashSeed(`shot-lab:${mode}`)) >>> 0 || 1;
  return {
    version: SHOT_LAB_VERSION,
    seed: s,
    mode: validMode(mode),
    input: defaultInput(),
    shots: [],
    score: 0,
    combo: 0,
    bestCombo: 0,
    elapsedMs: 0,
    paused: false,
    over: false,
    finishedBy: null,
  };
}

export function shotLimit(run) {
  return run?.mode === 'timed' ? SHOT_LAB_RULES.timedShots : SHOT_LAB_RULES.practiceShots;
}

export function shotLabRemainingMs(run) {
  return Math.max(0, SHOT_LAB_RULES.timedMs - (run?.elapsedMs || 0));
}

/** The player sees the moving target, keeper position and pressure before
 * shooting. No unseen future input is leaked. */
export function shotLabFrame(run) {
  const index = run?.shots?.length || 0;
  const seed = run?.seed || 1;
  const rng = createSeededRng(hashSeed(`${seed}:frame:${index}`) || 1);
  const phase = rng() * Math.PI * 2;
  const target = {
    x: fixed(clamp(50 + Math.sin(phase + index * 0.83) * 31, 14, 86)),
    y: fixed(clamp(38 + Math.cos(phase * 0.7 + index * 0.61) * 24, 13, 72)),
    radius: fixed(Math.max(8, 14 - index * 0.35 - (run?.mode === 'timed' ? 1.5 : 0))),
  };
  const history = run?.shots || [];
  const avgX = history.length ? history.reduce((n, s) => n + s.input.aim.x, 0) / history.length : 50;
  const read = history.length < 2 ? 0 : clamp((avgX - 50) * 0.2, -8, 8);
  const keeper = {
    x: fixed(clamp(50 + (rng() - 0.5) * 24 + read, 25, 75)),
    read: read < -2 ? 'shading left' : read > 2 ? 'shading right' : history.length < 2 ? 'no read yet' : 'holding centre',
  };
  return {
    index,
    target,
    keeper,
    pressure: fixed(clamp(0.16 + index * 0.065 + (run?.mode === 'timed' ? 0.12 : 0), 0.16, 0.9)),
  };
}

export function setShotLabInput(run, patch = {}) {
  if (!run || run.over) return run;
  const prev = run.input || defaultInput();
  const aim = patch.aim ? {
    x: fixed(clamp(patch.aim.x, 2, 98)),
    y: fixed(clamp(patch.aim.y, 3, 97)),
  } : prev.aim;
  const contact = patch.contact ? {
    x: fixed(clamp(patch.contact.x, -1, 1)),
    y: fixed(clamp(patch.contact.y, -1, 1)),
  } : prev.contact;
  run.input = {
    aim,
    contact,
    power: fixed(clamp(patch.power ?? prev.power, 0.3, 1)),
    curve: fixed(clamp(patch.curve ?? prev.curve, -1, 1)),
    shotType: SHOT_TYPES[patch.shotType] ? patch.shotType : prev.shotType,
  };
  return run;
}

function normalizedInput(input = {}) {
  const base = defaultInput();
  return {
    aim: { x: fixed(clamp(input.aim?.x ?? base.aim.x, 2, 98)), y: fixed(clamp(input.aim?.y ?? base.aim.y, 3, 97)) },
    contact: { x: fixed(clamp(input.contact?.x ?? 0, -1, 1)), y: fixed(clamp(input.contact?.y ?? 0, -1, 1)) },
    power: fixed(clamp(input.power ?? base.power, 0.3, 1)),
    curve: fixed(clamp(input.curve ?? 0, -1, 1)),
    shotType: SHOT_TYPES[input.shotType] ? input.shotType : 'drive',
  };
}

function finishIfNeeded(run) {
  if (run.shots.length >= shotLimit(run)) {
    run.over = true; run.finishedBy = 'shots';
  } else if (run.mode === 'timed' && run.elapsedMs >= SHOT_LAB_RULES.timedMs) {
    run.over = true; run.finishedBy = 'clock';
  }
}

export function advanceShotLabClock(run, deltaMs) {
  if (!run || run.over || run.paused || run.mode !== 'timed') return run;
  run.elapsedMs = Math.min(SHOT_LAB_RULES.timedMs, run.elapsedMs + Math.max(0, Number(deltaMs) || 0));
  finishIfNeeded(run);
  return run;
}

export function toggleShotLabPause(run) {
  if (!run || run.over) return run;
  run.paused = !run.paused;
  return run;
}

/** Resolve one shot. Landing error comes from visible pressure plus a locked
 * seed. Aim/contact/power/curve/type all measurably affect the flight. */
export function takeShot(run, submittedInput = run?.input) {
  if (!run || run.over || run.paused) return null;
  if (run.mode === 'timed' && shotLabRemainingMs(run) <= 0) { finishIfNeeded(run); return null; }
  const input = normalizedInput(submittedInput);
  const frame = shotLabFrame(run);
  const shotNo = run.shots.length + 1;
  const rng = createSeededRng(hashSeed(`${run.seed}:shot:${shotNo}`) || shotNo);
  const type = SHOT_TYPES[input.shotType];
  const idealPower = clamp(type.power + (42 - frame.target.y) * 0.002, 0.48, 0.86);
  const pressureError = frame.pressure * 13;
  const contactError = Math.hypot(input.contact.x, input.contact.y);
  const jitterX = (rng() - 0.5) * pressureError * (1 + contactError * 0.22);
  const jitterY = (rng() - 0.5) * pressureError * 0.78 * (1 + contactError * 0.18);
  const landing = {
    x: fixed(input.aim.x + input.curve * type.curve * 10 + input.contact.x * 5.5 + jitterX),
    y: fixed(input.aim.y - input.contact.y * 8 - (input.power - idealPower) * 18 + type.lift + jitterY),
  };
  const onTarget = landing.x >= 2 && landing.x <= 98 && landing.y >= 3 && landing.y <= 96;
  const targetDistance = Math.hypot(landing.x - frame.target.x, landing.y - frame.target.y);
  const targetHit = onTarget && targetDistance <= frame.target.radius;
  const keeperDistance = Math.hypot((landing.x - frame.keeper.x) * 1.05, (landing.y - 72) * 0.62);
  const keeperChance = clamp(0.58 - keeperDistance / 80 + frame.pressure * 0.12
    - Math.abs(input.curve) * 0.07 - (input.shotType === 'chip' ? 0.08 : 0), 0.05, 0.72);
  const saved = onTarget && rng() < keeperChance;
  const goal = onTarget && !saved;
  const technique = clamp(1 - Math.abs(input.power - idealPower) * 1.8 - contactError * 0.11, 0, 1);
  const accuracy = onTarget ? clamp(1 - targetDistance / 85, 0, 1) : 0;
  const points = Math.round(
    (goal ? 260 : onTarget ? 45 : 0)
    + accuracy * 230
    + technique * 170
    + (targetHit ? 300 : 0)
    + (goal && run.combo ? Math.min(160, run.combo * 28) : 0)
  );
  const outcome = !onTarget ? 'off-target' : saved ? 'saved' : targetHit ? 'bullseye' : 'goal';
  run.combo = targetHit && goal ? run.combo + 1 : goal ? Math.max(0, run.combo - 1) : 0;
  run.bestCombo = Math.max(run.bestCombo, run.combo);
  const event = Object.freeze({
    n: shotNo,
    input: Object.freeze({ ...input, aim: Object.freeze(input.aim), contact: Object.freeze(input.contact) }),
    frame: Object.freeze({
      target: Object.freeze(frame.target), keeper: Object.freeze(frame.keeper), pressure: frame.pressure,
    }),
    landing: Object.freeze(landing),
    onTarget, saved, goal, targetHit, outcome, points,
    accuracy: fixed(accuracy), technique: fixed(technique),
    elapsedMs: run.elapsedMs,
  });
  run.shots.push(event);
  run.score += points;
  run.input = input;
  finishIfNeeded(run);
  return event;
}

export function shotLabSummary(run) {
  const shots = run?.shots || [];
  const goals = shots.filter((s) => s.goal).length;
  const onTarget = shots.filter((s) => s.onTarget).length;
  const bullseyes = shots.filter((s) => s.targetHit && s.goal).length;
  const score = Math.max(0, Math.round(run?.score || 0));
  const accuracy = shots.length ? Math.round((onTarget / shots.length) * 100) : 0;
  const technique = shots.length ? Math.round(shots.reduce((n, s) => n + s.technique, 0) / shots.length * 100) : 0;
  const grade = score >= 6200 ? 'World class' : score >= 4600 ? 'Top bins' : score >= 3000 ? 'Dangerous' : score >= 1600 ? 'Finding range' : 'Training ground';
  return { score, shots: shots.length, goals, onTarget, bullseyes, accuracy, technique, bestCombo: run?.bestCombo || 0, grade };
}

export function shotLabRecordAfter(previous, run) {
  const s = shotLabSummary(run);
  const mode = validMode(run?.mode);
  const prev = previous || {};
  const bestKey = mode === 'timed' ? 'bestTimed' : 'bestPractice';
  return {
    played: (prev.played || 0) + 1,
    bestTimed: Math.max(prev.bestTimed || 0, mode === 'timed' ? s.score : 0),
    bestPractice: Math.max(prev.bestPractice || 0, mode === 'practice' ? s.score : 0),
    bestAccuracy: Math.max(prev.bestAccuracy || 0, s.accuracy),
    bestCombo: Math.max(prev.bestCombo || 0, s.bestCombo),
    last: { mode, seed: run.seed, score: s.score, grade: s.grade, goals: s.goals, shots: s.shots, accuracy: s.accuracy },
    [bestKey]: Math.max(prev[bestKey] || 0, s.score),
  };
}

export function shotLabEventLog(run) {
  return {
    gameVersion: SHOT_LAB_VERSION,
    ruleVersion: SHOT_LAB_VERSION,
    seed: run.seed,
    mode: run.mode,
    elapsedMs: run.elapsedMs,
    events: run.shots.map((s) => ({ input: s.input, elapsedMs: s.elapsedMs })),
    score: run.score,
  };
}

/** Pure replay validator suitable for a server route. It rejects version,
 * seed, timing, event-count and score tampering. This is not exposed as a
 * ranked submit button until the server owns the signed challenge. */
export function validateShotLabLog(log) {
  if (!log || log.gameVersion !== SHOT_LAB_VERSION || log.ruleVersion !== SHOT_LAB_VERSION) return { ok: false, reason: 'version' };
  if (!Number.isInteger(log.seed) || log.seed <= 0 || !Array.isArray(log.events)) return { ok: false, reason: 'challenge' };
  if (log.events.length > (log.mode === 'timed' ? SHOT_LAB_RULES.timedShots : SHOT_LAB_RULES.practiceShots)) return { ok: false, reason: 'event-count' };
  const replay = createShotLab(log.seed, log.mode);
  let lastMs = 0;
  for (const e of log.events) {
    const at = Math.max(0, Number(e.elapsedMs) || 0);
    if (at < lastMs || (log.mode === 'timed' && at > SHOT_LAB_RULES.timedMs)) return { ok: false, reason: 'timing' };
    advanceShotLabClock(replay, at - lastMs);
    lastMs = at;
    if (!takeShot(replay, e.input)) return { ok: false, reason: 'event' };
  }
  if (replay.score !== log.score) return { ok: false, reason: 'score', expected: replay.score };
  return { ok: true, score: replay.score, summary: shotLabSummary(replay) };
}
