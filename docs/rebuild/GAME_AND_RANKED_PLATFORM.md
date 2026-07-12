# United 2026 V2 Game and Ranked Platform

## Flagship decision: Counter Attack

The V2 flagship should be **Counter Attack**, rebuilt from first principles as a continuous, top-down 3v2/4v3 transition game. The player wins by reading space, carrying the ball, timing passes into runs, beating the recovering line, and finishing before the defense resets. A run is a sequence of short attacks from varied starting pictures, not a button-grid simulation.

Counter Attack has the best chance of meeting the brief because it expresses a complete and recognizable football fantasy in 10–20 seconds: turnover, break, overload, recovery run, final ball, finish. Continuous movement makes mastery visible; seeded defensive shapes and teammate behavior make runs comparable; compact attacks suit phones; and replay events remain small enough for authoritative server simulation.

## Concept audit

| Concept | Finding | Decision |
| --- | --- | --- |
| Rondo | Pure deterministic engine, habit-reading defense, fair lane rules, and replay validator are valuable. Current six fixed destinations, 100 ms tick, `setInterval`, and DOM actors create a discrete carousel rather than fluid football. | Retire as flagship. Keep as an unranked training experiment only after physical-device playtesting proves it earns a place. Reuse fairness/replay lessons, not presentation. |
| Break the Line | Strong positional idea, but risks becoming another lane-selection puzzle unless carrier, runners, and defensive block move continuously. | Use its line-breaking situations as Counter Attack scenario families; do not launch as a separate game. |
| Counter Attack | Immediate football fantasy, readable overload, natural short-session structure, continuous movement, meaningful pass/dribble/shoot decisions, strong replay value. | Build as flagship. |
| Penalty Rush | Clear fantasy and short loop. The pure keeper/timing replay work is useful, but penalties are narrow and repetition exposes timing abstraction quickly. | Rebuild later as an unranked side mode; not flagship and not ranked at V2 launch. |
| Final Minute | Carries tactical state but resolves through three choices, not embodied play. | Merge situations into Counter Attack pressure modifiers or a later tactics mode. |
| Match Lab | Rich football story, but it is a simulation/broadcast experience rather than a direct-control competitive game. | Preserve as a later unranked sandbox after extraction from `src/views/play.js`. |
| Coach's Call | Useful decision scenarios, insufficient as a standalone flagship. | Merge into tutorials/scenario content. |
| Arcade Cup | Campaign progress cannot compensate for uneven core games. | Retire until multiple excellent games exist. |

No `Break the Line` or `Counter Attack` implementation was found in the audited repository/history by those names; this evaluation treats them as concepts, not preserved code.

## Core Counter Attack loop

1. A signed seed selects pitch state, ball winner, attackers, defenders, recovery lanes, score target, and time budget.
2. The player receives control immediately after a turnover near midfield.
3. Drag anywhere in the lower control zone to steer the carrier. Direction and magnitude set desired velocity; releasing retains short momentum but reduces sprint.
4. Tap a teammate to pass. The engine leads the target according to current run velocity; hold briefly for a firmer pass. Passing is available during movement and can be buffered for one logic tick.
5. Swipe toward goal in the attacking third to shoot; direction and swipe speed set target and power. A tap near a loose ball triggers the context action only when visually available.
6. Teammates make coordinated width, overlap, underlap, hold, and third-man runs. Defenders delay, cover central lanes, track the most dangerous runner, and recover goal-side.
7. The attack ends on goal, save, miss, interception, tackle, offside, ball out, or time expiry. The next attack starts after a brief result beat.
8. A ranked run comprises five seeded attacks and produces score from goals, chance quality, speed, line breaks, and retained possession, with bounded bonuses and explicit deductions.

Difficulty must come from spatial pressure and coordinated recovery—not shrinking touch targets, input lag, hidden keeper boosts, or faster-than-possible defenders.

## Rendering/runtime decision: Canvas 2D

Use Canvas 2D with a small custom renderer and DOM HUD. Do not add a browser game engine or general rendering library for V2 launch.

Canvas 2D is sufficient for a top-down pitch, 8–12 actors, ball trails, shadows, particles, camera transforms, and sprite/shape animation. It keeps the runtime small, allows exact control over interpolation and draw order, works broadly in mobile Safari, and avoids coupling deterministic logic to a third-party scene/physics model. OffscreenCanvas may be used opportunistically for static pitch layers, never as a required path.

Reconsider PixiJS only if measured asset batching/animation needs exceed Canvas 2D budgets. Do not adopt Phaser: its scene, physics, timing, and bundle surface are unnecessary for this bounded game and complicate browser/server parity.

## Deterministic simulation

### Fixed step

- Logic frequency: 30 Hz (`33.333... ms`), represented as integer ticks.
- Use an accumulator driven by `performance.now()`. Clamp a foreground frame delta to 100 ms and process at most three catch-up steps; if the tab is hidden, pause the run and require resume.
- All authoritative positions, velocities, timers, cooldowns, animation states, RNG draws, and inputs advance on logic ticks.
- Use integers/fixed-point units for ranked-critical movement and collision where cross-runtime floating-point drift could affect score. Quantize inputs before simulation.
- Never use `setInterval` as the game clock and never derive logic from rendered frames.

### Smooth interpolation

- Render with `requestAnimationFrame` at the display rate.
- Keep previous and current simulation snapshots; render `previous + alpha * (current - previous)` where `alpha = accumulator / step`.
- Interpolate camera and non-authoritative presentation independently. Ball/actor collision uses current logic state, never interpolated pixels.
- If a frame drops, simulation remains deterministic and presentation catches up without teleporting more than the documented clamp.

### Continuous player and ball movement

- Actors have position, velocity, acceleration, facing, stamina/sprint state, possession state, and animation state.
- Ball state is possessed, loose, passing, shooting, deflected, saved, or dead. Passes/shots use deterministic trajectories with ground/air height where gameplay requires it.
- Steering uses desired velocity with bounded acceleration and turn rate. No direct position snapping.
- Tackle/interception volumes are visible consequences of actor position and facing. The engine records the responsible actor and geometric cause.

## Touch input

- One-thumb drag controls carrier intent; it begins anywhere in a generous lower-field control region and does not require touching a small player sprite.
- Teammate tap targets use enlarged invisible hit regions and choose the nearest eligible teammate only within an unambiguous radius.
- Shot swipe begins in the attacking third or dedicated context zone; a visible aim trace appears during the gesture in practice, reduced in ranked.
- Multi-touch is ignored beyond the first active pointer. `pointercancel`, app backgrounding, rotation, and lost capture pause safely.
- Inputs are normalized to pitch coordinates, quantized, tick-stamped, sequence-numbered, and appended to the replay log.
- Practice includes left-handed/right-handed HUD placement without changing simulation.

## Camera

- Portrait camera shows roughly 62% of pitch width and enough depth to read the recovering line.
- It leads 10–15% ahead of ball velocity, keeps goal and immediate passing options inside safe composition, and zooms only between bounded states.
- Camera behavior is presentation-only and excluded from scoring/replay authority.
- Shot impact may add <= 3 px/80 ms shake; reduced motion disables shake and zoom easing.
- Landscape/tablet expands visible pitch rather than scaling actors to tiny targets. Ranked competitive visibility must remain equivalent through bounded aspect-ratio crop rules.

## Animation states

Player state machine: idle, jog, sprint, receive, control, pass wind-up, pass follow-through, shoot wind-up, shoot follow-through, tackle, stumble, recover, celebrate, disappointed. Goalkeeper adds set, shuffle, dive, parry, catch, recover. Ball state drives trail/net/impact presentation.

Animation selection reads deterministic engine state; frame phase is presentation-only unless a documented wind-up tick affects play. Gameplay windows are expressed in logic ticks, not sprite-frame completion.

## Coordinated zonal AI

AI uses team roles and shared tactical context, not independent nearest-ball chasing.

- Attackers score candidate spaces for width, depth, onside status, passing lane, cover shadow, goal threat, and teammate occupation.
- One supports the carrier, one threatens depth, and one maintains rest defense/second ball. Role assignment changes through a deterministic auction with hysteresis to prevent jitter.
- Defenders maintain delay, cover, balance, and recovery responsibilities. The first defender controls the carrier; second blocks the central/most dangerous lane; third tracks depth; recovering defenders restore goal-side shape.
- Decisions update at a lower tactical cadence (for example every 3 logic ticks) while movement remains continuous at 30 Hz.
- Seeded tie-breaks may vary equally scored choices but cannot secretly decide tackles, saves, or goals.
- AI exposes debug overlays for zones, target points, role, danger score, and decision reason in non-production builds.

## Replay event contract

The replay stores only authoritative inputs and required lifecycle events:

```ts
type RankedInput =
  | { tick: number; seq: number; type: 'steer'; x: number; y: number; magnitude: number }
  | { tick: number; seq: number; type: 'pass'; target: number; power: number }
  | { tick: number; seq: number; type: 'shoot'; x: number; y: number; power: number }
  | { tick: number; seq: number; type: 'pause'; reason: 'system' };
```

Challenge ID supplies seed, scenario set, engine/rules/scoring versions, issued/expiry times, player ID, attempt number, and signed constraints. The final submission adds event log, final tick, client build, device performance summary, and idempotency key. The server ignores browser-reported score except as a diagnostic comparison.

Store periodic state hashes in test/debug logs, not as substitutes for replay. Golden fixtures must match hashes at defined ticks in browser and Node.

## Seeded ranked runs and parity

- Daily seed is not derived publicly from date alone. The server creates a challenge row and signs a player/period/attempt-scoped token.
- All players in a daily cohort receive the same scenario seed and rule version; per-player token/nonce prevents reuse.
- The browser imports the exact same headless TypeScript engine package the Node validator imports.
- Build artifacts pin engine, rules, scoring, and scenario-content versions separately. Any ranked-affecting change increments the relevant version and starts a new leaderboard partition.
- Server replay executes within CPU/input/tick limits, derives score and state hash, and persists only if challenge/token/user/version/expiry/attempt constraints pass.

## Sound and feedback hooks

The engine emits semantic cues (`touch`, `pass`, `lineBreak`, `interception`, `shot`, `save`, `post`, `goal`, `whistle`, `timeWarning`, `personalBest`) with tick and intensity. Presentation maps cues to WebAudio samples, haptics where supported, camera/particle feedback, and captions.

- Audio unlocks from Start or an explicit sound control.
- Mute prevents all new nodes immediately and persists as a preference.
- Sound never conveys required information alone.
- Use pooled short assets and gain limits; no autoplay music.
- Haptic calls are optional progressive enhancement and excluded from logic.

## Mobile performance budgets

- 60 fps target; frame p95 <= 16.7 ms and p99 <= 25 ms on target phone.
- Logic step p95 <= 2 ms; AI tactical update p95 <= 1 ms.
- No runtime allocation in inner movement/collision loops after warm-up; reuse arrays/objects where profiling justifies it.
- Canvas backing store caps at 2x device scale on high-DPR phones unless visual testing proves 3x affordable.
- <= 12 active football actors plus goalkeeper and ball in launch scenarios.
- Game chunk <= 120 KB gzip; initial game assets <= 600 KB compressed; total decoded audio <= 3 MB.
- Active game memory <= 120 MB; no listener/timer/AudioNode leaks across five consecutive runs.
- Pause on hidden; do not continue ranked time or AI in background.

## Ranked platform

### Challenge issuance

`POST /api/v2/ranked/challenges` requires authentication and game/period. Server checks eligibility and attempt allowance, then creates a durable challenge with UUID, player, cohort seed, scenario set, version tuple, issued/expiry timestamps, max ticks/events, and unused nonce. It returns public challenge fields plus an HMAC/EdDSA-signed token. Challenge rows are immutable except status transitions.

### Replay verification and score authority

`POST /api/v2/ranked/submissions` accepts token and log. The server:

1. verifies auth user, signature, challenge row, expiry, unused status, version support, payload size, event order, tick bounds, and input rate;
2. atomically marks the nonce in verification to prevent concurrent reuse;
3. replays the shared engine under CPU/time limits;
4. derives authoritative score, facts, and state hash;
5. applies sanity/abuse checks and either accepts, rejects with code, or quarantines;
6. writes an immutable attempt and refreshes rank projections;
7. returns verified score and ranks.

The score stored by the server is the only ranked score. Client score is never used for ordering.

### Versioning

Version tuple:

- `engineVersion` — integration, movement, collision, AI execution;
- `rulesVersion` — eligibility, scenario rules, attempt limits;
- `scoringVersion` — score formula and tie-breaks;
- `contentVersion` — scenario/formation data;
- `clientProtocolVersion` — event serialization.

Rank tables partition by game and compatible version season. Unsupported versions return explicit update-required before a run begins; a challenge already issued remains verifiable for a bounded grace period using its pinned server engine.

### Anti-cheat

- Authenticated, player-bound signed challenge; short expiry; single-use attempt nonce.
- Server replay with event count/rate/tick/coordinate bounds.
- Idempotency key prevents duplicate network retries from creating scores.
- Rate limits by user, IP risk bucket, device session, and challenge.
- Reject impossible sequencing, future ticks, excessive duration, unknown inputs, mutated versions, and score mismatch diagnostics.
- Quarantine statistically anomalous but mechanically valid runs for review; never silently manipulate results.
- Record coarse client performance/build metadata for debugging, not invasive fingerprinting.
- Published replay lets skilled runs be inspectable. Security-sensitive signals and raw IP/device data remain private.
- No client-side obfuscation is treated as security.

### Rank definitions

- **Daily:** best verified eligible score for the UTC-defined challenge day, with the user's display timezone shown separately. Tie-break: higher football-quality subtotal, then earlier verified submission; never join date.
- **Weekly:** sum of the best verified daily scores across the seven challenge IDs, with at least one completed day; show days counted.
- **Season:** sum of weekly contribution under one compatible version season, with published reset dates.
- **Personal:** all-time personal best per compatible rule partition plus percentile and improvement history; it is not a global rank substitute.

Attempts remain visible in personal history, but only the best eligible attempt contributes to each period. Attempt allowances are part of challenge rules and shown before start.

### Replay visibility

- Accepted attempts always retain a private replay for audit for the stated retention period.
- Player chooses Private, Unlisted, or Public after verification. Default: Private.
- Rank rows show Watch replay only for Public/Unlisted where the viewer has the link/permission.
- Revoking publication hides replay content without deleting the immutable score audit record.
- Public replay payload excludes auth identifiers, email, IP, anti-cheat signals, and internal challenge signature.

### Realtime refresh

Supabase Realtime publishes only compact accepted-score/rank invalidation events for the current period. Clients refetch authoritative views, coalesce bursts, and poll with backoff as fallback. Realtime never accepts or verifies a score and never streams a live run.

### RLS and data model

Recommended tables:

- `ranked_challenges` — service insert/read-own, no client mutation;
- `ranked_attempts` — service insert/update verification status; player reads own;
- `ranked_scores` — service-derived immutable accepted score; signed-in public rank reads through safe view;
- `ranked_replay_blobs` — private by default, service write, owner read, public via controlled RPC/view when published;
- `rank_periods` — public configuration;
- `player_records` — owner read; service-derived ranked fields; owner-writable unranked namespace through constrained RPC;
- `replay_publications` — owner controls visibility of their accepted replay.

Anon has no ranked table privileges. Authenticated users cannot insert/update authoritative challenge, attempt, score, verification, or rank fields. Global leaderboard views expose only user ID/handle/avatar, score, rank, period, verified time, and public replay availability.

### Isolation from legacy scores

- Do not read from, write to, migrate, union, alias, or backfill `public.scores` into V2 ranks.
- Do not reactivate `arcade_scores`/`arcade_ladder_v2` for Counter Attack.
- If legacy tables remain, revoke writes, remove them from exposed API schemas where possible, and label any administrative archive as unverified legacy.
- V1 local records can enter a user's Legacy section only; they do not seed ranked attempts, personal bests, achievements, streaks, or eligibility.

## Launch gate for ranked Counter Attack

Ranked stays disabled until all are true:

- engine produces identical golden hashes/scores in supported browsers and Node;
- challenge signature, expiry, nonce, idempotency, replay limits, and rate limits have adversarial tests;
- RLS/privilege tests prove clients cannot write authority fields or read private replays;
- at least 10,000 fuzz/property replay cases pass without divergence;
- physical iPhone Safari performance meets budgets across five consecutive runs;
- version rollover and stale-client behavior are proven;
- rank tie-breaks and period boundaries are documented and tested;
- operational dashboards show issuance, acceptance, rejection reason, replay duration, latency, and quarantine rate;
- privacy, replay retention, and moderation text is approved.
