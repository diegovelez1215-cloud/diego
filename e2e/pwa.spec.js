import { test, expect } from '@playwright/test';
import { gotoApp, expectNoHorizontalOverflow, tapTab, openPlayMode } from './helpers.js';

test.describe('PWA install and truth-safe offline surface', () => {
  test.use({ serviceWorkers: 'allow' });

  test('registers the service worker and keeps standalone layout dock-safe', async ({ page }) => {
    await page.addInitScript(() => {
      const nativeMatchMedia = window.matchMedia;
      window.matchMedia = (query) => query === '(display-mode: standalone)'
        ? { matches: true, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } }
        : nativeMatchMedia(query);
    });
    await gotoApp(page);
    await expect.poll(() => page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration('/')))).toBe(true);
    await expect(page.locator('.dock')).toBeVisible();
    await expectNoHorizontalOverflow(page, expect, 'standalone pwa');
  });

  test('shows iOS Add to Home Screen guidance without faking a browser prompt', async ({ page }) => {
    await gotoApp(page);
    await expect(page.locator('#pwa-toast')).toContainText('Add to Home Screen', { timeout: 4000 });
    await expect(page.locator('#pwa-toast')).toContainText('Share then Add to Home Screen');
    await expect(page.locator('#pwa-toast .pwa-action')).toHaveCount(0);
  });

  test('uses the supported install prompt when the browser provides one', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      event.prompt = async () => {};
      event.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(event);
    });
    await expect(page.locator('#pwa-toast')).toContainText('Install United 2026', { timeout: 3000 });
    await expect(page.locator('#pwa-toast .pwa-action')).toHaveText('Install');
  });

  test('offline truth message appears while Play remains usable', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.locator('#pwa-toast')).toContainText('Current World Cup data cannot refresh');
    await tapTab(page, 'play');
    await openPlayMode(page, 'lab');
    await expect(page.locator('#lab-kickoff')).toBeVisible();
  });

  test('update notice is user-controlled and waits through active Match Lab moments', async ({ page }) => {
    await gotoApp(page);
    await openPlayMode(page, 'lab');
    await page.locator('#lab-kickoff').click();
    await page.evaluate(() => window.dispatchEvent(new Event('u26:pwa-update-ready')));
    await expect(page.locator('#pwa-toast')).toBeHidden();
    await page.locator('[data-segmented="play-mode"] [data-value="lobby"]').click();
    await page.evaluate(() => window.dispatchEvent(new Event('u26:pwa-update-ready')));
    await expect(page.locator('#pwa-toast')).toContainText('Update ready');
  });
});
