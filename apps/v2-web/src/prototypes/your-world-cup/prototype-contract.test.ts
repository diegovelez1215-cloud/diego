import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { primaryDestinations } from '../../ui/AppShell';

const repository = process.env.INIT_CWD || resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(resolve(repository, path), 'utf8');

describe('Your World Cup prototype isolation contract', () => {
  it('registers one direct route without adding it to existing V2 navigation', () => {
    const app = read('apps/v2-web/src/app/App.tsx');
    const navigation = read('apps/v2-web/src/ui/AppShell.tsx');
    expect(app).toContain("'/v2/your-world-cup-prototype'");
    expect(primaryDestinations.map(({ path }) => path)).not.toContain('/v2/your-world-cup-prototype');
    expect(navigation).not.toContain('your-world-cup-prototype');
  });

  it('keeps prototype code free of V1, auth, prediction, official-data, backend, analytics, and service-worker dependencies', () => {
    const prototype = [
      read('apps/v2-web/src/prototypes/your-world-cup/YourWorldCupPrototype.tsx'),
      read('apps/v2-web/src/prototypes/your-world-cup/prototype-state.ts'),
      read('apps/v2-web/src/prototypes/your-world-cup/campaign/contracts.ts'),
      read('apps/v2-web/src/prototypes/your-world-cup/campaign/campaign-store.ts'),
      read('apps/v2-web/src/prototypes/your-world-cup/campaign/simulation.ts'),
      read('apps/v2-web/src/prototypes/your-world-cup/campaign/moment-engine.ts'),
      read('apps/v2-web/src/prototypes/your-world-cup/your-world-cup.css'),
    ].join('\n');
    expect(prototype).not.toMatch(/\.\.\/\.\.\/\.\.\/\.\.\/src\/|auth\/|predictions\/|data\/official|domain\/|@supabase|fetch\(|XMLHttpRequest|analytics|gtag\(|serviceWorker|indexedDB|sessionStorage/i);
    expect(prototype).toContain("'u26v2.prototype.your-world-cup'");
    expect(prototype).toContain("'u26v2.your-world-cup.campaign'");
    expect(prototype).not.toMatch(/localStorage\.(setItem|removeItem)\(['\"]u26v2\.(auth|predictions)/i);
  });

  it('leaves the V1 entry and existing V2 route files untouched by the prototype registration', () => {
    expect(read('index.html')).toContain('src="/src/app.js"');
    expect(read('apps/v2-web/src/ui/BottomNav.tsx')).not.toContain('your-world-cup-prototype');
    expect(read('apps/v2-web/src/routes/Matchday.tsx')).not.toContain('your-world-cup-prototype');
  });
});
