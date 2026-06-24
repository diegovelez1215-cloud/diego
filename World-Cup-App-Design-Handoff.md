# United 2026 — Product & Design Handoff for Codex

**Prepared for:** Diego (owner)
**Product:** United 2026 — phone-first World Cup 2026 companion + simulated-dollar Play experience
**Production URL:** https://worldcupapp-alpha.vercel.app/
**Date:** 2026-06-23
**Audit basis:** Live app structure pulled from production (nav, screen names, status states, disclaimer copy, theme color) + product/UX evaluation at 390px and 430px iPhone widths. This is a design and product handoff. No production code in this document — it ends in three scoped Codex tickets.

---

## 0. How to read this document

Everything here is phone-first. Targets are **390px (iPhone 13/14/15) and 430px (Pro Max)**, never desktop. Where a number is given (px, pt, ms, hex) it is a real default Codex can implement, not a placeholder. Where something says "keep," it means do not touch it during the overhaul.

The two hard product invariants behind every recommendation:

1. **Real World Cup data must always look calmer and more factual than the Play / simulation layer.** Facts are quiet. Simulations are energetic. The visual language must never let a user confuse a simulated number for a real one.
2. **Simulated money is clearly labeled, has no cash value, and is never dressed up to look like a real sportsbook.** Familiar patterns, yes. Casino pressure, never.

---

## 1. Product diagnosis

The app already has the right bones: four-area bottom navigation, a real tournament data spine, a Play layer, and an explicit "modelled estimates for entertainment only" disclaimer on the hero. The core problems are **density, hierarchy, and trust signaling at phone width** — not missing features.

### 1.1 What currently feels premium

- **The dark navy foundation (`#10153c` theme color) with the apple-mobile-web-app full-bleed treatment.** It reads like a broadcast graphics package, not a generic web app. This is the strongest existing asset and the whole redesign should build on it.
- **The hero framing** — `UNITED 2026 · 48 nations · 16 venues · 104 matches · Jun 11 – Jul 19, 2026 · all times ET`. Confident, factual, well-scoped. It tells you what this is in one glance.
- **The presence of a real disclaimer** ("Power ratings, futures odds and pundit analysis are modelled estimates for entertainment only"). Most fun-money apps hide this. Having it visible is a trust asset — it just needs to be designed, not buried in gray text.
- **Four-destination bottom nav exists** (`Now / World Cup / Bet / You`). The skeleton already matches a clean top-tier sports app. The fix is naming and contents, not structure.

### 1.2 What feels confusing

- **Two competing navigations.** The bottom nav (`Now / World Cup / Bet / You`) AND a 7-item chip row (`Bracket · Fixtures · Standings · Roads · Compare · Stats · Venues`). A new user cannot tell which is primary. The chip row is doing the job of a tab bar inside a tab. That is the single biggest IA problem.
- **"Now" vs "World Cup" is an unclear split.** Both sound like "the tournament." A user does not know whether live scores live in "Now" or "World Cup."
- **"Roads" and "Compare" are insider words.** "Roads" (qualification / road-to-the-final scenarios) and "Compare" (team/player comparison) are powerful features with names a casual fan won't decode in under a tap.
- **"Bet" as a tab label** invites the wrong mental model (real wagering) and may trip app-store / ad-platform policy. The experience is simulated dollars; the label should say so.

### 1.3 What feels visually busy

- **Seven chips on one row at 390px.** They either wrap (ugly) or scroll horizontally with most hidden (discoverability dies). Either way it signals "this app has a lot of stuff" before the user has done anything.
- **Equal visual weight across unequal things.** Bracket, Stats, and Venues are not equally important to a casual fan during a live match, but presented as identical chips they compete for the same attention.
- **No clear "what matters right now" surface.** On match day the most important thing — the live match — has to fight the chip row, the hero, and the navigation for primacy.

### 1.4 What feels unfinished

- **The `OFFLINE` status pill.** Right now it reads as an error/broken state rather than an intentional, explained data condition. For an app whose entire promise is "trust us for live scores," an unexplained OFFLINE badge is the most damaging possible first impression.
- **No visible data-freshness language.** There is a single status word but no "Updated 2 min ago" / "Live" / "Cached" vocabulary, which a live-data product needs everywhere.
- **Empty, delayed, and stale states are almost certainly underspecified** (no live matches between match days, weather delays, odds unavailable, player stats unavailable). These are 60%+ of the app's actual runtime during a month-long tournament and deserve first-class design (see §3.12–3.13).

### 1.5 What could damage trust

- **The unexplained `OFFLINE` pill** (above). #1 trust risk.
- **Any moment where a simulated/modelled number could be mistaken for a real live number.** Futures odds, power ratings, and pundit analysis are modelled. If they sit in the same card style and color as a real final score, the app's credibility on real data collapses.
- **Stale data shown as if live.** If a cached score or table is presented without an "as of" timestamp, users who check against TV will catch it and stop trusting the app. (Your data layer runs on free-tier API quotas with caching — see [United 2026 API quotas] — so cached/stale is a normal, frequent runtime state and must be designed honestly, not hidden.)
- **The word "Bet."** Beyond policy risk, it implies real stakes; if a new user funds expectations of cash and finds simulated dollars, that's a trust break at the worst moment.

### 1.6 What should stay exactly as it is

- **The deep navy `#10153c` broadcast aesthetic and full-bleed PWA framing.** Build on it; don't replace it.
- **The four-area bottom navigation as a structure** (just rename/recontent it).
- **The entertainment-only disclaimer as a permanent, visible element.** Redesign its presentation, never remove it.
- **The factual hero scope line** (nations / venues / matches / dates / "all times ET"). It's the right tone for real data.
- **The fundamental editorial honesty** of labeling modelled content as modelled. That instinct is the product's moat.

---

## 2. Information architecture — four tabs

Collapse everything into exactly four destinations. The current 7-chip row is dissolved: its items are redistributed as **sections inside Tournament** (reached by a single segmented control or scroll), not as peers of the tab bar.

### Tab 1 — Home  *(rename of "Now")*
**Purpose:** "What matters to me right now." A personalized, time-aware feed. The only tab whose contents change hour to hour.

**Belongs here:**
- Live / next match card (the single most prominent element on match day).
- Today's fixtures (compact, times in ET).
- "As it stands" nudge cards (your group, your bracket changed, a team you follow plays soon).
- Your active Play ticket status (read-only glance, taps through to Play).
- One editorial/"pundit" card max, clearly styled as modelled opinion.
- Data-freshness header (Live / Updated Xm ago / Offline-explained).

**Does NOT belong here:**
- Full standings tables, the full bracket, venue directories, the compare tool, deep stats. Those are Tournament. Home links *into* them; it does not contain them.
- Any Play stake entry. Home shows ticket status and deep-links to Play.

### Tab 2 — Tournament  *(rename/absorb of "World Cup" + the entire chip row)*
**Purpose:** The factual reference spine. Everything true about the real competition. This is the calm tab.

**Belongs here, as internal sections (segmented control or sectioned scroll, not 7 top chips):**
- **Matches** (Fixtures + results, filterable by day/group/team) → opens Match Center.
- **Groups & Standings** (live group tables).
- **Bracket** (as-it-stands knockout bracket).
- **Roads** → rename **"Scenarios"** or **"What it takes"** (qualification + knockout-path scenarios).
- **Teams** (squads, players) — and **Compare** lives *inside* a team/player view as an action, not as a top-level destination.
- **Stats** (tournament + player leaderboards — real).
- **Venues** (the 16 stadiums).

**Does NOT belong here:**
- Anything simulated, any odds you can "stake" on, any bankroll. Tournament is real-only. Modelled futures odds may appear as *reference* but visually demoted and labeled (see §3.4).

### Tab 3 — Play  *(rename of "Bet")*
**Purpose:** The simulated-dollar game. High energy, clearly fake money, clearly fun.

**Belongs here:**
- Beginner pick flow (pick → stake → slip → result).
- Bet slip and active tickets.
- Markets (winner first; advanced markets available but progressively disclosed).
- Matchcast / simulated match viewer entry.
- Modes: Ranked Season, Arcade, Matchday Cups, friend leagues.
- Bankroll, boosts, challenges.

**Does NOT belong here:**
- Real-money anything. Persistent "Simulated $ — no cash value" labeling required.
- Real live scores presented as the headline (Play references the real match but the *truth* lives in Tournament).

### Tab 4 — You  *(keep)*
**Purpose:** Identity, progress, social, settings.

**Belongs here:**
- Profile, rank, streak, level.
- Achievements & collectibles.
- Friend leagues hub (the social home; league *play* happens in Play).
- Leaderboards (global / friends / league).
- Settings: notifications, data/units, accessibility, **the entertainment-only / no-cash-value disclosure in full**, responsible-play info.

**Does NOT belong here:**
- Placing picks or live scores. You is about the person, not the tournament.

> **One-line IA test:** *Home = what's happening for me now. Tournament = what's true. Play = the game. You = me.* If a screen doesn't answer one of those four questions, it's in the wrong tab.

---

## 3. Screen-by-screen redesign plan

Each screen below is specified for 390px first. "Above the fold" = visible before any scroll on a 390×844 screen minus safe areas (~390×740 usable).

### 3.1 Home
- **Top:** Compact app wordmark + **data-freshness chip** (the reformed OFFLINE pill — see §3.13). Right side: a single avatar that taps to You.
- **Hero slot (highest priority):** one **smart card** that is context-aware:
  - *During a live match:* Live Match card — score, clock, possession bar, last event, a calm "LIVE" dot. Tap → Match Center.
  - *Within ~2h of kickoff:* Next Match card — countdown, teams, venue, "Make a pick" secondary action.
  - *No match today:* "Next up" card — next match date + a Tournament prompt ("See the bracket as it stands").
- **Below hero:** "Today" rail — horizontally scrollable fixture chips with ET times. Max 1 row, snap-scrolling, with a trailing "All fixtures →" chip into Tournament.
- **Your Play glance:** if a ticket is active, a slim card: stake, potential return (in simulated $), live status. Read-only; taps to Play. If none, a single soft prompt: "Make your first pick" (never nagging, never more than one).
- **One editorial card** max, tagged "Analysis · modelled."
- **Motion:** hero updates animate value changes (score ticks), not the whole card. Everything else static until refreshed.

### 3.2 Tournament
- **Header:** "Tournament" + a **segmented control** or a sticky section switcher with at most 4 visible primary sections: **Matches · Standings · Bracket · More**. "More" opens a clean list to Scenarios, Teams, Stats, Venues. This replaces the 7 equal chips.
- **Default section:** Matches, scoped to "Today" then "Upcoming," with a day picker.
- **Tone:** maximum calm. Neutral surfaces, factual type, no glow, no energetic motion. This is the trust tab; it should feel like a reference book that happens to be beautiful.
- **Every data surface carries an "as of" timestamp or a Live indicator.**

### 3.3 Match Center
The detail screen for a single match. Reached from Home or Tournament > Matches.
- **Scorebug header (sticky):** flags, score, status (Live clock / FT / KO time in ET / Delayed). Calm broadcast styling.
- **Tabs within (scrollable, not a second bottom bar):** Summary · Lineups · Stats · (if Play-enabled) Play.
- **Summary:** timeline of real events (goals, cards, subs). **Only real, confirmed events** — no invented live stats or scorer data. If a feed is delayed, show "Awaiting official updates" rather than guessing.
- **Play hook:** a single, clearly separated module "Play this match (simulated $)" that deep-links into Play with the match pre-selected. Visually distinct (Play accent), never blended into the factual timeline.
- **Stale handling:** if data is cached, a quiet banner "Showing last update · 4 min ago · pull to refresh."

### 3.4 Standings
- Group tables, one group per card, swipeable between groups or a group selector.
- Columns sized for 390px: Team (flag + 3-letter code) · P · GD · Pts. Tap a row → Team view. Long tables never force horizontal scroll; drop to abbreviations instead.
- **Qualification coloring:** subtle top-2 / playoff tint, with a legend. Calm, not neon.
- **Modelled vs real separation:** if you show "chance to advance %," it must be visually demoted (smaller, muted, tagged "modelled") and never colored like the real points column.

### 3.5 Live bracket
- **As-it-stands knockout bracket** that fits a phone: vertical, scrollable, one round in focus with horizontal paging between rounds — *not* a shrunk-down desktop bracket (unreadable at 390px).
- **Confirmed vs projected:** confirmed matchups solid; projected/seeded slots dashed/ghosted and labeled "projected." This is a core trust line — never show a projected path as if confirmed.
- Tapping a slot → Match Center (if scheduled) or the Scenario that determines it.
- "Roads/Scenarios" integrates here: from any team, "What it takes to advance."

### 3.6 Play (home of the tab)
- **Top:** Bankroll (simulated $) with an always-visible "SIM $ · no cash value" microtag. Mode selector: **Ranked · Arcade · Cups · Leagues**.
- **Primary surface:** today's matches as **pickable cards**. Each card shows the two teams and a single, beginner-readable line: the three winner options (Team A / Draw / Team B) with their potential return shown as "win $X on $10." (Decimal/American odds available in a setting for advanced users, but the *default* is plain-language potential return.)
- **One tap** on an option adds it to the slip; the slip is a persistent bottom bar (see §3.7).
- Advanced markets (totals, scorers, props) are **behind a "More markets" disclosure** on each match, never on the first screen. Beginners never see them unless they ask.

### 3.7 Bet slip → rename "Pick slip"
- **Persistent bottom bar** when ≥1 selection: "1 pick · stake $— · returns $—". Tap to expand into a **bottom sheet** (not a full page).
- **Sheet contents, top to bottom:** selection(s) with plain-language description ("Brazil to win vs Serbia"); a **stake stepper** with quick chips ($5 / $10 / $25 / Max); a live "You could win $X (total return $Y)" line; the **SIM $ no-cash-value** label; a single primary "Place pick" button.
- **Confirmation is explicit** (placing a pick is a deliberate action), but reversible within a short grace window where rules allow (Arcade). Ranked picks lock per fairness (see §6).
- After placing: a satisfying but tasteful confirmation (haptic + checkmark morph), then the sheet collapses to the active-ticket bar.

### 3.8 Active ticket
- Reached from the Play home, the Home glance card, or the collapsed slip bar.
- **States:** Open (match not started) · Live (in play, value updating) · Settled win · Settled loss · Void (e.g., market suspended).
- **Live state** is the exciting one: show the real match status calmly up top, and the *ticket's* live standing energetically below (Play accent, animated potential-return value). Keep the real score visually quieter than the ticket drama — invariant #1.
- **Cash-out / boosts** (if present) clearly labeled simulated; never use loss-pressure language ("Don't lose it all!") — that's a banned dark pattern.
- Settled tickets animate result once, then rest. Loss states are respectful and brief, never punishing.

### 3.9 Simulation / Matchcast
Full concept in §5. As a *screen*: a dedicated immersive viewer launched from a ticket or a "Watch simulation" action. Portrait-first, 2.5D pitch, scorebug, momentum, chance sequences, and a persistent "SIMULATION" marker so it is never confused with a real live match. Includes a "ticket impact" strip when the user has a stake on the simulated outcome.

### 3.10 You / profile
- **Header:** avatar, display name, **Rank** (e.g., "Gold III"), **current streak** (with a small flame that's earned, not spammy), level/XP bar.
- **Cards:** Achievements (grid, locked/unlocked), Friend leagues (your leagues + standings preview), Leaderboards entry, Collectibles.
- **Settings list:** Notifications, Units/odds format, Accessibility (text size, reduce motion, increased contrast), **Disclosures** (entertainment-only + no-cash-value in full), Responsible-play, About/data sources.
- Tone: personal and warm, calmer than Play, more playful than Tournament.

### 3.11 Leaderboards
- Segmented: **Friends · League · Global**. Friends default (most meaningful, least demoralizing).
- Row: rank, avatar, name, the ranked metric (e.g., ROI % or points), delta arrow. Your own row pinned and highlighted.
- Season context chip ("Ranked Season 1 · 12 days left").
- Never show global #1's untouchable numbers as the first thing a beginner sees — friends first protects motivation.

### 3.12 Empty states
Design these as first-class, because for most of a tournament month there is no live match.
- **No live match:** Home hero becomes "Next up" — next fixture, countdown, and one Tournament CTA. Friendly, never blank.
- **No active tickets:** Play shows the beginner pick prompt + "How Play works in 20 seconds" link.
- **No friends yet:** Leaderboards shows an invite card, not an empty table.
- **Pre-tournament / between rounds:** Bracket shows the confirmed structure with projected slots ghosted; Standings show final group state.
- Every empty state = one clear illustration + one sentence + at most one action.

### 3.13 Delayed / suspended / stale / unavailable states
This is the trust system. Define a **single data-state vocabulary** used everywhere:

| State | Visual | Copy pattern |
|---|---|---|
| **Live** | Green pulsing dot | "LIVE" + clock |
| **Updated** | Neutral dot | "Updated 2 min ago" |
| **Cached / Stale** | Amber dot | "Showing last update · 4 min ago · pull to refresh" |
| **Offline** | Gray dot | "You're offline — showing saved data from 3:40 PM ET" (this replaces the bare `OFFLINE` pill) |
| **Delayed** (weather/etc.) | Amber, calm | "Match delayed — we'll update when play resumes" |
| **Suspended market** (Play) | Play accent muted | "Picks paused for this match" |
| **Odds unavailable** | — | "Odds for this match aren't available yet" (never invent them) |
| **Player stats unavailable** | — | "Stats will appear once official data is in" (never invent them) |

Rules: never show a stale number without its timestamp; never fabricate live stats, odds, or scorer data; the offline state must say *what* it's showing and *from when*, turning a scary word into an honest, premium micro-interaction.

---

## 4. Premium iOS design system

Phone-first, iOS-native feel, "liquid glass" done tastefully. All values are implementable defaults.

### 4.1 Color roles
Built on the existing `#10153c` navy. Define roles, not just colors.

- **Surface / base:** `#0B1030` (deepest) → `#10153C` (base) → `#1A2150` (raised). Background uses a subtle vertical gradient base→deepest.
- **Glass tint:** translucent white overlays at low alpha (see §4.5), over the navy.
- **Text:** Primary `#F5F7FF`, Secondary `#AEB4D6`, Tertiary `#6E76A0`.
- **Real-data accent (calm, "truth"):** a cool cyan/ice `#5FC8E8` used sparingly for live indicators and factual emphasis.
- **Play accent (energy):** a warm, premium gold/amber `#FFC24B` (not casino red/green). This is the "simulated money" color — wherever it appears, money is fake.
- **Positive / negative (Play only):** Win `#3DDC97`, Loss `#FF6B6B` — used *only* inside Play/tickets, never on the factual Tournament tab.
- **Qualification tints (Standings):** muted green (advance) / muted amber (playoff) at ~12% alpha fills.

> **The single most important color rule:** the Play accent (gold) and the win/loss colors **never appear on real factual data**. Real scores, tables, and brackets use neutral text + the cool cyan only. This is how the eye learns "gold = simulated, cyan = real." Enforce in code with separated token sets: `--color-fact-*` vs `--color-play-*`.

### 4.2 Typography hierarchy
SF Pro / system font, Dynamic Type-respecting.

- **Display (hero scores, Matchcast scorebug):** SF Pro Display, 34–44pt, bold, tight tracking.
- **Title 1 (screen titles):** 28pt semibold.
- **Title 2 (card headers):** 20pt semibold.
- **Headline (row primary):** 17pt semibold.
- **Body:** 17pt regular.
- **Subhead/secondary:** 15pt regular, secondary color.
- **Caption / data-state / disclaimers:** 13pt, tertiary color.
- **Numerals:** use tabular/monospaced figures for all scores, odds, timers, and money so values don't jitter when they tick.

### 4.3 Spacing scale
8pt grid. Tokens: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 48`. Default screen side padding **16px**. Card inner padding **16px**. Min gap between cards **12px**. Respect safe-area insets top and bottom — content never sits under the notch or the home indicator.

### 4.4 Card system
- **Corner radius:** 20px for primary cards, 16px for nested, 12px for chips, continuous (squircle) curvature where the platform allows.
- **Three card tiers:** *Flat* (factual lists, lowest elevation), *Raised* (interactive content), *Glass* (hero/live/Play surfaces — see §4.5).
- One accent per card maximum. Cards never use both fact-cyan and play-gold.

### 4.5 Glass material levels
Three deliberate levels — not glass everywhere (that's the trap that looks cheap).
- **L1 — Chrome glass:** the bottom nav and sticky headers. `backdrop-blur: 24px`, white overlay ~8% alpha, hairline top border. Always translucent over content.
- **L2 — Feature glass:** Home hero, live cards, pick slip sheet. `blur: 18px`, overlay ~12%, soft inner highlight on the top edge (1px white at 15%).
- **L3 — Solid (no glass):** factual tables, settings, dense lists. Glass is reserved for "alive" surfaces; reference content stays solid for legibility.
- Provide a **"Reduce transparency"** fallback (solid navy surfaces) tied to the iOS accessibility setting.

### 4.6 Shadow rules
Dark UI → shadows are subtle; use elevation via lightness + blur, not heavy drop shadows.
- Cards: `y+8, blur 24, color rgba(0,0,0,0.35)`.
- Sheets: `y+16, blur 40, rgba(0,0,0,0.45)` + a scrim behind.
- Nav/headers: top hairline + soft `y-4` ambient. Never a hard black box-shadow.

### 4.7 Border rules
- **Hairlines, not boxes.** 1px (0.5px on retina) borders at white 8–12% alpha to define glass edges.
- Focus/selected state: 1.5px accent border (cyan for factual selection, gold for Play selection).
- Avoid full outlines on cards; let elevation + radius do the separation.

### 4.8 Button styles
- **Primary (filled):** full-width 50px height, radius 14px, bold 17pt label. Cyan for factual primary actions; **gold for Play primary actions** ("Place pick").
- **Secondary (tonal):** translucent white 10% fill, same metrics.
- **Tertiary (text):** label only, accent color.
- **Destructive/cancel:** text style, neutral — never red unless inside a Play loss context.
- All buttons: pressed state scales to 0.97 + slight dim, with haptic (§4.13). Min touch target 44×44pt regardless of visual size.

### 4.9 Bottom sheets
- The default modal pattern (pick slip, stake entry, market details, confirmations). Never full-page modals for short tasks.
- Detents: medium (~50%) and large (~92%). Grabber handle at top. Rounded top corners 24px. Dismiss by drag-down or scrim tap (except during irreversible confirmation steps).
- Background content dims to 40% + slight scale-down (0.98) for depth.

### 4.10 Bottom navigation
- **Four items only:** Home · Tournament · Play · You. L1 glass bar, blurred over content, safe-area aware.
- Icons + labels (labels always on — casual fans need words). Active item: filled icon + accent (cyan baseline; Play tab may glow gold when a live ticket is active — a tasteful, earned exception).
- Height ~49pt + safe area. A subtle live-dot badge on Home during live matches, on Play during a live ticket. Badges are informative, never red-dot nag spam.

### 4.11 Loading skeletons
- Every data surface has a skeleton matching its final layout (no spinners on content areas). Shimmer: a slow left-to-right gradient sweep, ~1.2s, low contrast.
- Scores/tables show skeleton rows of correct count where known. Skeletons use solid (L3) styling even on glass cards, so loading never flashes transparency.
- Hard rule: never show `0–0` or placeholder zeros as if real. Skeleton until real value arrives.

### 4.12 Error states
- **Inline, friendly, recoverable.** Pattern: small illustration/icon + one-line cause + one action ("Try again"). Never a stack trace, never a dead end.
- Tiered: transient (auto-retry quietly) vs hard (show the inline card). Network errors tie into the data-state vocabulary (§3.13), not generic "Something went wrong."

### 4.13 Motion principles
- **Purposeful, physical, brief.** Springs over linear easing. Standard transition 250–300ms; micro-interactions 120–180ms.
- **Value changes animate, layouts don't jump.** A score ticks; a card doesn't reflow.
- **Real vs sim motion budget:** Tournament/real surfaces get *restrained* motion (fades, gentle). Play/Matchcast get *energetic* motion (springs, scale pops, particle accents on goals/wins). The motion language itself reinforces real-vs-sim.
- Respect **Reduce Motion**: replace springs/parallax with simple fades; Matchcast falls back to a clean animated-stat view.
- Shared-element transitions: a fixture card on Home expands into Match Center (matched geometry) for premium continuity.

### 4.14 Haptic moments
Use sparingly so they stay meaningful (Core Haptics / UIFeedbackGenerator equivalents):
- **Light tap:** selection (adding a pick, switching tabs).
- **Medium:** placing a pick, opening the pick slip.
- **Success:** ticket win, achievement unlock.
- **Warning:** market suspended, pick rejected.
- **Goal in Matchcast:** a distinct, slightly bigger success pattern.
- Never haptic on scroll, on passive data updates, or on losses (a loss buzz feels punishing). Honor the system haptics setting.

### 4.15 Accessible contrast rules
- Body text on navy meets **WCAG AA (≥4.5:1)**; large text/numerals ≥3:1. Verify: primary `#F5F7FF` on `#10153C` passes comfortably; secondary `#AEB4D6` is for non-essential text only.
- Never encode meaning in color alone — qualification, win/loss, live all carry an icon or label too.
- Honor Reduce Transparency (solid fallbacks), Reduce Motion, and Dynamic Type up to XXL without clipping (test at 390px + largest type — the most likely break point).
- All interactive targets ≥44×44pt. Focus order logical for VoiceOver; live regions announce score changes.

---

## 5. Beginner-friendly Play experience

Goal: a brand-new user can place a meaningful pick in **three taps** and understand exactly what's happening, while advanced users keep their depth.

### 5.1 The five-step beginner spine
1. **Pick a winner.** On a match card, three big tappable options: *Team A win · Draw · Team B win*. No jargon. (Tap 1.)
2. **Understand what they might win.** The instant an option is tapped, the card shows plain language: **"Win $18 on a $10 pick."** Not "+1.80" or "+180" by default. The number updates as stake changes.
3. **Choose a stake.** The pick slip bottom sheet opens with quick-stake chips **$5 / $10 / $25 / Max** plus a stepper. Default pre-selected: $10. (Tap 2 = choose chip, or accept default.)
4. **See their bet slip.** The sheet always shows: what they picked (full sentence), stake, "you could win $X," total return, and the **"Simulated $ · no cash value"** label. One primary button: **Place pick.** (Tap 3.)
5. **Watch the result unfold.** Confirmation → the ticket appears as a live card. They can open Matchcast to watch the simulated match, or follow the real match calmly. On settle: a single celebratory (win) or respectful (loss) animation, bankroll updates with a count-up.

### 5.2 Keeping advanced markets available but not overwhelming
- **Progressive disclosure:** the winner market is the only thing visible by default. A single **"More markets ▾"** row on each match reveals totals, both-teams-to-score, correct score, scorers, props — grouped and collapsible.
- **Odds format setting:** default = plain-language potential return; advanced users switch to Decimal or American in You > Settings. The plain-language line can always show alongside.
- **A persistent "Why these numbers?" link** opens a short, honest explainer (modelled, entertainment-only). Education, not fine print.
- **Parlay/combo** (multiple picks) supported but never auto-suggested to beginners and never with pressure copy. Combining picks is a deliberate "Add to slip" action.

### 5.3 Guardrails (non-negotiable)
- Persistent SIM-$ labeling on every money surface.
- No loss-chasing prompts, no "you almost won," no fake-urgency timers, no forced daily streaks that punish missing a day.
- Bankroll top-ups (if any) are clearly simulated and rate-limited sensibly — never a "buy more" funnel implying real money.

---

## 6. Matchcast concept — premium 2.5D broadcast

A simulated-match viewer that feels like a modern football broadcast graphics package, **not** a console 3D football game. Think "broadcast augmented graphics + data," rendered in layered 2.5D.

### 6.1 Visual approach
- **2.5D pitch:** a stylized pitch rendered in perspective (slight tilt, depth via layering and parallax), with abstract player tokens/dots and motion trails — not modelled 3D players. Premium materials: subtle pitch gradient, soft stadium-light vignette, depth-of-field on the crowd layer. Portrait-first; the pitch sits in the upper 60% with data below.
- Avoid uncanny full-3D: it reads cheap on a phone and breaks the "broadcast graphics" premium feel. 2.5D abstraction looks intentional and high-end.

### 6.2 Scorebug
- Sticky top, L2 glass. Flags + 3-letter codes, tabular score, match clock, a SIMULATION marker (small, persistent — never let it look like a real live match). Period indicator (1H/HT/2H/ET/PENS).

### 6.3 Possession & momentum
- A **momentum bar** under the scorebug: a single horizontal bar that leans toward whichever side is on top, easing smoothly (not jumpy). Possession % shown as tabular figures. Momentum swings drive subtle background-tint shifts toward the dominant team's color.

### 6.4 Chance sequences
- Key passages render as animated **token movement on the pitch** with a labeled outcome ("Shot — saved", "Big chance!"). Build tension with pace: tokens accelerate into the box, a brief slow-down at the shot, then resolution. Sound optional and off by default.

### 6.5 Goal moments
- The peak moment. Sequence: ball-token strikes → **net ripple + flash of the scoring team's color** → scorebug score count-flip → a tasteful particle burst → "GOAL" lockup with scorer name and minute. ~1.5s, energetic but not garish. Distinct success haptic. Then settle back to play.

### 6.6 Penalties
- Dedicated mini-view: a goal-mouth 2.5D frame, shooter vs keeper tokens, a simple direction/outcome animation per kick, and a running shootout tally (●○●...). Highest-drama moment in the app — pace it deliberately, one kick at a time, with anticipation beats.

### 6.7 Halftime
- The viewer calms: momentum bar freezes, a HT summary card slides up (shots, possession, key chances, simulated). A good moment to surface "your ticket at half" (§6.9) and, in Arcade, an optional re-pick window.

### 6.8 Full time
- Final whistle: score locks, a clean FT summary (timeline of goals, top simulated stats), and the **result resolution** for any active ticket. One celebratory or respectful beat, then a clear "Back to Play" / "Next match" action.

### 6.9 Ticket impact
- A persistent slim strip at the bottom of Matchcast when the user has a stake on this match: "Your pick: Brazil to win · live: winning · returns $18." Updates with the simulated score, in the Play accent (gold), kept visually beneath the match drama so the match is the star.

### 6.10 Tournament impact
- After a simulated knockout result, an optional "What this means" card: how the bracket would update, who advances. Clearly framed as simulation (this is Play, not real). Links to a *simulated* bracket view, kept entirely separate from the real Tournament bracket so the two never blur.

---

## 7. Ranked vs Arcade

Two clearly separated competitive contexts so casual fun never corrupts serious competition.

### 7.1 Ranked Season
- **The fair, hard-to-exploit ladder.** Fixed starting bankroll for everyone, season-long, tied to **real** World Cup matches.
- **Picks lock at kickoff** (no editing, no cash-out exploits). Markets sourced consistently; everyone sees the same lines at the same time.
- Ranking metric rewards skill over volume (e.g., ROI or a points model with diminishing returns on stake size) so a user can't brute-force rank by spamming max stakes.
- **No boosts, no Easter eggs, no arcade modifiers** affect Ranked outcomes. Tiers (Bronze→Diamond) with seasonal reset. This is the integrity core — keep it austere.

### 7.2 Arcade
- **The playground.** Refillable/forgiving bankroll, instant simulated matches you don't have to wait for, re-picks, boosts, wild markets, and the rare Easter eggs live here. Low stakes emotionally, high fun. Nothing here touches Ranked standing.

### 7.3 Matchday Cups
- **Short, themed, time-boxed competitions** around a real match day (e.g., "Round of 16 Day 1 Cup"). Everyone enters with equal conditions, compete on that day's slate, winners get cosmetic rewards/badges. A bridge between Arcade's fun and Ranked's structure — competitive but bite-sized.

### 7.4 Friend leagues
- **Private leagues** among friends, configurable as Ranked-style (locked, fair) or Arcade-style (loose, fun) at creation. Invite via link. Standings live in You > Friend leagues; play happens in Play. Friendly, social, banter-friendly — but a Ranked-style friend league still enforces fairness rules so bragging rights mean something.

### 7.5 Anti-exploit principles (apply across Ranked + Cups)
- Server-authoritative settlement and locked lines; clients can't alter outcomes.
- One account per ranked entry; rate limits on bankroll refills.
- Easter eggs and boosts are flagged and structurally excluded from ranked scoring.
- Upsets come from realistic modelled variance, never scripted chaos or forced losses.

---

## 8. Prioritized roadmap

Each item: **User impact · Effort · Risk · Why it matters.** Do P0 before any major visual work — they're cheap, they're about trust and clarity, and skipping them undermines everything built on top.

### P0 — Must fix before major visual work
1. **Replace the bare `OFFLINE` pill with the data-state vocabulary (§3.13).**
   - *Impact:* High. *Effort:* Low. *Risk:* Low.
   - *Why:* An unexplained OFFLINE badge is the single biggest trust killer in a live-data app. Honest "showing saved data from 3:40 PM ET" turns a scare into a premium detail.
2. **Collapse the 7-chip secondary nav into Tournament sections (§2, §3.2).**
   - *Impact:* High. *Effort:* Medium. *Risk:* Low.
   - *Why:* Eliminates the dual-navigation confusion and the "busy" feeling at the root.
3. **Rename tabs: Now→Home, World Cup→Tournament, Bet→Play (§2).**
   - *Impact:* High. *Effort:* Low. *Risk:* Low (policy risk reduced by dropping "Bet").
   - *Why:* Clear mental model + reduced store/ad-policy exposure from the word "Bet."
4. **Establish the fact-vs-sim color separation (cyan = real, gold = simulated) as enforced tokens (§4.1).**
   - *Impact:* High. *Effort:* Medium. *Risk:* Low.
   - *Why:* Everything else depends on users never confusing modelled numbers for real ones. Cheapest to enforce now, expensive to retrofit later.
5. **Add data-freshness timestamps to every real data surface (§3.13).**
   - *Impact:* High. *Effort:* Medium. *Risk:* Low.
   - *Why:* Caching/free-tier quotas make stale a normal runtime state; honest timestamps preserve trust.

### P1 — Highest-impact visual & UX overhaul
6. **Home smart hero (live/next/none context-aware) + Today rail (§3.1).**
   - *Impact:* High. *Effort:* Medium. *Risk:* Low. *Why:* Gives the app a "what matters now" center of gravity it currently lacks.
7. **Premium iOS design system implementation: tokens, glass L1–L3, type, spacing, buttons, sheets, skeletons (§4).**
   - *Impact:* High. *Effort:* High. *Risk:* Medium (scope creep). *Why:* This is the "premium" promise made concrete and reusable.
8. **Phone-readable Live Bracket + Match Center (§3.3, §3.5).**
   - *Impact:* High. *Effort:* High. *Risk:* Medium. *Why:* Core factual screens; the bracket especially fails at 390px today.
9. **Full empty/delayed/suspended state set (§3.12–3.13).**
   - *Impact:* Medium-High. *Effort:* Medium. *Risk:* Low. *Why:* These states are most of the tournament's runtime; polished here = feels finished.

### P2 — Play & Matchcast upgrades
10. **Beginner pick flow + pick slip bottom sheet (3-tap spine) (§5).**
    - *Impact:* High. *Effort:* Medium. *Risk:* Low. *Why:* Converts casual fans into Play users without overwhelming them.
11. **Progressive-disclosure advanced markets + odds-format setting (§5.2).**
    - *Impact:* Medium. *Effort:* Medium. *Risk:* Low. *Why:* Keeps depth for pros without scaring beginners.
12. **Matchcast 2.5D viewer: pitch, scorebug, momentum, goals, FT, ticket-impact (§6).**
    - *Impact:* High (signature feature). *Effort:* High. *Risk:* Medium-High (perf on phones). *Why:* The "EA FC energy" differentiator; must stay 2.5D and performant.
13. **Ranked/Arcade/Cups/Leagues separation with fairness rules (§7).**
    - *Impact:* Medium-High. *Effort:* High. *Risk:* Medium. *Why:* Competitive integrity; hard to retrofit fairness later.

### P3 — Gamification, collectibles, Easter eggs
14. **Achievements, levels, streaks (earned, non-manipulative) (§3.10).**
    - *Impact:* Medium. *Effort:* Medium. *Risk:* Medium (dark-pattern temptation). *Why:* Retention via delight, not pressure.
15. **Collectibles + cosmetic rewards from Cups/leagues.**
    - *Impact:* Medium. *Effort:* Medium. *Risk:* Low. *Why:* Status and self-expression without pay-to-win.
16. **Rare, optional Easter eggs (Arcade-only, never affect Ranked) (§7.2).**
    - *Impact:* Low-but-loved. *Effort:* Low. *Risk:* Low. *Why:* Personality and word-of-mouth; safe because structurally excluded from ranked.

---

## 9. Codex handoff — three scoped tickets

Each ticket is phone-first, testable, and bounded so Codex can complete it without rewriting the app. Acceptance criteria are written so they can be checked at 390px and 430px.

---

### Ticket A — Premium app shell, Home, and Tournament

**Goal:** Establish the four-tab shell, the design-token foundation, the context-aware Home, and the consolidated Tournament with its data-state vocabulary.

**Scope**
1. **Design tokens & theme** — implement the color roles (§4.1) as two enforced token sets: `--color-fact-*` (cyan/neutral) and `--color-play-*` (gold/win/loss). Type scale (§4.2), spacing scale (§4.3), radii, shadows (§4.6), hairline borders (§4.7). Reduce Transparency / Reduce Motion / Dynamic Type fallbacks.
2. **App shell** — four-item glass bottom nav (Home · Tournament · Play · You) per §4.10, safe-area aware, labels always visible, live-dot badge logic. Rename existing Now/World Cup/Bet/You accordingly.
3. **Home** — context-aware smart hero (live / next / none) per §3.1, Today fixtures rail, read-only Play-glance card, one editorial card tagged "modelled," data-freshness header.
4. **Tournament** — replace the 7-chip row with a 4-section switcher (Matches · Standings · Bracket · More→Scenarios/Teams/Stats/Venues) per §3.2. Implement Matches list + Standings tables (§3.4) readable at 390px (abbreviate, never horizontal-scroll). Bracket and deep sections can be stubbed but must be reachable.
5. **Data-state system** — implement the §3.13 vocabulary (Live/Updated/Cached/Offline/Delayed) with timestamps; replace the bare `OFFLINE` pill.

**Acceptance criteria**
- At 390px and 430px: bottom nav shows exactly four labeled items, blurred over content, clears the home indicator.
- No screen renders two competing navigations.
- Home hero changes correctly across three data conditions (live match present / kickoff within 2h / none).
- Every real data surface shows a Live indicator or an "Updated/Showing saved data from …" timestamp; no bare "OFFLINE."
- Fact surfaces use only cyan/neutral tokens; no gold or win/loss color appears on any real score, table, or bracket.
- Standings fit 390px with no horizontal scroll; text honors Dynamic Type to XL without clipping.
- Reduce Transparency yields solid navy surfaces; Reduce Motion removes parallax/springs.

**Out of scope:** Play flows, Matchcast, achievements.

---

### Ticket B — Play, pick slip, and beginner flow

**Goal:** Ship the 3-tap beginner pick spine with a clearly-simulated pick slip, progressive advanced markets, and active-ticket states.

**Scope**
1. **Play home (§3.6)** — bankroll header with persistent "SIM $ · no cash value" tag; mode selector (Ranked · Arcade · Cups · Leagues — Ranked/Arcade functional, Cups/Leagues may link to stubs); today's matches as pickable cards showing Team A / Draw / Team B with plain-language potential return ("Win $18 on $10").
2. **Pick slip (§3.7)** — persistent collapsed bottom bar; expands to a bottom sheet (medium/large detents) with selection sentence, stake chips ($5/$10/$25/Max, default $10) + stepper, live "you could win $X / total $Y," SIM-$ label, single "Place pick" primary (gold). Medium haptic on open, success on place.
3. **Beginner spine (§5.1)** — guarantee pick-a-winner → stake → slip → place in three taps from a match card; default stake pre-filled.
4. **Advanced markets (§5.2)** — "More markets ▾" progressive disclosure per match (totals, BTTS, correct score, scorers, props), collapsed by default. Odds-format setting (plain/decimal/American) in You>Settings, defaulting to plain.
5. **Active ticket (§3.8)** — Open / Live / Win / Loss / Void states; live state shows real match status calmly above the energetic ticket value below; respectful (non-punishing) loss; bankroll count-up on settle.
6. **Guardrails (§5.3)** — persistent SIM labeling, no loss-chasing/urgency copy anywhere.

**Acceptance criteria**
- A new user can place a pick in 3 taps; default stake is pre-selected.
- "SIM $ · no cash value" is visible on Play home, in the slip, and on every ticket — never more than a glance away.
- The first Play screen shows only the winner market; advanced markets require an explicit disclosure tap.
- The pick slip is a bottom sheet (not a full page) and dismisses by drag/scrim except during the place-confirmation step.
- Win uses gold/`#3DDC97`, loss uses `#FF6B6B`, and these colors appear only inside Play — never on the Tournament tab.
- No copy in Play uses fake urgency, loss-chasing, or "you almost won" language (manual review checklist passes).
- All targets ≥44pt; works at 390px and 430px; honors Reduce Motion (no spring on slip).

**Out of scope:** Matchcast rendering, Ranked fairness backend, achievements.

---

### Ticket C — Matchcast, motion, rewards, and profile polish

**Goal:** Ship the 2.5D Matchcast viewer, the motion/haptic layer, and the You tab with rewards — the signature-premium pass.

**Scope**
1. **Matchcast 2.5D (§6)** — portrait viewer: 2.5D pitch (token-based, parallax depth — no full 3D players), sticky glass scorebug with persistent SIMULATION marker, momentum bar, chance-sequence token animations, goal moment (net ripple + count-flip + particle burst + success haptic, ~1.5s), halftime summary card, full-time resolution, and the gold ticket-impact strip when a stake exists. Performance budget: 60fps on a mid-range phone; degrade gracefully and provide a Reduce-Motion animated-stat fallback.
2. **Penalties mini-view (§6.6)** — goal-mouth frame, per-kick animation, shootout tally, paced one kick at a time.
3. **Motion & haptics layer (§4.13–4.14)** — shared-element transition (fixture card → Match Center), value-tick animations, the haptic map (light/medium/success/warning + goal), all honoring system settings. No haptic on loss or passive updates.
4. **You tab (§3.10, §3.11)** — profile header (avatar, rank, streak, level/XP), achievements grid (locked/unlocked), friend-leagues preview, Leaderboards (Friends/League/Global, friends default, own row pinned), settings list including full disclosures and accessibility toggles.
5. **Rewards (P3 subset)** — achievements + earned streaks (non-manipulative), cosmetic collectibles surface. Rare Arcade-only Easter egg hook, structurally excluded from Ranked.

**Acceptance criteria**
- Matchcast renders in portrait at 390px and 430px, holds ~60fps on a mid-range device, and never visually resembles a real live match (SIMULATION marker always present).
- Goal moment fires once per goal with the success haptic; loss/settle never triggers a buzz.
- Reduce Motion replaces the 2.5D animation with a clean animated-stat view; nothing breaks.
- Ticket-impact strip appears only when the user has a stake, uses gold, and stays visually subordinate to the match.
- You tab: Leaderboards default to Friends; the user's own row is pinned and highlighted; full entertainment-only + no-cash-value disclosure is reachable in Settings.
- Achievements/streaks contain no punitive "you broke your streak"-style pressure copy (review checklist passes).
- Easter eggs are flagged and cannot affect any Ranked or Cup standing (verified by a test that excludes flagged events from ranked scoring).

**Out of scope:** Ranked matchmaking backend, real-money anything (prohibited), full collectibles economy.

---

## 10. Guardrail summary (applies to all tickets)

- Real data calmer than simulations, always (cyan/neutral vs gold).
- Simulated dollars labeled, no cash value, every money surface.
- No fabricated live stats, odds, or scorer data — show honest "unavailable/awaiting official data" states instead.
- No dark patterns: no forced loss, no rigged outcomes, no fake urgency, no loss-chasing, no punitive streaks.
- Upsets feel like realistic football variance, never scripted chaos.
- Easter eggs rare, optional, Arcade-only, never affecting ranked competition.
- Phone-first at 390/430px; every major action in 1–3 taps; ≥44pt targets; AA contrast; honor Reduce Motion / Reduce Transparency / Dynamic Type.
