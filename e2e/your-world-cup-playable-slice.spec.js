import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const v1Path = new URL('../index.html', import.meta.url);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const v1AtCheckpoint = sha(execFileSync('git', ['show', 'HEAD:index.html'], { encoding: 'utf8' }));

async function enterCampaign(page) {
  await page.goto('/v2/your-world-cup-prototype');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: /start your world cup/i }).click();
  await page.getByRole('button', { name: /Argentina, Quick combinations/i }).click();
  await page.getByRole('button', { name: /choose argentina/i }).click();
  const skip = page.getByRole('button', { name: /skip draw/i });
  if (await skip.isVisible()) await skip.click();
  await page.getByRole('button', { name: /enter campaign/i }).click();
}

async function openMoment(page, plan = 'wings') {
  await page.getByRole('button', { name: /play argentina v nigeria/i }).click();
  if (plan === 'direct') await page.getByRole('button', { name: 'Direct runners' }).click();
  await page.getByRole('button', { name: /^kick off/i }).click();
  await page.getByRole('button', { name: /skip to the moment/i }).click();
  await expect(page.locator('[data-screen="moment"]')).toBeVisible();
}

async function scoreWithPitchControls(page, onFeedback) {
  await page.getByRole('button', { name: /Luna, open for a pass/i }).click();
  await page.getByRole('button', { name: /Ferreyra, open for a pass/i }).click();
  await page.getByRole('button', { name: /Shoot right goal zone/i }).click();
  await expect(page.locator('.ywc-moment-feedback')).toContainText(/goal/i);
  if (onFeedback) await onFeedback();
  await expect(page.locator('[data-screen="result"]')).toBeVisible();
}

for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1280, height: 900 }]) {
  test(`pitch controls fit and finish at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await enterCampaign(page);
    await page.getByRole('button', { name: /play argentina v nigeria/i }).click();
    await page.screenshot({ path: testInfo.outputPath(`tactics-${viewport.width}.png`), fullPage: true });
    await page.getByRole('button', { name: /^kick off/i }).click();
    await page.screenshot({ path: testInfo.outputPath(`match-tape-${viewport.width}.png`), fullPage: true });
    await page.getByRole('button', { name: /skip to the moment/i }).click();
    await expect(page.locator('[data-screen="moment"]')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`moment-open-${viewport.width}.png`), fullPage: true });
    await page.screenshot({ path: testInfo.outputPath(`moment-mid-${viewport.width}.png`), fullPage: true });
    await scoreWithPitchControls(page, () => page.screenshot({ path: testInfo.outputPath(`goal-feedback-${viewport.width}.png`), fullPage: true }));
    await page.screenshot({ path: testInfo.outputPath(`victory-${viewport.width}.png`), fullPage: true });
    await page.getByRole('button', { name: /keep the paper/i }).click();
    await page.screenshot({ path: testInfo.outputPath(`campaign-wall-${viewport.width}.png`), fullPage: true });
    const geometry = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, buttons: [...document.querySelectorAll('button')].map((button) => button.getBoundingClientRect().height) }));
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
    expect(geometry.buttons.every((height) => height >= 48)).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('u26v2.predictions.local'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('u26v2.auth'))).toBeNull();
  });
}

test('keyboard, reload, reduced motion, malformed state, isolation, and V1 stay safe', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterCampaign(page);
  await openMoment(page);
  await page.keyboard.press('1'); await page.keyboard.press('4'); await page.keyboard.press('e');
  await expect(page.locator('[data-screen="result"]')).toBeVisible();
  await page.getByRole('button', { name: /keep the paper/i }).click();
  await expect(page.locator('[data-screen="campaign"]')).toBeVisible();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterCampaign(page);
  await openMoment(page, 'direct');
  await page.getByRole('button', { name: /Ferreyra, lane closing/i }).click();
  await expect(page.getByRole('button', { name: /pin it up/i })).toBeVisible();

  await page.goto('/v2/your-world-cup-prototype');
  await page.evaluate(() => localStorage.setItem('u26v2.your-world-cup.campaign', '{malformed'));
  await page.reload();
  await expect(page.locator('[data-screen="opening"]')).toBeVisible();
  await page.goto('/');
  await expect(page.locator('.ywc-prototype')).toHaveCount(0);
  expect(sha(readFileSync(v1Path))).toBe(v1AtCheckpoint);
});

test('restores an in-progress pitch action after reload', async ({ page }) => {
  await enterCampaign(page);
  await openMoment(page);
  await page.getByRole('button', { name: /Luna, open for a pass/i }).click();
  await page.reload();
  await expect(page.locator('[data-screen="moment"]')).toBeVisible();
  await expect(page.locator('.ywc-moment-timer')).toContainText(/Ball: Luna/i);
});

test('captures a saved shot and its negative result', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterCampaign(page); await openMoment(page);
  await page.getByRole('button', { name: /Luna, open for a pass/i }).click();
  await page.getByRole('button', { name: /Ferreyra, open for a pass/i }).click();
  await page.getByRole('button', { name: /Shoot center goal zone/i }).click();
  await expect(page.locator('.ywc-moment-feedback')).toContainText(/saved/i);
  await page.screenshot({ path: testInfo.outputPath('save-feedback-390.png'), fullPage: true });
  await expect(page.locator('[data-screen="result"]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('negative-390.png'), fullPage: true });
});

for (const [name, action] of [['complete-success', scoreWithPitchControls], ['closed-lane-failure', async (page) => { await page.getByRole('button', { name: /Ferreyra, lane closing/i }).click(); await expect(page.getByRole('button', { name: /pin it up/i })).toBeVisible(); }]]) {
  test(`records ${name} flow`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: testInfo.outputPath('recording'), size: { width: 390, height: 844 } }, serviceWorkers: 'block' });
    const page = await context.newPage();
    await enterCampaign(page); await openMoment(page); await action(page);
    const video = page.video(); await context.close(); await video?.saveAs(testInfo.outputPath(`${name}.webm`));
  });
}
