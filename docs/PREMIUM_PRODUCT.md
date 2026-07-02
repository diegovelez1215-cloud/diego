# United 2026 — Premium Product Pass

Branch `fable/premium-world-cup-product` (from
`fable/world-cup-experience-completion`, base `942f43e`). Product and visual
elevation only: the canonical-truth pipeline, validated overlay, real-vs-Play
isolation, and persistent navigation are untouched at the architecture level.

## World Cup tab (was Home)

A live tournament hub, not a card stack: masthead with tournament day number,
the cinematic score stage lit by both teams' colors (kickoff countdown when
upcoming, honest pending states always), an editorial Today board, Coming Up
under day headers, a Road to the Final snapshot derived from validated finals
only, and Qualification-on-the-line group races that render exclusively while
groups are genuinely undecided (`homeModel` additions in
`src/data/tournament-model.js`). Consequence lines resolve the advancement
edge ("Winner advances to the Round of 16").

## Visual system

Broadcast display typography (Archivo variable, wide-stretch, loaded with
`font-display: swap`; body text stays native for iPhone fidelity), deeper
midnight with a second low horizon light plus a static film-grain texture (no
blend modes, no filters), stadium-horizon hairline under the hero, glass
reserved for the dock, segmented controls, chips and sheets. Scores everywhere
(hero, match rows, bracket, Match Center, Match Lab) speak in display type.

## Tournament

- **Matches**: editorial lanes kept; live rows carry an accent bar and
  display-type scores; venue/round meta in small caps.
- **Groups**: settled tables get a lit top hairline; the Best Thirds race is
  integrated below the tables that decide it (moved out of Knockout).
- **Knockout**: Follow a Team is the default delight mode with a tactile
  nation-chip rail and a route summary strip (opponent-by-opponent, honest
  placeholders, W/L with scores once decided). Connectors are rounded light
  trails; decided ties add a wide faint under-glow in the winner's color.
  Round-jump also centers vertically so the Final arrives like a destination,
  crowned by "★ The Final" with day and venue.

## Play

- **Match Lab**: tale-of-the-tape rating bars in team colors, kickoff whistle
  event, varied chance commentary, goal-pop and full-time reveal animations.
- **My World Cup**: unchanged mechanics; champion celebration adds quiet
  conic-gradient rays in the champion's color.
- **Prediction Run**: recent graded calls chips (✓/✗ with confidence), hot
  streak treatment. Still zero market language anywhere.

## Truth rules (re-verified)

Unresolved slots stay scoreless and muted (adversarial time-window FINAL
probe re-run), real names render wherever canonical truth resolves them,
group races/road snapshot derive from validated finals only, Play remains a
one-way deep copy.

## Verification

54/54 logic tests, 15/15 Playwright at iphone-390 and iphone-430 (Chromium in
the sandbox; WebKit is the configured default), screenshots reviewed by hand
at both widths for all nine surfaces, `git diff --check` clean.
