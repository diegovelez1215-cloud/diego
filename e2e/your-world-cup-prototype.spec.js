import { expect, test } from '@playwright/test';

test.use({ trace: 'on' });

const sizes = [
  { label: '390x844', width: 390, height: 844 },
  { label: '430x932', width: 430, height: 932 },
  { label: '1280x900', width: 1280, height: 900 },
  { label: '1440x1000', width: 1440, height: 1000 },
];

async function expectViewportSafe(page, { width, height }) {
  const geometry = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    buttons: [...document.querySelectorAll('button:not([disabled])')].map((button) => {
      const box = button.getBoundingClientRect();
      return { text: button.textContent?.trim(), width: box.width, height: box.height, left: box.left, right: box.right };
    }),
  }));
  expect(geometry.viewport).toBe(width);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(width);
  for (const button of geometry.buttons) {
    expect(button.height, `${button.text} target height`).toBeGreaterThanOrEqual(48);
    expect(button.left, `${button.text} left edge`).toBeGreaterThanOrEqual(0);
    expect(button.right, `${button.text} right edge`).toBeLessThanOrEqual(width + .5);
  }
  expect(await page.locator('body').evaluate((body, viewportWidth) => body.scrollWidth <= viewportWidth, width)).toBe(true);
  expect(height).toBeGreaterThan(0);
}

for (const size of sizes) {
  test(`${size.label} completes the simulated personal tournament slice`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/v2/your-world-cup-prototype');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await expect(page.getByRole('heading', { name: 'Your World Cup' })).toBeVisible();
    await expect(page.getByText('Simulated personal tournament · Prototype')).toBeVisible();
    await expect(page.locator('.ywc-opening__terrace')).toHaveText('48 NATIONS · 3 HOST COUNTRIES · YOUR COLORS · YOUR NOISE · YOUR WORLD CUP');
    await expect(page.locator('.v2-primary-nav')).toHaveCount(0);
    await expectViewportSafe(page, size);
    await page.screenshot({ path: testInfo.outputPath(`${size.label}-opening.png`), fullPage: true });

    await page.getByRole('button', { name: /start your world cup/i }).click();
    await expect(page.getByRole('heading', { name: /pick your colors/i })).toBeVisible();
    const argentina = page.getByRole('button', { name: /Argentina, Quick combinations/i });
    await argentina.click();
    await expect(argentina).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.ywc-nation-sticker:disabled')).toHaveCount(5);
    await expect(page.getByText('Preview', { exact: true })).toHaveCount(0);
    await expect(page.locator('.ywc-simulation-label.is-compact')).toBeVisible();
    const nationComposition = await page.evaluate(() => {
      const sheet = document.querySelector('.ywc-sticker-sheet')?.getBoundingClientRect();
      const grid = document.querySelector('.ywc-sticker-grid')?.getBoundingClientRect();
      const action = document.querySelector('.ywc-screen-actions--nation')?.getBoundingClientRect();
      const selected = document.querySelector('.ywc-nation-sticker:first-child .ywc-sticker-disc')?.getBoundingClientRect();
      const other = document.querySelector('.ywc-nation-sticker:nth-child(2) .ywc-sticker-disc')?.getBoundingClientRect();
      return { sheet, grid, action, selected, other };
    });
    expect(nationComposition.sheet).toBeTruthy();
    expect(nationComposition.action.top - nationComposition.grid.bottom).toBeLessThanOrEqual(30);
    if (size.width >= 760) {
      expect(nationComposition.sheet.height).toBeGreaterThanOrEqual(size.height * .6);
      expect(nationComposition.selected.width).toBeGreaterThan(nationComposition.other.width * 1.5);
    }
    await page.screenshot({ path: testInfo.outputPath(`${size.label}-nation.png`), fullPage: true });
    await page.getByRole('button', { name: /choose argentina/i }).click();

    await expect(page.locator('[data-screen="draw"]')).toBeVisible();
    await page.getByRole('button', { name: /skip draw/i }).click();
    await expect(page.locator('[data-draw-complete="true"]')).toBeVisible();
    await expect(page.getByText('Group C is on the wall.')).toBeVisible();
    const drawComposition = await page.evaluate(() => {
      const poster = document.querySelector('.ywc-draw-poster')?.getBoundingClientRect();
      const footer = document.querySelector('.ywc-draw-footer')?.getBoundingClientRect();
      return { poster, footer };
    });
    expect(drawComposition.footer.top - drawComposition.poster.bottom).toBeLessThanOrEqual(24);
    expect(drawComposition.poster.height).toBeGreaterThanOrEqual(size.height * .52);
    if (size.width >= 760) expect(drawComposition.poster.width).toBeGreaterThanOrEqual(size.width * .6);
    await page.screenshot({ path: testInfo.outputPath(`${size.label}-draw.png`), fullPage: true });
    await page.getByRole('button', { name: /enter campaign/i }).click();

    await expect(page.getByRole('heading', { name: /campaign wall/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Argentina v Nigeria/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /play argentina v nigeria/i })).toBeVisible();
    const matchupGeometry = await page.locator('.ywc-next-ticket h2').evaluate((matchup) => {
      const box = matchup.getBoundingClientRect();
      return {
        box: { left: box.left, right: box.right },
        clientWidth: matchup.clientWidth,
        scrollWidth: matchup.scrollWidth,
        teams: [...matchup.querySelectorAll('span')].map((team) => {
          const teamBox = team.getBoundingClientRect();
          return { left: teamBox.left, right: teamBox.right };
        }),
      };
    });
    expect(matchupGeometry.scrollWidth).toBeLessThanOrEqual(matchupGeometry.clientWidth + 1);
    for (const team of matchupGeometry.teams) {
      expect(team.left).toBeGreaterThanOrEqual(matchupGeometry.box.left - 1);
      expect(team.right).toBeLessThanOrEqual(matchupGeometry.box.right + 1);
    }
    await expectViewportSafe(page, size);
    await page.screenshot({ path: testInfo.outputPath(`${size.label}-campaign.png`), fullPage: true });
    await page.getByRole('button', { name: /play argentina v nigeria/i }).click();
    await expect(page.getByText('Playable match moment comes in the next vertical slice.')).toBeVisible();

    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['u26v2.prototype.your-world-cup']);
    expect(await page.evaluate(() => localStorage.getItem('u26v2.auth'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('u26v2.predictions.local'))).toBeNull();
  });
}

test('reduced motion reveals the complete draw immediately', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/v2/your-world-cup-prototype');
  await page.evaluate(() => localStorage.setItem('u26v2.prototype.your-world-cup', JSON.stringify({ version: 1, screen: 'draw', nation: 'Argentina' })));
  await page.reload();
  await page.getByRole('button', { name: /continue campaign/i }).click();
  await expect(page.locator('[data-screen="draw"][data-draw-complete="true"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /enter campaign/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /skip draw/i })).toHaveCount(0);
});

test('opening and nation selection are keyboard operable with visible focus', async ({ page }) => {
  await page.goto('/v2/your-world-cup-prototype');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const start = page.getByRole('button', { name: /start your world cup/i });
  await start.focus();
  await expect(start).toBeFocused();
  expect(await start.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid');
  await start.press('Enter');
  const back = page.getByRole('button', { name: /^back/i });
  await back.focus();
  await expect(back).toBeFocused();
  const argentina = page.getByRole('button', { name: /Argentina, Quick combinations/i });
  await argentina.focus();
  await expect(argentina).toBeFocused();
  await argentina.press('Enter');
  await expect(argentina).toHaveAttribute('aria-pressed', 'true');
  const choose = page.getByRole('button', { name: /choose argentina/i });
  await choose.focus();
  await expect(choose).toBeFocused();
});

test('the prototype stays absent from existing V2 navigation and the V1 entry', async ({ page }) => {
  await page.goto('/v2/');
  await expect(page.getByRole('heading', { name: 'Matchday' })).toBeVisible();
  await expect(page.locator('.v2-primary-nav .v2-nav-link')).toHaveCount(4);
  await expect(page.locator('a[href="/v2/your-world-cup-prototype"]')).toHaveCount(0);
  await page.goto('/');
  await expect(page.locator('#v2-root')).toHaveCount(0);
});

for (const size of [
  { label: '390x844', width: 390, height: 844 },
  { label: '1280x900', width: 1280, height: 900 },
]) {
  test(`${size.label} records the complete physical draw`, async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone-390', 'One canonical video capture per requested viewport');
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      recordVideo: { dir: testInfo.outputPath('recording'), size: { width: size.width, height: size.height } },
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const baseURL = String(testInfo.project.use.baseURL);
    await page.goto(new URL('/v2/your-world-cup-prototype', baseURL).toString());
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: /start your world cup/i }).click();
    await page.getByRole('button', { name: /Argentina, Quick combinations/i }).click();
    await page.getByRole('button', { name: /choose argentina/i }).click();
    await expect(page.locator('[data-draw-complete="false"]')).toBeVisible();
    await expect(page.locator('[data-draw-complete="true"]')).toBeVisible({ timeout: 4_000 });
    await expect(page.getByRole('button', { name: /enter campaign/i })).toBeVisible();
    await page.waitForTimeout(350);
    const video = page.video();
    await context.close();
    await video?.saveAs(testInfo.outputPath(`${size.label}-draw-sequence.webm`));
  });
}
