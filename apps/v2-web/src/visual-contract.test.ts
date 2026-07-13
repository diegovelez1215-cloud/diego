import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repository = process.env.INIT_CWD || resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(resolve(repository, path), 'utf8');
const shell = read('apps/v2-web/src/styles/shell.css');
const components = read('apps/v2-web/src/styles/components.css');
const routeStyles = ['matchday.css', 'tournament.css', 'play.css', 'you.css'].map((file) => read(`apps/v2-web/src/styles/${file}`)).join('\n');
const tokens = read('apps/v2-web/src/styles/tokens.css');
const matchday = read('apps/v2-web/src/routes/Matchday.tsx');
const main = read('apps/v2-web/src/main.tsx');

describe('V2 Floodlight visual contract', () => {
  it('keeps useful canonical football ahead of quiet service-state treatment', () => {
    expect(matchday.indexOf('<FixtureStage')).toBeGreaterThan(-1);
    expect(matchday.indexOf('<ServiceNotice')).toBeGreaterThan(matchday.indexOf('<FixtureStage'));
    expect(components).toContain('.v2-service-notice');
    expect(components).toMatch(/\.v2-service-notice p\s*\{[^}]*font-size:12px/);
  });

  it('uses the 1120px shell and structural 60px sibling navigation', () => {
    expect(tokens).toContain('--v2-shell-width: 1120px');
    expect(tokens).toContain('--v2-nav-height: 60px');
    expect(shell).toMatch(/\.v2-primary-nav\s*\{\s*position:\s*fixed/);
    expect(shell).toContain('calc(60px + env(safe-area-inset-bottom) + 32px)');
    expect(shell).toContain('scroll-padding-bottom: 100px');
    expect(read('apps/v2-web/src/ui/AppShell.tsx')).toMatch(/<TopBar[^>]+\/>[\s\S]*<BottomNav/);
    expect(read('apps/v2-web/src/ui/TopBar.tsx')).not.toContain('v2-edition');
  });

  it('keeps one floodlight radial and removes the old poster grammar', () => {
    expect(`${components}\n${routeStyles}`).toContain('radial-gradient(120% 90% at 18% 0%, rgba(47,107,255,.14), transparent 55%)');
    expect(`${shell}\n${components}\n${routeStyles}`).not.toContain('linear-gradient');
    expect(`${components}\n${routeStyles}`).not.toMatch(/v2-competition-ribbon|v2-tournament-command|v2-play-manifesto|v2-you-principles|v2-match-stage__geometry/);
  });

  it('enforces the metadata floor, safe areas, and 48px controls', () => {
    expect(`${shell}\n${components}\n${routeStyles}`).not.toMatch(/font-size:\s*(?:[1-9]|10)px/);
    expect(shell).toContain('env(safe-area-inset-bottom)');
    expect(shell).toContain('env(safe-area-inset-top)');
    expect(`${shell}\n${components}\n${routeStyles}`).toMatch(/min-height:\s*48px/);
    expect(components).toContain('font-size:12px');
  });

  it('preserves visible focus and explicit reduced motion', () => {
    expect(shell).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px/s);
    expect(shell).toContain('@media (prefers-reduced-motion: reduce)');
    expect(`${shell}\n${components}`).toContain('@media (prefers-reduced-motion: no-preference)');
  });

  it('splits route styles without adding runtime platform, analytics, font, or service-worker dependencies', () => {
    for (const file of ['matchday.css', 'tournament.css', 'play.css', 'you.css']) expect(main).toContain(`./styles/${file}`);
    const packageJson = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    expect(Object.keys(packageJson.dependencies).sort()).toEqual(['react', 'react-dom']);
    const production = ['apps/v2-web/src/main.tsx','apps/v2-web/src/app/App.tsx','apps/v2-web/src/routes/Matchday.tsx','apps/v2-web/src/routes/MatchDetail.tsx','apps/v2-web/src/routes/Tournament.tsx','apps/v2-web/src/routes/Play.tsx','apps/v2-web/src/routes/You.tsx'].map(read).join('\n');
    expect(production).not.toMatch(/serviceWorker|@supabase|analytics|gtag\(|segment\.|mixpanel/i);
    expect(`${shell}\n${components}\n${routeStyles}\n${tokens}`).not.toMatch(/url\(.*https?:/i);
  });
});
