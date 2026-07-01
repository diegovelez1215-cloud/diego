// United 2026 — e2e helpers. Deterministic clock and a complete mock world:
// all 72 group finals (built by the same derivation the app uses) so knockout
// identities resolve, plus a live Round-of-32 tie. Zero real network. AST
// equals EDT during the tournament; the frozen instant is 13:05 in Puerto
// Rico on Round-of-32 day three.
import { fullResultsPayload, livePayloadFor, OK } from '../tests/mock-provider.mjs';

export const FROZEN_ISO = '2026-07-01T17:05:00Z';
export const LIVE_FIXTURE = 80;

export async function freezeClock(page, iso = FROZEN_ISO) {
  const fixed = new Date(iso).getTime();
  await page.addInitScript((fixedNow) => {
    const RealDate = Date;
    class FrozenDate extends RealDate {
      constructor(...args) { super(...(args.length ? args : [fixedNow])); }
      static now() { return fixedNow; }
    }
    // eslint-disable-next-line no-global-assign
    Date = FrozenDate;
  }, fixed);
}

export const RESULTS_FULL = fullResultsPayload();
export const LIVE_80 = livePayloadFor(LIVE_FIXTURE, { gh: 1, ga: 0, min: 63 });
export const RESULTS_EMPTY = { ...OK, finished: [], live: [], hold: [], scheduled: [] };
export const OUTAGE = { configured: false, finished: [], live: [], hold: [], scheduled: [], response: [] };

export async function mockProviders(page, { results = RESULTS_FULL, live = LIVE_80 } = {}) {
  await page.route('**/_vercel/**', (r) => r.fulfill({ status: 204, body: '' }));
  await page.route('**/api/results*', (r) => r.fulfill({ json: results }));
  await page.route('**/api/live*', (r) => r.fulfill({ json: live }));
}

export async function gotoApp(page, opts = {}) {
  await freezeClock(page, opts.iso);
  await mockProviders(page, opts);
  await page.goto('/');
  await page.waitForSelector('.dock');
  await page.waitForSelector('.score-stage');
}

export async function tapTab(page, tab) {
  await page.locator(`.dock-tab[data-tab="${tab}"]`).click();
}

export async function openTournamentSection(page, section) {
  await tapTab(page, 'tournament');
  await page.locator(`[data-segmented="tournament-view"] [data-value="${section}"]`).click();
}

export async function openPlayMode(page, mode) {
  await tapTab(page, 'play');
  await page.locator(`[data-segmented="play-mode"] [data-value="${mode}"]`).click();
}

export async function expectNoHorizontalOverflow(page, expect, label) {
  const overflow = await page.evaluate(() => {
    const d = document.documentElement;
    return d.scrollWidth - d.clientWidth;
  });
  expect(overflow, label + ': no horizontal overflow').toBeLessThanOrEqual(1);
}

export async function screenshot(page, testInfo, name) {
  await page.waitForTimeout(250); // let 140ms control transitions settle
  await page.screenshot({
    path: `test-results/playwright/${testInfo.project.name}-${name}.png`,
    fullPage: true,
  });
}
