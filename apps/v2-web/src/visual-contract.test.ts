import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repository = process.env.INIT_CWD || resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(resolve(repository, path), 'utf8');
const shell = read('apps/v2-web/src/styles/shell.css');
const components = read('apps/v2-web/src/styles/components.css');
const routes = read('apps/v2-web/src/styles/routes.css');
const matchday = read('apps/v2-web/src/routes/Matchday.tsx');

describe('V2 visual rebuild contract', () => {
  it('keeps canonical match content ahead of provider-error treatment in the page hierarchy', () => {
    expect(matchday.indexOf('{focus ? <FocusMatch')).toBeGreaterThan(-1);
    expect(matchday.indexOf('{stateNotice(snapshotState')).toBeGreaterThan(matchday.indexOf('{focus ? <FocusMatch'));
    expect(components).toContain('.v2-service-notice');
    expect(components).not.toMatch(/\.v2-service-notice[^}]*font-size:\s*(?:[3-9]|\d{2,})rem/s);
  });

  it('uses a compact horizontal desktop navigation instead of reserving a desktop rail', () => {
    expect(shell).toContain('@media (min-width: 820px)');
    expect(shell).toMatch(/\.v2-primary-nav\s*\{\s*position:\s*static;/);
    expect(shell).not.toMatch(/\.v2-app\s*\{[^}]*padding-left/s);
    expect(shell).not.toContain('width: 168px');
  });

  it('puts meaningful match and schedule content into the desktop first viewport', () => {
    expect(matchday).toContain('v2-matchday__layout');
    expect(matchday).toContain('data-content-priority="primary"');
    expect(matchday).toContain('v2-day-desk');
    expect(routes).toMatch(/@media \(min-width: 1040px\)[\s\S]*grid-template-columns:[^;]*1\.55fr/);
    expect(routes).toMatch(/\.v2-match-stage\s*\{[^}]*min-height:\s*340px/s);
  });

  it('keeps mobile navigation reachable and key controls at least 48px', () => {
    expect(shell).toMatch(/\.v2-primary-nav\s*\{\s*position:\s*fixed;/);
    expect(shell).toContain('env(safe-area-inset-bottom)');
    expect(`${components}\n${shell}`).toMatch(/min-height:\s*48px/);
    expect(routes).toContain('@media (max-width: 360px)');
  });

  it('preserves visible focus and an explicit reduced-motion path', () => {
    expect(shell).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px/s);
    expect(shell).toContain('@media (prefers-reduced-motion: reduce)');
    expect(`${shell}\n${components}`).toContain('@media (prefers-reduced-motion: no-preference)');
  });

  it('adds no runtime platform, analytics, font, service-worker, or data dependency', () => {
    const packageJson = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    expect(Object.keys(packageJson.dependencies).sort()).toEqual(['react', 'react-dom']);
    const production = [
      'apps/v2-web/src/main.tsx',
      'apps/v2-web/src/app/App.tsx',
      'apps/v2-web/src/routes/Matchday.tsx',
      'apps/v2-web/src/routes/MatchDetail.tsx',
      'apps/v2-web/src/routes/Tournament.tsx',
      'apps/v2-web/src/routes/Play.tsx',
      'apps/v2-web/src/routes/You.tsx',
    ].map(read).join('\n');
    expect(production).not.toMatch(/serviceWorker|@supabase|analytics|gtag\(|segment\.|mixpanel/i);
    expect(`${shell}\n${components}\n${routes}\n${read('apps/v2-web/src/styles/tokens.css')}`).not.toMatch(/@import|url\(.*https?:/i);
  });
});
