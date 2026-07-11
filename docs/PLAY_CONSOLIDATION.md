# Play consolidation — catalog v3

Catalog v2 (below, kept for history) preserved Shot Lab unchanged. The user then tested Shot Lab and rejected it, so v3 retires it outright and rebuilds the skill tier around a new flagship. The catalog version is explicit in persistence (`catalogVersion: 3`) so navigation can change without erasing records.

## Catalog v3 decisions

| Mode | Loop | Decision in v3 |
|---|---|---|
| **Rondo** (new flagship) | Direct-control possession carousel: tap a teammate (or press 1–6) to pass before a live, tick-simulated press cuts the lane or arrives on the carrier. One-touch chains, split passes and switches score; waves add pressers and shrink space. Practice mode shows lane openness; the daily challenge is seeded and exactly replayable. | **Built new.** Replaces Shot Lab as the skill flagship. |
| Shot Lab | Aim/contact/power/curve/type striking studio | **Retired.** Route unreachable (falls back to the lobby), engine/UI/styles/tests removed, records moved losslessly to `play.legacy.shotLab` and shown on the You legacy shelf. Never merged into Rondo. |
| Penalty Rush | Rebuilt as a two-phase duel: choose a zone (six targets), optionally arm a feint, then time the run-up pulse and strike. Six scouted keeper archetypes with honest tendency cards; the keeper model reads only tendencies and your habit history — never the current pick. | **Rebuilt** on a new pure engine (`src/games/penalty-duel.js`). Record contract unchanged. |
| Final Minute | Connected three-call late-match sequence with carried territory/fatigue/cards/subs state | **Keep.** |
| Coach's Call | Tactical puzzle: situation read, plan fit, style matchup, post-call explanation | **Keep.** |
| Match Lab | Full broadcast night with decisions, extra time, penalties, replay | **Keep.** |
| My World Cup | Parallel bracket journey | **Keep; squad-management rebuild remains the next pass.** |
| Prediction Run | Real-fixture picks, deadline-locked, server-settled | **Keep** — the only global surface. |
| Arcade Cup | Campaign layer over the real games | **Keep as campaign** (never an equal tab). The road grows to five stops: **The Carousel (Rondo)** → Coach's Call → Penalty Rush → Final Minute → the Showdown. Runs started on the old four-stop road finish on that road (`cupRoad(cup)`) — rules never change mid-run. Medal thresholds scale with road length, so legacy runs keep their exact old thresholds. |
| Lobby | Rebuilt with hierarchy: Play now (Rondo hero with record-to-beat and time chip) → Continue (active Cup run, unfinished My World Cup, runback) → Skill → Tactics → Big nights → Real calls → You & records (side, rank, moments, season, next achievement). Time-to-play chips on every tile. | **Rebuilt.** |

## Fairness contracts (tested)

- **Rondo** (`tests/rondo.test.mjs`): pressers can never outrun the ball at any wave; a genuinely open lane is never cut; tackles need a fixed reaction window that never shrinks; waves cap; same seed + same tick-stamped pass log replays to the identical score; every turnover carries a teach-back naming the open teammate. Ranked stays fail-closed behind `validateRondoLog` (pure server-replayable validator) until signed challenges exist.
- **Penalty Duel** (`tests/penalty-duel.test.mjs`): the timing window narrows under pressure but has an absolute floor and is always shown; the keeper never reads the current pick (proven by clone-runs); feints genuinely beat early divers; well-struck wrong-wing kicks score >95%; `validateDuelLog` replays the kick log. Ranked fail-closed.
- **Migration** (`tests/play-catalog.test.mjs`): staged v1→v2→v3, idempotent, lossless; corrupt scalar records dropped rather than enshrined; old scores never rebadged as Rondo scores; empty/partial/corrupted saves migrate without crashing.

## Architecture

- Both new games are pure engines under `src/games/` (zero DOM, zero network) consuming `createSeededRng`/`hashSeed` from the shared soccer engine; UI lives in `src/views/play.js`. Fictional full-match outcomes still run through the seeded soccer engine; direct-control games do not.
- `PLAY_CATALOG_VERSION` now has a single source of truth (`src/core/play-catalog.js`), imported by persistence; a test pins persistence's import list to exactly that leaf module.
- No new fetch, polling, provider route, secret, SQL, or production dependency. Sound reuses the persisted shared WebAudio system; reduced motion disables decorative transitions while keeping gameplay state honest.

---

# Play consolidation — catalog v2 (historical)

This audit was based on the shipped routes, persistence contracts, logic tests and browser flows at `9cae712`. Shot Lab was preserved as transferred; v3 above supersedes that decision.

| Mode / alias | Decision at v2 |
|---|---|
| Shot Lab / Shots | Keep unchanged *(superseded: retired in v3)* |
| Penalty Rush / Rush | Rebuild around psychology *(done in v3)* |
| Final Minute / 90+ | Rebuild as a stateful sequence *(done at v2)* |
| Coach's Call / Coach | Keep and clarify |
| Match Lab / Lab / Showdown | Keep; migrate shared contracts incrementally |
| My World Cup / My Cup | Keep; rebuild next pass |
| Prediction Run / Predict | Keep |
| Arcade Cup / Cup | Merge into campaign layer |
| Lobby | Keep, canonical label "Play" |

No gameplay or record namespace was retired in catalog v2. Old records were migrated losslessly and tagged with `catalogVersion: 2`.
