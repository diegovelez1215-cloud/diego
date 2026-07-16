import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { primaryDestinations } from '../../ui/AppShell';

const repository = process.env.INIT_CWD || resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(resolve(repository, path), 'utf8');

describe('Your World Cup isolation and renderer contract', () => {
  it('keeps the campaign a direct isolated route, outside existing V2 navigation', () => {
    const app = read('apps/v2-web/src/app/App.tsx'); const prototype = read('apps/v2-web/src/prototypes/your-world-cup/YourWorldCupPrototype.tsx');
    expect(app).toContain("'/v2/your-world-cup-prototype'"); expect(app).toContain("lazy(() => import('../prototypes/your-world-cup/YourWorldCupPrototype')");
    expect(prototype).toContain("lazy(() => import('./match/MatchExperience')"); expect(primaryDestinations.map(({ path }) => path)).not.toContain('/v2/your-world-cup-prototype');
  });

  it('uses only the campaign key and keeps fictional simulation isolated from V1, truth, auth, prediction, and network code', () => {
    const surface = ['YourWorldCupPrototype.tsx', 'campaign/tournament.ts', 'match/MatchExperience.tsx', 'match/CanvasMatchRenderer.ts'].map((path) => read(`apps/v2-web/src/prototypes/your-world-cup/${path}`)).join('\n');
    expect(surface).toContain("'u26v2.your-world-cup.campaign'"); expect(surface).not.toContain('u26v2.prototype.your-world-cup');
    expect(surface).not.toMatch(/\.\.\/\.\.\/\.\.\/\.\.\/src\/|auth\/|predictions\/|data\/official|domain\/|@supabase|fetch\(|XMLHttpRequest|analytics|gtag\(|serviceWorker|indexedDB|sessionStorage/i);
  });

  it('makes Canvas own the active match frames with one fixed-step rAF loop and no React player renderer', () => {
    const renderer = read('apps/v2-web/src/prototypes/your-world-cup/match/CanvasMatchRenderer.ts'); const match = read('apps/v2-web/src/prototypes/your-world-cup/match/MatchExperience.tsx');
    expect(renderer).toContain('const STEP = 1 / 30'); expect(renderer).toContain('requestAnimationFrame(this.loop)'); expect(renderer).toContain('cancelAnimationFrame'); expect(renderer).toContain('this.accumulator'); expect(renderer).toContain('draw(this.accumulator / STEP)');
    expect(match).toContain('<canvas'); expect(match).not.toContain('MatchPitch'); expect(match).not.toMatch(/setTimeout|setInterval|RenderPlayer/);
  });
});
