# United 2026 — Core Audit

Baseline `205b5ec` (1,153,127-byte `index.html` monolith, 1,167 named functions,
10 tabs) versus the rebuilt four-tab app on `fable/world-cup-rebuild`. All counts
below were measured with grep/wc against both trees in this session.

## KEEP

| Surface | Old entry point | Now |
| --- | --- | --- |
| Official fixture ingestion | `/api/results`, `/api/live` proxies | Kept (results.js pruned of the R32 name manifest); consumed by `src/core/provider-overlay.js` with strict validation |
| Matches (Today/Tomorrow/All) | `SCRMAP.schedule` | `src/views/matches.js` |
| Groups | `SCRMAP.groups` | `src/views/groups.js` (standings derived from validated provider finals only) |
| Knockout bracket | `SCRMAP.bracket` | `src/views/knockout.js` (complete, chronological, R32→Final) |
| Match Center | sheet inside monolith | `src/views/match-center.js` |
| What-If Match | part of Play arcade | `src/views/play.js` (ratings-driven sim engine, seeded RNG) |
| My World Cup simulation | `startPredictFlow`/sim mode | `src/views/play.js` (sealed sim world, deep-copied real finals) |
| Saved simulations | scattered in `wc26_v1` blob | `src/views/you.js` + `u26v2.sims` |
| Basic preferences | `wc26_sound`, `wc26_seen`, … | `u26v2.prefs` (theme) |
| Icons, manifest, vercel.json | — | Kept (manifest betting shortcuts removed) |
| Canonical schedule data | `const DATA` inside monolith | `src/data/fixtures.js` — identity/schedule only; the hard-coded results table was **not** carried over |

## DELETE (physically removed)

| Surface | Old entry point | Why removed | Replaced by |
| --- | --- | --- | --- |
| Betting/bankroll/wallet/odds/slips/tickets/cashout/payouts | `SCRMAP.bet` tab, `renderBetting`, `settleAllBets`, `ticketStatusInfo`, ~23 storage fields in `wc26_v1`, `wc26_odds` | Fake sportsbook mechanics, outside the four-tab product | Nothing — deliberately |
| Odds route | `api/odds.js` (TheOddsAPI) | Betting surface | — |
| Leaderboard/social hub/rankings | Supabase (`SUPABASE_leaderboard_fix.sql`), `wc26_lb_backup`, `wc26_lb_ranks`, `wc26_name` | Social layer, outside product | You tab is private |
| Player leaders / stats routes | `api/scorers.js`, `api/matchstats.js`, `REALGOALS`/`REALASSISTS` hard-coded stats | Stats routes cut; hard-coded stats violate truth rules | — |
| Cities / road / compare / h2h routes | `SCRMAP.cities/road/compare/stats/h2h` + Wikipedia/Open-Meteo fetches | Outside product | — |
| Matchcast director / ticket cinematics | `window.__ts2`, `phase20` | Betting presentation layer | Play reveals (restrained) |
| Duplicate renderer + navigation systems | dirty-flag full-app `render()`, `switchTab`, `startViewTransition` transitions | Root cause of blank screens and slow taps | `src/navigation/router.js` (persistent outlets) + rAF scheduler |
| Hard-coded results (`DATA.results`, `REAL`) | monolith line 3430 | **Stale-truth root cause #1** — competing truth path | Provider overlay only |
| Stale-cache display path | client accepted `stale-fallback` payloads | **Root cause #2** | `payloadAccepted()` rejects them |
| Phase-model hero (`tournamentPhaseState`/`phlPickFinalModel`) | Home hero picked from cached phase | **Root cause #3** — promoted finished Group B fixtures over live R32 | `homeModel()` (live > upcoming > final) |
| R32 verified-name manifest | `api/officialR32Fixtures.js` injected into `/api/results` | Second owner of fixture identity | Canonical registry + derived slots |
| Legacy persisted state blob | `wc26_v1` (could restore provider fixture identity) | **Root cause #4** — storage restored stale truth | Whitelist (`u26v2.*`) + boot purge of everything else |
| Legacy service-worker page cache | `sw.js` cache-first shell | Could revive stale shells | Minimal SW, no fetch handler, drops all caches |
| API infra routes | `api/diag.js`, `api/matchday.js`, `api/rapid.js` | Diagnostics/duplicates of results/live | — |
| Legacy tests | 28 `tests/*` files (jsdom-eval of monolith globals) | Interface died with the monolith; many covered deleted features | 8 new module-level suites (38 tests) |
| Legacy e2e | 6 specs + 10 screenshot baselines | Covered betting/matchup surfaces; helpers keyed to monolith globals | 3 new specs (9 tests × 2 viewports) |
| Repo clutter | `CODEX_RELIABILITY_NOTE.md`, `DESIGN_HANDOFF.md`, `World-Cup-App-Design-Handoff.md`, `RELEASE_NOTES.md`, `deploy.command`, `_probe.js`, `_relite_test.js`, `worldcup-dbg.js`, `testwrite.tmp` | Dead notes/debug scripts | `docs/` |

### Measured deletion counts

- Bytes of app code: **1,153,127 → 99,335** (index.html 1,236 + src 98,099); −91%
- Named functions: **1,167 → 115**
- Tabs/routes: **10 → 4**; sub-routes compare/stats/cities/road/h2h → 0
- Serverless routes: **10 → 3** (`_shared`, `results`, `live`)
- localStorage keys: **8 legacy → 3 whitelisted**; boot purges all others
- CSS: **3,373 lines / 2,824 rules → 621 lines**
- Test files: **28 → 8** logic (38 passing tests), e2e **6 → 3** specs
- External services cut: TheOddsAPI, Supabase, Open-Meteo, Wikipedia

## REPLACE LATER

- Match Center could regain factual stats (possession/shots) if a validated,
  quota-safe provider route is reintroduced — never hard-coded.
- Knockout could gain a graphical bracket layout; the chronological list is the
  truth-correct foundation.
- What-If could grow group-scenario exploration (Polymarket-style implications)
  using the same sealed sim world.
