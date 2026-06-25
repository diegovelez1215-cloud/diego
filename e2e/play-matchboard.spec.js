const { test, expect } = require('@playwright/test');
const {
  gotoApp,
  expectNoHorizontalOverflow,
  expectRectsInsideViewport,
  screenshot
} = require('./helpers');

test.describe('Play and Matchboard rendered runtime', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page, 'final-matchday');
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

  test('Speed Up is at least 3x faster and settlement remains single-path', async ({ page }) => {
    await page.evaluate(() => window.__wc26E2E.startMatchboard());
    const ratio = await page.evaluate(() => window.__wc26E2E.speedRatio());
    expect(ratio).toBeGreaterThanOrEqual(3);

    const result = await page.evaluate(() => window.__wc26E2E.runFastToResult());
    expect(result.ratio).toBeGreaterThanOrEqual(3);
    expect(result.settled).toBe(1);
    expect(result.bank).toBeGreaterThan(9900);

    const after = await page.evaluate(() => window.__wc26E2E.runFastToResult());
    expect(after.settled).toBe(1);
    expect(after.bank).toBe(result.bank);
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
