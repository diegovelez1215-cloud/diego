import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repository = process.env.INIT_CWD || resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(resolve(repository, path), 'utf8');

describe('V2 foundation isolation', () => {
  it('keeps the V1 root entry intact and free of V2 assets', () => {
    const root = read('index.html');
    expect(root).toContain('src="/src/app.js"');
    expect(root).not.toContain('/v2/');
  });

  it('keeps V2 entry styles and bundles separate from V1', () => {
    const entry = read('apps/v2-web/src/main.tsx');
    const v2Html = read('apps/v2-web/index.html');
    expect(entry).toContain("./styles/reset.css");
    expect(entry).toContain("./styles/tokens.css");
    expect(entry).toContain("./styles/shell.css");
    expect(entry).toContain("./styles/components.css");
    expect(entry).toContain("./styles/routes.css");
    expect(entry).not.toMatch(/src\/styles|src\/app\.js/);
    expect(v2Html).toContain('src="/src/main.tsx"');
    expect(v2Html).not.toContain('/src/styles/');
  });

  it('emits a V2-only production asset graph', () => {
    const built = read('public/v2/index.html');
    expect(built).toContain('/v2/assets/');
    expect(built).not.toContain('/src/app.js');
    expect(built).not.toContain('/src/styles/');
  });

  it('has no V2 service-worker registration', () => {
    const entry = read('apps/v2-web/src/main.tsx');
    const app = read('apps/v2-web/src/app/App.tsx');
    expect(`${entry}\n${app}`).not.toMatch(/serviceWorker|register\(/);
  });

  it('uses no remote font request in the V2 document or styles', () => {
    const html = read('apps/v2-web/index.html');
    const tokens = read('apps/v2-web/src/styles/tokens.css');
    const styles = `${tokens}\n${read('apps/v2-web/src/styles/reset.css')}\n${read('apps/v2-web/src/styles/shell.css')}\n${read('apps/v2-web/src/styles/components.css')}\n${read('apps/v2-web/src/styles/routes.css')}`;
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com|<link[^>]+font/i);
    expect(styles).not.toMatch(/@import|url\(.*https?:/i);
  });

  it('keeps minimum control, safe-area, and reduced-motion rules in isolated V2 CSS', () => {
    const shell = read('apps/v2-web/src/styles/shell.css');
    const components = read('apps/v2-web/src/styles/components.css');
    expect(`${shell}\n${components}`).toMatch(/min-height:\s*48px/);
    expect(shell).toContain('env(safe-area-inset-bottom)');
    expect(shell).toContain('env(safe-area-inset-top)');
    expect(`${shell}\n${components}`).toContain('@media (prefers-reduced-motion: no-preference)');
    expect(`${shell}\n${components}`).not.toContain('prefers-reduced-motion: reduce) {\n    *');
  });

  it('keeps Play and You isolated from official tournament imports', () => {
    const play = read('apps/v2-web/src/routes/Play.tsx');
    const you = read('apps/v2-web/src/routes/You.tsx');
    expect(`${play}\n${you}`).not.toMatch(/domain\/|data\/official-snapshot|tournament-bridge|canonicalFixtures|canonicalTournamentSnapshot/);
  });

  it('puts explicit V2 rewrites before the existing V1 catch-all', () => {
    const config = JSON.parse(read('vercel.json'));
    expect(config.rewrites.map((route: { source: string }) => route.source)).toEqual([
      '/v2',
      '/v2/(.*)',
      '/((?!api/).*)',
    ]);
  });
});
