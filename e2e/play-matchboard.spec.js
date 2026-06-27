const { test, expect } = require('@playwright/test');
const {
  gotoApp,
  tapBottomTab,
  expectNoHorizontalOverflow,
  expectRectsInsideViewport,
  screenshot
} = require('./helpers');

test.describe('Play and Matchboard rendered runtime', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page, 'final-matchday');
  });

  test('Play disclosure is immediately visible and does not cover controls', async ({ page }) => {
    await tapBottomTab(page, 'bet');
    const disc = page.locator('.play-disclosure');
    await expect(disc).toBeVisible();
    await expect(disc).toHaveText('SIM $ · NO REAL MONEY');
    await expectRectsInsideViewport(page, '.play-disclosure', 'Play disclosure');

    await page.evaluate(() => window.__wc26E2E.openTicketBuilder());
    await expect(page.locator('#tkPlace')).toBeVisible();
    const covered = await page.locator('#tkPlace').evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!(top && top.closest && top.closest('.play-disclosure'));
    });
    expect(covered).toBe(false);
  });

  test('Play ticket builder is reachable and mobile-safe', async ({ page }, testInfo) => {
    await page.evaluate(() => window.__wc26E2E.openTicketBuilder());
    await expect(page.locator('#sheet .tk')).toBeVisible();
    await expect(page.locator('#tkPlace')).toContainText('Place simulated pick');
    await expectNoHorizontalOverflow(page, 'Play ticket builder');
    await expectRectsInsideViewport(page, '#sheet .tk, #sheet button, #sheet input', 'Ticket builder controls');
    await screenshot(page, testInfo, 'play-ticket-builder');
  });

  test('Matchboard ball and markers change through rendered event states', async ({ page }, testInfo) => {
    await page.evaluate(() => window.__wc26E2E.startMatchboard());
    await expect(page.locator('.ts2-matchboard')).toBeVisible();

    const initial = await page.evaluate(() => window.__wc26E2E.board());
    const goal = await page.evaluate(() => window.__wc26E2E.applyEvent('goal'));
    const halftime = await page.evaluate(() => window.__wc26E2E.applyEvent('halftime'));
    const card = await page.evaluate(() => window.__wc26E2E.applyEvent('red_card'));
    const penalty = await page.evaluate(() => window.__wc26E2E.applyEvent('penalties'));
    const final = await page.evaluate(() => window.__wc26E2E.applyEvent('final_whistle'));

    expect(goal.ball).not.toEqual(initial.ball);
    expect(goal.markers.map((m) => [m.x, m.y])).not.toEqual(initial.markers.map((m) => [m.x, m.y]));
    expect(goal.ball.x).toBeGreaterThanOrEqual(88);
    expect(['0-0', '1-0']).toContain(initial.score);

    expect(halftime.cls).toContain('reset');
    expect(card.cls).toContain('card');
    expect(penalty.cls).toContain('pen');
    expect(final.cls).toContain('final');
    expect(new Set([goal.event, halftime.event, card.event, penalty.event, final.event]).size).toBe(5);

    await expectNoHorizontalOverflow(page, 'Matchboard goal sequence');
    await screenshot(page, testInfo, 'matchboard-goal-sequence');
  });

  test('Speed Up is at least 2.5x faster and settlement remains single-path', async ({ page }) => {
    await page.evaluate(() => window.__wc26E2E.startMatchboard());
    const ratio = await page.evaluate(() => window.__wc26E2E.speedRatio());
    expect(ratio).toBeGreaterThanOrEqual(2.5);

    const result = await page.evaluate(() => window.__wc26E2E.runFastToResult());
    expect(result.ratio).toBeGreaterThanOrEqual(2.5);
    expect(result.settled).toBe(1);
    expect(result.bank).toBeGreaterThan(9900);

    const after = await page.evaluate(() => window.__wc26E2E.runFastToResult());
    expect(after.settled).toBe(1);
    expect(after.bank).toBe(result.bank);
  });

  test('Director runtime: 12-14 markers, fast first motion, and a bright ball', async ({ page }, testInfo) => {
    await page.evaluate(() => window.__wc26E2E.startMatchboard());
    await expect(page.locator('.ts2-matchboard')).toBeVisible();
    const markerCount = await page.locator('.ts2-mb-marker').count();
    expect(markerCount).toBeGreaterThanOrEqual(12);
    expect(markerCount).toBeLessThanOrEqual(14);
    await expect(page.locator('.ts2-ball')).toBeVisible();

    // The deterministic Director Plan moves the ball within 250ms and presents a
    // captured late goal well inside the budget — never after a literal-minute wait.
    const timing = await page.evaluate(() => {
      const ts2 = window.__ts2;
      const lateGoalLeg = { num: 5, pick: 'h', simple: true, label: 'late', finalState: 'win',
        result: { teams: { h: 'BRA', a: 'CRO' }, seed: 777, replayKey: 'late-e2e', score: { h: 1, a: 0 }, minute: 90, period: 'final',
          events: [{ minute: 84, type: 'goal', side: 'h', score: { h: 1, a: 0 }, headline: 'late' }] } };
      const watch = ts2.ts2BuildDirectorPlan(lateGoalLeg, 'cinematic', 1);
      const fast = ts2.ts2BuildDirectorPlan(lateGoalLeg, 'fast', 1);
      const b0 = ts2.ts2DirectorFrame(watch, lateGoalLeg, 0).frame.ball;
      const b250 = ts2.ts2DirectorFrame(watch, lateGoalLeg, 250).frame.ball;
      const goalSeg = (p) => p.segments.find((s) => p.stops[s.stopIndex].type === 'goal');
      return {
        firstMotion: Math.hypot(b250.x - b0.x, b250.y - b0.y),
        watchGoal: goalSeg(watch).revealAt, fastGoal: goalSeg(fast).revealAt,
        watchMaxBeat: Math.max(...watch.beats.map((b) => b.dur)),
        fastMaxBeat: Math.max(...fast.beats.map((b) => b.dur)),
        ratio: watch.total / fast.total
      };
    });
    expect(timing.firstMotion).toBeGreaterThan(0.5);
    expect(timing.watchGoal).toBeLessThanOrEqual(9000);
    expect(timing.fastGoal).toBeLessThanOrEqual(3500);
    expect(timing.watchMaxBeat).toBeLessThanOrEqual(650);
    expect(timing.fastMaxBeat).toBeLessThanOrEqual(300);
    expect(timing.ratio).toBeGreaterThanOrEqual(2.5);
    await expectNoHorizontalOverflow(page, 'Director matchboard');
    await screenshot(page, testInfo, 'matchboard-director');
  });

  test('Cash Out remains clickable and clear of the pitch', async ({ page }) => {
    await page.evaluate(() => {
      window.__wc26E2E.startMatchboard();
      window.__wc26E2E.applyEvent('goal');
    });
    const cashButton = page.locator('#ts2cash button', { hasText: 'Cash out' });
    await expect(cashButton).toBeVisible();
    await expect(cashButton).toBeEnabled();

    const layout = await page.evaluate(() => window.__wc26E2E.board());
    expect(layout.cash.top).toBeGreaterThanOrEqual(layout.pitch.bottom - 1);
    await expectNoHorizontalOverflow(page, 'Cash Out layout');
  });
});
