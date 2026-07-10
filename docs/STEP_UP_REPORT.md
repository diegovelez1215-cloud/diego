# United 2026 serious step-up report

Date: 2026-07-10

Status: complete in the Codex workspace, verified locally, not copied to the real repository, committed, pushed, deployed, or applied to Supabase.

## 1. Product changes

- Added Shot Lab as the flagship direct-control football game.
- Replaced the flat Play entry with a clearer game hierarchy, a prominent primary action, an immersive active-game surface, and direct routes back to Play and You.
- Routed My World Cup match simulation through one shared deterministic football engine.
- Added Shot Lab records and replay entry points to the local You museum.
- Locked the unsafe browser-reported Arcade leaderboard instead of presenting unverified scores as global competition.

## 2. Visual and interaction system

- Shot Lab uses a full-viewport emerald stadium studio, readable match-lighting effects, an animated keeper, moving targets, shot trails, a goal map, pressure feedback, and a composed results stage.
- During active play the global dock is removed and replaced with explicit Exit and Pause controls, preventing gameplay controls from being covered on iPhone.
- The Play surface can expand to 1080 px on desktop while Official remains at its calmer 760 px reading width.
- Layout checks cover 320, 390, 430, 768, 1024, and 1440 px widths.

## 3. Architecture

- `src/core/soccer-engine.js` is the shared match model with a versioned contract and seeded random source.
- `src/games/shot-lab.js` is a pure, versioned game engine separated from rendering and persistence.
- Official truth remains isolated from local Play simulations and Play storage.
- Match results and Shot Lab outcomes can be reproduced from their seed and input contract.

## 4. Games improved

- Shot Lab supports timed and untimed sessions, eight-shot runs, direct goal aiming, visible keeper reads, pressure, nine contact zones, power, curve, Drive, Finesse, Chip, pause, exit, sound feedback, keyboard input, touch input, replay exact, new run, sharing, result details, and local records.
- My World Cup now receives realistic team-strength, tactics, fatigue, rest, travel, cards, match-state, venue, momentum, extra-time, and penalty inputs from the shared engine.
- Existing Play modes are preserved. The next migration should move Match Lab, Final Minute, and Coach's Call onto the same engine rather than duplicating simulation logic.

## 5. Model calibration

Fixed-seed batch tests produced these reference results:

- France vs Curacao, neutral, 50,000 matches: France 84.706%, draw 10.986%, Curacao 4.308%; 3.33162 total goals per match.
- Switzerland vs Switzerland, default home advantage, 50,000 matches: home 42.628%, draw 25.776%, away 31.596%; 2.71856 total goals per match.
- Argentina vs Brazil, neutral, 30,000 matches: 2.25577 mean goals and 2.23975 variance.
- Argentina vs Brazil with one red card each, neutral, 30,000 matches: 3.2117 mean goals and 3.45062 variance.

These checks protect strength ordering, home advantage, draw rate, volatility, card effects, and deterministic replay. They are model calibration evidence, not claims about official future results.

## 6. Match Market rules

No Match Market was shipped in this slice. A prediction market should remain absent until probability creation, settlement, audit history, age policy, and server authority are designed together. No real-money, sportsbook, wallet, payout, or wagering path was added.

## 7. Global competition

- Official Picks remain the only eligible global competition because picks are locked before kickoff and settled by server-owned official results.
- Arcade now clearly identifies global ranked play as locked and keeps local records local.
- The old browser-submitted Arcade score feed is no longer fetched or rendered as trustworthy global competition.

## 8. Anti-cheat

- Browser submission through `pushArcadeScore()` fails closed and performs no network request.
- Shot Lab records a replayable event log and validates the log locally, but `ranked` remains false.
- A future ranked mode requires a server-signed challenge, server replay validation, version pinning, time bounds, nonce reuse prevention, and authoritative persistence.

## 9. API and service protections

- The new game and simulator add no provider requests, polling, or scraping.
- Official data cadence and cached degradation behavior are unchanged.
- The Supabase migration draft revokes client Arcade writes and makes Picks permissions explicit, but it has not been applied.
- Persistent daily provider quotas and cross-instance request coalescing remain a backend roadmap item; in-memory counters alone are not treated as a global budget.

## 10. Accessibility and mobile behavior

- Core actions use 44 px or larger targets.
- Shot Lab supports touch and keyboard control, visible focus, reduced-motion handling, readable status text, explicit pause and exit, and non-color scoring feedback.
- The live game avoids bottom-dock collisions and horizontal overflow.
- Sound remains gesture-unlocked for iPhone browser policy.

## 11. Performance

- No image, video, font, analytics, or API payload was added.
- New runtime code is approximately 11.9 KB for the soccer engine and 10.9 KB for Shot Lab before transfer compression.
- Existing navigation-purity tests still confirm that ordinary tab changes do not fetch or write storage.
- No synthetic Core Web Vitals benchmark was run, so no unsupported timing claim is made.

## 12. Test results

- `node --test tests/play-arcade.test.mjs`: 30 of 30 passed.
- `npm run test:logic`: 218 of 218 passed.
- Full mobile browser gate: 49 of 49 passed at 390 px and 49 of 49 passed at 430 px.
- Final Shot Lab browser gate on both mobile projects: 6 of 6 passed, including gameplay, results, local museum persistence, console and page-error checks, and width checks at 320, 768, 1024, and 1440 px.
- Static syntax check across JavaScript and MJS source, API, tests, and E2E files passed.
- Whitespace/error check against the real repository baseline passed.

One overlapping browser run lost its temporary local server before the 430 px project and reported 49 connection failures. The same 430 px project was immediately rerun with an isolated server and passed 49 of 49. This was a harness-server interruption, not an application assertion failure.

## 13. Build, lint, and type status

- This repository serves static ES modules and does not define a production build command.
- It does not define separate lint or typecheck commands.
- Syntax, logic, and real-browser gates were used as the available release evidence.
- The logic suite prints a known JSDOM `window.scrollTo` implementation warning; the tests pass and the real Shot Lab browser console check is clean.

## 14. Files added or changed

Added:

- `src/core/soccer-engine.js`
- `src/games/shot-lab.js`
- `tests/soccer-engine-calibration.test.mjs`
- `tests/shot-lab.test.mjs`
- `e2e/shot-lab.spec.js`
- `supabase/migrations/0002_ranked_arcade_lockdown.sql`
- `docs/STEP_UP_ISSUE_MAP.md`
- `docs/SOCCER_ENGINE.md`
- `docs/SOCCER_CALIBRATION.md`
- `docs/STEP_UP_REPORT.md`

Changed:

- `src/app.js`
- `src/core/app-state.js`
- `src/core/leaderboard.js`
- `src/styles/play.css`
- `src/styles/responsive.css`
- `src/views/play.js`
- `src/views/you.js`
- `tests/leaderboard.test.mjs`
- `e2e/global-leaderboard.spec.js`

## 15. Migrations and environment changes

- `0002_ranked_arcade_lockdown.sql` is prepared but not applied.
- It removes authenticated Arcade policies, revokes Arcade table access, explicitly grants the intended Picks access, and hardens function search paths.
- No environment variable or secret is required for Shot Lab or the shared simulation engine.
- Applying the migration changes production database authorization and requires separate explicit approval.

## 16. Known limitations

- Shot Lab is local and unranked until server-signed replay validation exists.
- Match Lab, Final Minute, and Coach's Call have not yet been migrated to the shared engine.
- My World Cup does not yet model complete squad roles, suspensions, lineup selection, or long-horizon tournament fatigue.
- No Match Market, social account system, cross-device museum, push alerts, or persistent global API budget was added.
- Calibration is a defensible first model, not proof of predictive accuracy; real outcome calibration requires historical datasets and versioned backtesting.

## 17. External actions still required

None should be performed without approval. The workspace and real repository remain separate, the branch is not committed or pushed, Vercel has not been triggered, and the Supabase migration has not been applied.

## 18. Exact Mac instructions

The safest beginner action is to let Codex perform the controlled copy and Preview push. In this task, reply exactly:

`Approve copying the verified step-up files to the real repo, committing them, and pushing fable/global-live-leaderboard to Preview. Do not apply Supabase.`

That authorizes only the file copy, reviewable commit, and branch push that triggers Preview. It does not authorize Production promotion or database changes.

After Preview is verified, if the database lockdown is also approved, reply separately:

`Approve applying 0002_ranked_arcade_lockdown.sql to the linked Supabase project after a dry review.`

The second approval changes database permissions and should remain separate.

## 19. Approval status

- Copy to real repository: not approved in this task.
- Commit: not approved in this task.
- Push to Preview branch: not approved in this task.
- Production promotion: not approved.
- Supabase migration: not approved.

## 20. Recommended next pass

First, copy and push this verified slice to Preview and test Shot Lab on the user's physical iPhone. Then migrate Match Lab to the shared soccer engine and add signed daily Shot Lab challenges. Only after server authority exists should ranked global Arcade be reopened. Match Market should stay later than those integrity foundations.
