# Play consolidation — catalog v2

This audit is based on the shipped routes, persistence contracts, logic tests and browser flows at `9cae712`. Shot Lab is preserved as transferred. The catalog version is now explicit so navigation can change without erasing old records.

| Mode / alias | Player fantasy | Main input / skill | Session | Match context | Score / replay / progression | Engine and state | Visual identity | Overlap and quality | Decision |
|---|---|---|---|---|---|---|---|---|---|
| Shot Lab / Shots | Be the striker in a repeatable training studio | Aim, contact, power, curve, shot type; timing and placement | 2–4 min | Training, moving targets and keeper read | Points, accuracy, grade; exact seeded replay; local records | Dedicated seeded Shot Lab engine; local `shotLab` record | Floodlit goal studio, trajectory and shot map | Unique direct-control fantasy; high quality | **Keep unchanged** |
| Penalty Rush / Rush / shootout route | Win a psychological penalty duel | Run-up rhythm, deception, placement; pattern management under rising pressure | 1–3 min | Five penalties, then sudden death | Goals; seeded replay; daily/all-time local record; Cup stop | Dedicated seeded duel; local `penaltyRush` record | Goal mouth, keeper tendency, pressure and rhythm controls | Previously overlapped Shot Lab through placement-only input | **Rebuild** around psychology, not shot physics |
| Final Minute / 90+ | Manage a connected pressure sequence | Three tactical calls; carrying territory, fatigue, substitutes and cards | 2–4 min | 88' through stoppage time | W/D/L; seeded replay; side record and history; Cup stop | Deterministic match-window model; local `finalMinute` and `fmHistory` | Match clock, score, field state and composure | Strong concept, previously three mostly independent probability buttons | **Rebuild** as a stateful sequence |
| Coach's Call / Coach | Read a difficult game state from the touchline | Plan choice and adaptation; tactical fit and tradeoff reading | 2–3 min | One score state, two dugout windows | W/D/L; seeded replay; record/history; Cup stop | Deterministic tactical resolver; local `coachCall` and `ccHistory` | Tactical board, style matchup, post-call explanation | Distinct from Final Minute when explanation and plan fit are central; good but under-explained | **Keep and clarify** |
| Match Lab / Lab / Showdown | Stage and replay a complete fictional match | Team selection, initial approach, halftime/late calls, pace | 5–15 min | Full match, extra time and penalties | Result, events, comeback, player of match; same-seed replay/rematch; local history | Seeded Play event simulation; shared team ratings/RNG; local `labHistory` | Broadcast pitch, players, ball, VAR, cards and shootout | Unique complete-match fantasy; high quality, but its detailed event director remains specialized | **Keep**; migrate shared contracts incrementally |
| My World Cup / My Cup / What-If references | Build a parallel tournament | Pick winners and simulate rounds | 10–30 min across sessions | Full 104-match-derived knockout world | Champion, hand picks, saved timeline and trophy memory | Shared soccer outcome engine; local `myWorldCup`, saved simulations | Full bracket and champion stage | Distinct long-form bracket fantasy, but squad management is still shallow | **Keep; rebuild next pass** |
| Prediction Run / Predict / Pick'em surface | Prove real-match prediction judgment | Winner, confidence, optional score; calibration and timing | 1–5 min per slate | Canonical official fixtures before kickoff | Server-settled points, accuracy and streak; global Picks board | Official overlay for display/deadline; local drafts plus server settlement | Ticket/stub board with sealed state | No overlap with fictional simulations; strong and truth-safe | **Keep** |
| Arcade Cup / Cup | Take several games through one campaign road | Choose and play four existing challenges | 15–30 min | Coach, penalties, late pressure, full showdown | Stop W/D/L, medals, run history and trophy room | Local wrapper over surviving games; `arcadeCup` and `cupHistory` | Road map and trophy stage | Valuable progression, but not its own mechanic | **Merge into campaign layer**; remove from equal tab rail |
| Lobby | Enter and resume Play | Select a game, side, slate or current run | Seconds | Product home, not a game | Resumes records and campaigns | Read-only composition of Play state | Stadium editorial index | Necessary orientation surface | **Keep**, canonical label is “Play” |

## Information architecture

The persistent rail contains six canonical primary destinations: Play, Shot Lab, Penalty Rush, Match Lab, Prediction Run and My World Cup. Final Minute and Coach's Call live together as tactical challenges in Play. Arcade Cup is presented from Play as a campaign. When any secondary mode is active it appears contextually in the rail, so the active destination remains visible without restoring a nine-item alias strip.

No gameplay or record namespace is retired in catalog v2. Old records are migrated losslessly and tagged with `catalogVersion: 2`; the preserved legacy note records the old display aliases. No trophy, side, simulation, prediction, museum entry or local best is deleted.

## Architecture and fairness

- Fictional full-match outcomes continue through the seeded soccer engine; Shot Lab and Penalty Rush keep purpose-built skill engines.
- Match Lab keeps its specialized event director because forcing shot-by-shot visuals through the aggregate match engine would reduce fidelity. Team ratings and deterministic RNG remain shared.
- Ranked Arcade remains fail-closed. Prediction Run remains the only global competition surface because it is deadline-locked and server-settled from official results.
- The consolidation adds no fetch, polling, provider route, secret, SQL application or production dependency.

## Deferred, not disguised

My World Cup still needs squad selection, roles, formation, suspensions and multi-match fatigue before it meets the long-form management target. That is a coherent next rebuild and was not partially bolted onto this pass.
