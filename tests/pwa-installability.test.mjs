import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const rootPath = fileURLToPath(root);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('web app manifest exposes installable United 2026 metadata and icons', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.name, 'United 2026');
  assert.equal(manifest.short_name, 'United 2026');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.ok(manifest.theme_color);
  assert.ok(manifest.background_color);
  assert.ok(manifest.icons.length >= 2);
  for (const icon of manifest.icons) {
    assert.ok(existsSync(join(rootPath, icon.src.replace(/^\//, ''))), icon.src + ' exists');
  }
});

test('service worker caches static shell but excludes live truth endpoints from stale cache', () => {
  const sw = read('sw.js');
  assert.match(sw, /STATIC_CACHE/);
  assert.match(sw, /addEventListener\('fetch'/);
  assert.match(sw, /pathname\.startsWith\('\/api\/'\)/);
  assert.match(sw, /cache:\s*'no-store'/);
  assert.doesNotMatch(sw, /caches\.match\(request\)[\s\S]{0,220}\/api\/results/);
  assert.match(sw, /SKIP_WAITING/);
});

test('app registers PWA install, iOS guidance, offline truth, and update affordances', () => {
  const app = read('src/app.js');
  assert.match(app, /serviceWorker\.register\('\/sw\.js'\)/);
  assert.match(app, /beforeinstallprompt/);
  assert.match(app, /Share then Add to Home Screen/);
  assert.match(app, /Current World Cup data cannot refresh/);
  assert.match(app, /u26:pwa-update-ready/);
  assert.match(app, /installTipDismissed/);
});

test('iOS web app metadata is present in the document head', () => {
  const html = read('index.html');
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(html, /apple-mobile-web-app-title/);
  assert.match(html, /apple-touch-icon/);
  assert.match(html, /mobile-web-app-capable/);
});
