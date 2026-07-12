# Copy-and-paste prompt for the next Terra run

````text
# United 2026 V2 — Package 1: Parallel Foundation

Repository:

`/Users/diegovelez/Claude/Projects/world cup app`

Plan source:

- `docs/rebuild/MASTER_PLAN.md`
- `docs/rebuild/ARCHITECTURE.md`
- `docs/rebuild/DESIGN_AND_PRODUCT.md`
- `docs/rebuild/GAME_AND_RANKED_PLATFORM.md`
- `docs/rebuild/EXECUTION_PLAN.md`

## Objective

Implement only Package 1 from `docs/rebuild/EXECUTION_PLAN.md`: create a minimal parallel United 2026 V2 foundation at `/v2/` using Vite, React, and TypeScript while leaving the current V1 app usable and behaviorally unchanged.

This is a foundation package, not the rebuild. Do not migrate tournament logic, redesign the whole product, build games, change official-data behavior, or touch Supabase.

## Before editing

Run:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log -1 --format=%s
```

Expected state:

- branch is `rebuild/united-v2-plan`
- HEAD subject is exactly `docs(rebuild): define United 2026 V2`
- there are no tracked changes
- untracked `output/` may exist and must remain untouched

Stop without editing if any expected condition fails. Report the exact HEAD SHA you found.

After the gate passes, create and switch to:

`rebuild/united-v2-foundation`

Do not create a backup branch.

## Read first

Read all six files under `docs/rebuild/`, then inspect the current `package.json`, `vercel.json`, `index.html`, `.github/workflows/release-gate.yml`, `playwright.config.js`, `src/navigation/router.js`, `src/styles/tokens.css`, `src/styles/shell.css`, `sw.js`, and the navigation/PWA tests. Ground changes in the current checkout.

## Required implementation

1. Add Vite, React, React DOM, TypeScript, the React Vite plugin, and the smallest reasonable test dependencies. Use current stable compatible versions and update the existing lockfile. Do not replace the current Node test or Playwright setup.
2. Create `apps/v2-web/` as an independently built React + TypeScript application.
3. Serve the V2 app at `/v2/` in development and production builds. Add explicit Vercel routing for `/v2` and `/v2/*` before the existing V1 catch-all.
4. Create four URL-addressable V2 destinations with a mobile bottom navigation:
   - `/v2/` — Matchday
   - `/v2/tournament` — Tournament
   - `/v2/play` — Play
   - `/v2/you` — You
5. Each destination must render an honest foundation placeholder that states the area is being rebuilt. Do not reproduce V1 feature content or invent live scores, ranks, games, profiles, or tournament data.
6. Add a route-level not-found state and a root error boundary with a retry/safe-navigation action.
7. Add isolated V2 tokens, reset, and shell styles imported only by the V2 entry. Use the Match Ledger direction from `DESIGN_AND_PRODUCT.md` only enough to prove typography roles, spacing, safe areas, color roles, focus, and navigation. Do not do the full visual rebuild.
8. Keep controls at least 48 px, support keyboard focus/activation, respect `prefers-reduced-motion`, and prevent horizontal overflow at 320, 390, and 430 CSS pixels.
9. Add V2 scripts for typecheck, unit smoke, and production build while preserving the current `test:logic`, `test:ui`, and `test:release` behavior.
10. Add focused tests proving:
    - all four routes render non-empty content;
    - navigation changes the URL and selected accessible tab;
    - an unknown V2 route shows the not-found state;
    - V1 `/` still loads the existing app;
    - V2 CSS/bundles are isolated from V1;
    - V2 has no service-worker registration yet.
11. Update CI only enough to run V2 typecheck, smoke tests, and build in addition to the existing logic and whitespace gates. Do not weaken or delete existing checks.

## Hard boundaries

- Do not edit application behavior under existing `src/`.
- Do not edit `api/`, `supabase/`, `sw.js`, `manifest.webmanifest`, or existing V1 CSS.
- Do not register a V2 service worker.
- Do not migrate or copy official tournament logic.
- Do not add TanStack Query, Supabase client, analytics, error-reporting vendor, Canvas/game engine, ranked APIs, feature-flag service, or component library in this package.
- Do not delete, rename, or move V1 files.
- Do not write to Supabase, deploy, push, or touch Production.
- Do not use subagents.
- Do not use forced browser clicks or weakened expectations.
- Do not touch `output/`.
- Never use `git add .`.

If Vite's output location or Vercel routing requires a small deviation from the plan, choose the smallest reversible structure, document it, and keep V1 isolated. Pause only for a destructive action, a real scope change, or information only Diego can provide.

## Validation

Run and report direct output for:

```bash
npm run test:logic
npm run test:v2
npm run typecheck:v2
npm run build:v2
git diff --check
git status --short
```

Also run focused browser smoke checks against a production-equivalent local serve:

- V1 `/` at 390 px: existing four-tab app is visible and no V2 asset is loaded.
- V2 `/v2/` at 320, 390, and 430 px: all four destinations work through visible controls, selected state is accessible, URLs are correct, focus is visible, safe-area padding exists, no blank route, and no horizontal overflow.
- Direct-load each V2 URL and the V2 not-found URL.
- Confirm no V2 service worker controls the page.

Do not run browser specs that create or overwrite screenshots inside `output/`. Use temporary test artifacts outside `output/`.

Review the complete diff and match every completion claim to command or browser evidence.

## Commit

Stage only the exact Package 1 files. Never use `git add .`.

Create one local commit:

`feat(v2): create parallel application foundation`

Do not push.

## Definition of done

- V1 remains behaviorally unchanged and usable at `/`.
- V2 production build is reachable at `/v2/` with four deep-linkable placeholder destinations.
- V2 JS and CSS are isolated from V1.
- V2 has typecheck, smoke tests, build, and CI signals.
- Mobile navigation is accessible, safe-area-aware, non-empty, and overflow-free at required widths.
- No service worker, tournament migration, live API, game, auth, Supabase, deployment, or Production work was added.
- Worktree after commit contains only the pre-existing untracked `output/`, if it existed at start.

## Final report

Lead with the outcome. Include:

- starting SHA
- final local commit SHA
- branch
- files/subsystems changed
- V1 isolation proof
- V2 route and mobile proof
- test/typecheck/build results with exact counts where available
- CI change
- anything not verified
- confirmation that there was no push, deploy, Supabase write, service-worker change, or Production change
````
