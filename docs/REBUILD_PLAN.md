# United 2026 — Rebuild Plan

Branch `fable/world-cup-rebuild` from baseline `205b5ec`. Autonomous end-to-end rebuild
around canonical tournament truth and a four-tab product.

## Verified root problems (evidence from this session's audit)

1. **Stale-truth root cause (three coupled flaws):**
   - `index.html:3430` — hard-coded `DATA.results` (`REAL`) contains group-stage
     results only. During the knockout stage the built-in truth has no knockout data.
   - `api/_shared.js` (`cachedRoute`, `staleMs`) — on provider failure it serves a
     `stale-fallback` payload; the client displayed it instead of rejecting it.
   - `index.html:~7056` (`tournamentPhaseState`) — phase detection trusts whatever
     data is present. With stale group data and no R32 fixtures, the app stays in
     `final_matchday` phase and `phlPickFinalModel()` promotes finished Group B
     fixtures (Switzerland–Canada, Bosnia–Qatar) as the Home hero over the live
     England–DR Congo match.
   - A secondary identity leak: `api/officialR32Fixtures.js` injects curated team
     names as synthetic provider fixtures — a second owner of fixture identity.
2. **Monolith:** one 1.15 MB `index.html` (~3.4k lines CSS, ~7.5k lines JS), 10 tabs
   via `SCRMAP`, single dirty-flag dispatcher that re-renders whole screens,
   `document.startViewTransition` on tab taps, localStorage writes on every state
   mutation, no view-model memoization for Home/Knockout.
3. **Out-of-product surfaces:** betting/odds/slips/tickets/cashout/bankroll (23
   storage keys, TheOddsAPI via `api/odds.js`), Supabase leaderboard, social hub,
   rankings, player leaders, matchup explorer, cities/road/stats routes, weather
   (Open-Meteo), Wikipedia stadium fetches, matchcast director.

## Approach: rewrite, not relocate

The monolith is replaced by static browser ES modules. No framework. Canonical data
(104 fixtures, 48 teams, 16 venues, third-place allocation matrix, team ratings) is
extracted from the baseline monolith as **identity/schedule data only — no results,
no scores** (results come from the provider at runtime; rule: never hard-code
results).

### Truth pipeline

```
src/data/fixtures.js         canonical registry: id, stage, group, kickoff (UTC-4),
                             venue, team codes or slot spec, advancement edges
src/core/canonical-truth.js  registry index, team-name alias index, slot resolution
                             (group ranks + TP3 matrix) derived ONLY from validated
                             provider results
src/core/provider-overlay.js validates /api/results + /api/live payloads; rejects
                             stale/unconfigured/mismatched data; overlays ONLY
                             status/score/clock/finality onto matched canonical ids
src/data/tournament-model.js memoized derived view models (home, matches-by-day,
                             groups, knockout, match center), invalidated by
                             overlay version
views                        consume view models only
```

Rules enforced in code and tests: provider entries that do not match a canonical
fixture are dropped; `isStale`/`sourceStatus!=='ok'`/`configured:false` payloads are
rejected wholesale; canonical identity is never replaced; missing scores render an
honest pending state; Puerto Rico local day (fixed UTC-4) buckets Today/Tomorrow.

### Persistence

`src/core/persistence.js` whitelists exactly: UI prefs (theme), Play state, saved
simulations (`u26v2.prefs`, `u26v2.play`, `u26v2.sims`). On boot it purges every
legacy key. No real-tournament data is ever persisted or restored. No storage
writes during tab navigation.

### Navigation

`src/navigation/router.js`: 4 persistent outlets created once; a tab tap
synchronously flips visibility classes — no fetch, no storage write, no
startViewTransition, no render work if the outlet has valid content.
`src/navigation/render-scheduler.js`: rAF-queued, deduped per-view rendering.
Provider refresh runs on boot, on visibility gain, and on a visible-data interval —
never on tab taps.

## Deletion list (physical)

- `index.html` monolith internals (rewritten shell, ~1.13 MB removed)
- `api/odds.js`, `api/scorers.js`, `api/matchstats.js`, `api/matchday.js`,
  `api/rapid.js`, `api/diag.js`, `api/officialR32Fixtures.js` (odds, stats routes,
  duplicate identity fallback, diagnostics)
- All 28 legacy `tests/*` (interface with monolith globals; replaced by new suite)
- Legacy e2e specs + stale screenshot baselines
- Root clutter: `CODEX_RELIABILITY_NOTE.md`, `DESIGN_HANDOFF.md`,
  `World-Cup-App-Design-Handoff.md`, `RELEASE_NOTES.md`,
  `SUPABASE_leaderboard_fix.sql`, `deploy.command`, `_probe.js`, `_relite_test.js`,
  `worldcup-dbg.js`, `testwrite.tmp`
- `.github/workflows/release-gate.yml` replaced with a workflow for the new suite

Kept: `api/_shared.js` (minus unused provider guards), `api/results.js` (minus R32
manifest injection), `api/live.js`, icons, `manifest.webmanifest` (shortcuts
pruned), `sw.js` (rewritten minimal, never caches `/api/`), `vercel.json`.

Full inventory with counts: `docs/CORE_AUDIT.md`.

## Architecture (target, as specified)

`index.html` (slim shell) + `src/core/*`, `src/data/*`, `src/navigation/*`,
`src/views/*` (home, tournament, matches, groups, knockout, match-center, play,
you), `src/components/*` (score-stage, match-row, date-control, segmented-control),
`src/styles/*` (tokens, shell, real-world, play, responsive), `src/app.js` boot.

Play (What-If + My World Cup) owns a private namespace; it deep-copies derived real
state and can never write back into it (enforced by module boundaries + tests).

## Test plan (new suite, `node --test`, ESM; no monolith globals)

1. `canonical-truth.test.mjs` — registry integrity; slot/advancement edges; PR-day
   bucketing; Today contains each local-day fixture exactly once.
2. `provider-overlay.test.mjs` — overlay requires canonical match; stale/fallback/
   mismatch rejected; missing scores preserve identity; no identity replacement.
3. `persistence.test.mjs` — whitelist only; legacy keys purged; persisted data can
   never restore fixture identity/scores/standings.
4. `home-model.test.mjs` — live outranks future/completed; hero selection.
5. `play-isolation.test.mjs` — Play/My World Cup mutations never alter real models.
6. `navigation.test.mjs` (jsdom) — tab taps: no fetch/storage write/view
   transition; rapid Home→Tournament→Play→You ends non-empty and correct; truly
   queued rAF harness (manual flush, never immediate).
7. `view-cache.test.mjs` — memoized models not recomputed for same version;
   canonical updates invalidate only affected views.
8. `views-truth.test.mjs` — Matches/Groups/Knockout/Match Center render correct
   validated content.
9. `deleted-features.test.mjs` — betting/social/odds tokens unreachable in shipped
   code.
10. Playwright (`e2e/`) — 390/430 WebKit: navigation purity, no blank states, no
    horizontal overflow, screenshots.

CI: rewrite workflow to run the logic suite (and lint via `git diff --check`).

## Acceptance criteria

- Exactly 4 tabs; all listed dead surfaces physically absent from the repo.
- Truth pipeline rules 1–12 hold, with tests proving each.
- Warm tab change is a synchronous class flip (<100 ms budget); no tap-time fetch,
  storage, transition, or derivation.
- 390/430 screenshots show no blank regions, clipping, or overflow.
- Branch committed, pushed, Vercel Preview exists; no Production deploy.
