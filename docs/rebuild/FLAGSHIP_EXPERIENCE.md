# United 2026 V2 — Flagship Experience

Status: design direction of record for the V2 flagship visual and interaction experience. Baseline commit: `7649bf42d0004e56baec29dab6f93787f9951e33` (`feat(v2): add authentication foundation`). This document defines what to build and why; it changes no application code.

Everything in this document is constrained by the real contracts in the current checkout: `SnapshotState`, `FixtureStatus`, `TournamentSnapshot`, `PredictionFixtureState`, `AuthSessionState`, the route table in `apps/v2-web/src/app/App.tsx`, and the FLOODLIGHT visual contract enforced by `apps/v2-web/src/visual-contract.test.ts`. No screen in this document requires data the application cannot produce today, except where a section is explicitly labeled **Future implementation**.

---

## 1. Product north star

United 2026 is the truthful companion to a World Cup night. It answers four questions faster than any broadcast overlay or federation site: what matters right now, what should I come back to do today, can I compete fairly, and what has my record become. Every screen serves one of those questions; any element that serves none of them is removed.

The flagship standard: a person standing in a stadium concourse with 15% battery and one bar of signal opens the app and, within two seconds, sees the match that matters, its verified status, and one action worth taking. Nothing on that first viewport is decorative, invented, or stale without saying so.

## 2. Emotional and visual thesis

The emotional register is **night match under floodlights**: dark, calm, and charged. Tension comes from football — a live minute, an unresolved bracket slot, a prediction that locks in forty minutes — never from decoration. The interface behaves like a broadcast gallery: quiet, authoritative, instantly readable, and honest about what the cameras can and cannot see.

Three principles govern every visual decision:

**Light means truth.** The single floodlight radial (`radial-gradient(120% 90% at 18% 0%, rgba(47,107,255,.14), transparent 55%)`) appears only on surfaces carrying verified or canonical primary content: the fixture stage, the phase tracker, the identity band, the Play flagship stage. Service notices, footnotes, and degraded states sit in flat night. A user learns, without being told, that lit surfaces are the ones United stands behind.

**Typography is the set design.** There are no card walls, no glass, no mesh gradients. Hierarchy is built from type size, weight, tabular numerals, hairline rules, and open space. The score is the largest object in the product because the score is the product.

**Stillness is the default.** The interface is static until football changes state. The only permanently animated element is the live pulse on a verified live dot. All other motion is a one-time response to a state change, 140–260 ms, then stillness again.

## 3. FLOODLIGHT evolution

FLOODLIGHT is the foundation, not a draft. The following is preserved verbatim, evolved deliberately, and extended where the current system is silent.

### 3.1 Preserved (locked, already enforced by the visual contract test)

- Color tokens: night `#07111F`, band `#0D1B2B`, band-high `#13253C`, chalk `#F4F1E8` with 86/68/48/24 opacity steps, official cobalt `#2F6BFF`, live coral `#FF4D3D`, pitch `#167A53`, brass `#C99A3D`, error `#E5484D`, hairline `rgba(244,241,232,.10)`, strong rule `rgba(244,241,232,.20)`.
- One radial floodlight; zero `linear-gradient` anywhere in shell, components, or route styles.
- 12 px metadata floor; no type below 12 px.
- 48 px minimum control targets; 3 px chalk `:focus-visible` outline with 3 px offset (−3 px inside rows and stages).
- Square corners everywhere (`border-radius: 0` on buttons and inputs); the crest, flags, and status dots are the only non-rectangular shapes.
- 1120 px shell width, 60 px bottom navigation, safe-area insets on all four edges.
- Rules and spacing instead of nested cards; `box-shadow: 0 12px 32px rgba(2,6,12,.45)` reserved for lit stage surfaces and transient layers only.
- Explicit `prefers-reduced-motion: reduce` handling that nulls animation and transition.
- Fixture stage top border as status channel: cobalt default, coral only when `status.kind === 'live'`.

### 3.2 Evolved

**Typography family.** Replace the system stack in `--v2-font` with self-hosted **Archivo** (variable, WOFF2, latin subset, `font-display: swap`, system stack retained as fallback). This is the single largest visual upgrade available: Archivo's condensed-capable widths and 760+ weights give scores and wordmarks broadcast authority that SF/Segoe cannot. The visual contract permits this: the font is a local asset (no remote `url(https:)`), no runtime dependency is added to `package.json`, and the file ships through the V2 build. Two faces only: `Archivo` (variable weight axis 430–780) and no second family. Numerals in scores, tables, counts, and kickoff times are always `font-variant-numeric: tabular-nums`.

**Score presence.** The fixture stage score grows from 40 px to a 44 px phone / 72 px desktop scale (see §10) and gains a one-time settle animation on change (see §9.2). Scheduled fixtures keep kickoff time in the score slot at 32 px — time is the "score" of an upcoming match.

**Stage lighting hierarchy.** Today four surfaces use the identical radial. Evolve to two intensities of the same gradient, never a new gradient: primary stage (fixture stage, Play flagship) keeps `rgba(47,107,255,.14)`; secondary lit bands (phase tracker, identity band) drop to `rgba(47,107,255,.10)`. This keeps one floodlight grammar while making the match unmistakably the brightest object. Implementation is one token: `--floodlight-primary` and `--floodlight-secondary` as `background-image` custom properties.

**National identity.** Flags move from passive 20×14 marks to structural identity: in the fixture stage each team row gains a 3 px inset left rule in a neutral chalk-24 (never team colors — sourcing 48 accurate palettes is out of scope and wrong palettes are worse than none). Unresolved slots keep the dashed outline flag and muted label; they must always look *pending*, not *broken*.

**Consequence line.** The existing one-sentence consequence (`consequenceFor`) is promoted from 14 px body to a named element with a 2 px cobalt left rule, matching the prediction status rail — one grammar for "here is what this means."

**Edition context.** The top bar gains a single quiet context line under the wordmark on Matchday only: `48 teams · 104 matches · CAN/MEX/USA` set in 12 px chalk-48. Static canonical facts, zero data risk.

### 3.3 Extended (new definitions where FLOODLIGHT was silent)

- Motion grammar (§9): named durations, easings, and the exhaustive list of things allowed to move.
- Responsive system (§6): explicit behavior at 320, 390, 430, 768, 1280, 1440.
- Elevation ladder: level 0 field → level 1 lit stage → level 2 sticky structure (top bar, section switcher, bottom nav) → level 3 transient (confirm dialog, source sheet). Z-index tokens: 20/30/40/60/80/100 as already used; no new values.
- Focus order contracts per screen (§12).
- Empty/degraded state tone: every empty state names what would fill it and when (already the pattern in `StatePanel` usage; now a rule).

## 4. Complete application anatomy

Route table (existing, unchanged):

| Route | Surface | Bottom-nav owner |
| --- | --- | --- |
| `/v2/` | Matchday | Matchday |
| `/v2/match/:fixtureId` | Fixture detail | Matchday (no tab selected is current behavior via `primaryPathFor`; see §5.2) |
| `/v2/tournament?section=groups\|bracket\|matches` | Tournament | Tournament |
| `/v2/play` | Play lobby | Play |
| `/v2/play/rondo` | Full-screen game (**new route, design target**) | Play |
| `/v2/predictions` | Predictions list | Play |
| `/v2/predictions/:fixtureId` | Prediction detail | Play |
| `/v2/you` | You | You |

Shell anatomy, top to bottom:

1. **Skip link** (existing, fixed, chalk on focus).
2. **Top bar**: sticky, 52 px phone / 64 px desktop plus safe-area top, `rgba(7,17,31,.92)` with 12 px blur. Left: wordmark `United 26` (cobalt numeral). Right: `SourceChip` — the single global authority indicator. The chip is the only place global source state lives; routes repeat it only through `ServiceNotice` rows in context.
3. **Content frame**: gutters 16 px (320–429), 20 px (430–599), 24 px (600–819), 32 px (≥820); bottom padding `calc(60px + env(safe-area-inset-bottom) + 32px)` on phone, 48 px on desktop where the nav moves up.
4. **Bottom navigation** (<820 px): fixed, four text-plus-icon links, 60 px + safe-area, active item marked by a 20×3 px cobalt underline — never a filled capsule.
5. **Top-center navigation** (≥820 px): the same four links rendered as a horizontal row centered in the top bar band (existing behavior at 820 px). Desktop never gains a sidebar.

The full-screen game route (`/v2/play/rondo`) is the one surface that suppresses the shell: no top bar, no bottom nav, its own exit control (§5.5). Everything else lives inside the shell without exception.

## 5. Screen-by-screen specifications

Every spec below lists: hierarchy (what the eye meets in order), layout, states, and interaction. Responsive behavior is consolidated in §6; motion in §9.

### 5.1 Matchday

**Hierarchy:** 1) the focus fixture stage, 2) its status mark, 3) the day's ledger, 4) context line and freshness, 5) service notice if degraded.

**Layout (phone).** `h1` "Matchday" (route title row, 22 px). Context row: `{Weekday, Month D} · Matchday N` left, `Updated {h:mm} · Refresh` right, both 12–13 px. Then the fixture stage selected by `selectMatchdayFocus` (live → upcoming today → upcoming any → most recent final). Then the day ledger: `Today` heading with match count, followed by `MatchRow` items for `scheduleForFocus`. `ServiceNotice` renders after the ledger — canonical football always outranks service state (enforced by the visual contract test).

**Fixture stage (the hero).** Structure per current `FixtureStage`: topline (`Group X · Match N` + `StatusMark`), two team rows (flag 28×20, name 18 px→24 px desktop, value right-aligned tabular), venue line, consequence sentence, footer (`{date}` + `Match centre →`). State treatment:

- `scheduled`: cobalt top border, kickoff time 32 px in home value slot, `local` label 11 px in away slot, `Scheduled` mark, neutral tone.
- `live` with score: coral top border, coral `LIVE · {minute}'` mark with pulsing dot, scores 44 px both rows.
- `live` with `score: null` (`scoreState: 'pending'`): coral border, mark reads `LIVE — score pending`, value slots show `–`. Never a placeholder number.
- `final`: cobalt border returns, chalk `FT` mark, verified tone, scores stay at full size.
- `pending` (`on-hold` / `score-pending`): brass mark `Pending` / `Score pending`, value slots `–`.
- `unavailable`: brass/neutral mark `Unavailable`, value slots `–`, consequence line still renders — the fixture's meaning is canonical even when its status is not.
- No focus fixture at all: the existing `v2-empty-stage` block, flat (unlit), stating the schedule contains no match to feature.

**Tournament context.** One line below the ledger heading area: `Matchday N of {days.length}` — derived from the existing day index computation; no progress bar, no invented "round momentum".

**Freshness truth.** `Updated {time}` renders only when `snapshot.source.fetchedAt` exists; otherwise `Not verified`. The refresh button disables while `refreshing` and its label changes to `Refreshing…` (existing behavior, kept).

**States.** `loading`: canonical schedule renders immediately from `canonicalTournamentSnapshot()` with the source chip reading `Checking` — never a spinner page, never skeleton shimmer (skeletons imply data that may not come; the canonical schedule is real content). `stale` / `unavailable` / `partial` / `error`: identical layout plus the matching `ServiceNotice` copy; retained official fields under `stale` keep their values with the stale mark.

**Interaction.** Whole stage is one link to `/v2/match/:id`. Rows are whole-row links. Re-selecting the Matchday tab scrolls to top (existing `navigateTo` behavior). Keyboard order: skip link → wordmark → source chip → refresh → stage → rows → notice retry → nav.

### 5.2 Fixture detail

**Hierarchy:** 1) score/status authority, 2) teams, 3) kickoff/venue facts, 4) prediction entry, 5) coverage honesty.

**Layout (phone).** `← Matchday` back button (top, 48 px target). Title `Match detail`. The fixture stage in `detail` mode (non-interactive, taller: 300 px min at ≥820). Below, a two-region detail grid:

- **Verified fields ledger** (`dl` rows, 54 px min height, hairline dividers): Status, Kickoff (as `<time>`), Stage, Venue, Source freshness. Values right-aligned, 13 px semibold. Unknown values render `Not provided` — never blank, never invented.
- **Coverage list**: Fixture identity — Canonical; Commentary / Lineups / Match statistics — `Not provided`. This list is the anti-fabrication contract made visible: United states out loud what it does not have. When live with hidden score, the existing explanatory sentence renders under the list.

**Prediction entry point.** Between the stage and the detail grid, one full-width row (64 px, hairline top and bottom): left, `Prediction` with the current state as sublabel; right, an action chip. Content by `predictionState` for this fixture:

- `scheduled` (eligible, no record): `Make a prediction` → `/v2/predictions/:id`, cobalt chip `Open`.
- `confirmed`: `Your call: {outcome}` sublabel `Editable until kickoff`, chip `Edit`.
- `locked` / `pending`: sublabel `Locked at kickoff` / `Waiting for official final`, chip `View`, brass tone.
- `correct` / `incorrect`: sublabel `Graded · Correct/Incorrect` in pitch/error, chip `View`.
- Unresolved participants or ineligible: row hidden entirely. No teaser for something that cannot be done.

**Match narrative without fabricated statistics.** The narrative is assembled only from canonical and verified facts: the consequence sentence, the stage name, group context ("Both sides are in Group C" is derivable; "Team X has momentum" is not), and — when final — the verified scoreline sentence: `{Winner} won {h}–{a}` derived from `fixture.winner` and `status.score`. Nothing else. No possession bars, no form guides, no head-to-head history.

**States.** Unknown fixture ID: `StatePanel` not-found with `View Matchday` action (existing). Snapshot degraded: `ServiceNotice` at the bottom, same rules as Matchday.

**Back navigation.** `onBack` pops history when the entry was in-app, else replaces to `/v2/` (existing `backFromDetail`). Focus after back lands on `#v2-content` (main has `tabIndex={-1}`).

### 5.3 Tournament

**Hierarchy:** 1) phase tracker, 2) section switcher, 3) the active section's content.

**Phase tracker.** Existing six-cell band (Groups → R32 → R16 → QF → SF → Final), secondary floodlight intensity, each cell a label plus 4 px state bar: pitch = complete, cobalt = current, strong-rule = future. This is the single tournament-progress visualization; no percentage, no ring.

**Section switcher.** Sticky under the top bar (top: 52 px / 64 px), three 48 px buttons — Groups, Bracket, Matches — active marked with `aria-current="page"` and 2 px cobalt underline. URL-addressable via `?section=` (existing). Switching sections preserves scroll position per section is **not** attempted; each section starts at its own top (simple, predictable, current behavior).

**Groups.** Twelve group tables in a grid (1 col phone, 2 ≥820, 3 ≥1040). Each table: header `Group A` plus state word — `Awaiting results` / `Provisional` / `Complete` (existing mapping from `group.state`). Columns Pos / Team / MP / Pts (phone); at ≥820 add W-D-L and GD by widening the grid template to `32px 1fr 30px 30px 30px 36px 36px` — the data already exists on `GroupRow`. Qualification state: when a group is `complete`, rows 1–2 gain a 3 px pitch left rule; third-place rows show no mark until actual TP3 resolution exists in the snapshot (best-thirds allocation is resolved by the domain, but per-group "likely qualified" speculation is forbidden). `Provisional` tables show no qualification marks at all — provisional standings must look provisional.

**Bracket (phone).** Horizontal scroll-snap columns per round (existing), 230 px columns, one column fully visible plus a 24 px peek of the next — the peek is the affordance that more rounds exist. Column header: round name + `N of M resolved`. Each match: two participant lines (flag + name, unresolved slots dashed/muted), kickoff label bottom-right; whole match links to fixture detail. Add a round position indicator under the bracket: five 6 px dots (R32 → Final), current snap position filled cobalt — implemented with `scroll-timeline`-free JS (IntersectionObserver on columns), updating `aria-label` "Round of 16, 3 of 5".

**Bracket (desktop ≥1040).** All five columns visible in one grid, 176 px columns (existing sizing). Advancement paths: connector lines between rounds drawn as 1 px hairline pseudo-elements are **approved** but only in the desktop overview where geometry is stable; the phone bracket relies on order and headers instead of connectors.

**Final and third place.** The Final match block renders at stage scale: its column gives the final a taller cell (96 px min) with 16 px team names and a brass 2 px top border — brass is earned: it marks the match that awards a medal. The bronze fixture, currently filtered out of the bracket, gets a dedicated row below the bracket titled `Third place`, same match-block anatomy with a muted brass border. This restores a canonical fixture the current UI hides.

**Unresolved state.** Unresolved participants always render the dashed flag + slot label (`Winner Match 74`). The label is the truth; never `TBD`.

**Matches section.** Day-grouped `MatchRow` ledger (existing). Day headers sticky within the scroller at ≥820 only.

### 5.4 Predictions

**Hierarchy:** 1) what this is (device-local record), 2) the four counts, 3) actionable fixtures by day, 4) the honesty footnote.

**List.** Intro block: eyebrow `Local prediction record`, title, one sentence of rules. Counts strip: Eligible / Pending / Graded / Correct as 22 px tabular numerals over 12 px labels (2×2 phone, 1×4 ≥600, existing). Day sections with 74 px prediction rows: kickoff time, two team lines, right column showing the user's call (or stage name if no record) over the state label. State label colors: pitch = correct, error = incorrect, brass = pending; `Confirmed` / `Locked` / `Scheduled` stay chalk-48.

**Empty state.** `No eligible fixtures right now` + the sentence explaining eligibility (resolved canonical fixtures before kickoff). This is the tournament-over state too; it must read as a fact, not an apology.

**Prediction detail — the ritual.** The confirmation flow is deliberately ceremonial because it is the one moment the user commits to a claim:

1. **Context**: back button, stage eyebrow, title, kickoff/venue line, the two-team face-off block (flags at stage size, centered, 112 px min).
2. **Status rail**: one sentence with 3 px left rule — cobalt (scheduled/confirmed), brass (pending/locked), pitch (correct), error (incorrect). Copy per `statusCopy` (existing).
3. **Selection**: `Choose a result` fieldset — two or three 52 px radio tiles (`drawAllowed` = group stage only). Selected tile: cobalt border + `rgba(47,107,255,.14)` fill. Then `Confidence` fieldset: Low / Medium / High tiles, optional, defaulting to Low. Confidence copy never implies stakes: it is a note-to-self, not a wager.
4. **Review**: `Review prediction` (primary button) opens the confirm dialog: bottom sheet on phone (aligned `end center`, existing), 520 px max. Eyebrow `Confirm local prediction`, the chosen outcome as a 22 px title, the sentence `This is saved only on this device and locks at the official kickoff.`, Cancel / Confirm buttons. Focus moves into the dialog (existing `confirmDialog.current?.focus()`), Escape and Cancel return focus to the review button.
5. **Confirmed**: dialog closes, status rail updates to `Confirmed locally. You can edit it until kickoff.`, focus moves to the `Edit prediction` button (existing `requestAnimationFrame` focus handoff).

**Editing.** `Edit prediction` re-opens the form pre-filled. Editing is available strictly while `!isLockedAtKickoff`. If a save races kickoff, `confirmPrediction` rejects and the existing message renders: `Kickoff has passed, so this prediction was not saved.` — the client never pretends the server of record is itself.

**Locked / pending / graded.** After kickoff the form never renders. Locked: brass rail. Pending: brass rail, `waiting for a validated official final`. Graded: pitch/error rail plus the grade sentence naming both the official result and the user's call (existing copy). Correct grades get no confetti, no badge — a pitch-green rule and the word `Correct` carry the moment (§9.6 adds the single permitted settle animation).

**Identity truth.** Footnote on the list and in You: predictions live in `localStorage` (`u26v2.predictions.local`), signing in never uploads or changes them. A signed-in user sees no sync claim anywhere in this flow.

### 5.5 Play

**Hierarchy:** 1) the flagship stage, 2) Start, 3) the mode ledger, 4) Predictions entry, 5) truth footnote.

**Lobby.** The flagship stage is the full-width lit surface with the tactical chalkboard SVG (existing art direction: pitch lines at chalk-20, one cobalt run arrow, chalk ball dot — this diagram grammar is the Play identity and extends to any future mode art; never screenshots, never faked gameplay renders).

**Rondo as the primary destination.** The stage promotes Rondo — the one real, playable, deterministic engine in the repository — as the flagship destination:

- Stage copy block: tag `Playable`, title `Rondo`, one-sentence objective (`Keep the ball moving. Read the press before it reads you.`), and a primary `Start Rondo` button (full-width within the copy block, 49 px), navigating to `/v2/play/rondo`.
- Below the stage, a `Local record` line renders only when a device record exists: `Best: {score} · This device` in 13 px, brass numeral. No record → the line is absent (not zeroed).
- Counter Attack moves to the mode ledger as `In development` — it is not playable and must not occupy the stage claiming otherwise.

**Mode ledger** (64 px rows, icon + name/description + state chip):

1. `Rondo practice` — `Unranked, no clock.` — chip `Open` (cobalt) — available at launch of the game route.
2. `Daily challenge` — `One seeded run, same for everyone.` — chip `Planned` — stays Planned until server issuance exists; the chip is not a button.
3. `Ranked` — `Server-verified competition.` — chip `Locked` — same rule.
4. `Counter Attack` — `Turn the break into a goal before the defense recovers.` — chip `In development`.
5. `Predictions` — live counts sublabel (existing projection) — chip `Open`.

Planned/Locked rows are `article` elements, not links; they have no hover state and no cursor change. The only interactive rows are ones that go somewhere real.

**Game launch transition.** `Start Rondo` pushes `/v2/play/rondo`. The route suppresses the shell and owns the full viewport (`100dvh`, night background). Entry: 220 ms fade from the lobby (§9.7). The game screen owns: a top HUD band (one translucent structural band: score, clock/turn state, pause), the playfield, and touch controls clear of `env(safe-area-inset-bottom)` and browser edge-swipe zones. Pause freezes logic, exposes Resume / Restart / Exit / Mute, and states plainly that the run is unranked.

**Result direction.** On run end, a result band (not a modal) rises from the field: 1) final score, 32 px tabular; 2) `Local record` line with delta when a best exists (`Best +40` in brass when beaten, otherwise `Best: {n}` in chalk-48); 3) actions: `Play again`, `Practice`, `Exit to Play`. A beaten personal best gets the one permitted celebration: the record numeral settles with the score-change animation and the brass rule under it draws in once, 260 ms. No confetti, no shaking, no fake percentile (`Top 8% worldwide` is banned — there is no worldwide).

Replays: **Future implementation.** The V1 Rondo engine has deterministic replay tests; a `Watch replay` action is designed here as a slot after `Play again` but must not render until a V2 replay presenter exists.

Sound and haptics: **Future implementation.** Semantic cue mapping (touch/intercept/whistle) per `GAME_AND_RANKED_PLATFORM.md` when the game route ships audio; mute control is present from the first shipped build; no autoplay.

### 5.6 You

**Hierarchy:** 1) identity band with auth state, 2) local prediction history, 3) the future-records explanation, 4) route footnote.

**Identity band.** Lit (secondary intensity) band with the U/26 crest (56×64, chalk border, 3 px brass bottom rule) and a state-driven right column. All five `AuthSessionState` kinds have distinct, honest presentations:

- `checking`: `Checking your session` + explanation. No spinner longer than the check; the band itself is the loading state.
- `configuration-unavailable`: `Sign-in is unavailable` + `This device cannot reach the configured sign-in service right now.` + `Try again` (quiet button). This is a system fact, not a user error — no red.
- `signed-out`: title, one sentence, then the email form → six-digit code form (`inputMode="numeric"`, `autoComplete="one-time-code"`, existing). `Use another email` resets to step one. Error messages render under the form in error color with `role="status"`. Privacy sentence: email handled by the existing sign-in service; no profile is built.
- `signed-in`: `Signed in` + verified email, the Account ID / Verified email definition list, `Sign out` (quiet). Followed by the sentence `Server profiles and cross-device records are not built yet.` — the future-records explanation lives here, in the exact place a user would look for the missing feature.
- `error`: `Session needs attention` + the actual message + `Try again`, plus `Sign out` when a stale identity exists. Recoverable tone: brass rail, not error red, unless sign-out is the only path.

The signed-in band contains **no** avatar, handle, country, team, rank, streak, or achievement. The crest is the product's crest, not the user's.

**Local predictions section.** Device-local history (existing): counts line, up to six recent fixtures with Pending/Correct/Incorrect state words, the note that signing in never touches them.

**Sign-out choreography.** Sign-out returns the band to `signed-out` with a 160 ms crossfade; local prediction history visibly persists through the transition — the layout guarantees the user watches their local record survive sign-out.

### 5.7 Application shell

Specified structurally in §4. Behavioral contracts:

- **Active route treatment**: `aria-current="page"` + cobalt underline; inactive links chalk-48; no glow, no pill.
- **Fixture/prediction detail routes** keep Play or Matchday context: `primaryPathFor` already maps `/v2/predictions*` to Play; extend the same mapping so `/v2/match/:id` highlights Matchday (one-line change, keeps the bottom nav truthful about where you are).
- **Route entry**: content mounts immediately with canonical/cached data; the 160 ms enter animation runs on `.v2-main` (existing). There is no blank route state anywhere — every route has canonical content or a designed `StatePanel`.
- **Safe areas**: top bar and nav pad with `env(safe-area-inset-*)` (existing); the game route is the only surface allowed to paint under the top inset, and its HUD may not.
- **Desktop adaptation**: navigation moves into the top bar at ≥820 px; content column capped at 1120 px; reading measures capped at 720 px (`you`, `predictions`, `play`). No sidebar, no second navigation system.
- **Scroll restoration**: forward navigation scrolls to top; back restores browser-native scroll position; re-tapping the active tab scrolls to top without resetting section state (Tournament's `?section=` survives because it is URL state).

## 6. Responsive specifications

Design targets: 320×690, 390×844, 430×932, 768×1024, 1280×900, 1440×1000. Implementation breakpoints stay on the existing ladder (430, 600, 820, 1040, 1280) — 768 falls into the 600–819 band and 1440 into ≥1280; no new breakpoints are introduced.

| Width | Gutter | Navigation | Matchday | Tournament groups | Bracket | Fixture stage score |
| --- | --- | --- | --- | --- | --- | --- |
| 320 | 16 px | Bottom, 4 tabs | Single column | 1 column | Snap columns, 230 px | 40 px |
| 390 | 16 px | Bottom | Single column | 1 column | Snap columns | 44 px |
| 430 | 20 px | Bottom | Single column | 1 column | Snap columns | 44 px |
| 768 | 24 px | Bottom (portrait tablet keeps thumb reach) | Single column, stage min-height 300 px | 1 column (2 at ≥820) | Snap columns, wider peek | 56 px |
| 1280 | 32 px | Top-center | Two columns: stage 1.6fr / ledger 1fr | 3 columns | Full 5-column overview | 72 px |
| 1440 | 32 px | Top-center | Two columns, shell capped 1120 px, centered | 3 columns | Full overview + connectors | 72 px |

**320 × 690.** The floor. Team names may ellipsize but never wrap to a third line; kickoff time in the stage drops to 28 px; prediction outcome tiles stack `home/draw` on row one, `away` full-width (existing `:nth-child(3)` rule handles three-choice layout). Nothing scrolls horizontally except the bracket, which is designed to.

**390 × 844 and 430 × 932.** The reference phones. First Matchday viewport must contain: top bar, title, context row, complete fixture stage, and the first ledger row. If the stage's consequence line pushes the first row out at 390, the consequence clamps to 2 lines (existing `-webkit-line-clamp: 2`).

**768 × 1024.** Tablet is a large phone, not a small desktop: bottom navigation stays (thumbs remain at the bottom edge in handheld use); type steps up one increment (§10); the Matchday layout stays single-column so the stage keeps its full-width authority. Two-column group tables arrive at 820 to serve landscape tablets and small laptops.

**1280 × 900 and 1440 × 1000.** Navigation joins the top bar. Matchday becomes stage + ledger side by side (existing 1040 grid). The bracket shows all rounds; connectors render. The confirm dialog centers (`place-items: center`) instead of bottom-sheeting. Hover states exist only at these widths: match rows tint `rgba(47,107,255,.07)` (existing), interactive chips underline. Nothing is hover-only.

**Keyboard and focus at every width.** Focus outlines are always visible (3 px chalk). The confirm dialog traps focus; Escape closes it. The bracket scroller is keyboard-reachable: columns receive focus in document order and `scrollIntoView` on focus keeps the focused match visible.

**Safe areas.** Left/right insets respected in gutters (existing `max()` expressions); bottom nav pads with the home-indicator inset; the game route insets its HUD and controls but may paint the field edge-to-edge.

**Reduced motion at every width.** All entries in §9 collapse to instant state changes; scroll-snap remains (it is a positioning behavior, not an animation); smooth-scroll is never used (`scroll-behavior: auto` in the reset).

## 7. Component inventory

Existing components, kept and evolved:

| Component | Role | Evolution in this package |
| --- | --- | --- |
| `AppShell` | Frame, skip link, top bar, nav | None structural; game route bypasses it |
| `TopBar` | Wordmark + source chip | Optional context line slot (Matchday only) |
| `BottomNav` | Four destinations | Matchday highlight on `/v2/match/*` |
| `SourceChip` | Global authority disclosure | Keep; copy table is canonical (§13) |
| `ServiceNotice` | In-context degraded state row | Keep verbatim |
| `StatusMark` | Dot + word status | Keep; tones: verified/live/stale/unavailable/error/neutral/pending |
| `FixtureStage` | Match hero / scoreboard | Score scale, consequence rule, team inset rule, primary floodlight token |
| `MatchRow` | Ledger row | Keep; hover tint desktop only |
| `StatePanel` | Loading/stale/unavailable/error/empty/not-found | Keep; every route's fallback |
| `SectionHeader` | Eyebrow/title/description | Keep |
| `Flag` | Sprite flag with unresolved fallback | Keep; dashed unresolved is a contract |

New components required by this direction (design-complete, to be built):

| Component | Spec |
| --- | --- |
| `PredictionEntryRow` | 64 px row on fixture detail; state-driven label/chip per §5.2; hidden when ineligible |
| `BracketFinalBlock` | Final + third-place match blocks with brass rules per §5.3 |
| `BracketPositionDots` | Five-dot round indicator, IntersectionObserver-driven, `aria-label` announced |
| `LocalRecordLine` | `Best: {n} · This device`; absent when no record |
| `ModeRow` (variant) | Adds `Playable`/`Open` interactive variant; Planned/Locked stay inert |
| `GameHud` | One translucent band: score, state, pause; game route only |
| `ResultBand` | End-of-run band per §5.5; not a modal |
| `ConsequenceLine` | 2 px cobalt left rule + sentence; used by stage and detail |

Component rules: no component introduces a new color, gradient, radius, or shadow; every interactive component has a 48 px target, `:focus-visible` treatment, and a non-color state signal (word or mark) alongside any color change.

## 8. State matrix

Global snapshot state × surface treatment. "Canonical" means schedule identity, kickoff, venue, stage — always available from `canonicalTournamentSnapshot()`.

| `SnapshotState` | Source chip | Matchday / Detail | Tournament | Notes |
| --- | --- | --- | --- | --- |
| `loading` | `Checking` | Canonical content, `aria-busy`, notice: "Checking official status…" | Canonical tables/bracket | Never a blank or skeleton screen |
| `verified` | `Official` (cobalt dot) | Verified statuses and scores | Standings from verified results | The only state where `Official` appears |
| `partial` | `Unverified` | Validated fields only; notice: partial coverage | Provisional markers | No inferred values for missing fields |
| `stale` | `Unverified` | Retained fields marked stale (brass) | Provisional | Reason (`provider-stale`/`request-error`) does not change UI copy |
| `unavailable` | `Unverified` | Canonical only; no live state or score implied | `Awaiting results` states | |
| `error` | `Unverified` (error dot) | Canonical + alert notice with Retry | Canonical | `role="alert"` on the notice |

Fixture status × presentation (applies to stage, rows, detail):

| `FixtureStatus` | Mark | Score slot | Border/tone |
| --- | --- | --- | --- |
| `scheduled` | `Scheduled`, neutral | Kickoff time / `local` | Cobalt |
| `live` + score | `LIVE · {m}'`, coral, pulsing dot | Numerals | Coral |
| `live` + null score | `LIVE — score pending` | `–` | Coral; explanation on detail |
| `final` | `FT`, verified | Numerals | Cobalt |
| `pending` (`on-hold`) | `Pending`, brass | `–` | Neutral |
| `pending` (`score-pending`) | `Score pending`, brass | `–` | Neutral |
| `unavailable` (either reason) | `Unavailable`, brass/neutral | `–` | Neutral |

Prediction state × detail surface: covered exhaustively in §5.4; the six `PredictionFixtureState` values each have exactly one rail color and one copy string (`statusCopy`). Auth state × You: five `AuthSessionState` kinds, each with one band layout (§5.6). No state combination outside these tables exists in the contracts; if a new state is added to a contract, it must be added here before it ships.

## 9. Motion and interaction choreography

Durations and easings are tokens: `--motion-fast: 140ms`, `--motion-route: 160ms`, `--motion-standard: 200ms`, `--motion-enter: 220ms`, `--motion-settle: 260ms`; easing `ease-out` for entries, `ease` for color/opacity, no springs, no bounce. Under `prefers-reduced-motion: reduce`, every item below becomes an instant state change except where noted.

1. **Route entry** (exists): `.v2-main` opacity 0→1 + translateY 4px→0, 160 ms. No exit animations — the old route disappears instantly; exit choreography doubles perceived latency.
2. **Score change**: when a rendered score numeral's value changes, the old numeral translates up 6 px and fades while the new settles from below, 260 ms, once, via a keyed span swap. Applies to stage and detail; ledger rows just swap text. Never re-runs on refetches that don't change the value.
3. **Match-state transition** (scheduled→live, live→final): border-top color and `StatusMark` swap with a 200 ms color transition; the layout does not move. Going live never scrolls, flashes, or reorders the visible ledger under the user; reordering by `selectMatchdayFocus` applies on next route entry, not live under the finger.
4. **Live pulse** (exists): the coral dot only, 1.2 s, infinite; the single permanent animation; removed under reduced motion.
5. **Prediction confirmation**: overlay fades in 160 ms; dialog translates 24 px→0, 200 ms. On confirm: dialog closes (instant), status rail text and color update, focus lands on `Edit prediction`. No success toast — the rail is the confirmation.
6. **Prediction grade settle**: when a detail view first renders a `correct` grade in a session, the pitch rail draws top-to-bottom, 260 ms, once. `incorrect` gets no animation — losses are stated, not performed.
7. **Game launch/exit**: lobby→game 220 ms opacity fade through night; game→lobby the same. Reduced motion: instant swap.
8. **Result band**: rises 32 px with fade, 220 ms, after the engine reports run end; personal-best brass rule draws in once, 260 ms (§5.5).
9. **Bracket movement**: native scroll-snap; position dots update with a 140 ms color transition; no auto-scrolling the user's bracket position, ever.
10. **Signed-in transition**: identity band content crossfades 160 ms between auth states.
11. **Feedback tones**: success = pitch rail/word, warning = brass, failure = error red + `role="alert"`. Color never carries feedback alone; every state has a word.

Banned motion: parallax, marquee, shimmer skeletons, looping gradients, hover scale, celebration particles, animated tab indicators sliding between tabs, and any animation on data the product is not certain about.

Haptics (game route only) and sound: **Future implementation** — direction per `GAME_AND_RANKED_PLATFORM.md` cue contract; nothing in the product UI outside the game ever vibrates or sounds.

## 10. Typography and spacing system

Family: self-hosted Archivo variable (latin subset, single WOFF2, `font-display: swap`); fallback stack unchanged. Weights used: 430 (body), 600 (row emphasis), 650–700 (headings), 760–780 (scores, counts). Nothing else.

| Role | Phone | ≥820 | Weight | Notes |
| --- | --- | --- | --- | --- |
| Stage score | 44 px (40 at 320) | 72 px | 760 | Tabular, `letter-spacing: -.02em`, line-height 1 |
| Scheduled kickoff in stage | 32 px (28 at 320) | 40 px | 700 | Tabular |
| Page title | 22 px | 28 px | 700 | `-.01em` |
| Dialog/result title | 22 px | 22 px | 700 | |
| Count numerals | 22 px | 22 px | 760 | Tabular |
| Stage team name | 18 px | 24 px | 700 | Ellipsis, never 3 lines |
| Section/row heading | 15–16 px | 16 px | 650–700 | |
| Body / descriptions | 14–15 px | 15 px | 430 | Line-height 1.45 |
| Row meta, labels, eyebrows | 12–13 px | 12–13 px | 600–700 | 12 px floor; status marks uppercase with `.06em` tracking |

The scale has four effective size groups (score/display, title, body, meta) and stays within the four-size / two-axis discipline; intermediate pixel values above are optical adjustments inside groups, not new hierarchy levels.

Spacing: 4 px base grid; rhythm 4, 8, 12, 16, 24, 32, 48. Related elements 8–12 px apart; group boundaries at 24–32 px (2× rule); route sections separated by 24 px phone / 32 px desktop. Row heights: 44 (table), 48 (controls), 54–74 (content rows), 64 (mode/entry rows). Gutters per §4. Reading measure 720 px; shell 1120 px.

## 11. Icon, flag, illustration, and imagery direction

**Icons.** The existing hand-drawn line set (1.7 px stroke, square caps, miter joins, 24 px grid) is the icon language. Additions (pause, mute, replay slot, exit) must match those exact stroke properties. No icon library import — the set stays small and owned. Icons never appear without a text label except inside the game HUD where space is scored (pause glyph + `aria-label`).

**Flags.** The `/v2/flags.svg` sprite with `FLAG_CODE_MAP` is the sole flag source; 20×14 rows, 28×20 stage, 1 px chalk-24 border, unresolved = dashed border empty mark. Flags are never stretched, recolored, rounded, or used decoratively (no giant background flags).

**Illustration.** The tactical chalkboard grammar (chalk-20 pitch lines, cobalt run arrows, chalk ball dot on lit night) is the only illustration style, used for Play mode art and any future empty-state art. It must always depict a plausible football situation — an illustration is a diagram, not a mood poster.

**Imagery.** No photography at launch: no licensed player/stadium photo pipeline exists, and stock photography would puncture the system's authority. The crest, flags, type, and chalkboards carry the brand. If photography ever enters, it enters through a licensed pipeline, not this document.

## 12. Accessibility requirements

- WCAG 2.1 AA contrast: chalk on night 15.4:1; chalk-68 on night ≥ 7:1; chalk-48 used only at ≥12 px 600+ weight for non-essential meta; cobalt on night 4.6:1 for large/bold text and non-text marks; live coral and brass always paired with words, never color-only.
- Every interactive target ≥ 48×48 px (49 px buttons existing); adjacent targets ≥ 8 px apart.
- Focus: 3 px chalk outline, 3 px offset (−3 px in rows); focus never suppressed; skip link first; `#v2-content` receives focus on route change via `tabIndex={-1}`.
- Landmarks: one `main` per view, `nav` labeled `Primary navigation`, `role="alert"` for errors, `role="status"` for quiet updates (existing patterns; keep).
- The confirm dialog: `role="dialog"`, `aria-modal`, labeled by its title, focus moved in on open and restored on close (existing); focus is trapped while open.
- Live regions: score changes on the visible stage announce via a single polite live region (`{Home} {h}, {Away} {a}, {minute} minutes`), throttled to state changes — never per-refetch.
- Radio-tile forms keep native inputs (visually hidden, existing) so VoiceOver reads group legends and states.
- `aria-busy` during refreshes (existing); refresh controls disabled while in flight.
- The bracket scroller: keyboard focus scrolls columns into view; the position dots have text alternatives; no horizontal-scroll content is keyboard-unreachable.
- The game route: pause reachable by keyboard and switch access; all HUD text meets contrast on the field; reduced-motion removes camera/impact effects while preserving state readability; no essential information conveyed by sound.
- Copy: statuses are words (`LIVE`, `FT`, `Pending`, `Unavailable`), not icons or color alone, everywhere.

## 13. Truth and authority requirements

The single non-negotiable: **United never claims more certainty than its data contracts hold.**

- `Official` appears only in the `verified` snapshot state. Every other state reads `Unverified` or `Checking` in the source chip.
- Live treatment (coral, pulse, minute) requires `status.kind === 'live'` from the validated snapshot. Polling, refreshing, and recency are never dressed as live.
- Scores render only from `status.score`; a live fixture with a null score says `score pending`; unknown is `–`, never `0–0`.
- Freshness is a timestamp or `Not verified` — no relative "just now" softening.
- Coverage lists state `Not provided` for commentary, lineups, and statistics until a verified source exists.
- Predictions are labeled device-local at every surface where they appear (list, detail, Play row, You). A signed-in session changes nothing about that labeling until server records actually exist.
- Play chips: `Playable`/`Open` only for routes that exist; `Planned`, `Locked`, `In development` are inert text, and no locked feature gets a preview interaction.
- Local game records say `This device`. No global comparison, percentile, or rank is displayed or implied anywhere.
- Grades derive only from `gradePrediction` against a validated official final; a finished-looking match without a validated final stays `Pending grade`.
- The Coverage/StatePanel/ServiceNotice copy in the current build is the canonical honesty voice; new copy follows it: name what is known, name what is not, name what would change it.

## 14. Implementation sequence

Each step is a reviewable package that leaves the app shippable; no step changes authentication, prediction persistence, official-data logic, tournament calculations, schema, Supabase, the service worker, Production, or V1.

1. **Type and token foundation** — self-hosted Archivo, type-scale tokens, motion tokens, floodlight intensity tokens. Update the visual contract test expectations in the same change.
2. **Fixture stage evolution** — score scale, consequence rule, team inset rules, score-settle animation, live-region announcement.
3. **Shell polish** — Matchday context line, `/v2/match/*` nav highlighting, desktop dialog centering.
4. **Tournament completion** — expanded ≥820 group columns, qualification rules for complete groups, third-place block, final prominence, bracket position dots, desktop connectors.
5. **Fixture detail entry point** — `PredictionEntryRow` with all six prediction states.
6. **Predictions ritual refinements** — grade-settle animation, rail consistency pass.
7. **Play lobby restructure** — Rondo stage promotion, `Start Rondo` action, mode ledger reorder, `LocalRecordLine` (renders nothing until the game route lands records).
8. **Game route** (`/v2/play/rondo`) — shell suppression, HUD, pause, result band, local record persistence in a `u26v2.*` namespace. Largest step; ships behind nothing because it is additive.
9. **Motion and accessibility audit** — reduced-motion verification of §9 items, VoiceOver pass on all seven surfaces, contrast verification, 320-width sweep.

## 15. Acceptance criteria

- At 390×844, cold load of `/v2/` renders title, context row, complete fixture stage, and the first ledger row in the first viewport with no layout shift after font swap greater than CLS 0.05.
- All six `FixtureStatus` presentations and all six `SnapshotState` treatments are reproducible via test fixtures and match §8 exactly.
- Live coral appears in exactly one situation (`status.kind === 'live'`); a repo-wide style search finds no other coral usage.
- `Official` label appears only under `verified`; `stale`/`unavailable`/`partial`/`error` all read `Unverified`.
- The six prediction states each render distinct rail color + copy; a prediction saved 1 ms after kickoff is rejected and the rejection message renders.
- Confirm dialog: focus enters on open, is trapped, and returns to the trigger on cancel — verified with keyboard only.
- Tournament: complete groups show pitch qualification rules; provisional groups show none; third place and final render with brass treatment; bracket dots track scroll position and announce.
- Play: Planned/Locked/In-development rows are non-interactive (no `href`, no click handler, no pointer cursor); `Start Rondo` reaches a full-screen route with working pause and exit; result band shows a record delta only when a prior record exists.
- You: all five auth states render per §5.6; sign-out preserves visible local prediction history; no avatar/rank/streak/achievement element exists in the DOM.
- Zero `linear-gradient`, zero new colors, zero border-radius on rectangles, zero fonts beyond Archivo + fallback — enforced by the updated visual contract test.
- `prefers-reduced-motion: reduce` leaves exactly zero running animations (including the live pulse) while every state remains readable.
- Every claim above verifiable at 320, 390, 430, 768, 1280, and 1440 widths without horizontal overflow outside the bracket scroller.

## 16. Explicit items that must not be built

- Fake player statistics, lineups, commentary, possession/xG bars, or head-to-head history.
- Fake live tickers, simulated crowd activity, "N people watching", or social feeds.
- User avatars, handles, countries, favorite teams, ranks, streaks, badges, or achievements (none exist in any contract).
- Cloud-sync claims or UI for predictions; "synced" iconography anywhere.
- Global or ranked leaderboards for Rondo; percentile claims; "worldwide" anything.
- Betting, odds, or confidence framed as stakes.
- Fabricated official results, projected standings presented as standings, or qualification predictions.
- Countdown-driven urgency theatrics (a lock time is a fact line, not a red timer).
- A fifth navigation destination, a desktop sidebar, or a hamburger menu.
- Skeleton shimmer screens, splash screens, or loading spinners where canonical content can render.
- Preview interactions on Locked/Planned modes.
- Photography, gradient meshes, glassmorphism, neon glows, confetti.
- Service-worker, schema, Supabase, auth-flow, or official-data changes of any kind under this design package.

## 17. Final visual-quality checklist

Before any step in §14 is accepted, review at 390 and 1280:

- [ ] The brightest surface on screen is verified or canonical football, never chrome.
- [ ] One floodlight grammar: every gradient on screen is the sanctioned radial at a sanctioned intensity.
- [ ] Every numeral that can change is tabular; no score, count, or time reflows its container.
- [ ] Every status is a word with a mark; cover the screen in grayscale and every state is still unambiguous.
- [ ] Nothing below 12 px; nothing interactive below 48 px; focus visible on every control by keyboard walk.
- [ ] Hairlines and spacing, not boxes: no level-2 surface nested inside another level-2 surface.
- [ ] Coral audit: if anything coral is on screen, a match is verifiably live.
- [ ] Brass audit: if anything brass is on screen, it marks a medal match, an earned record, or a pending/stale truth state — nothing else.
- [ ] Copy audit: no sentence claims data the snapshot does not hold; every empty state names what fills it.
- [ ] Motion audit: after 5 seconds of no interaction and no live match, zero pixels are animating.
- [ ] Reduced-motion audit: toggle it; the product loses nothing but movement.
- [ ] 320 px audit: no horizontal overflow, no three-line team names, no clipped controls.
- [ ] The screen would look correct broadcast on a stadium concourse monitor: dark, legible at distance, unmistakably football.
