# United 2026 Reliability Note

Performance/UX pass date: 2026-06-22

## APIs checked

- `api/live.js`: API-Sports live proxy. Returns only World Cup league id `1`, separates final states from live/hold states, and fails with a safe empty payload.
- `api/results.js`: Football-Data proxy. Only `FINISHED` matches are official settlement inputs. Suspended/postponed/cancelled states are exposed separately as non-final hold states.
- `api/odds.js`: Odds proxy. Missing keys or provider failures return an empty response; model odds remain available.

## Match statuses supported

- Scheduled / upcoming
- Live first half / second half
- Halftime / paused
- Extra time
- Penalties
- Weather delay / interrupted
- Suspended
- Postponed
- Cancelled / abandoned
- Full time / after extra time / penalties

## Safety rules

- Standings update only from official final payloads.
- Bracket paths advance only from official final KO payloads or explicit My Sim actions.
- A delayed/suspended match stays visible but does not settle bets.
- Simulate/cash-out actions are blocked for bets tied to delayed/suspended official matches.
- Disappearing from the live API feed is no longer treated as full time.

## Known remaining risk

- Upstream providers may use new status codes. Unknown non-final statuses are treated as scheduled/live display data, not final settlement data.
- Postponed kickoff time corrections still depend on the provider returning updated fixture timing.
