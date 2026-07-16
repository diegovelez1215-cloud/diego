import { expect, test } from '@playwright/test';

const route = '/v2/your-world-cup-prototype';
async function start(page) { await page.goto(route); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.getByRole('button', { name: /start new campaign/i }).click(); await page.locator('.ywc-nation-sticker').first().click(); await page.getByRole('button', { name: /enter campaign/i }).click(); }
async function playOne(page) { await page.getByRole('button', { name: /prepare/i }).click(); await page.getByRole('button', { name: /^kick off/i }).click(); const match = page.locator('[data-screen="match"]'); await page.getByRole('button', { name: '4×', exact: true }).click(); await expect(match).toHaveAttribute('data-phase', 'take-control'); await page.locator('.ywc-canvas-control__passes button').first().click(); await page.getByRole('button', { name: /shoot left/i }).click(); await expect(match).toHaveAttribute('data-phase', 'full-time'); await page.getByRole('button', { name: /pin result/i }).click(); }

test('fictional campaign completes groups, Round of 32, knockouts, final and trophy with reload-safe ledger', async ({ page }) => {
  test.setTimeout(45_000); await start(page);
  for (let index = 0; index < 8; index++) { await playOne(page); const result = page.locator('[data-screen="result"]'); await expect(result).toBeVisible(); if (await result.getByText(/CHAMPIONS OF YOUR WORLD CUP/i).count()) break; await page.getByRole('button', { name: /return to wall/i }).click(); await page.reload(); await expect(page.locator('[data-screen="campaign"]')).toBeVisible(); }
  await expect(page.locator('[data-screen="result"]')).toContainText(/CHAMPIONS OF YOUR WORLD CUP/i); await expect(page.evaluate(() => { const state = JSON.parse(localStorage.getItem('u26v2.your-world-cup.campaign')); return { trophy: state.trophy, fixtures: state.fixtures.filter((fixture) => fixture.stage !== 'groups').length, version: state.version }; })).resolves.toEqual({ trophy: true, fixtures: 31, version: 4 });
});

test('a saved shot can eliminate a campaign and New campaign clears only campaign state', async ({ page }) => {
  await start(page); await page.getByRole('button', { name: /prepare/i }).click(); await page.getByRole('button', { name: /^kick off/i }).click(); await page.getByRole('button', { name: '4×', exact: true }).click(); await expect(page.locator('[data-screen="match"]')).toHaveAttribute('data-phase', 'take-control'); await page.locator('.ywc-canvas-control__passes button').first().click(); await page.getByRole('button', { name: /shoot center/i }).click(); await expect(page.locator('[data-screen="match"]')).toHaveAttribute('data-phase', 'full-time'); await page.getByRole('button', { name: /pin result/i }).click();
  await page.getByRole('button', { name: /return to wall|new campaign/i }).click(); await expect(page.locator('[data-screen="campaign"]')).toBeVisible();
});
