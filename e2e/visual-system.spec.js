const { test, expect } = require('@playwright/test');
const { gotoApp, expectNoHorizontalOverflow, expectRectsInsideViewport } = require('./helpers');

// Presentation-only checks for the premium Official / Virtual-Play visual system.
// No engine, navigation, wallet, odds, or simulation logic is exercised or changed.
// No screenshots are taken, so baselines are untouched.

const TRACKING = /\bsimulat|\bdanger\b|\bpossession\b|player position|ball movement|heat ?map|\bvirtual\b/i;

async function openMatchupPicker(page) {
  await page.locator('.tabbar button[data-screen="matches"]').click({ force: true });
  await page.locator('.tour-switch button[data-sub="bracket"]').click({ force: true });
  await page.locator('.mx-entry').click({ force: true });
  await expect(page.locator('#scrim.on')).toBeVisible();
  await page.locator('.mx-slot').first().click({ force: true });
  await expect(page.locator('#mxSearchInput')).toBeVisible();
}

test.describe('Premium Official / Virtual-Play visual system', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page, 'final-matchday');
  });

  test('Official Match Center stays factual — no simulation/danger/tracking language', async ({ page }) => {
    // Official fixtures render through sheet() in factual (real) mode.
    const offenders = await page.evaluate((reSrc) => {
      const re = new RegExp(reSrc, 'i');
      const bad = [];
      [1, 2, 3, 25, 40].forEach((n) => {
        try {
          sheet(n);
          const t = document.getElementById('sheet').textContent || '';
          if (re.test(t)) bad.push({ n, hit: (t.match(re) || [])[0] });
        } catch (e) { /* fixture may not exist; ignore */ }
      });
      return bad;
    }, TRACKING.source);
    expect(offenders, JSON.stringify(offenders)).toEqual([]);
  });

  test('Simulation and Play surfaces clearly disclose virtual / SIM $ / no real money', async ({ page }) => {
    await page.locator('.tabbar button[data-screen="bet"]').click({ force: true });
    const disc = page.locator('.play-disclosure');
    await expect(disc).toBeVisible();
    await expect(disc).toContainText(/SIM \$/);
    await expect(disc).toContainText(/NO REAL MONEY/i);

    // The animated matchcast is unmistakably a virtual simulation.
    const mc = await page.evaluate(() => matchcastHTML(1));
    expect(mc).toMatch(/SIMULATED MATCHCAST/);
    expect(mc).toMatch(/Virtual match/);
    expect(mc).toMatch(/No real money/);
    expect(mc).toMatch(/Does not affect official results/);
  });

  test('Ticket controls stay reachable inside the viewport and Cash Out is wired', async ({ page }) => {
    await page.evaluate(() => window.__wc26E2E.openTicketBuilder());
    await expect(page.locator('#tkStake')).toBeVisible();
    await expect(page.locator('#tkPlace')).toBeVisible();
    await expect(page.locator('.tk-bal')).toContainText(/SIM/i);
    // The place control must sit fully inside the viewport (not clipped/covered).
    await expectRectsInsideViewport(page, '#tkPlace', 'place control');
    const hasCashOut = await page.evaluate(() => typeof window.cashOut === 'function');
    expect(hasCashOut).toBe(true);
  });

  test('Matchup picker is one integrated dark surface — no blue/navy fill', async ({ page }) => {
    await openMatchupPicker(page);
    const colors = await page.evaluate(() => {
      const input = document.getElementById('mxSearchInput');
      const chip = document.querySelector('.mx-tm');
      return {
        input: getComputedStyle(input).backgroundColor,
        chip: chip ? getComputedStyle(chip).backgroundColor : null
      };
    });
    // The old fills were the panel blue --bg2 (rgb(16,22,74)) and --card (rgb(40,52,118)).
    for (const c of [colors.input, colors.chip]) {
      expect(c).not.toBe('rgb(16, 22, 74)');
      expect(c).not.toBe('rgb(40, 52, 118)');
      expect(c).toMatch(/rgba?\(255,\s*255,\s*255/); // neutral translucent wash
    }
  });

  test('long team names stay inside the viewport in the picker and results', async ({ page }) => {
    await openMatchupPicker(page);
    await expectRectsInsideViewport(page, '.mx-tm .mx-tm-nm', 'picker team names');
    await expectNoHorizontalOverflow(page, 'picker');

    await page.evaluate(() => {
      mxOpen();
      _mxState.a = 'BIH'; _mxState.b = 'KSA'; _mxState.view = 'select'; _mxState.pickFor = null;
      _mxRenderSheet();
    });
    for (const sel of ['.mx-hero-fl .n', '.mx-q', '.mx-rteam .n']) {
      await expectRectsInsideViewport(page, sel, sel);
    }
    await expectNoHorizontalOverflow(page, 'result with long names');
  });

  test('no page-level horizontal overflow across Play, picker, and a match sheet', async ({ page }) => {
    await page.locator('.tabbar button[data-screen="bet"]').click({ force: true });
    await expectNoHorizontalOverflow(page, 'Play');

    await page.evaluate(() => { sheet(1); });
    await expect(page.locator('#scrim.on')).toBeVisible();
    await expectNoHorizontalOverflow(page, 'official match sheet');
    await page.locator('.sheet-x').click({ force: true }).catch(() => {});

    await openMatchupPicker(page);
    await expectNoHorizontalOverflow(page, 'matchup picker');
  });
});

test.describe('Reduced motion is respected', () => {
  test.use({ reducedMotion: 'reduce' });
  test('animated transitions collapse under prefers-reduced-motion', async ({ page }) => {
    await gotoApp(page, 'final-matchday');
    await page.locator('.tabbar button[data-screen="matches"]').click({ force: true });
    await page.locator('.tour-switch button[data-sub="bracket"]').click({ force: true });
    const dur = await page.locator('.mx-entry').evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration) || 0);
    // The global reduced-motion rule forces transition-duration to ~0.
    expect(dur).toBeLessThan(0.05);
  });
});
