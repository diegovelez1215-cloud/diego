# United 2026 — Rebuild Report

Branch `fable/world-cup-rebuild` from baseline `205b5ec`. Full rebuild around
canonical tournament truth and a four-tab product (Home, Tournament, Play, You).

## Stale-truth root cause and fix

Four coupled flaws produced the observed failures (stale Group B "Final
Matchday" fixtures during the Round of 32; live England–DR Congo missing while
a future USA–Bosnia tie was promoted):

1. **Hard-coded results** (`DATA.results` / `REAL`, monolith line 3430) held
   group results only — the built-in "truth" had no knockout data.
2. **Stale-cache display**: `/api/*` responses flagged `stale-fallback` were
   rendered instead of rejected.
3. **Phase-model hero**: `tournamentPhaseState()` trusted whatever data was
   present; with stale group data and no R32 fixtures it stayed in
   `final_matchday` and `phlPickFinalModel()` promoted finished group fixtures
   as the Home hero.
4. **Persisted identity**: the `wc26_v1` state blob restored provider fixture
   identity from localStorage across sessions.

Fix: one explicit pipeline. `src/data/fixtures.js` (canonical registry —
identity/schedule only, zero scores) → `src/core/provider-overlay.js`
(rejects `isStale`/unconfigured/error payloads wholesale; every provider entry
must match a canonical fixture by resolved team identity, or — only for
unresolved knockout slots — an exact ±15-min kickoff window; overlays only
status/score/clock/finality; orientation corrected to canonical home/away) →
`src/data/tournament-model.js` (memoized view models; Home hero is a hard rule:
live > upcoming > completed) → views. localStorage is whitelisted to
`u26v2.prefs|play|sims` and every other key is purged at boot; the service
worker holds no page cache. Every competing truth path was physically deleted.

## Architecture map

```
index.html (1.2 KB shell)
src/app.js                boot: purge storage → seed state → paint canonical-first
                          → provider refresh loop (60s live / 5min idle, visible only)
src/core/                 time (AST/UTC-4), canonical-truth (registry, aliases,
                          standings, TP3 slot resolution), provider-overlay
                          (validation), app-state (real/play isolation), persistence
src/data/                 fixtures (canonical registry), tournament-model (memoized
                          view models, per-view invalidation)
src/navigation/           router (persistent outlets, synchronous tab flips),
                          render-scheduler (rAF-queued, deduped)
src/views/                home, tournament, matches, groups, knockout,
                          match-center, play (sealed sim world), you
src/components/           score-stage, match-row, date-control, segmented-control
src/styles/               tokens, shell, real-world, play, responsive
api/                      _shared, results, live (provider proxies only)
tests/  e2e/  docs/
```

## Actual deletion counts (measured)

App code 1,153,127 → 99,335 bytes (−91%). Named functions 1,167 → 115. Tabs
10 → 4. Serverless routes 10 → 3. localStorage keys 8 legacy → 3 whitelisted
(+ boot purge). CSS 3,373 → 621 lines. Tests 28 → 8 logic files; e2e 6 → 3
specs. External services cut: TheOddsAPI, Supabase, Open-Meteo, Wikipedia.
Full inventory: `docs/CORE_AUDIT.md`.

## Tests and outcomes (all verified in this session)

- **Logic suite** (`npm run test:logic`, node --test, ESM): **38/38 pass** —
  canonical registry integrity; PR-local-day Today exactly-once; overlay
  validation (stale rejection, canonical-match requirement, orientation,
  finality precedence, honest missing-score states); persistence whitelist +
  legacy purge + real-truth field stripping; Home hero priority; Play isolation
  (full simulated tournament leaves real overlay byte-identical); view-model
  caching + targeted invalidation; view truth (Matches/Groups/Knockout/Match
  Center); deleted-feature scanner (forbidden tokens + files physically gone;
  index.html must stay <5 KB).
- **Navigation purity** (jsdom + truly queued rAF harness, jobs never run
  immediately): tab taps perform zero fetches, zero storage writes, zero view
  transitions, no sync render; warm revisits enqueue no work; rapid
  Home→Tournament→Play→You ends on a correct, non-empty You.
- **Playwright mobile e2e**: **9/9 pass at iphone-390 and 9/9 at iphone-430**
  (18 total) — live hero with honest score, provider-outage honesty, Today
  exactly-once, 12 groups, complete 32-match chronological knockout, Match
  Center, What-If, My World Cup to champion + save to You, tab-tap network/
  storage purity, no horizontal overflow anywhere. Screenshots reviewed at both
  widths: no blank regions, no clipping.
- `git diff --check`: clean.

Sandbox caveat: WebKit could not launch in this Linux sandbox (missing GTK4
host libraries, no root), so e2e ran on Playwright Chromium headless with the
same iPhone viewports/UA via the `PW_BROWSER` seam in `playwright.config.js`.
WebKit remains the default. **No physical iPhone Safari verification was
performed** — see the smoke-test script below.

## Performance findings

Tab activation is a synchronous class flip over persistent, pre-seeded outlets;
render work is rAF-queued and version-keyed (warm revisit = zero work — proven
by test). No fetch/storage/view-transition on the tap path. Full view-model
derivation for all 104 fixtures measures ~9 ms in Node on this machine; a full
7-round tournament simulation also ~9 ms. Payload dropped from 1.15 MB to
~100 KB of unminified modules. Animations use transform/opacity only;
backdrop-filter is limited to the dock, segmented controls, and the Match
Center sheet.

## Visual-system summary

Tokens in `src/styles/tokens.css`: deep-midnight dark (never flat black), warm
off-white light; disciplined official blue for real surfaces; restrained gold
for Play/You; live red reserved for live states only. One dominant score stage
per Home; editorial match rows; dense readable groups; monumental chronological
knockout. Liquid glass only on interaction surfaces (dock, segmented controls,
compact Match Center sheet). 4 type sizes / 2 weights, tabular numerals,
4/8-px spacing grid, 44-px targets, safe-area insets, `-apple-system-body`
dynamic type, reduced-motion support, VoiceOver labels on rows/stage/dock.
Grug-voice microcopy appears only in Play reveals and empty states.

## Known limitations

- No physical-device iPhone Safari verification (no device access); e2e ran on
  Chromium mobile emulation in-sandbox, WebKit config intact for CI/local.
- Group tie-breaks use points/GD/goals-for (FIFA head-to-head criteria beyond
  that are not modeled); with full provider finals this matters only in rare
  exact ties.
- ~~Knockout is a chronological list~~ — superseded: the experience-completion
  pass shipped the full graphical bracket (see
  `docs/EXPERIENCE_COMPLETION.md`).
- If both providers are unconfigured, the app shows the full official schedule
  with honest "scores unavailable" states — by design, no fallback scores.
- Emoji flags depend on the platform emoji font (fine on iOS).

## iPhone smoke-test script (manual, ~3 minutes)

1. Open the Vercel Preview URL in iPhone Safari (390 pt class device).
2. Home: verify the score stage shows the current live match (or next fixture)
   with round, venue, and either a score or an explicit pending state — never a
   different fixture. Check the Today rail count matches the official schedule
   in Puerto Rico time.
3. Tap Tournament → Matches: Today/Tomorrow/All Dates switch instantly; today's
   fixtures each appear once. Groups: 12 tables. Knockout: R32→Final complete.
4. Tap a live/any row → Match Center sheet: factual status, venue, kickoff AST,
   consequence. Close it.
5. Rapid-tap Home→Tournament→Play→You repeatedly: no blank flashes, no jank,
   ends on You.
6. Play: run a What-If match; begin My World Cup, simulate to a champion, save;
   verify Home/Tournament unchanged afterward. You: saved sim present; toggle
   Appearance; kill and relaunch the app — real scores must NOT restore from
   storage (they refetch), saved sims must persist.
7. Airplane mode + relaunch: official schedule renders with honest unavailable
   notes; nothing invented, nothing blank.
