import { expect, test } from '@playwright/test';

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
  await expect(page.locator('[data-screen="tactics"]')).toBeVisible();
  if (plan === 'direct') await page.getByRole('button', { name: 'Direct runners' }).click();
  await page.getByRole('button', { name: /^kick off/i }).click();
  await expect(page.locator('[data-screen="match-story"]')).toBeVisible();
  await page.getByRole('button', { name: /skip to the moment/i }).click();
  await expect(page.locator('[data-screen="moment"]')).toBeVisible();
}

for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1280, height: 900 }, { width: 1440, height: 1000 }]) {
  test(`playable slice fits ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await enterCampaign(page);
    await openMoment(page);
    await page.screenshot({ path: testInfo.outputPath(`moment-${viewport.width}.png`), fullPage: true });
    const moment = page.locator('[data-screen="moment"]');
    await moment.focus(); await moment.press('1'); await moment.press('3'); await moment.press('g');
    await expect(page.locator('[data-screen="result"]')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`result-${viewport.width}.png`), fullPage: true });
    await page.getByRole('button', { name: /keep the paper/i }).click();
    await expect(page.locator('[data-screen="campaign"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Argentina v Poland/i })).toBeVisible();
    const geometry = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, buttons: [...document.querySelectorAll('button')].map((button) => button.getBoundingClientRect().height) }));
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
    expect(geometry.buttons.every((height) => height >= 48)).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('u26v2.predictions.local'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('u26v2.auth'))).toBeNull();
  });
}

test('failure, reset, direct restoration and reduced motion are safe', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterCampaign(page);
  await openMoment(page, 'direct');
  await page.getByRole('button', { name: /pass luna/i }).click();
  await expect(page.locator('[data-screen="result"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /pin it up/i })).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-screen="result"]')).toBeVisible();
  await page.getByRole('button', { name: /pin it up/i }).click();
  await page.getByRole('button', { name: /reset this slice/i }).click();
  await expect(page.getByRole('button', { name: /play argentina v nigeria/i })).toBeVisible();
  await expect(page.evaluate(() => localStorage.getItem('u26v2.your-world-cup.campaign'))).resolves.toBeNull();
});

test('records one complete mobile victory flow', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: testInfo.outputPath('recording'), size: { width: 390, height: 844 } }, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(new URL('/v2/your-world-cup-prototype', String(testInfo.project.use.baseURL)).toString());
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.getByRole('button', { name: /start your world cup/i }).click();
  await page.getByRole('button', { name: /Argentina, Quick combinations/i }).click();
  await page.getByRole('button', { name: /choose argentina/i }).click();
  await page.getByRole('button', { name: /skip draw/i }).click(); await page.getByRole('button', { name: /enter campaign/i }).click();
  await openMoment(page);
  await page.getByRole('button', { name: /pass luna/i }).click(); await page.getByRole('button', { name: /pass garay/i }).click(); await page.getByRole('button', { name: /shoot at goal/i }).click();
  await expect(page.getByRole('button', { name: /keep the paper/i })).toBeVisible();
  const video = page.video(); await context.close(); await video?.saveAs(testInfo.outputPath('390-complete-flow.webm'));
});
