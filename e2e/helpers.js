// United 2026 — e2e helpers. Deterministic clock, mocked provider routes,
// zero real network. AST during the tournament equals EDT, so the frozen
// instant below is 13:05 Puerto Rico time on Round-of-32 day three.
export const FROZEN_ISO = '2026-07-01T17:05:00Z';

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

export const LIVE_MATCH_80 = {
  configured: true, sourceStatus: 'fresh', isStale: false,
  response: [{ id: 9080, home: 'England', away: 'DR Congo', gh: 1, ga: 0, min: 63, status: '2H', statusLong: 'Second Half', kind: 'live', date: '2026-07-01T16:00:00Z' }],
  finished: [],
};

export const RESULTS_EMPTY = {
  configured: true, sourceStatus: 'fresh', isStale: false,
  finished: [], live: [], hold: [], scheduled: [],
};

export async function mockProviders(page, { results = RESULTS_EMPTY, live = LIVE_MATCH_80 } = {}) {
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

export async function expectNoHorizontalOverflow(page, expect, label) {
  const overflow = await page.evaluate(() => {
    const d = document.documentElement;
    return d.scrollWidth - d.clientWidth;
  });
  expect(overflow, label + ': no horizontal overflow').toBeLessThanOrEqual(1);
}

export async function screenshot(page, testInfo, name) {
  await page.screenshot({
    path: `test-results/playwright/${testInfo.project.name}-${name}.png`,
    fullPage: true,
  });
}
