# United 2026 Step-Up Issue Map

Audit date: 2026-07-10. Baseline: local source matching commit `cbbdcb1`.

## Product and architecture

| Area | Current evidence | Decision |
| --- | --- | --- |
| Framework | Static ES modules; no framework build step | Keep. Split new game/engine logic into modules instead of growing `play.js` further. |
| Navigation | Four persistent tab outlets; synchronous tab flips | Keep. It is fast, testable, and does not fetch or write storage on taps. |
| Truth | Canonical registry → validated provider overlay → views | Protect. Fictional play must remain structurally unable to write official state. |
| Play | Strong visual shell, but most games use separate probability formulas | Introduce one documented soccer engine; route tournament simulation through it first. |
| Storage | Whitelisted `u26v2.*`; Play data is local | Extend within `u26v2.play` so existing history survives. No official data persistence. |
| Global Picks | Authenticated picks; database kickoff lock; official results settled server-side | Keep, with explicit table grants/RLS and no anonymous access. |
| Global Arcade | Browser submits a derived local ledger | Release blocker. Disable submission and old self-reported rows until signed server replay exists. |
| API usage | Shared refresh loop, in-flight dedupe, hidden-tab pause, safe TTL floors | Keep. Daily budget/circuit-breaker accounting remains a later server foundation item. |

## Experience issues

1. There was no flagship direct-control soccer game. Penalty Rush was tap-a-zone; other modes were primarily tactical choices.
2. The core Play simulation used an overall-rating Poisson formula while other games carried separate formulas, making calibration and fairness hard to audit.
3. Desktop used the same 640px composition as an iPhone, leaving large screens under-designed.
4. Ranked Arcade looked global even though its score was self-reported by the browser.
5. The You museum did not preserve a direct skill-game record.

## Highest-value slice selected

1. Reusable seeded soccer engine with explicit context inputs and calibration.
2. Complete Shot Lab: aim, contact, power, curve, shot type, keeper read, pressure, moving target, timed/untimed, pause, sound, results, shot map, replay trail, share, local records, keyboard and touch.
3. Ranked Arcade fail-closed until server-authoritative replay exists.
4. Wider responsive composition for Play while keeping Official at a calm reading width.

## Known remaining work after this slice

- Match Lab, Final Minute and Coach's Call still need full migration onto the shared engine.
- Signed challenge issuance, rate limits, quarantine and server event-log replay are not deployed; ranked Arcade stays disabled.
- Match Market is not shipped in this slice. Shipping it before the probability and settlement backend is server-auditable would create a wide but shallow surface.
- My World Cup still needs squad roles, suspensions, long-form fatigue and difficulty levels.
- Provider budgets are cadence-protected but do not yet have persistent daily accounting across serverless instances.
