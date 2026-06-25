const { test, expect } = require('@playwright/test');
const {
  gotoApp,
  expectNoHorizontalOverflow,
  expectRectsInsideViewport,
  screenshot
} = require('./helpers');

test.describe('Home mobile schedule', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page, 'final-matchday');
  });

  test('final matchday hero does not duplicate lower fixtures and paired windows stay paired', async ({ page }, testInfo) => {
    await expect(page.locator('.phl.final')).toBeVisible();
    await expect(page.locator('.phl-fixture')).toHaveCount(2);

    const heroNums = await page.locator('.phl-fixture').evaluateAll((els) =>
      els.map((el) => Number(el.getAttribute('data-num'))).filter(Boolean)
    );
    const rail = page.locator('.home-card').filter({ has: page.locator('.today-rail-head') });
    const lowerNums = await rail.locator('.home-fixture').evaluateAll((els) =>
      els.map((el) => {
        const click = el.getAttribute('onclick') || '';
        const match = click.match(/openSheet\((\d+)\)/);
        return match ? Number(match[1]) : null;
      }).filter(Boolean)
    );

    expect(new Set(heroNums).size).toBe(heroNums.length);
    expect(lowerNums.filter((n) => heroNums.includes(n))).toEqual([]);
    expect(lowerNums.slice(0, 4)).toEqual([57, 58, 59, 60]);

    const windowCounts = await rail.locator('.home-time-window').evaluateAll((els) =>
      els.map((el) => el.querySelectorAll('.home-fixture').length)
    );
    expect(windowCounts.slice(0, 2)).toEqual([2, 2]);

    await expectNoHorizontalOverflow(page, 'Home Final Matchday');
    await expectRectsInsideViewport(page, '.home-fixture span', 'Home group labels');
    await screenshot(page, testInfo, 'home-final-matchday');
  });

  test('later today includes every remaining fixture and keeps labels in viewport', async ({ page }, testInfo) => {
    const rail = page.locator('.home-card').filter({ has: page.locator('.today-rail-head') });
    await expect(rail).toBeVisible();
    const railText = await rail.textContent();
    expect(railText).toContain('Later today');
    expect(railText).toContain('4 matches left today');

    const lowerNums = await rail.locator('.home-fixture').evaluateAll((els) =>
      els.map((el) => Number((el.getAttribute('onclick') || '').match(/openSheet\((\d+)\)/)?.[1])).filter(Boolean)
    );
    expect(lowerNums.slice(0, 4)).toEqual([57, 58, 59, 60]);

    await expectNoHorizontalOverflow(page, 'Home Later Today');
    await expectRectsInsideViewport(page, '.home-fixture span', 'Home fixture labels');
    await screenshot(page, testInfo, 'home-later-today');
  });
});

test.describe('Tournament mobile surface', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page, 'final-matchday');
    await page.getByRole('button', { name: 'Tournament' }).click();
    await page.locator('.tour-switch button[data-sub="bracket"]').click();
    await page.waitForTimeout(200);
  });

  test('best-third qualification module is single, below bracket, and unresolved slots are not confirmed', async ({ page }, testInfo) => {
    await expect(page.locator('#knockoutPath')).toBeVisible();
    await expect(page.locator('#bestThirdQualification')).toHaveCount(1);

    const order = await page.evaluate(() => {
      const path = document.querySelector('#knockoutPath');
      const third = document.querySelector('#bestThirdQualification');
      return !!(path && third && path.compareDocumentPosition(third) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(order).toBe(true);

    const states = await page.locator('#knockoutPath .kpath-card').evaluateAll((cards) =>
      cards.map((card) => ({
        cls: card.className,
        text: card.textContent || ''
      }))
    );
    const unresolvedConfirmed = states.filter((s) =>
      !s.cls.includes('confirmed') && /Confirmed pairing|Both teams officially locked|tie confirmed/i.test(s.text)
    );
    expect(unresolvedConfirmed).toEqual([]);

    await expectNoHorizontalOverflow(page, 'Tournament bracket');
    await expectRectsInsideViewport(page, '#knockoutPath .kpath-card, #bestThirdQualification .third-qual-row', 'Tournament content');
    await screenshot(page, testInfo, 'knockout-path-qualification-table');
  });

  test('fixed controls do not cover the bracket content', async ({ page }) => {
    const overlap = await page.evaluate(() => {
      const nav = document.querySelector('.tabbar')?.getBoundingClientRect();
      const last = document.querySelector('#bestThirdQualification .third-qual-row:last-child')?.getBoundingClientRect();
      if (!nav || !last) return false;
      return last.bottom > nav.top && last.top < nav.bottom;
    });
    expect(overlap).toBe(false);
    await expectNoHorizontalOverflow(page, 'Tournament fixed controls');
  });
});
