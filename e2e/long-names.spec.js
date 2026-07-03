// Long country names must fit cleanly at mobile widths: single-word names
// (Switzerland, Netherlands, Argentina) never break mid-word — they render on
// one line — and no team-name element overflows its container. Multi-word
// names (Bosnia & Herzegovina, Korea Republic) may wrap at word boundaries.
import { test, expect } from '@playwright/test';
import { gotoApp, openPlayMode, openTournamentSection, screenshot } from './helpers.js';

async function singleWordWraps(page, selector) {
  return page.$$eval(selector, (els) => {
    const bad = [];
    for (const el of els) {
      const text = (el.textContent || '').trim();
      // strip a leading flag emoji token if present
      const name = text.replace(/^[^A-Za-zÀ-ž]+/, '').trim();
      if (!name || /\s/.test(name)) continue; // multi-word may wrap at spaces
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 18;
      const h = el.getBoundingClientRect().height;
      if (h > lh * 1.7) bad.push(`${name} (${Math.round(h)}px)`);
    }
    return bad;
  });
}

async function overflowing(page, selector) {
  return page.$$eval(selector, (els) => {
    const bad = [];
    for (const el of els) {
      if (el.scrollWidth > el.clientWidth + 2) bad.push((el.textContent || '').trim().slice(0, 24));
    }
    return bad;
  });
}

test('long country names fit without mid-word breaks across key surfaces', async ({ page }, testInfo) => {
  await gotoApp(page);

  // World Cup hero team names
  expect(await singleWordWraps(page, '.outlet.active .ss-name'), 'hero names single-line when single-word').toEqual([]);

  // Matches, All Dates — every canonical fixture row
  await openTournamentSection(page, 'matches');
  await page.locator('[data-segmented="matches-date"] [data-value="all"]').click();
  await page.waitForSelector('.outlet.active .matches-list .mr-name');
  expect(await singleWordWraps(page, '.outlet.active .mr-name'), 'match-row single-word names on one line').toEqual([]);
  expect(await overflowing(page, '.outlet.active .mr-name'), 'match-row names do not overflow').toEqual([]);
  await screenshot(page, testInfo, 'long-names-matches');

  // Full Road cards — Switzerland, Bosnia & Herzegovina, Côte d'Ivoire live here
  await openTournamentSection(page, 'knockout');
  await page.waitForSelector('.outlet.active .road-team-name');
  expect(await singleWordWraps(page, '.outlet.active .road-team-name'), 'road single-word names on one line').toEqual([]);
  expect(await overflowing(page, '.outlet.active .road-team-name'), 'road names do not overflow').toEqual([]);
  await screenshot(page, testInfo, 'long-names-road');

  // Prediction Run pick buttons — Bosnia & Herzegovina must not collapse to an ellipsis
  await openPlayMode(page, 'prediction');
  await page.waitForSelector('.outlet.active .pr-side');
  await expect(page.locator('.outlet.active .pr-side', { hasText: 'Bosnia & Herzegovina' })).toBeVisible();
  expect(await overflowing(page, '.outlet.active .pr-side'), 'prediction names do not overflow').toEqual([]);
  await screenshot(page, testInfo, 'long-names-prediction');
});
