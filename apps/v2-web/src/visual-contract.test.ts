import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repository = process.env.INIT_CWD || resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(resolve(repository, path), 'utf8');
const styleFiles = ['reset.css', 'tokens.css', 'shell.css', 'components.css', 'routes.css', 'matchday.css', 'tournament.css', 'play.css', 'predictions.css', 'you.css'] as const;
const styles = Object.fromEntries(styleFiles.map((file) => [file, read(`apps/v2-web/src/styles/${file}`)])) as Record<typeof styleFiles[number], string>;
const routeStyles = ['matchday.css', 'tournament.css', 'play.css', 'predictions.css', 'you.css'].map((file) => styles[file as keyof typeof styles]).join('\n');
const allStyles = styleFiles.map((file) => styles[file]).join('\n');
const matchday = read('apps/v2-web/src/routes/Matchday.tsx');
const play = read('apps/v2-web/src/routes/Play.tsx');
const app = read('apps/v2-web/src/app/App.tsx');
const main = read('apps/v2-web/src/main.tsx');

function cssBlocks(source: string): Array<{ selector: string; body: string }> {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({ selector: match[1].trim(), body: match[2] }));
}

describe('V2 Floodlight visual contract', () => {
  it('keeps canonical football ahead of quiet service-state treatment', () => {
    expect(matchday.indexOf('<FixtureStage')).toBeGreaterThan(-1);
    expect(matchday.indexOf('<ServiceNotice')).toBeGreaterThan(matchday.indexOf('<FixtureStage'));
    expect(styles['components.css']).toContain('.v2-service-notice');
    expect(styles['components.css']).toMatch(/\.v2-service-notice p\s*\{[^}]*font-size:\s*12px/s);
  });

  it('uses the 1120px shell, four safe areas, and the 820px navigation handoff', () => {
    expect(styles['tokens.css']).toContain('--v2-shell-width: 1120px');
    expect(styles['tokens.css']).toContain('--v2-nav-height: 60px');
    expect(styles['shell.css']).toMatch(/\.v2-primary-nav\s*\{\s*position:\s*fixed/);
    expect(styles['shell.css']).toContain('@media (min-width: 820px)');
    for (const edge of ['top', 'right', 'bottom', 'left']) expect(styles['shell.css']).toContain(`env(safe-area-inset-${edge})`);
    expect(read('apps/v2-web/src/ui/AppShell.tsx')).toMatch(/<TopBar[\s\S]*<BottomNav/);
    expect(read('apps/v2-web/src/ui/TopBar.tsx')).toContain('48 teams · 104 matches · CAN/MEX/USA');
    expect(app).toMatch(/\/v2\\\/match\\\/\\d\+\$\/\.test\(path\)\) return '\/v2\/'/);
    expect(app).toMatch(/\/v2\\\/predictions/);
  });

  it('keeps one sanctioned radial grammar with primary and secondary intensities', () => {
    const gradients = [...styles['tokens.css'].matchAll(/radial-gradient\(([^;]+)\)/g)].map((match) => match[0]);
    expect(gradients).toHaveLength(2);
    expect(gradients[0]).toContain('120% 90% at 18% 0%');
    expect(gradients[0]).toContain('rgba(47,107,255,.14)');
    expect(gradients[1]).toContain('120% 90% at 18% 0%');
    expect(gradients[1]).toContain('rgba(47,107,255,.10)');
    expect(allStyles).not.toContain('linear-gradient');
    expect(`${styles['components.css']}\n${routeStyles}`).not.toMatch(/(?:radial|linear)-gradient\(/);
  });

  it('allows only the approved FLOODLIGHT colors', () => {
    const approvedHex = new Set(['#07111F', '#0D1B2B', '#13253C', '#F4F1E8', '#2F6BFF', '#FF4D3D', '#167A53', '#C99A3D', '#E5484D']);
    const hexValues = [...allStyles.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((match) => match[0].toUpperCase());
    expect(hexValues.every((value) => approvedHex.has(value))).toBe(true);
    const approvedRgb = new Set(['244,241,232', '47,107,255', '7,17,31', '2,6,12']);
    const rgbValues = [...allStyles.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)].map((match) => `${match[1]},${match[2]},${match[3]}`);
    expect(rgbValues.every((value) => approvedRgb.has(value))).toBe(true);
    expect(allStyles).not.toMatch(/\b(?:hsl|oklch|lab)\(/i);
  });

  it('self-hosts one licensed Latin Archivo variable asset with no remote font request', () => {
    expect(styles['tokens.css']).toContain('@font-face');
    expect(styles['tokens.css']).toContain('font-family: "Archivo"');
    expect(styles['tokens.css']).toContain('font-display: swap');
    expect(styles['tokens.css']).toMatch(/url\("\.\.\/\.\.\/\.\.\/\.\.\/node_modules\/@fontsource-variable\/archivo\/files\/archivo-latin-wght-normal\.woff2"\)/);
    expect(styles['tokens.css'].match(/\.woff2/g)).toHaveLength(1);
    expect(read('apps/v2-web/public/ARCHIVO-OFL.txt')).toContain('SIL OPEN FONT LICENSE Version 1.1');
    expect(`${allStyles}\n${read('apps/v2-web/index.html')}`).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com|url\(.*https?:/i);
    const packageJson = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    expect(Object.keys(packageJson.dependencies).sort()).toEqual(['@fontsource-variable/archivo', 'react', 'react-dom']);
  });

  it('enforces the 12px type floor and tabular changing numerals', () => {
    const sizes = [...allStyles.matchAll(/font-size:\s*([0-9.]+)px/g)].map((match) => Number(match[1]));
    expect(sizes.length).toBeGreaterThan(20);
    expect(Math.min(...sizes)).toBe(12);
    expect(styles['components.css']).toMatch(/v2-fixture-stage__team b[\s\S]*font-variant-numeric:\s*tabular-nums/);
    expect(styles['predictions.css']).toMatch(/v2-prediction-counts dd[\s\S]*font-variant-numeric:\s*tabular-nums/);
    expect(styles['tournament.css']).toContain('font-variant-numeric: tabular-nums');
  });

  it('keeps controls at 48px or larger and rectangles square', () => {
    expect(styles['components.css']).toMatch(/\.v2-button,[\s\S]*?min-height:\s*48px/);
    expect(styles['shell.css']).toMatch(/\.v2-nav-link\s*\{[^}]*min-height:\s*var\(--v2-nav-height\)/s);
    expect(styles['tournament.css']).toMatch(/\.v2-section-switcher button\s*\{[^}]*min-height:\s*48px/s);
    expect(styles['predictions.css']).toMatch(/\.v2-outcome-choices label,[^{}]+\{[^}]*min-height:\s*52px/s);
    expect(styles['you.css']).toMatch(/\.v2-auth-form input\s*\{[^}]*min-height:\s*48px/s);
    const radiusBlocks = cssBlocks(allStyles).filter(({ body }) => /border-radius:/.test(body));
    for (const block of radiusBlocks) {
      const radius = /border-radius:\s*([^;]+)/.exec(block.body)?.[1].trim();
      if (radius === '0') continue;
      expect(block.selector).toMatch(/v2-source-chip summary > span|v2-status-mark--live \.v2-status-dot|v2-bracket-position > span/);
      expect(radius).toBe('50%');
    }
  });

  it('preserves visible focus and guarantees zero reduced-motion animations or transitions', () => {
    expect(styles['shell.css']).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px/s);
    expect(styles['tokens.css']).toContain('--motion-fast: 140ms');
    expect(styles['tokens.css']).toContain('--motion-settle: 260ms');
    expect(styles['shell.css']).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles['shell.css']).toMatch(/\.v2-app \*[\s\S]*animation:\s*none !important;[\s\S]*transition:\s*none !important;/);
    expect(allStyles).not.toMatch(/parallax|shimmer|marquee|hover[^{}]*scale/i);
  });

  it('restricts live coral and medal brass to their approved truth roles', () => {
    expect(routeStyles).not.toContain('var(--live)');
    const liveBlocks = cssBlocks(styles['components.css']).filter(({ body }) => body.includes('var(--live)'));
    expect(liveBlocks.map(({ selector }) => selector)).toEqual(expect.arrayContaining([
      '.v2-status-mark--live',
      '.v2-fixture-stage[data-status="live"]',
    ]));
    expect(liveBlocks).toHaveLength(2);

    expect(styles['play.css']).not.toContain('var(--brass)');
    for (const block of cssBlocks(styles['tournament.css']).filter(({ body }) => body.includes('var(--brass)'))) expect(block.selector).toMatch(/bracket-match--final|bracket-match--third/);
    for (const block of cssBlocks(styles['matchday.css']).filter(({ body }) => body.includes('var(--brass)'))) expect(block.selector).toMatch(/data-state="locked"|data-state="pending"/);
    for (const block of cssBlocks(styles['predictions.css']).filter(({ body }) => body.includes('var(--brass)'))) expect(block.selector).toMatch(/data-state="pending"|data-state="locked"/);
  });

  it('keeps Play interactive only where a real route exists', () => {
    expect(play).toContain('<h2 id="flagship-title">Rondo</h2>');
    expect(play).toContain('Next build');
    expect(play).toMatch(/<article className="v2-mode-row" data-interactive="false"/);
    expect(play).toMatch(/<a className="v2-mode-row v2-mode-row--action" data-interactive="true" href="\/v2\/predictions"/);
    expect(play).toContain("name: 'Counter Attack'");
    expect(play).toContain("state: 'In development'");
    expect(play).not.toMatch(/Playable|Start Rondo|href="\/v2\/play\/rondo"|onNavigate\('\/v2\/play\/rondo'\)/);
  });

  it('adds no fake profile, photography, external image, service-worker, or analytics surface', () => {
    const production = ['apps/v2-web/src/main.tsx', 'apps/v2-web/src/app/App.tsx', 'apps/v2-web/src/routes/Matchday.tsx', 'apps/v2-web/src/routes/MatchDetail.tsx', 'apps/v2-web/src/routes/Tournament.tsx', 'apps/v2-web/src/routes/Play.tsx', 'apps/v2-web/src/routes/Predictions.tsx', 'apps/v2-web/src/routes/PredictionDetail.tsx', 'apps/v2-web/src/routes/You.tsx'].map(read).join('\n');
    expect(production).not.toMatch(/data-(?:avatar|profile|rank|streak|achievement|level|country|favorite-team)/i);
    expect(production).not.toMatch(/top \d+%|global rank|current streak|level \d+|achievements? earned|favorite team/i);
    expect(production).not.toMatch(/<img\b|\.(?:jpe?g|png|webp)["']/i);
    expect(production).not.toMatch(/serviceWorker|@supabase|analytics|gtag\(|segment\.|mixpanel/i);
    expect(`${allStyles}\n${production}`).not.toMatch(/url\(.*https?:/i);
    for (const file of ['matchday.css', 'tournament.css', 'play.css', 'predictions.css', 'you.css']) expect(main).toContain(`./styles/${file}`);
  });
});
