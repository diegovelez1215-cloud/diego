const { expect } = require('@playwright/test');
const path = require('node:path');

const E2E_PATH = '/?__wc26_e2e=1';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

async function freezeClock(page, iso = '2026-06-25T17:05:00-04:00') {
  await page.addInitScript((fixedIso) => {
    const RealDate = Date;
    const fixed = new RealDate(fixedIso).getTime();
    class FixedDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) super(fixed);
        else super(...args);
      }
      static now() {
        return fixed;
      }
    }
    FixedDate.UTC = RealDate.UTC;
    FixedDate.parse = RealDate.parse;
    FixedDate.prototype = RealDate.prototype;
    window.Date = FixedDate;
  }, iso);
}

async function gotoApp(page, mode = 'final-matchday') {
  await freezeClock(page);
  await page.route('**/_vercel/**', (route) => route.fulfill({ status: 204, body: '' }));
  await page.route('**/api/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ configured: false, response: [], finished: [], live: [], hold: [], goals: [], assists: [] })
  }));
  await page.goto(E2E_PATH);
  await page.waitForFunction(() => window.__wc26E2E && window.__wc26E2E.enabled);
  await page.evaluate((nextMode) => window.__wc26E2E.reset(nextMode), mode);
  await page.waitForTimeout(150);
}

async function expectNoHorizontalOverflow(page, label = 'page') {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return Math.max(doc.scrollWidth, body.scrollWidth) - Math.max(doc.clientWidth, body.clientWidth);
  });
  expect(overflow, `${label} has horizontal overflow`).toBeLessThanOrEqual(1);
}

async function expectRectsInsideViewport(page, selector, label) {
  const bad = await page.locator(selector).evaluateAll((els) => {
    const vw = document.documentElement.clientWidth;
    return els.map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, text: (el.textContent || '').trim() };
    }).filter((r) => r.left < -1 || r.right > vw + 1);
  });
  expect(bad, `${label} outside viewport`).toEqual([]);
}

async function screenshot(page, testInfo, name) {
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${testInfo.project.name}-${name}.jpg`),
    fullPage: true,
    type: 'jpeg',
    quality: 76
  });
}

async function waitForScrollY(page, expected) {
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(expected);
}

module.exports = {
  E2E_PATH,
  gotoApp,
  expectNoHorizontalOverflow,
  expectRectsInsideViewport,
  screenshot,
  waitForScrollY
};
