import { expect, test } from '@playwright/test';

const route = '/v2/your-world-cup-prototype';
const sentinels = { 'u26v2.predictions.local': 'prediction-sentinel', 'u26v2.auth': 'auth-sentinel', 'u26v2.play': 'v1-play-sentinel' };

async function freshCampaign(page) {
  await page.goto(route); await page.evaluate((values) => { localStorage.clear(); for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value); }, sentinels); await page.reload();
  await page.getByRole('button', { name: /start new campaign/i }).click(); await page.locator('.ywc-nation-sticker').first().click();
  await expect(page.locator('[data-screen="draw"]')).toBeVisible(); await page.getByRole('button', { name: /enter campaign/i }).click();
  await page.getByRole('button', { name: /prepare/i }).click(); await page.getByRole('button', { name: /^kick off/i }).click();
  await expect(page.locator('[data-screen="match"][data-renderer="canvas-2d"]')).toBeVisible();
}

async function takeControlAndFinish(page) {
  const match = page.locator('[data-screen="match"]'); await page.getByRole('button', { name: '4×', exact: true }).click();
  await expect(match).toHaveAttribute('data-phase', 'take-control');
  await expect(page.locator('.ywc-match-canvas')).toBeVisible(); await expect(page.getByLabel('Take control').getByText('TAKE CONTROL', { exact: true })).toBeVisible();
  await page.locator('.ywc-canvas-control__passes button').first().click(); await expect(page.getByRole('button', { name: /shoot left/i })).toBeEnabled(); await page.getByRole('button', { name: /shoot left/i }).click();
  await expect(match).toHaveAttribute('data-phase', 'full-time'); await page.getByRole('button', { name: /pin result/i }).click();
}

test('Canvas match has a continuous Canvas-owned presentation, TAKE CONTROL, semantic HUD, and isolated storage', async ({ page }) => {
  const errors = []; page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); }); page.on('pageerror', (error) => errors.push(error.message));
  await freshCampaign(page); await takeControlAndFinish(page);
  await expect(page.locator('[data-screen="result"]')).toBeVisible(); await expect(page.locator('[data-screen="result"]')).toContainText(/RESULT PINNED|WALL HOLDS|CHAMPIONS/i);
  const metrics = await page.evaluate(() => window.__ywcCanvasMetrics);
  expect(metrics.frames).toBeGreaterThan(10); expect(metrics.dpr).toBeGreaterThanOrEqual(1); expect(metrics.canvas.width).toBeGreaterThan(0); expect(metrics.semanticCommits).toBeLessThan(metrics.frames);
  expect(await page.evaluate((values) => Object.fromEntries(Object.keys(values).map((key) => [key, localStorage.getItem(key)])), sentinels)).toEqual(sentinels);
  expect(await page.evaluate(() => localStorage.getItem('u26v2.your-world-cup.campaign'))).not.toBeNull(); expect(errors).toEqual([]);
});

test('Canvas match stays viewport-safe at required mobile and desktop dimensions', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 393, height: 852 }, { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport); await freshCampaign(page); const geometry = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth, canvas: document.querySelector('.ywc-match-canvas')?.getBoundingClientRect().toJSON(), controls: [...document.querySelectorAll('button:not(:disabled)')].map((button) => button.getBoundingClientRect().height) }));
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.width); expect(geometry.canvas.height).toBeGreaterThan(300); expect(Math.min(...geometry.controls)).toBeGreaterThanOrEqual(48);
  }
});
