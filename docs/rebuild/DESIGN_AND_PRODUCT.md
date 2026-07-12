# United 2026 V2 Design and Product

## Direction: The Match Ledger

United 2026 should feel like a live broadcast desk crossed with a player's match ledger: decisive, typographic, spatial, and calm until football creates urgency. It is not a collection of glowing cards. The field, score, timeline, table, and personal record are the visual objects.

The default V2 experience is dark because stadium context and game continuity benefit from it, but it avoids generic black-purple AI styling. Use mineral navy, chalk, broadcast cobalt, true live coral, pitch green, and medal brass in disciplined roles. One large field or scoreboard may dominate a screen; supporting information uses rows, rules, and open space rather than nested containers.

## Product hierarchy

### Top-level navigation

The bottom bar has four text-first destinations: Matchday, Tournament, Play, You. Use simple custom line icons only as reinforcement. The active item uses a solid underline/field mark, not a glowing capsule. The bar respects left/right/bottom safe areas and never floats over primary game controls.

- **Matchday:** now, next, and consequence.
- **Tournament:** explore verified competition structure.
- **Play:** act—play the flagship, make Picks, enter practice or a curated side mode.
- **You:** identity, records, ranks, replays, streaks, privacy, settings.

### Matchday

Matchday replaces the broad Home dashboard. Its first viewport contains:

1. tournament/date context;
2. one live or next match stage;
3. one sentence explaining why it matters;
4. the next action: open match, make a Pick, or view today's schedule.

Below it, use a chronological match ledger with live/upcoming/final dividers. Tournament progress appears as one compact line, not a grid of summary tiles. During a provider outage, canonical schedule remains visible and the source state is written plainly.

### Tournament

Use a sticky section switcher for Matches, Groups, Bracket, Stats, and Venues. Sections are URL-addressable. Matches are rows; groups are tables; the bracket is a spatial bracket/round journey; stats are ranked lists with coverage notes; venues are editorial reference pages. Do not wrap every row or table in a card.

### Play

Play opens with the daily Counter Attack challenge as the dominant field-width scene. The start action, attempt status, personal best, time to play, and ranked/unranked label are visible without scrolling. Picks is the second primary action. Practice and at most two polished side modes follow as a short list. Campaign wrappers and horizontal mode rails are absent.

### You

You opens on identity and current competitive standing, then personal records and recent replays. It is a record book, not a museum of every emitted statistic. The first viewport contains handle/avatar, daily/weekly/personal rank, the most relevant streak, and the next milestone. Settings and privacy are quiet secondary sections.

## Typography

Use **Archivo Variable** as the product family, self-hosted as a subset for deterministic PWA behavior.

- Display: Archivo Expanded/120%, 760–850 weight, uppercase only for short round/result moments.
- Score and rank numerals: Archivo 760 with tabular numerals; never squeeze or wrap.
- Body and controls: Archivo 430–600 at 16 px minimum default.
- Labels: Archivo 620, 12–13 px, modest `0.06em` tracking; no paragraphs in all caps.
- Commentary/captions: 14 px minimum, 1.4 line height.

Do not use tiny 10–11 px instructional copy. A game rule essential to success belongs in the field or tutorial, not a disclosure footer.

## Color roles

| Role | Token direction | Use |
| --- | --- | --- |
| Night | `#07111F` | Main background, not pure black |
| Raised night | `#0D1B2B` | Sheets and structural bands |
| Chalk | `#F4F1E8` | Primary text and light scoreboard surfaces |
| Muted chalk | `rgba(244,241,232,.68)` | Secondary copy |
| Official cobalt | `#2F6BFF` | Verified tournament navigation, focus, source-confirmed selection |
| Live coral | `#FF4D3D` | Only a genuinely live match/clock/event |
| Pitch | `#167A53` | Game field and positive football-space cues, not generic success UI |
| Medal brass | `#C99A3D` | Earned rank/result/medal moments only |
| Error | `#E5484D` | Failures and invalid states, visually distinct from live |

No gradient mesh, decorative neon, faux glass everywhere, or gold applied to ordinary Play navigation. Live coral must never decorate an upcoming fixture or call-to-action.

## Surface hierarchy

There are four surface levels:

1. **Field/background:** uninterrupted page or game field.
2. **Structural band:** sticky navigation, scoreboard, result band, sheet.
3. **Interactive row/control:** clear hit region with border/rule or fill.
4. **Transient layer:** modal, toast, tutorial cue, replay annotation.

Do not nest level 2 inside level 2. Cards are reserved for truly independent objects such as a published replay preview; match rows, rank rows, instructions, stats, and settings should use dividers and spacing.

## Spacing and safe areas

- Base grid: 4 px; primary rhythm: 8, 12, 16, 24, 32, 48.
- Page inline gutter: 16 px at 320–390, 20 px at 430, 24 px above 600.
- Minimum control target: 48 x 48 px; minimum gap between adjacent game actions: 8 px.
- Top padding: `max(16px, env(safe-area-inset-top))` plus route context.
- Bottom content padding includes navigation height, 16 px breathing room, and `env(safe-area-inset-bottom)`.
- Game canvas may reach the side safe-area edges; HUD and touch controls may not.
- Reading width caps at 720 px; game and bracket can use wider landscape/tablet space intentionally.

## Navigation behavior

- A tab tap changes the URL and paints meaningful cached/seed content immediately.
- Re-tapping the active tab scrolls its primary scroller to top without resetting filters, game, bracket position, or drafts.
- Match detail can open as a bottom sheet from a list and remains deep-linkable as a route.
- No giant horizontally scrolling mode rail. Secondary route sections use a compact sticky switcher or an anchored list.
- Back returns focus to the logical opener and restores scroll.

## Live-state treatment

A live state requires verified provider status. It consists of a coral dot with non-color text (`LIVE`, minute/status), score emphasis, and an optional restrained 1.2-second pulse on the dot only. Upcoming uses cobalt/neutral time. Final uses chalk and `FT`. Delayed, source-degraded, score-pending, and offline have separate plain-language states. Never label polling, recent refresh, a simulated match, or a leaderboard subscription as live.

## Motion language

Motion follows the ball and the consequence:

- Product navigation: 140–220 ms, opacity/translate only, no view-transition spectacle.
- Score change: old numeral moves out, new numeral settles in; 260 ms, once.
- Live event: timeline insertion and a single field/score response.
- Rank change: one directional move with the previous rank retained in text.
- Game: continuous physical interpolation, animation state machines, camera ease, impact frames, net/ball response.
- Result: score locks first, then rank delta, then actions; no confetti for routine completion.

Reduced motion removes camera shake, pulses, parallax, particle celebration, and nonessential transitions while preserving ball position, timing clarity, and state changes.

## Match presentation

The match stage is a scoreboard, not a card:

- stage/round and verified status on top;
- teams occupy opposing halves with names allowed two lines at most;
- score/versus is the visual center using tabular numerals;
- venue and kickoff are one quiet line;
- one consequence sentence below;
- open action spans the stage but does not masquerade as live.

Match detail adds event timeline, lineups/statistics only when verified, group/bracket consequence, source/freshness, and related Picks state. Unknown data is omitted or labeled pending, never padded with simulated texture.

## Play home

The first screen is a playable proposition:

- full-width Counter Attack key art rendered from the actual engine scene;
- `Daily ranked challenge` or `Practice` label;
- one-sentence objective: “Turn the break into a goal before the defense recovers.”
- primary Start button;
- attempts remaining/status and best score;
- mute/audio status accessible before start;
- Picks row below with number of unlocked fixtures.

The remaining catalog is a vertical list: Penalty Rush (if rebuilt to quality), Match Lab (unranked sandbox), and My World Cup (later). A mode that cannot justify a distinct fantasy, control model, and return loop is merged or removed.

## Game HUD

- Canvas owns the pitch and actors; DOM owns pause, score, clock, combo, objective, connection/submission status, and accessible alternative controls.
- Top HUD is one translucent structural band, not multiple badges.
- Score and remaining transition time are readable at a glance; secondary multipliers appear only when active.
- Touch input zone stays clear of browser edges and home indicator.
- Tutorial prompts point to actual space/runners and disappear after demonstrated success.
- Pause freezes logic and input, exposes Resume/Restart/Exit/Mute, and explains whether the run is ranked.

## Result and rank presentation

Results reveal in this order:

1. outcome and authoritative score;
2. replay verification state (`Verified`, `Unranked`, or a specific rejection);
3. daily/weekly/personal rank and delta;
4. two football facts derived from the replay (for example, fastest transition or chances created);
5. Watch replay, Play again if eligible, Practice, and Share result.

Do not show a fake global estimate while submission is pending. Ties use the documented ranking rule. Personal-best celebrations are distinct from top-rank medals.

## Profile and records

Profile identity uses handle, compact avatar/crest, preferred national side, join date, and privacy controls. Records are grouped by Ranked, Picks, and Unranked. Each record names game/rule version and period where relevant. Published replays show consent and visibility; deleted/private replays never remain accessible through rank rows.

Legacy V1 records may appear in a `Legacy` section with their original game label and local-only marker. They do not seed V2 ranks, streaks, achievements, or personal bests for a materially different engine.

## Content rules

- Lead with verbs and football outcomes: Watch, Open match, Make pick, Start break, View replay.
- State authority explicitly where needed: Official, Verified, Unranked, Local record.
- Use “football” in product copy except where the United States audience needs “soccer” for discovery/metadata.
- Instructions name one action and its result; no dense rule card before play.
- Never invent crowd activity, urgency, rank movement, player names, source freshness, or football events.

## Rejected patterns

- card walls and stacked rounded containers;
- giant mode rails and equal-weight aliases;
- dashboard tile grids above the primary live match;
- fake live labels or animated red decoration;
- glass on noninteractive content;
- tiny instructions and mystery icon-only controls;
- generic AI gradients, purple neon, excessive glow, or ambient blobs;
- desktop canvases scaled down to phones;
- desktop sidebars that duplicate bottom navigation;
- celebration before score authority is known.
