const { test, expect } = require('@playwright/test');
const { gotoApp, expectNoHorizontalOverflow } = require('./helpers');

// Targeted UI checks for the Matchup Explorer scenario experience.
// These are presentation-only assertions over the existing matchupIntelligence()
// engine. They never touch navigation/scroll behaviour and take no screenshots,
// so screenshot baselines are untouched.

async function openExplorer(page) {
  await page.locator('.tabbar button[data-screen="matches"]').click({ force: true });
  await page.locator('.tour-switch button[data-sub="bracket"]').click({ force: true });
  const entry = page.locator('.mx-entry');
  await expect(entry).toBeVisible();
  await entry.click({ force: true });
  await expect(page.locator('#scrim.on')).toBeVisible();
}

test.describe('Matchup Explorer scenario experience', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page, 'final-matchday');
  });

  test('entry opens the explorer and the Swap affordance is gone', async ({ page }) => {
    await openExplorer(page);
    await expect(page.locator('.mx-pickrow')).toBeVisible();
    // Swap must be absent everywhere.
    await expect(page.locator('.mx-swap')).toHaveCount(0);
    const swapText = await page.locator('#sheet').evaluate((el) => /\bswap\b/i.test(el.textContent || ''));
    expect(swapText).toBe(false);
    await expectNoHorizontalOverflow(page, 'explorer sheet');
  });

  test('search input is at least 16px and filtering narrows results', async ({ page }) => {
    await openExplorer(page);
    await page.locator('.mx-slot').first().click({ force: true });
    const input = page.locator('#mxSearchInput');
    await expect(input).toBeVisible();

    const fontPx = await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontPx).toBeGreaterThanOrEqual(16);

    const before = await page.locator('.mx-tm').count();
    await input.fill('bra');
    const after = await page.locator('.mx-tm').count();
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
  });

  test('a filtered result selects immediately and the same team is then blocked', async ({ page }) => {
    await openExplorer(page);

    // Pick the first team straight from a filtered result.
    await page.locator('.mx-slot').first().click({ force: true });
    // GROUPS / nm / matchupIntelligence are const/function lexical globals in the
    // page's classic script, reachable as bare identifiers (not window properties).
    const code = await page.evaluate(() => {
      const all = Object.keys(GROUPS).flatMap((g) => GROUPS[g]);
      return all[0];
    });
    const firstName = await page.evaluate((c) => nm(c), code);
    await page.locator('#mxSearchInput').fill(firstName);
    const result = page.locator('.mx-tm:not(.dis)', { hasText: firstName }).first();
    await expect(result).toBeVisible();
    await result.click({ force: true });

    // Selection registered immediately, and the flow auto-advances to choosing
    // the second team (its search field is shown, ready to type).
    await expect.poll(() => page.evaluate(() => _mxState.a)).toBe(code);
    await expect.poll(() => page.evaluate(() => _mxState.pickFor)).toBe('B');
    await expect(page.locator('#mxSearchInput')).toBeVisible();

    // The already-chosen team is offered but disabled (cannot pick twice).
    await page.locator('#mxSearchInput').fill(firstName);
    const sameTeam = page.locator('.mx-tm', { hasText: firstName }).first();
    await expect(sameTeam).toBeVisible();
    await expect(sameTeam).toBeDisabled();
  });

  test('primary scenario route renders with alternates and no raw labels', async ({ page }) => {
    await openExplorer(page);

    // Pick the pair the engine reports with the most scenario routes, then render
    // the result through the real explorer state. (GROUPS / matchupIntelligence are
    // bare lexical globals, not window properties, in the page's classic script.)
    const pick = await page.evaluate(() => {
      const all = Object.keys(GROUPS).flatMap((g) => GROUPS[g]);
      let best = null;
      let bestN = 0;
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          const n = (matchupIntelligence(all[i], all[j]).scenarioRoutes || []).length;
          if (n > bestN) { bestN = n; best = { a: all[i], b: all[j], n }; }
        }
      }
      return best;
    });
    expect(pick, 'expected at least one pair with a scenario route').not.toBeNull();
    expect(pick.n).toBeGreaterThan(0);

    await page.evaluate(({ a, b }) => {
      mxOpen();
      _mxState.a = a;
      _mxState.b = b;
      _mxState.view = 'select';
      _mxState.pickFor = null;
      _mxRenderSheet();
    }, pick);

    await expect(page.locator('text=Fastest way they can meet')).toBeVisible();
    await expect(page.locator('.mx-route').first()).toBeVisible();
    await expect(page.locator('.mx-route .mx-mcard').first()).toBeVisible();
    // Two team columns with explicit finishes.
    await expect(page.locator('.mx-route .mx-rcol')).toHaveCount(2);
    await expect(page.locator('.mx-rfinv').first()).toBeVisible();
    // Honest alternates: when the engine offers more than one route, they appear in
    // a collapsed section that expands to real, distinct routes.
    if (pick.n > 1) {
      const alts = page.locator('.mx-alts');
      await expect(alts).toBeVisible();
      await alts.locator('summary').first().click({ force: true });
      await expect(page.locator('.mx-alt').first()).toBeVisible();
    }

    // No raw engine enums / internal labels may leak into the rendered copy.
    const leaked = await page.locator('#sheet').evaluate((el) => {
      const t = el.textContent || '';
      return /group_finish|best_third|third_allocation|knockout_advancement|knockout_result|official_result_dependency|requiredEntrySlot|recommendedPrimaryRoute|TP3|matchupIntel/.test(t);
    });
    expect(leaked).toBe(false);

    await expectNoHorizontalOverflow(page, 'explorer result');
  });
});
