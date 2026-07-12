# United 2026 V2 Architecture

## Decision summary

- **Stack:** Vite + TypeScript + React.
- **Migration:** parallel and incremental; no full rewrite cutover.
- **Rendering:** React for product UI, Canvas 2D for direct-control games, DOM for accessible HUD and controls.
- **State:** domain stores by ownership, TanStack Query for server state, route/local state for ephemeral UI; no new global mutable singleton.
- **Backend:** Vercel functions as trust boundary; Supabase for Auth, durable player data, ranks, and Realtime invalidation—not official feed ingestion or game simulation authority by itself.
- **Offline:** build-manifest-driven V2 worker with explicit scope and network-only truth/ranked APIs.

React is chosen because V2 needs composable screens, route/error boundaries, mature accessibility primitives, predictable testing, and a maintainable hiring ecosystem. Vite provides a small migration surface and fast builds. TypeScript is mandatory at trust boundaries and for shared browser/server replay. This is not permission to translate every V1 file mechanically: stable pure tournament modules remain intact until characterized, then receive typed façades and move one at a time.

## Target repository shape

```text
apps/
  v2-web/
    index.html
    src/
      app/                 router, providers, error boundaries, bootstrap
      routes/              matchday, tournament, play, you
      components/          product UI primitives only
      styles/              tokens, reset, layout, route layers
      sw/                  V2 worker entry and update coordinator
  ranked-api/
    src/                   challenge issue, replay submit, ranks, replays
packages/
  tournament-domain/      fixture registry, standings, slots, official models
  official-data/          payload schemas, overlay validation, freshness
  game-counter-attack/    deterministic headless simulation and replay
  ranked-contracts/       challenge, event log, score, version schemas
  identity/               profile and record contracts
  observability/          event names, redaction, error taxonomy
src/                      existing V1, unchanged until route cutover
api/                      existing V1 routes during migration
```

The first implementation package may create only `apps/v2-web` plus minimal root tooling/configuration. Package extraction follows after characterization tests; it must not move official-truth code and build the new shell simultaneously.

## Module boundaries

### Tournament domain

Owns fixture identity, stage graph, kickoff, team aliases, standings, best-thirds resolution, knockout slots, and derived match/tournament models. It has no fetch, DOM, storage, React, Supabase, game, or analytics imports.

Initial sources: `src/data/fixtures.js`, `src/core/canonical-truth.js`, pure portions of `src/data/tournament-model.js`, and `src/core/time.js`.

Migration rule: add characterization fixtures first; introduce TypeScript schemas and adapters without changing results; move only after old/new outputs are byte-equivalent for canonical test vectors.

### Official data

Owns provider payload validation, canonical matching, freshness, status precedence, and source-health state. It may depend on tournament-domain, never the reverse. It returns discriminated unions such as `verified`, `degraded`, `unconfigured`, and `rejected`; UI never interprets raw provider responses.

Initial sources: `src/core/provider-overlay.js`, `src/core/refresh-policy.js`, and relevant code in `api/results.js`, `api/live.js`, `api/scorers.js`, and `api/_shared.js`.

### Product application

Owns routing, composition, copy, accessibility, local UI state, and rendering. It consumes typed view models; it cannot mutate official truth. React route boundaries are:

- `/v2` Matchday
- `/v2/tournament/:section?`
- `/v2/match/:fixtureId`
- `/v2/play/:mode?`
- `/v2/you/:section?`

The bottom navigation maps only to Matchday, Tournament, Play, and You. Match detail is a route that may also render as a sheet through background-location routing.

### Games

Each game is a headless deterministic package with no DOM, Canvas, AudioContext, Date, random global, network, storage, or React dependency. Rendering, input collection, audio, haptics, tutorial, and records are adapters around it. A ranked engine exposes `create`, `step`, `applyInput`, `snapshot`, `score`, `eventLog`, and `replay`.

### Ranked platform

Owns signed challenge issuance, version pinning, replay validation, score persistence, rank projections, rate limits, and replay access. It must not reuse the legacy `public.scores` or browser-written `arcade_scores` trust model.

### Identity and records

Owns authenticated user profile, public handle/avatar, privacy settings, personal records, achievements, streaks, and replay metadata. Auth tokens are managed by the supported Supabase client with secure refresh behavior; app code does not hand-roll PostgREST or token rotation.

## State ownership

| State | Owner | Persistence |
| --- | --- | --- |
| Canonical registry and rules | tournament-domain build artifact | Version-controlled only |
| Verified official snapshot | TanStack Query cache + official-data adapter | Memory only; never localStorage or Cache Storage |
| Route and active section | URL/router | Browser history |
| UI disclosure, sheet, focus, draft controls | owning component | None unless explicitly useful |
| Picks drafts before sync | Picks feature store | IndexedDB/local cache, marked pending; server remains lock authority |
| Auth session | Supabase Auth client | Supported session storage; credentials only |
| Player profile and ranks | Supabase via server/RLS APIs | Server authoritative |
| Active game simulation | game runtime instance | Memory only |
| Unranked records | identity record service with local outbox | Local-first, server-synced when signed in |
| Ranked challenge and score | ranked API/database | Server authoritative |
| Preferences | small versioned preference store | Local; cloud sync optional later |

Do not mirror the same mutable object into React context, query cache, localStorage, and Supabase. Every datum has one authority and optional derived projections.

## API boundaries

### Public read APIs

- `/api/v2/official/snapshot` returns a normalized, verified tournament snapshot with ETag, `fetchedAt`, source health, and canonical version. It never exposes provider-specific shapes to the app.
- `/api/v2/stats` returns only metrics supported by the provider scope, with explicit coverage and truncation metadata.
- CDN/browser caching may cache immutable registry assets. Live truth responses use validated server caching and client revalidation, never service-worker stale-while-revalidate.

### Authenticated player APIs

- `/api/v2/me`, `/records`, `/picks`, and `/replays` enforce session identity server-side.
- Pick writes require canonical fixture ID and are rejected at or after database kickoff time.
- Profile mutations are schema-validated and rate-limited.

### Ranked APIs

- `POST /api/v2/ranked/challenges`
- `POST /api/v2/ranked/submissions`
- `GET /api/v2/ranked/ranks?period=daily|weekly|season|personal`
- `GET /api/v2/ranked/replays/:id`

Submission is an idempotent command keyed by challenge ID and attempt nonce. The browser never posts an authoritative score; it posts the event log and client diagnostics. The server replays and derives the score.

### Server rules

Use Zod-compatible shared schemas or an equivalent zero-ambiguity validator at every network boundary. Return stable error codes, request ID, retryability, and no secrets. Provider credentials, Supabase service role, challenge signing key, and anti-abuse signals remain server-only.

## Supabase boundaries

Supabase owns authentication, profiles, picks, official settlement projections, ranked challenge/result records, personal record metadata, and rank read models. It does not own the canonical fixture source code or decide whether a provider match is official; the Vercel settlement/ingestion boundary validates that first.

Required practices:

- Apply migrations through reviewed versioned files; verify actual remote migration state before every Preview or Production change.
- Use RLS on every player table. Default deny; grant the minimum table privileges separately from policies.
- Clients can read/update only their profile and allowed personal records; cannot write settled results, challenge seed, engine version, authoritative score, verification status, or rank.
- SECURITY DEFINER functions must set a fixed search path and expose narrow operations.
- Views that expose global ranks contain only public profile fields and aggregate results—never auth email, raw private picks, device data, or anti-cheat signals.
- Keep V2 tables under explicit names such as `ranked_challenges`, `ranked_attempts`, `ranked_scores`, `player_records`, and `published_replays`. Do not overload `public.scores` or `arcade_scores`.

## Realtime boundaries

Realtime is an invalidation channel, not the source of truth.

- Subscribe only to small rank/result channels for the signed-in user and current leaderboard period.
- On notification, refetch the authoritative row/view with jittered coalescing.
- Do not stream per-frame game state, official provider data, or raw global score writes.
- Presence is deferred; it adds cost and false-social pressure without improving the core loop.
- Unsubscribe when the route is hidden; one tab owns a leader-election heartbeat if multiple tabs are open.

## Service-worker migration

V1 currently registers root-scoped `/sw.js`, caches a hand-maintained asset list, and deletes every other cache on activation. V2 must avoid letting an early worker evict or intercept V1 unexpectedly.

1. Serve V2 initially at `/v2/` with a worker URL and scope of `/v2/` only.
2. Generate the precache manifest from the Vite build; do not maintain paths by hand.
3. Cache immutable hashed JS/CSS/fonts and an offline shell. Treat `/api/`, Supabase, official snapshots, auth, challenges, submissions, ranks, and replays as network-only unless a specific privacy-safe read cache is designed.
4. Use versioned cache namespaces (`u26-v2-<buildId>`) and delete only V2-owned old caches.
5. Prompt for update only outside active games; persist/finish no ranked run across an engine-version update.
6. At cutover, ship an intermediate V1 worker that relinquishes root caches and routes safely before V2 ever claims `/`.
7. Test controller ownership, upgrade, downgrade, offline launch, stale-tab submission, and rollback on real iPhone Safari.

## Analytics, logging, and errors

### Analytics

Use first-party, consent-aware events with a documented schema. Core events: route viewed, match opened, pick drafted/locked/synced, tutorial step, game started/completed/abandoned, challenge issued/submitted/verified/rejected, rank viewed, replay published, PWA installed/updated, and error boundary shown. Include build ID and rule version; exclude email, access token, raw free text, exact pointer traces, and provider secrets.

### Logging

Retain `safeLog` principles from `api/_shared.js`: structured JSON, request ID, route, duration, status class, source health, cache outcome, challenge/rule version, and redaction by default. Send server errors to a centralized error service; sample successful provider/game validation logs and retain all security-relevant rejection counters without raw sensitive payloads.

### Error handling

- Route error boundaries provide retry and a safe destination.
- Official-data errors keep canonical schedule identity and label freshness honestly.
- Ranked failures distinguish expired challenge, version mismatch, invalid log, duplicate submission, rate limit, offline, and server error.
- A game render failure ends the local presentation but preserves the event log for diagnostics; it never invents a score.
- Global unhandled rejection/error hooks report build/route and show no raw stack to users.

## Performance budgets

Measured on iPhone-class mobile hardware or WebKit automation where noted:

| Budget | Target |
| --- | --- |
| V2 entry JS, gzip | <= 90 KB |
| Initial Matchday route total JS, gzip | <= 140 KB |
| Lazy game runtime chunk, gzip | <= 120 KB |
| Initial CSS, gzip | <= 25 KB |
| LCP warm/cold 4G | <= 1.5 s / 2.5 s |
| INP p75 | <= 150 ms product UI; game input visual response <= 50 ms p95 |
| CLS | <= 0.05 |
| Product navigation | <= 100 ms to meaningful destination paint |
| Game rendering | 60 fps target, <= 16.7 ms frame p95, <= 25 ms p99 |
| Game logic step | <= 2 ms p95 at 30 Hz |
| Long tasks | none > 100 ms; <= 2 over 50 ms during initial load |
| Memory | <= 120 MB active game, <= 70 MB normal route |

CI fails when bundle budgets regress beyond an explicitly reviewed allowance.

## Testing and delivery gates

- Unit/property tests for pure tournament and game domains.
- Contract tests for provider, API, Supabase, and replay schemas.
- Browser tests on 390 and 430 widths in WebKit, with active controls and no forced clicks.
- Accessibility tests plus manual VoiceOver verification for navigation, Match Center, Picks, HUD, pause, results, and settings.
- Golden replay fixtures execute in browser and Node/server and must produce identical state hash and score.
- Preview smoke tests use the exact commit and a clean data environment.
- CI adds install, typecheck, lint/format, logic, V2 build, bundle budget, Playwright smoke, and migration static checks. Full WebKit can be a protected release job if runtime cost is material.
