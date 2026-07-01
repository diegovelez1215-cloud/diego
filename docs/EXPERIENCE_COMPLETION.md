# United 2026 — Experience Completion

Branch `fable/world-cup-experience-completion` (from `fable/world-cup-rebuild`).
Product-completion and visual-quality pass. No architecture rewrite; the
canonical-truth pipeline, module structure, real-vs-Play isolation, and
persistent navigation are preserved.

## P0 truth fixes (all test-proven)

1. **Finality requires identity.** A provider FINAL now attaches only through
   an identity match against two resolved canonical teams
   (`provider-overlay.js`: `matchToCanonical` returns `byIdentity`; pass 1
   retries finals across resolution passes and rejects them otherwise). A
   score can never sit beside an unresolved "Best third" chip.
2. **Placeholders stay scoreless.** Live status and clock may attach to an
   unresolved knockout slot by exact kickoff window, but goals are stripped;
   `fixtureModel` adds a belt-and-braces guard (`identityResolved`).
3. **Group coherence.** A group is labeled **Final** only when all six results
   are validated; otherwise it says "N of 6 played" or "Not started".
   Qualification marks (Q / q3 / out) appear only when settled; the
   third-place race table stays provisional until all 12 groups complete.
4. **Bracket structure integrity** is proven by tests: 16 R32 + 8 R16 + 4 QF +
   2 SF + final + third place, 30 winner edges drawn, 2 loser edges into the
   third-place match, ordering derived from advancement edges rather than
   kickoff time.

## Tournament experience

- **Graphical bracket** (`src/components/bracket.js`): horizontally
  scrollable/drag-pannable canvas, sticky round headers, R32→Final columns
  plus the third-place match, SVG elbow connectors that light in the winning
  team's color, compact→cinematic card sizing by round, informative unresolved
  chips ("Group A winners", "Best third (C/E/F/H/I)", "Winner, Match 89"),
  round-jump chips with scroll-position tracking, Full Bracket and
  Follow-a-Team modes (route lit, field dimmed), and a Best Thirds panel
  linking qualified thirds to their R32 slots.
- **Matches** is an editorial matchday board: Live Now / Up Today / Earlier
  Today lanes plus a Tomorrow preview.
- **Groups** keep density with stronger row rhythm, W column, qualification
  markers, and honest state labels.

## Play arcade

- **Match Lab** — pick two nations and an approach (Balanced / All-out press /
  Counter / Fortress), then a paced 90-minute simulation with a live clock,
  momentum bar in team colors, event feed, and two meaningful decisions
  (halftime and 68'). Draws go to a shootout. Results auto-save to You.
  Reduced-motion runs instantly.
- **My World Cup** — the same graphical bracket in sim mode: tap an open tie,
  choose who advances, or Simulate Remaining with paced round-by-round
  progression; champion banner; timelines save to You. Clearly badged
  SIMULATION; the sealed sim world copies real finals one-way.
- **Prediction Run** — non-monetary confidence calls (Hunch / Call / Lock) on
  resolvable official fixtures; insight points, streaks, and best-run tracked
  by grading picks against validated finals at render time (never stored
  truth). No odds, wallet, stakes, or gambling language anywhere.

## Visual system

Deep-midnight default with a controlled official-blue atmospheric light
(single fixed gradient, no blur), stage lighting on the hero, restrained gold
for Play, team colors only at meaningful moments (bracket glow, momentum,
pick chips). Light mode is an explicit preference. Glass stays on interaction
surfaces only. All effects are transform/opacity/gradient — cheap on Safari.

## Verification

- Logic suite: **54/54** (`node --test`), including new
  `bracket-structure`, `group-truth`, and `play-arcade` suites and the
  hardened overlay tests.
- Playwright: **15/15 at iphone-390 and 15/15 at iphone-430** — bracket
  completeness and round-jump, follow mode dimming, group honesty under
  partial data, unresolved-live scorelessness, Match Lab full flow, My World
  Cup pick→simulate→save, Prediction Run recording, navigation purity, no
  horizontal overflow.
- Screenshots reviewed by hand at both widths: Home, Matches, Groups, Full
  Bracket, Follow-a-Team, Match Lab (setup/decision/full time), My World Cup
  (pick/champion), Prediction Run, You.
- `git diff --check` clean.

## Known limitations

- Sandbox e2e ran on Playwright Chromium (WebKit host libraries unavailable);
  WebKit remains the configured default. No physical-device verification.
- Emoji flags depend on the platform emoji font (render correctly on iOS;
  tofu in the CI runner's screenshots).
- Group tie-breaks model pts/GD/GF (no head-to-head beyond that).
