import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SOCCER_MODEL_VERSION,
  calibrateMatchup,
  expectedGoals,
  soccerRatingEdge,
  simulateSoccerMatch,
} from '../src/core/soccer-engine.js';

test('short match windows share one bounded symmetric rating edge', () => {
  const favorite = soccerRatingEdge('FRA', 'CUW');
  assert.ok(favorite > 0 && favorite <= 0.75);
  assert.equal(soccerRatingEdge('CUW', 'FRA'), -favorite);
  assert.equal(soccerRatingEdge('SUI', 'SUI'), 0);
  assert.ok(Math.abs(soccerRatingEdge({ code: 'A', baseStrength: 100 }, { code: 'B', baseStrength: 40 })) <= 0.75);
});

test('shared engine is replayable from one seed and exposes its rule version', () => {
  const input = { home: 'FRA', away: 'CUW', seed: 260711, matchImportance: 0.8 };
  const a = simulateSoccerMatch(input);
  const b = simulateSoccerMatch(input);
  assert.deepEqual(a, b);
  assert.equal(a.modelVersion, SOCCER_MODEL_VERSION);
  assert.match(a.source, /stable-fallback/);
});

test('France is a heavy favorite over Curaçao, but draws and upsets remain possible', () => {
  const c = calibrateMatchup({ home: 'FRA', away: 'CUW', neutralVenue: true }, 12000, 2026);
  assert.ok(c.homeWinRate > 0.76 && c.homeWinRate < 0.96, `France win rate ${c.homeWinRate}`);
  assert.ok(c.drawRate > 0.03 && c.drawRate < 0.2, `draw rate ${c.drawRate}`);
  assert.ok(c.awayWinRate > 0.008 && c.awayWinRate < 0.12, `Curaçao win rate ${c.awayWinRate}`);
  assert.ok(c.homeGoalsPerMatch > c.awayGoalsPerMatch * 2.5, 'rating gap remains visible in scoring');
});

test('balanced peers produce credible goals, draws and a bounded home edge', () => {
  const c = calibrateMatchup({ home: 'SUI', away: 'SUI' }, 10000, 91);
  assert.ok(c.goalsPerMatch > 2 && c.goalsPerMatch < 3.35, `goals ${c.goalsPerMatch}`);
  assert.ok(c.drawRate > 0.18 && c.drawRate < 0.34, `draws ${c.drawRate}`);
  assert.ok(c.homeWinRate > c.awayWinRate, 'home advantage is present but not deterministic');
});

test('fatigue lowers late performance and substitutions recover only part of it', () => {
  const fresh = expectedGoals({ home: 'BRA', away: 'COL', homeContext: { minute: 78, fatigue: 0.05 } });
  const tired = expectedGoals({ home: 'BRA', away: 'COL', homeContext: { minute: 78, fatigue: 0.9, substitutions: 0 } });
  const changed = expectedGoals({ home: 'BRA', away: 'COL', homeContext: { minute: 78, fatigue: 0.9, substitutions: 1 } });
  assert.ok(tired.home < fresh.home * 0.91, `${tired.home} < ${fresh.home}`);
  assert.ok(changed.home > tired.home && changed.home < fresh.home, 'fresh legs help without erasing fatigue');
});

test('tactical aggression creates a measurable chance/exposure tradeoff', () => {
  const safe = expectedGoals({
    home: 'USA', away: 'MEX',
    homeContext: { tactic: 'low-block' },
    awayContext: { tactic: 'low-block' },
  });
  const press = expectedGoals({
    home: 'USA', away: 'MEX',
    homeContext: { tactic: 'press' },
    awayContext: { tactic: 'press' },
  });
  assert.ok(press.home > safe.home * 1.25, 'press creates more attacking threat');
  assert.ok(press.away > safe.away * 1.25, 'press also exposes the team');
  assert.ok(press.volatility > safe.volatility, 'tradeoff is visible in volatility');
});

test('red cards widen the match distribution instead of forcing one result', () => {
  const normal = calibrateMatchup({ home: 'ARG', away: 'BRA', neutralVenue: true }, 7000, 400);
  const red = calibrateMatchup({
    home: 'ARG', away: 'BRA', neutralVenue: true,
    homeContext: { redCards: 1 }, awayContext: { redCards: 1 },
  }, 7000, 400);
  assert.ok(red.totalGoalVariance > normal.totalGoalVariance * 1.08,
    `red-card variance ${red.totalGoalVariance} > normal ${normal.totalGoalVariance}`);
  assert.ok(red.homeWinRate > 0 && red.awayWinRate > 0 && red.drawRate > 0);
});

test('the model has no user-side or AI-side boost surface', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) =>
    readFile(new URL('../src/core/soccer-engine.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(source, /userSelected|playerSide|aiAdvantage|rubberBand|forcedWin|forcedLoss/i);
  const home = simulateSoccerMatch({ home: 'JPN', away: 'KOR', seed: 88 });
  const replay = simulateSoccerMatch({ home: 'JPN', away: 'KOR', seed: 88, user: 'away', ai: 'home' });
  assert.deepEqual(home, replay, 'unknown user/AI labels cannot influence the result');
});
