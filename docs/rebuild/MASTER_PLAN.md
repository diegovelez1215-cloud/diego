# United 2026 V2 Master Plan

Status: decision record for implementation. Repository baseline: `dfe944f7c8ca5ce788502b9ad7b304d8c877ca32` on `rebuild/united-v2-plan`.

## Executive decision

Build United 2026 V2 as a parallel, mobile-first application while keeping the current app available until V2 passes explicit release gates. Preserve the canonical tournament registry, provider-overlay validation, standings/slot resolution, polling safeguards, and official-versus-simulation isolation. Replace the presentation shell, the 5,095-line Play view, the local-only identity model, and the DOM-driven game runtime.

V2 will use Vite, TypeScript, and React. Migration is incremental by domain and route, not a big-bang rewrite. Pure tournament modules cross the boundary first behind typed adapters; screens and game systems are rebuilt inside an isolated V2 shell. Production remains on V1 until the V2 shell, live Match Center, Picks, identity, offline/update behavior, and the first excellent game all pass Preview gates.

The product has four top-level destinations:

1. **Matchday** — the live and next-match command center.
2. **Tournament** — schedule, groups, bracket, stats, and venues.
3. **Play** — a small catalog led by one direct-control football game, plus Picks and selected unranked experiences.
4. **You** — identity, rank, records, replays, streaks, and settings.

Picks lives inside Play during discovery and inside You as record/rank history. It is not a fifth top-level destination.

## Product promise

United 2026 should answer four questions quickly:

- What matters in the World Cup right now?
- What should I return to do today?
- Can I compete on the same fair challenge as everyone else?
- What has my football identity and record become over time?

During the World Cup, Matchday and Tournament lead. After the final, Play and You lead, while Matchday becomes a daily football briefing powered only by competitions for which United has verified data rights and reliable feeds. The enduring loop is daily challenge, Picks or football calls, personal records, replayable moments, weekly rank, and a compact verified match briefing—not a frozen tournament museum.

## Current repository findings

### Strong foundations to preserve

- `src/data/fixtures.js` owns the 104-match canonical schedule and tournament graph without embedded scores.
- `src/core/canonical-truth.js` resolves aliases, standings, best thirds, knockout slots, and advancement edges.
- `src/core/provider-overlay.js` rejects stale, unconfigured, conflicting, or unmatched provider entries before they can affect official views.
- `src/data/tournament-model.js` memoizes derived Home, Matches, Groups, Knockout, and Match Center models by overlay version.
- `src/core/app-state.js` and `src/core/persistence.js` separate ephemeral official state from persisted Play/prefs/sims and strip forbidden truth fields recursively.
- `src/app.js` coalesces provider refreshes, pauses hidden-tab polling, and uses different live, idle, and scorer cadences.
- `api/_shared.js` contains structured safe logging and a persistent, fail-closed API-Sports quota guard backed by Redis.
- `api/settle.js` validates finished provider results through the same canonical overlay used by the client before server-only Supabase settlement.
- `tests/` covers truth, navigation purity, simulation isolation, replay determinism, PWA boundaries, auth/leaderboard contracts, and game fairness. The audited baseline passed 268/268 logic tests.

### Structural problems to replace

- `src/views/play.js` is 5,095 lines and owns catalog rendering, several engines, WebAudio, timers, simulation, persistence folding, campaign, Picks, and navigation wiring. It is the largest change-risk concentration.
- The router in `src/navigation/router.js` has fast persistent outlets but no URL-addressable application routes, deep links, route-level loading, or error boundaries.
- State is one mutable singleton. Tags provide coarse invalidation but do not express ownership, async lifecycle, or server-cache policy.
- Rondo's pure logic is deterministic, but its production loop advances every 100 ms through `setInterval`; DOM actors jump between logic samples and CSS fills the gaps. Input is destination selection rather than continuous football control.
- Match Lab, Final Minute, Coach's Call, My World Cup, and Arcade Cup share a screen file but not one coherent runtime or ranked contract.
- `src/core/leaderboard.js` manually implements auth token storage, refresh, PostgREST calls, and profile/board state. Ranked Arcade correctly fails closed, but the schema still contains legacy arcade artifacts that V2 must not reuse.
- `sw.js` hard-codes every shell asset and deletes all prior caches on activation. That is brittle during a parallel-shell migration.
- `.github/workflows/release-gate.yml` runs logic tests and `git diff --check`, but not the configured Playwright suite, a V2 build, type checking, bundle budgets, or accessibility checks.
- `vercel.json` rewrites every non-API path to the V1 `index.html`; V2 needs explicit route isolation before the catch-all.

## Feature disposition

| Current capability | Decision | V2 destination and rationale |
| --- | --- | --- |
| Canonical fixtures, standings, TP3 and knockout resolution | Preserve | Shared domain package; this is trusted tournament logic. |
| Provider overlay and refresh policy | Preserve, type, harden | Official-data gateway; keep fail-closed matching and freshness semantics. |
| Home and Match Center | Merge and rebuild | One Matchday surface with a focused match sheet/route. Remove duplicated command-center/card stacks. |
| Matches, Groups, Bracket | Preserve logic, rebuild UI | Tournament. Keep truthful models; replace presentation. |
| Stats | Preserve only verified metrics | Tournament. No inferred leaderboards or standalone assists claim when source scope cannot support it. |
| Venues | Preserve as secondary reference | Tournament, below core competition views; not a primary return loop. |
| Prediction Run | Rename to Picks and preserve | Play for making picks; You for rank/history. Server-settled official results remain authoritative. |
| Rondo | Preserve engine lessons and replay tests; retire as flagship | Optional unranked training prototype only if it survives playtesting. Do not ship it merely because it exists. |
| Penalty Rush | Rebuild selectively | Unranked skill side mode after the flagship; keep keeper-read and replay ideas, replace pulse/card-heavy presentation. |
| Final Minute | Merge | Its late-match fantasy becomes scenario content for the flagship or a compact unranked tactics mode. |
| Match Lab | Rebuild later | Unranked football story/sandbox. Separate from direct-control ranked scoring. |
| Coach's Call | Merge into training/scenarios | Useful scenario content, not a top-level game. |
| My World Cup | Preserve domain idea, rebuild later | Unranked long-form sandbox after core launch. |
| Arcade Cup | Retire as a shell | Do not wrap average modes in a campaign to simulate depth. A season can return only when the underlying games are excellent. |
| Local museum and legacy shelf | Migrate to Records | You. Preserve readable historical achievements with source/version labels. |
| Global Picks leaderboard/auth/profile | Preserve contract, rebuild client | You. Supabase Auth/RLS and server settlement remain boundaries. |
| Legacy `public.scores` and browser-reported `arcade_scores` | Isolate and retire | Never migrate into ranked V2. Keep read-only only if legal/product history requires it. |
| Theme toggle | Preserve later | You settings; launch with one fully resolved visual system first. |

## Return loops

### Daily

- Matchday opens to the next decisive verified event or live match, never a generic dashboard.
- One signed daily Counter Attack challenge uses the same seed and rules for eligible players.
- Picks shows only actionable, pre-kickoff fixtures and a clear lock time.
- You shows personal best delta, daily placement, streak status, and one replay/moment worth revisiting.

### Weekly

- A seven-day ranked table aggregates authoritative daily run scores using the best eligible run per challenge.
- Weekly Picks form and official tournament rank update only after server settlement.
- A weekly recap in You names verified facts: games played, best rank, personal-best improvements, correct picks, and saved replays.

No fabricated activity feed, fake live badge, or artificial scarcity is permitted.

## Ranked versus unranked

Ranked experiences must use server-issued challenges, versioned deterministic engines, tick-quantized event logs, server replay, authoritative score persistence, and immutable results. At V2 launch, eligible ranked surfaces are:

- Counter Attack daily/weekly challenge, after server parity is proven.
- Picks, locked against canonical kickoff and settled from official results.

Unranked experiences include practice, tutorials, custom Counter Attack scenarios, Penalty Rush, Match Lab, My World Cup, and any legacy replay. Unranked results may live locally or in clearly labeled personal cloud records, but never enter global ranks.

## Success metrics

- Matchday meaningful content visible within 1.5 seconds on a warm mid-tier phone and within 2.5 seconds on cold 4G.
- Primary navigation response under 100 ms; no blank destination state.
- Game input-to-visible-response under 50 ms at p95, with 60 fps target and no logic dependence on render rate.
- At least 70% of new users can complete the flagship tutorial without explanatory copy outside the playfield.
- Ranked replay rejection/acceptance is deterministic across browser and server fixtures.
- Zero official score, fixture identity, rank, or challenge result accepted from an untrusted browser assertion.
- Crash-free sessions above 99.5%; API errors grouped by route/provider/status without secrets or personal data.

## Decisions reserved for Diego

Implementation does not require routine design choices from Diego. Three business decisions remain before Production promotion:

1. Which non-World-Cup competitions United is licensed and funded to cover after July 2026.
2. Whether public player replays are opt-in by default or private by default. Recommendation: private by default, explicit publish.
3. The moderation, age, prize, and eligibility policy if ranked play ever awards anything of material value. Recommendation: launch ranks without prizes.

## Release principle

V1 remains the production fallback until V2 is demonstrably better. No database migration, service-worker takeover, route cutover, or Production promotion is bundled into ordinary feature packages. Preview evidence must identify the exact commit, viewport, test result, data environment, service-worker controller, and rollback target.
