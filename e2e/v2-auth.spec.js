import { expect, test } from '@playwright/test';

const publicConfig = { url: 'https://u26-auth-test.supabase.co', anonKey: 'a'.repeat(32) };
const fixtures = [
  [320, 690], [390, 844], [430, 932], [768, 1024], [1280, 900], [1440, 1000],
];
const signedOutFormViewports = new Set(['320x690', '390x844', '430x932']);
const localPrediction = JSON.stringify({
  version: 1,
  records: [{ fixtureId: 2, outcome: 'away', confidence: 2, confirmedAt: '2026-06-10T12:00:00.000Z', kickoffEpoch: 1781229600000 }],
});

async function mockExistingAuth(page, { verifyFails = false, configured = true, configDelayMs = 0 } = {}) {
  await page.route('**/api/leaderboard-config', async (route) => {
    if (configDelayMs) await new Promise((resolve) => setTimeout(resolve, configDelayMs));
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(configured ? publicConfig : {}) });
  });
  await page.route('https://u26-auth-test.supabase.co/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/auth/v1/otp')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    if (url.includes('/auth/v1/verify')) {
      return route.fulfill(verifyFails
        ? { status: 400, contentType: 'application/json', body: '{}' }
        : { status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'mock-access-token', refresh_token: 'mock-refresh-token', expires_at: 2_000_000_000, user: { id: 'mock-user-123', email: 'fan@example.com' } }) });
    }
    if (url.includes('/auth/v1/token')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'refreshed-access-token', refresh_token: 'refreshed-refresh-token', expires_at: 2_000_000_000, user: { id: 'mock-user-123', email: 'fan@example.com' } }) });
    if (url.includes('/rest/v1/profiles')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.abort();
  });
}

test('V2 You reuses controlled email-code auth without changing device-local predictions', async ({ page }) => {
  await mockExistingAuth(page);
  await page.setViewportSize({ width: 320, height: 690 });
  await page.goto('/v2/you');
  await page.evaluate((value) => localStorage.setItem('u26v2.predictions.local', value), localPrediction);
  await page.reload();
  const predictionBeforeSignIn = await page.evaluate(() => localStorage.getItem('u26v2.predictions.local'));
  expect(predictionBeforeSignIn).toBe(localPrediction);

  await page.getByLabel('Email').fill('fan@example.com');
  await page.getByRole('button', { name: 'Send sign-in code' }).click();
  await page.getByLabel('Six-digit code sent to fan@example.com').fill('123456');
  await page.getByRole('button', { name: 'Confirm sign-in' }).click();
  await expect(page.getByText('Verified session · fan@example.com')).toBeVisible();
  await expect(page.getByText('Account ID')).toBeVisible();
  await expect(page.locator('[data-rank], [data-avatar], [data-profile]')).toHaveCount(0);
  await expect(page.evaluate(() => Object.keys(localStorage).filter((key) => /auth|token/i.test(key)))).resolves.toEqual(['u26v2.auth']);
  await expect(page.evaluate(() => localStorage.getItem('u26v2.predictions.local'))).resolves.toBe(predictionBeforeSignIn);

  await page.reload();
  await expect(page.getByText('Verified session · fan@example.com')).toBeVisible();
  await expect(page.evaluate(() => localStorage.getItem('u26v2.predictions.local'))).resolves.toBe(predictionBeforeSignIn);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByText('FLOODLIGHT')).toBeVisible();
  await expect(page.evaluate(() => Object.keys(localStorage).filter((key) => /auth|token/i.test(key)))).resolves.toEqual([]);
  await expect(page.evaluate(() => localStorage.getItem('u26v2.predictions.local'))).resolves.toBe(predictionBeforeSignIn);

  for (const [width, height] of fixtures) {
    await page.setViewportSize({ width, height });
    await page.goto('/v2/you');
    await expect(page.getByRole('heading', { name: 'You' })).toBeVisible();
    await expect(page.getByText('FLOODLIGHT')).toBeVisible();
    await expect(page.getByText('Korea Republic v Czechia')).toBeVisible();
    if (signedOutFormViewports.has(`${width}x${height}`)) {
      await expect(page.getByLabel('Email')).toBeVisible();
      const documentWidth = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(documentWidth.scrollWidth).toBeLessThanOrEqual(documentWidth.clientWidth);
    }
  }

  const play = page.getByRole('link', { name: 'Play' });
  await play.focus();
  await expect(play).toBeFocused();
  await expect(page).not.toHaveURL(/token|code|returnTo/i);
  await expect(page.evaluate(() => navigator.serviceWorker.controller)).resolves.toBeNull();
  expect(await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name).join('\n'))).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE/i);

  await play.click();
  await expect(page.getByRole('heading', { name: 'Play' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'You' })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Play' })).toBeVisible();
});

test('V2 You keeps configuration failure non-blank', async ({ page }) => {
  await mockExistingAuth(page, { configured: false, configDelayMs: 50 });
  await page.goto('/v2/you');
  await expect(page.getByText('Sign-in is unavailable')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('V2 You keeps a bad code failure generic and non-enumerating', async ({ page }) => {
  await mockExistingAuth(page, { verifyFails: true });
  await page.goto('/v2/you');
  await page.getByLabel('Email').fill('fan@example.com');
  await page.getByRole('button', { name: 'Send sign-in code' }).click();
  await page.getByLabel('Six-digit code sent to fan@example.com').fill('000000');
  await page.getByRole('button', { name: 'Confirm sign-in' }).click();
  await expect(page.getByText('That code could not be confirmed. Check it and try again.')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('400');
});

test('V1 root stays free of V2 assets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#app')).toBeVisible();
  expect(await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name).some((url) => url.includes('/v2/assets/')))).toBe(false);
});
