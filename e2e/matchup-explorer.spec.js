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

  // Render the highest-route pair directly through the real explorer state.
  // GROUPS / matchupIntelligence are bare lexical globals (not window props).
  async function renderBestPair(page) {
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
      _mxState.a = a; _mxState.b = b; _mxState.view = 'select'; _mxState.pickFor = null;
      _mxRenderSheet();
    }, pick);
    return pick;
  }

  test('primary route, open alternates, collapsed extras, and no raw labels', async ({ page }) => {
    await openExplorer(page);
    const pick = await renderBestPair(page);

    await expect(page.locator('text=Fastest way they can meet')).toBeVisible();
    await expect(page.locator('.mx-route').first()).toBeVisible();
    await expect(page.locator('.mx-route .mx-mcard').first()).toBeVisible();
    await expect(page.locator('.mx-route .mx-rcol')).toHaveCount(2);
    await expect(page.locator('.mx-rfinv').first()).toBeVisible();

    // First up-to-three alternates are visible WITHOUT opening any collapsed control.
    const alts = pick.n - 1;
    const expectedOpen = Math.min(3, alts);
    await expect(page.locator('.mx-altlist-open > details.mx-alt')).toHaveCount(expectedOpen);
    if (expectedOpen > 0) await expect(page.locator('.mx-altlist-open > details.mx-alt').first()).toBeVisible();

    // Extras beyond the first three live in a quiet collapsed control.
    if (alts > 3) {
      await expect(page.locator('.mx-alts > summary')).toHaveText(/See \d+ more possible routes?/);
      await expect(page.locator('.mx-alts .mx-altlist > details.mx-alt')).toHaveCount(alts - 3);
    } else {
      await expect(page.locator('.mx-alts')).toHaveCount(0);
    }

    // No raw engine enums / internal labels may leak into rendered copy.
    const leaked = await page.locator('#sheet').evaluate((el) => /group_finish|best_third|third_allocation|knockout_advancement|knockout_result|official_result_dependency|requiredEntrySlot|recommendedPrimaryRoute|TP3|matchupIntel/.test(el.textContent || ''));
    expect(leaked).toBe(false);

    await expectNoHorizontalOverflow(page, 'explorer result');
  });

  test('route comparison stacks vertically at phone width with clean step text', async ({ page }) => {
    await openExplorer(page);
    await renderBestPair(page);

    // Team route cards stack (single column) on phones — never squeezed side-by-side.
    const dir = await page.locator('.mx-route .mx-rcols').first().evaluate((el) => getComputedStyle(el).flexDirection);
    expect(dir).toBe('column');

    // Order within the primary route: team card, team card, then the meeting card.
    const order = await page.locator('.mx-route').first().evaluate((el) => {
      const kids = Array.from(el.children).map((c) => c.className);
      const cols = kids.findIndex((c) => /mx-rcols/.test(c));
      const meet = kids.findIndex((c) => /mx-mcard/.test(c));
      return { cols, meet, colCount: el.querySelectorAll('.mx-rcols > .mx-rcol').length };
    });
    expect(order.colCount).toBe(2);
    expect(order.cols).toBeLessThan(order.meet);

    // No dark per-word/per-step background rectangles behind advancement steps.
    const stepBgs = await page.locator('.mx-rstep').evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).backgroundColor));
    expect(stepBgs.length).toBeGreaterThan(0);
    for (const bg of stepBgs) {
      expect(bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent').toBe(true);
    }
  });

  test('third-place routes say "Lose the Semi-final" and are clearly labelled', async ({ page }) => {
    await openExplorer(page);
    // Two teams in the same group can only meet again via the Third-place match.
    const pair = await page.evaluate(() => {
      for (const g of Object.keys(GROUPS)) {
        const teams = GROUPS[g];
        for (let i = 0; i < teams.length; i++) {
          for (let j = i + 1; j < teams.length; j++) {
            const r = matchupIntelligence(teams[i], teams[j]);
            if ((r.scenarioRoutes || []).some((x) => x.target && x.target.round === 'Third-place match')) {
              return { a: teams[i], b: teams[j] };
            }
          }
        }
      }
      return null;
    });
    test.skip(!pair, 'no third-place route available in this state');

    await page.evaluate(({ a, b }) => {
      mxOpen();
      _mxState.a = a; _mxState.b = b; _mxState.view = 'select'; _mxState.pickFor = null;
      _mxRenderSheet();
      // Open every route detail so the advancement chain is rendered.
      document.querySelectorAll('#mxResult details').forEach((d) => { d.open = true; });
    }, pair);

    const txt = await page.locator('#mxResult').evaluate((el) => el.textContent || '');
    expect(txt).toContain('Lose the Semi-final');
    expect(txt).toContain('only if both teams lose their Semi-finals');
    // The old vague phrasing must be gone.
    expect(txt).not.toContain('but not the Final');
  });

  test('a state-fingerprint refresh keeps the selected teams and the open sheet', async ({ page }) => {
    await openExplorer(page);
    const pick = await renderBestPair(page);
    await expect(page.locator('#mxResult .mx-hero')).toBeVisible();

    // Force a stale fingerprint, then run the refresh the focus/visibility hooks use.
    const after = await page.evaluate(() => {
      _mxState.fp = '__stale__';
      mxRefreshIfStale();
      return { a: _mxState.a, b: _mxState.b, fp: _mxState.fp };
    });
    expect(after.a).toBe(pick.a);
    expect(after.b).toBe(pick.b);
    expect(after.fp).not.toBe('__stale__'); // refreshed to the real official fingerprint
    await expect(page.locator('#mxResult .mx-hero')).toBeVisible();
    await expect(page.locator('#scrim.on')).toBeVisible();
  });
});
