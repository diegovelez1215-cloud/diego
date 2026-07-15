import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const v1Path = new URL('../index.html', import.meta.url);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const momentHash = (value) => [...value].reduce((total, character) => ((total * 33) + character.charCodeAt(0)) >>> 0, 5381);
const v1AtCheckpoint = sha(execFileSync('git', ['show', 'HEAD:index.html'], { encoding: 'utf8' }));
const sentinels = Object.freeze({
  'u26v2.predictions.local': '{"sentinel":"prediction-bytes-v1"}',
  'u26v2.auth': '{"sentinel":"auth-bytes-v1"}',
  'u26v2.play': '{"sentinel":"v1-play-bytes-v1"}',
});

async function seedSentinels(page) {
  await page.evaluate((values) => { localStorage.clear(); Object.entries(values).forEach(([key, value]) => localStorage.setItem(key, value)); }, sentinels);
}

async function expectSentinels(page) {
  await expect(page.evaluate((values) => Object.fromEntries(Object.keys(values).map((key) => [key, localStorage.getItem(key)])), sentinels)).resolves.toEqual(sentinels);
}

async function enterCampaign(page) {
  await page.goto('/v2/your-world-cup-prototype');
  await seedSentinels(page); await page.reload();
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

async function passAndSettle(page, name) {
  await page.getByRole('button', { name }).click();
  await expect(page.locator('[data-screen="moment"]')).toHaveAttribute('aria-busy', 'true');
  await page.waitForTimeout(350);
  await expect(page.locator('[data-screen="moment"]')).toHaveAttribute('aria-busy', 'false');
}

async function scoreWithVisiblePressure(page, onFirstPass) {
  await passAndSettle(page, /Luna, open for a pass/i);
  if (onFirstPass) await onFirstPass();
  await passAndSettle(page, /Ferreyra, open for a pass/i);
  const tick = Number((await page.locator('.ywc-score-bug').textContent())?.match(/\+\s*(\d+)/)?.[1] ?? 0);
  const zone = ['right', 'left'].sort((a, b) => (momentHash(`26062026:4-3-3-wide:wings:${tick}:${b}`) % 13) - (momentHash(`26062026:4-3-3-wide:wings:${tick}:${a}`) % 13))[0];
  await page.getByRole('button', { name: `Shoot ${zone} goal zone` }).click();
  await expect(page.locator('.ywc-moment-feedback')).toContainText(/goal/i);
  await page.waitForTimeout(500);
  await expect(page.locator('[data-screen="result"]')).toBeVisible();
}

for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1280, height: 900 }, { width: 1440, height: 1000 }]) {
  test(`pressure is observable and usable at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport); await enterCampaign(page); await openMoment(page);
    const open = await page.locator('[data-screen="moment"]').screenshot({ path: testInfo.outputPath(`moment-open-${viewport.width}.png`) });
    if (viewport.width === 1440) {
      const geometry = await page.evaluate(() => {
        const score = document.querySelector('.ywc-score-bug')?.getBoundingClientRect(); const timer = document.querySelector('.ywc-moment-timer')?.getBoundingClientRect();
        return { width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, pitch: !!document.querySelector('.ywc-play-panel'), score: score ? score.bottom <= innerHeight : false, timer: timer ? timer.bottom <= innerHeight : false };
      });
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.width); expect(geometry.pitch).toBe(true); expect(geometry.score).toBe(true); expect(geometry.timer).toBe(true);
    }
    await scoreWithVisiblePressure(page, async () => {
      await expect(page.locator('.ywc-moment-timer')).toContainText(/Ball: Luna/i);
      await expect(page.locator('.ywc-score-bug')).toContainText(/\+ 1/);
      const mid = await page.locator('[data-screen="moment"]').screenshot({ path: testInfo.outputPath(`moment-mid-${viewport.width}.png`) });
      expect(sha(mid)).not.toBe(sha(open));
    });
    await page.screenshot({ path: testInfo.outputPath(`victory-${viewport.width}.png`), fullPage: true });
    await expectSentinels(page);
  });
}

test('storage sentinels survive failure, campaign reset, and reload', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 }); await enterCampaign(page); await openMoment(page, 'direct');
  await page.getByRole('button', { name: /Ferreyra, lane closing/i }).click();
  await expect(page.locator('.ywc-moment-feedback')).toContainText(/closed|cut it out/i);
  await page.screenshot({ path: testInfo.outputPath('negative-feedback-390.png'), fullPage: true });
  await expect(page.getByRole('button', { name: /pin it up/i })).toBeVisible();
  await expectSentinels(page);
  await page.getByRole('button', { name: /pin it up/i }).click();
  await page.getByRole('button', { name: /reset this slice/i }).click();
  await expect(page.evaluate(() => localStorage.getItem('u26v2.your-world-cup.campaign'))).resolves.toBeNull();
  await expectSentinels(page); await page.reload(); await expectSentinels(page);
  await page.goto('/'); await expect(page.locator('.ywc-prototype')).toHaveCount(0); expect(sha(readFileSync(v1Path))).toBe(v1AtCheckpoint);
});

test('keyboard controls respect the pass lock and restore exact progress', async ({ page }) => {
  await enterCampaign(page); await openMoment(page);
  await page.keyboard.press('1'); await page.keyboard.press('4');
  await page.waitForTimeout(350); await page.keyboard.press('4'); await page.waitForTimeout(350); await page.keyboard.press('e');
  await expect(page.locator('[data-screen="result"]')).toBeVisible(); await expectSentinels(page);
  await page.reload(); await expect(page.locator('[data-screen="result"]')).toBeVisible(); await expectSentinels(page);
});

for (const [name, action] of [
  ['complete-success', async (page) => scoreWithVisiblePressure(page)],
  ['closed-lane-failure', async (page) => { await page.getByRole('button', { name: /Ferreyra, lane closing/i }).click(); await page.waitForTimeout(900); await expect(page.getByRole('button', { name: /pin it up/i })).toBeVisible(); }],
]) {
  test(`records ${name} flow with observable pauses`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: testInfo.outputPath('recording'), size: { width: 390, height: 844 } }, serviceWorkers: 'block' });
    const page = await context.newPage(); await enterCampaign(page); await openMoment(page); await action(page); await expectSentinels(page);
    const video = page.video(); await context.close(); await video?.saveAs(testInfo.outputPath(`${name}.webm`));
  });
}
