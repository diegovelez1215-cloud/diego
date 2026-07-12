# United 2026 V2 Execution Plan

## Delivery rules

V2 is built in parallel under `/v2/`. V1 remains usable and deployable through every package. Each package starts from a reconciled branch/HEAD/worktree, makes one reviewable change, runs its focused validation, and creates a checkpoint commit only after the definition of done is met. Database application, external writes, Preview push, and Production promotion are separate explicit operations.

Branch model:

- `rebuild/united-v2-plan` contains this decision pack.
- Create `rebuild/united-v2-foundation` from the committed plan for package 1.
- Continue with short-lived `rebuild/united-v2-pNN-<slug>` branches based on the latest accepted V2 integration commit, or use one long-lived `rebuild/united-v2` branch with checkpoint commits if Diego wants sequential agent handoffs. Recommendation: one long-lived integration branch plus package checkpoint commits until V2 has independent CI.
- Never merge V2 foundation back to Production merely because it builds. Production cutover is package 12.

Route isolation:

- Add an explicit `/v2` rewrite before V1's catch-all.
- Keep V1 source, root index, API behavior, manifest, and service worker unchanged in package 1.
- V2 CSS must be imported from the V2 entry and rooted under a V2 layer/reset. No V2 stylesheet is linked by V1.
- Feature flags are limited to server-controlled capability gates that solve migration risk: `v2Enabled`, `rankedCounterAttack`, `v2PicksWrite`, and later `v2RootCutover`. Do not flag ordinary components, colors, or every route.

Data compatibility:

- Official registry and provider overlay are adapted, not forked.
- Existing `u26v2.*` local records are read only by an explicit migration adapter. V2 writes new versioned namespaces and never makes V1 unable to read its own data.
- Existing authenticated profile/Picks data may be reused after remote schema/RLS verification. Ranked V2 uses new tables and no legacy Arcade scores.
- V2 service worker is scoped to `/v2/` until cutover.

## Package 1 — Parallel V2 foundation

**Objective**

Create a minimal Vite + React + TypeScript application at `/v2/` with four mobile navigation destinations, route/error boundaries, isolated tokens/styles, basic test scaffolding, build/typecheck scripts, and Vercel routing. Prove V1 remains unchanged and usable. No real feature redesign.

**Recommended model and effort**

Codex with high reasoning; medium effort (one focused implementation run).

**Dependencies**

Committed decision pack; clean `rebuild/united-v2-foundation` branch; package-install and lockfile authorization.

**Likely files or subsystem**

`package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig*.json`, `apps/v2-web/**`, `vercel.json`, focused tests under `tests/v2-foundation*` or `apps/v2-web/src/**/*.test.tsx`, and `.github/workflows/release-gate.yml` only as needed for V2 build/typecheck. Existing `src/**`, `api/**`, `sw.js`, and V1 styles remain untouched.

**Validation**

- install from lockfile succeeds;
- V1 `npm run test:logic` stays 268/268 or higher with no regressions;
- V2 typecheck, unit smoke, and production build pass;
- V1 `/` and V2 `/v2/` both load from the same local production-equivalent server;
- 390 and 430 viewport smoke proves four V2 destinations, URL changes, no horizontal overflow, no blank route, keyboard focus, and safe-area layout;
- asset/network inspection proves V1 loads no V2 bundle and V2 loads no V1 CSS;
- `git diff --check` and exact file review.

**Checkpoint**

`feat(v2): create parallel application foundation`

**Definition of done**

The exact commit serves an inert but production-built V2 shell at `/v2/`, V1 behavior and release tests remain intact, navigation is deep-linkable, CSS is isolated, and CI has a V2 build/typecheck signal. No V2 service worker controls either shell.

**Explicit exclusions**

No tournament-domain migration, live API integration, game, auth, Supabase changes, service worker, analytics vendor, final visual polish, V1 deletion, Preview push, or Production cutover.

## Package 2 — Typed tournament-domain bridge

**Objective**

Create typed, framework-free adapters for canonical fixtures, time, standings, best-thirds, knockout slots, and tournament models; feed fixture-backed placeholder data to V2 Tournament without changing V1 modules.

**Recommended model and effort**

Codex with high reasoning; high effort.

**Dependencies**

Package 1 accepted; canonical characterization vectors available.

**Likely files or subsystem**

`packages/tournament-domain/**`, adapters around `src/data/fixtures.js`, `src/core/canonical-truth.js`, `src/core/time.js`, `src/data/tournament-model.js`, V2 Tournament routes, shared type schemas, golden test fixtures.

**Validation**

Byte/semantic parity for all 104 fixtures, day buckets, standings, TP3 allocations, every advancement edge, unresolved slots, and complete knockout; V1 logic suite; V2 typecheck/build; route tests for Matches/Groups/Bracket at 390/430.

**Checkpoint**

`feat(v2): bridge canonical tournament domain`

**Definition of done**

V2 Tournament renders canonical schedule/groups/bracket from the shared domain adapter; no scores are embedded or persisted; V1 outputs remain unchanged; the package has no React/fetch/storage imports.

**Explicit exclusions**

No provider fetch, Matchday redesign, stats/venues polish, database change, or deletion/movement of V1 truth modules.

## Package 3 — Official snapshot and Matchday

**Objective**

Add a normalized V2 official snapshot boundary and build Matchday plus match detail from verified models, preserving fail-closed identity/freshness rules.

**Recommended model and effort**

Codex with high reasoning; high effort.

**Dependencies**

Packages 1–2; confirmed provider/API budgets; snapshot schema approved.

**Likely files or subsystem**

`packages/official-data/**`, `/api/v2/official/snapshot`, adapters around `provider-overlay.js` and refresh policy, V2 Matchday and match route, TanStack Query setup, source-health/error components, contract tests.

**Validation**

Provider mismatch/stale/unconfigured/finality/orientation fixtures; no official truth in localStorage/Cache Storage; live > upcoming > final hero priority; polling pauses hidden; ETag/retry behavior; Matchday/match browser tests at 390/430; API budget and redaction tests.

**Checkpoint**

`feat(v2): ship verified Matchday snapshot`

**Definition of done**

V2 shows canonical Matchday and match detail with verified live state, honest degraded states, stable deep links, and no raw provider shape in UI code. V1 APIs continue to operate.

**Explicit exclusions**

No Picks writes, Supabase migration, ranked game, service worker, stats expansion, or root cutover.

## Package 4 — Identity, You, and record migration contract

**Objective**

Build V2 authentication/profile ownership and the You record-book shell. Define a non-destructive, versioned reader for V1 local records and new V2 record namespaces.

**Recommended model and effort**

Codex with high reasoning; high effort.

**Dependencies**

Packages 1–3; current Supabase project/migration/RLS state verified read-only before implementation.

**Likely files or subsystem**

`packages/identity/**`, V2 auth provider, You routes, profile/record schemas, local outbox, Supabase client boundary, migrations drafted but not applied, RLS tests.

**Validation**

OTP/session refresh/sign-out tests; public/private profile fields; corrupt/partial V1 record reads; idempotent migration; V1 remains able to read its stores; RLS static/integration tests against an isolated environment only; accessibility and offline states.

**Checkpoint**

`feat(v2): establish player identity and records`

**Definition of done**

Signed-out and signed-in You routes work honestly; legacy records are labeled and never promoted into V2 ranked authority; session handling uses the supported client; no Production migration has run.

**Explicit exclusions**

No public replay publishing, ranked tables, Picks mutation, prizes, or deletion of `src/core/leaderboard.js`.

## Package 5 — Picks migration

**Objective**

Move Prediction Run into a V2 Picks workflow: actionable fixtures, clear lock time, local outbox, authenticated sync, official settlement, and rank/history in You.

**Recommended model and effort**

Codex with high reasoning; high effort.

**Dependencies**

Packages 2–4; verified Supabase fixture schedule parity; settlement operational plan.

**Likely files or subsystem**

V2 Play/Picks route, Picks domain, sync/outbox, `/api/v2/picks`, current `api/settle.js` adapter or successor, Supabase migrations/RLS, rank read model.

**Validation**

Lock exactly at database kickoff; offline draft/sync conflict; idempotent settlement; client cannot write results/rank; official/provider mismatch rejected; ranking parity fixtures; browser join/pick/lock/result flow; migration dry-run and rollback script.

**Checkpoint**

`feat(v2): migrate verified Picks competition`

**Definition of done**

V2 players can make and sync eligible Picks, see honest status and server-settled rank, and cannot alter locked picks or official results. Production remains gated behind explicit migration approval.

**Explicit exclusions**

No ranked game, realtime rank animations, prizes, private leagues, wagering, or root cutover.

## Package 6 — Counter Attack engine prototype

**Objective**

Build the headless deterministic Counter Attack engine, AI, event contract, replay validator, debug renderer, and automated tuning harness before product UI.

**Recommended model and effort**

Codex with high reasoning; very high effort, split into engine/AI and calibration checkpoints if needed.

**Dependencies**

Package 1; game/ranked contract in this decision pack; target device access for later package.

**Likely files or subsystem**

`packages/game-counter-attack/**`, `packages/ranked-contracts/**`, simulation CLI/test harness, golden replays, AI debug outputs. No production route integration.

**Validation**

Determinism/property/fuzz tests; fixed-step invariants; collision and offside rules; coordinated role assignments; input bounds; 10,000 seeded runs; browser/Node golden state hashes; CPU budgets; no DOM/Date/network/storage/global RNG imports.

**Checkpoint**

`feat(v2): build deterministic counter attack engine`

**Definition of done**

The same seed and tick-stamped input log produce identical score/state hashes in Node and browser, AI behavior is explainable in debug output, and calibration bands show skill-sensitive but bounded outcomes.

**Explicit exclusions**

No polished art, sound, global ranking, production API, campaign, or claim that the game is fun before device playtesting.

## Package 7 — Counter Attack mobile experience

**Objective**

Build the Canvas 2D renderer, touch controls, camera, animation state presentation, tutorial, practice, HUD, sound hooks, results, and performance instrumentation.

**Recommended model and effort**

Codex with high reasoning plus human physical-device playtesting; very high effort.

**Dependencies**

Package 6 accepted; final visual assets available or generated; physical iPhone Safari access.

**Likely files or subsystem**

V2 Play route, Canvas renderer/input/audio adapters, sprites/assets, DOM HUD, tutorial and practice records, performance probes, browser specs.

**Validation**

Real pointer gestures without forced clicks; 320/390/430 and landscape/tablet; five-run memory/leak check; 60 fps/frame/input budgets; hidden/pause/rotation/cancel; reduced motion, mute, VoiceOver alternative/status; at least three human playtest rounds with observed tutorial completion and qualitative feel notes.

**Checkpoint**

`feat(v2): deliver counter attack on mobile`

**Definition of done**

Counter Attack feels continuous and readable on a physical iPhone, meets performance/accessibility budgets, and has a compelling practice/daily-unranked loop. Weak mechanics are removed rather than protected.

**Explicit exclusions**

No worldwide rank, prizes, Arcade Cup, additional games, or Production claim.

## Package 8 — Ranked challenge authority

**Objective**

Implement signed challenge issuance, replay submission, server validation, immutable scores, daily/weekly/season/personal ranks, private replay audit, and fail-closed client integration.

**Recommended model and effort**

Codex with high reasoning and security review; very high effort.

**Dependencies**

Packages 4, 6, and 7; isolated Supabase/Vercel Preview resources; privacy/retention policy.

**Likely files or subsystem**

`apps/ranked-api/**`, ranked Supabase migrations, shared contracts, V2 ranked UI states, rate-limit/quarantine observability, replay storage.

**Validation**

Signature/nonce/expiry/idempotency/race/adversarial logs; cross-runtime parity; CPU/payload limits; RLS privilege matrix; private replay access; version rollover; tie/period boundaries; Realtime invalidation with polling fallback; 10,000 replay fuzz cases; load test to expected peak.

**Checkpoint**

`feat(v2): add server-authoritative ranked challenges`

**Definition of done**

The browser cannot create or alter ranked authority, every accepted score is server-replayed, ranks are deterministic and versioned, private replays remain private, and rejection reasons are observable.

**Explicit exclusions**

No legacy score migration, prizes, public replay publication, second ranked game, or Production database application without approval.

## Package 9 — Public replays and competitive loops

**Objective**

Add opt-in replay publication, daily/weekly recap, rank movement based on observed authoritative ranks, and clear season rules.

**Recommended model and effort**

Codex with high reasoning; high effort.

**Dependencies**

Package 8; Diego decision on default visibility; moderation/reporting minimum.

**Likely files or subsystem**

Replay viewer, publication controls, rank/recap routes, moderation hooks, Supabase visibility policies/views, sharing metadata.

**Validation**

Private/unlisted/public matrix; revoke visibility; deleted profile behavior; replay version playback; no sensitive fields; truthful movement; share deep links; accessibility and abuse reporting.

**Checkpoint**

`feat(v2): publish verified replay and rank loops`

**Definition of done**

Players can knowingly publish/revoke verified replays, ranks link only to permitted content, and daily/weekly loops use verified facts.

**Explicit exclusions**

No chat, comments, follows, DMs, prizes, or fabricated social feed.

## Package 10 — PWA and offline/update migration

**Objective**

Add the scoped V2 service worker, install/update UX, safe offline shell, version-aware active-game behavior, and rollback-safe cache ownership.

**Recommended model and effort**

Codex with high reasoning; high effort.

**Dependencies**

Stable V2 asset graph and routes from packages 1–9.

**Likely files or subsystem**

V2 worker build entry, manifest, update coordinator, cache tests, Vercel headers/routes. V1 worker changes only in a separately reviewed bridge step.

**Validation**

Installability; `/v2/` scope only; offline shell; official/ranked/auth network-only; update during active/unranked/ranked play; controller ownership; cache cleanup limited to V2; upgrade/downgrade/rollback on iPhone Safari.

**Checkpoint**

`feat(v2): add safe scoped PWA lifecycle`

**Definition of done**

V2 installs and updates without intercepting V1 or serving stale truth/ranked data, and a rollback does not strand clients on missing assets.

**Explicit exclusions**

No root scope, V1 cache deletion, push notifications, background score sync, or Production cutover.

## Package 11 — Observability, budgets, and release gate

**Objective**

Complete analytics/error/logging contracts, performance instrumentation, CI gates, accessibility audit, and exact Preview verification workflow.

**Recommended model and effort**

Codex with high reasoning; high effort.

**Dependencies**

Packages 1–10 feature-complete for candidate scope.

**Likely files or subsystem**

Observability package, error boundaries, performance marks, bundle budgets, GitHub Actions, Playwright projects/specs, release checklist/scripts, privacy documentation.

**Validation**

Full logic/type/build/browser suite; WebKit 390/430; physical iPhone smoke; bundle/frame/memory budgets; axe/manual VoiceOver; log redaction; API/ranked dashboards; exact commit to protected Preview; service-worker source/controller proof; clean worktree.

**Checkpoint**

`chore(v2): enforce release and performance gates`

**Definition of done**

Every Production criterion has automated or named manual evidence, the exact Preview commit is verified, and outstanding failures are explicit blockers.

**Explicit exclusions**

No Production promotion, root route switch, V1 deletion, or scope expansion.

## Package 12 — Production promotion and rollback

**Objective**

Promote V2 to the root only after approval, with a reversible routing/worker/data sequence and monitored rollback window.

**Recommended model and effort**

Codex with high reasoning plus Diego approval at each external mutation; high operational effort.

**Dependencies**

Package 11 green; approved Supabase migrations already verified in Preview; rollback commit/deployment identified; legal/product decisions complete.

**Likely files or subsystem**

`vercel.json`, root HTML/manifest/worker bridge, environment flags, deployment records, runbook. V1 remains in the repository for at least one rollback cycle.

**Validation**

Preview exact-commit gate; migration status; data backup/rollback plan; root and legacy fallback URLs; fresh install and V1-upgrade PWA paths; live API/Picks/ranked smoke; logs/errors/performance for staged cohort; rollback drill.

**Checkpoint**

`release(v2): promote United 2026 V2`

**Definition of done**

Production serves V2 at root, data and workers are healthy, monitored budgets hold, and rollback can restore the prior production deployment without data corruption or stale-cache lock-in.

**Explicit exclusions**

No immediate V1 source deletion, post-World-Cup competition expansion, new game, prize program, or cleanup that weakens rollback.

## Production promotion gate

All must be green on the exact candidate commit:

- V1 regression and V2 unit/type/build/browser suites;
- official truth contract and outage behavior;
- Picks kickoff lock and server settlement in the target environment;
- ranked replay parity/security/RLS/load gates, or ranked remains disabled;
- physical iPhone Safari Matchday, navigation, Picks, game, auth, install/update, and offline smoke;
- accessibility manual pass;
- bundle, LCP, INP, frame, memory, and API budget targets;
- no V2 worker controlling V1 before planned bridge;
- exact Vercel Preview commit READY with clean console and logs;
- remote migration history reconciled with repository migrations;
- documented rollback deployment and owner;
- Diego explicitly approves Production promotion.
