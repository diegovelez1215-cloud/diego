const { test, expect } = require('@playwright/test');
const { gotoApp, expectNoHorizontalOverflow } = require('./helpers');

// Explicitly walk the real app flow to a Tournament sub-surface and wait for it to
// be the active screen before any assertion. Tournament tab maps to the Matches
// (schedule) sub by default; other subs are reached via the segmented control.
async function openTournament(page, sub) {
  const tabbar = page.locator('nav.tabbar[role="tablist"]');
  await expect(tabbar).toBeVisible();
  await tabbar.getByRole('button', { name: 'Tournament' }).click();
  const tournament = page.locator('main.wrap > section#scr-matches.screen.on');
  await expect(tournament).toBeVisible();
  await expect(tournament.locator('#schedule.subview.on')).toBeVisible();
  if (sub && sub !== 'schedule') {
    const sectionButton = tournament.locator(`.tour-switch button[data-sub="${sub}"]`);
    await expect(sectionButton).toBeVisible();
    await sectionButton.click();
    await expect(tournament.locator(`.tour-switch button[data-sub="${sub}"].on`)).toBeVisible();
  }
  await expect(tournament.locator(`#${sub || 'schedule'}.subview.on`)).toBeVisible();
}

test.describe('Matches date navigator', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page, 'final-matchday');
    await openTournament(page, 'schedule');
    await expect(page.locator('#scr-matches.screen.on #schedule.subview.on .date-nav')).toBeVisible(); // wait for the Matches view
  });

  test('navigator is visible, in-flow (not fixed/sticky), and does not cover rows', async ({ page }) => {
    const nav = page.locator('#scr-matches.screen.on #schedule.subview.on .date-nav');
    await expect(nav).toBeVisible();
    await expect(nav.locator('.dn-btn', { hasText: /^Today$/ })).toBeVisible();
    await expect(nav.locator('.dn-btn', { hasText: /^Tomorrow$/ })).toBeVisible();
    // The navigator sits entirely above the first fixture row (no vertical overlap).
    const boxes = await page.waitForFunction(() => {
      const navEl = document.querySelector('#scr-matches.screen.on #schedule.subview.on .date-nav');
      const rowEl = document.querySelector('#scr-matches.screen.on #schedule.subview.on .daygrp .mrow');
      if (!navEl || !rowEl) return null;
      const pos = getComputedStyle(navEl).position;
      if (!pos) return null;
      const navBox = navEl.getBoundingClientRect();
      const firstRow = rowEl.getBoundingClientRect();
      if (!navBox.width || !navBox.height || !firstRow.width || !firstRow.height) return null;
      return {
        pos,
        navBox: { y: navBox.y, height: navBox.height },
        firstRow: { y: firstRow.y }
      };
    });
    const { pos, navBox, firstRow } = await boxes.jsonValue();
    expect(['static', 'relative']).toContain(pos); // never fixed/sticky => cannot overlay content
    expect(navBox).not.toBeNull();
    expect(firstRow).not.toBeNull();
    expect(navBox.y + navBox.height).toBeLessThanOrEqual(firstRow.y + 1);
    await expectNoHorizontalOverflow(page, 'Matches date navigator');
  });

  test('Today jumps to the first unfinished fixture window today', async ({ page }) => {
    const targetNum = await page.evaluate(() => schedFirstUnfinishedToday());
    expect(targetNum).not.toBeNull();
    await page.locator('#scr-matches.screen.on #schedule.subview.on .date-nav .dn-btn', { hasText: /^Today$/ }).click();
    await page.waitForTimeout(700); // smooth-scroll settle
    const box = await page.locator(`#fx-${targetNum}`).boundingBox();
    expect(box).not.toBeNull();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeLessThan(220); // near the top, below the sticky header
  });

  test('Tomorrow jumps to tomorrow\'s first fixture window', async ({ page }) => {
    const targetNum = await page.evaluate(() => {
      const tom = nextISO(curISO());
      const ms = MATCHES.filter((m) => m.date === tom).sort(schedSort);
      return ms.length ? ms[0].num : null;
    });
    test.skip(targetNum === null, 'no fixtures tomorrow in this fixture set');
    await page.locator('#scr-matches.screen.on #schedule.subview.on .date-nav .dn-btn', { hasText: /^Tomorrow$/ }).click();
    await page.waitForTimeout(700);
    const box = await page.locator(`#fx-${targetNum}`).boundingBox();
    expect(box).not.toBeNull();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeLessThan(220);
  });
});

test.describe('Route Explorer discovery', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page, 'final-matchday');
    await openTournament(page, 'groups');
    await expect(page.locator('#scr-matches.screen.on #groups.subview.on .fre-allbtn')).toBeVisible(); // wait for the Route Explorer entry
  });

  test('all 48 teams are reachable through Route Explorer, grouped A–L', async ({ page }) => {
    const groups = page.locator('#scr-matches.screen.on #groups.subview.on');
    await expect(groups.getByText('All 48 teams · by group')).toBeVisible();
    await groups.locator('.fre-allbtn').click();
    const sheet = page.locator('#scrim.on #sheet');
    await expect(sheet.locator('.rat-list')).toBeVisible();
    await expect(sheet.locator('.rat-chip')).toHaveCount(48);
    await expect(sheet.locator('.rat-gh')).toHaveCount(12);
  });

  test('a non-group-leader opens the correct Route Explorer view', async ({ page }) => {
    const code = await page.evaluate(() => {
      const leaders = new Set('ABCDEFGHIJKL'.split('').map((g) => {
        const st = standings(g);
        return st && st[0] ? st[0].code : null;
      }));
      return Object.keys(T).find((c) => !leaders.has(c));
    });
    expect(code).toBeTruthy();
    await page.locator('#scr-matches.screen.on #groups.subview.on .fre-allbtn').click();
    const sheet = page.locator('#scrim.on #sheet');
    await expect(sheet.locator('.rat-list')).toBeVisible();
    await sheet.locator(`button.rat-chip[onclick="routeAllTeamsGo('${code}')"]`).click();
    // Assert one intentional unique element: that team's route container.
    await expect(page.locator(`#scrim.on #sheet #fre-${code}`)).toBeVisible();
  });
});

test.describe('Bracket context', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page, 'final-matchday');
    await openTournament(page, 'bracket');
    await expect(page.locator('#scr-matches.screen.on #bracket.subview.on')).toBeVisible(); // wait for the Bracket view
  });

  test('Bracket has no CTA that simply reopens the current Bracket view', async ({ page }) => {
    const bracket = page.locator('#scr-matches.screen.on #bracket.subview.on');
    await expect(bracket.locator('.brk-rounds')).toBeVisible(); // useful controls remain
    await expect(bracket.getByText('Open the full live bracket')).toHaveCount(0);
  });
});

test.describe('Home Live Knockout placement', () => {
  test('Home Live Knockout marquee appears only in a meaningful knockout state', async ({ page }) => {
    await gotoApp(page, 'final-matchday');
    // Gating contract, evaluated in the real browser.
    const r = await page.evaluate(() => ({
      meaningful: knockoutContextMeaningful(),
      home: knockoutPulseHTML(false),
      brk: knockoutPulseHTML(true)
    }));
    if (r.meaningful) expect(r.home.length).toBeGreaterThan(0);
    else expect(r.home).toBe('');
    expect(r.brk.includes('Open the full live bracket')).toBe(false);
  });
});
