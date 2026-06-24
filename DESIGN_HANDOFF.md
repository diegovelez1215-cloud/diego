# United 2026 — Product & UX Design Handoff

**Audience:** Codex (implementation) · **Author role:** product designer / mobile UX / design-system lead
**Target device:** iPhone first — design and test at **390px** and **430px** width before anything else.
**Production:** https://worldcupapp-alpha.vercel.app/
**Status of code today:** single-file PWA (`index.html` + `sw.js` + `/api/*`), live results + scorers + odds working, leaderboard/league de-duped and self-updating, Real-life vs My-Sim separation enforced, simulated dollars labeled, graceful fallbacks when feeds are down.

> **Golden rule for this whole document:** *Real World Cup information always looks calmer and more factual than simulations. Simulated dollars are always labeled and have no cash value. No fake live stats, no fake live odds, no rigged outcomes, no dark patterns.*

---

## 1. Product diagnosis

### Feels premium (keep)
- Liquid-glass dark theme, team-color theming, tabular numerals on money/odds/scores.
- The **Live Now / Tournament Pulse / Active Picks** home cards — calm, factual, clearly labeled "Official tracker / Calm / Delayed / Pending."
- Live match simulation (pitch canvas, momentum, commentary, yellow/red cards, VAR) — genuinely differentiated; this is the app's signature moment.
- The post-bet action tray (Simulate now / Add another / Build parlay / Track in My Bets) — momentum is preserved.
- Real-life vs My-Sim mode toggle and the "as it stands" knockout engine.

### Feels confusing
- **Five tabs** (Home / Matches / Bracket / Bet / Teams) with sub-segments inside Matches (schedule/standings/stats) and Teams (h2h/road/cities). Too many peer destinations; "Teams" and "Bracket" are not first-class daily jobs.
- Bracket is a top-level tab but is a "check occasionally" surface, not a core loop.
- Some screens mix factual tournament data and Play/betting energy at equal weight.

### Feels visually busy
- Home can stack many cards (live, picks, pulse, pick'em, hype, progress, champion, leaderboard, next-up, tools) — needs a clear "one hero + one resume + progressive disclosure" order.
- Chip/badge density on match and bet cards at 390px.

### Feels unfinished
- No persistent freshness signal across all data surfaces (just added one on Live Now — extend it).
- Loading states are mostly skeletons but not consistent across every async surface.
- Assists list is short (Football-Data free tier) — needs a graceful "limited data" note.

### Could damage trust
- Anything labeled "LIVE" that is actually pre-match or modeled. (Just renamed odds → **MARKET ODDS**; keep auditing.)
- xG / possession / shots / ratings must say **"Modeled match profile"** unless from a verified live provider (matchstats/matchday/rapid routes are currently disabled — never present them as live).
- Bankroll is device-local — global leaderboards must not imply a server-authoritative ranked ladder yet.

### Should stay exactly as it is
- Real-life vs My-Sim separation and the "official finals only update standings" rule.
- Wallet/device isolation on shared links (links carry bracket/sim only).
- Simulated-dollar labeling and the entertainment-only disclaimer (now de-duplicated).
- The graceful-degradation pattern when any feed is unavailable.

---

## 2. Information architecture — four tabs only

### 🏠 Home — "What should I do right now?"
**Belongs:** featured/live match hero, bankroll + streak chip, one primary CTA, one "resume" card (active ticket or live sim), a single daily card (mission/fortune as *secondary*), data-freshness stamp, soft entry to friend league.
**Does not belong:** full standings tables, full bracket, the simulator tool drawer, multiple competing promos.

### 🏆 Tournament — the trustworthy factual world (calm)
**Belongs:** Today's matches, fixtures, Match Center entry, Groups & Standings, live "as-it-stands" knockout bracket, third-place race, venues, team/player info.
**Does not belong:** bet slip, simulated bankroll, Play promos. This tab is the "Apple Sports clarity" zone — factual, calm, no Play color.

### 🎮 Play — the simulated-dollar fun (clearly labeled)
**Belongs:** Picks/markets, bet slip + Parlay Lab, active tickets, simulations/Matchcast, futures, boosts, daily fortune, power-ups, the "SIM $ · no cash value" labeling.
**Does not belong:** anything that looks like official live data without a "modeled/sim" badge.

### 👤 You — identity, progression, social
**Belongs:** profile (bankroll path, ROI, win rate, biggest hit, favorite team, play-style tag), achievements/trophies, rank + streak, **leaderboards**, **friend leagues (Crew)**, settings, reset, install.
**Does not belong:** live match data, the bet slip.

> **Migration from today's code:** `home → Home`; `matches(schedule/standings/stats)` + `bracket` + `teams(road/cities)` → **Tournament** (sub-segments: Today / Standings / Bracket / Teams); `bet` → **Play**; new **You** tab absorbs leaderboard/league/profile/achievements (today these live under `teams`/`bet`).

---

## 3. Screen-by-screen redesign plan

**Home** — Order top→bottom: (1) freshness + status pill, (2) **one** hero card (live match if any, else next big match, else top story), (3) resume card (active ticket / live sim) only when relevant, (4) one daily card, (5) compact friend-league row, (6) quiet link to tools. Everything else is progressive disclosure.

**Tournament** — Segmented control: **Today · Standings · Bracket · Teams**. Calm palette. Each match row → Match Center. Standings: fix right-edge padding (done), tidy number columns. Bracket: the live "as it stands" view with a clear "updates only from official finals" caption.

**Match Center** — One hub per match: status pill (Scheduled / LIVE / HT / FT / Delayed / Suspended), score, scorers, **MARKET ODDS** (pre-match) with clear label, standings impact, "Add to slip" and "Simulate" actions, and a freshness line. Modeled stats clearly tagged "Modeled match profile."

**Standings** — Compact, tabular, fixed gutters at 390px; Win/RU/3rd legend; "as-it-stands" projection beneath each group with a 🔴 live tag only when a real game is in play.

**Live bracket** — Round columns horizontally scrollable; resolved ties show real teams, unresolved show slot labels; third-place pool surfaced; "official finals only" caption.

**Play** — Category nav at top (Matches / Futures / Players / Specials), bankroll header with SIM-$ label, markets front and center, rewards/store/missions in a collapsible "extras" drawer.

**Bet slip** — Single sheet: selection(s), stake chips, to-win, one dominant CTA. Parlay Lab when ≥2 legs (risk meter, Safe/Balanced/Spicy/Insane, combined % chance).

**Active ticket** — From Play → My Bets: each open bet directly settle-able (Simulate / Cash out) without re-finding the match; futures show progress + "Play tournament to settle."

**Simulation / Matchcast** — See §6.

**You / profile** — Avatar, play-style tag, bankroll trend sparkline, ROI/win-rate/biggest-hit, trophies, rank + streak, league membership.

**Leaderboards** — De-duped rows (done), tap → profile drawer; "🟢 Live · auto-updating" header; one row per player.

**Empty states** — "No live matches right now" (done), "No active picks yet," "No scores yet," "Stats unavailable — modeled profile only." Always calm, never blank.

**Delayed/suspended** — "Play suspended / Postponed / Weather delay" pill; bets stay open; "nothing settles until official full time" caption (already implemented — keep consistent everywhere).

---

## 4. Premium iOS design system

- **Color roles:** `--bg` deep navy; **green = money/win**, **blue = action/odds**, **gold = status/leader**, **red = danger/loss/live-red**, **purple = boosts/specials**. Real-tracker surfaces use neutral/blue; Play surfaces may use green/gold.
- **Typography:** Display (Space Grotesk 900) for scores/bankroll/odds; UI (Manrope 600–800) for body; tabular-nums everywhere numeric. Scale ~ 11 / 12.5 / 14 / 17 / 22 / 30.
- **Spacing scale:** 4 / 8 / 12 / 16 / 20 / 26 px. Min 16px screen gutters at 390px.
- **Card system:** one radius family (12/16/20/26), one elevation per layer, max one dominant CTA per card.
- **Glass levels:** L1 nav/sheets `blur(30px)`, L2 cards `blur(18px)`, L3 chips solid. Cap blur use (perf).
- **Shadows:** one soft ambient + one inset hairline; avoid stacking.
- **Borders:** 1px hairline `rgba(255,255,255,.10–.20)`.
- **Buttons:** primary (gradient fill), secondary (glass), ghost (text). 44px min height.
- **Bottom sheets:** grab handle, scrim, spring-in; one primary action.
- **Bottom nav:** 4 tabs, active = filled glyph + label; re-tap scrolls to top.
- **Skeletons:** shimmer blocks matching final layout; never blank.
- **Error states:** calm one-liner + retry; never a stack trace.
- **Motion:** 180–260ms, `cubic-bezier(.2,.9,.25,1.06)`; spectacle reserved for goals / parlay reveal / big win / fortune.
- **Haptics:** light on tap/place; success on win/cash; heavier on goal/red. Respect reduced-motion.
- **Contrast:** body text ≥ 4.5:1; status pills carry text labels, never color alone.

---

## 5. Beginner-friendly Play

First-time flow in ≤3 taps: **pick a winner → see "Risk $X to win $Y" in plain language → choose stake (chips) → bet slip → watch result.** Hide American odds behind a "% chance" default for novices (toggle already exists: US / Dec / Frac / Chance). Advanced markets live one tap deeper, never on the first screen. Every Play surface shows "SIM $ · no cash value."

---

## 6. Matchcast concept (premium 2.5D, not console 3D)

- **Pitch:** stylized top-down/2.5D with depth gradient and team-color end-zones; ball with motion trail; no player models.
- **Scorebug:** broadcast-style top bar — flags, score, clock, status; sticky.
- **Possession/momentum:** a single animated momentum bar that tilts to the pressing side (already modeled) + possession %.
- **Chance sequences:** brief ball-surge animation toward goal; commentary line; xG-weighted.
- **Goal moments:** flash, score pop, haptic, sound, scorer line.
- **Penalties:** dedicated spot-kick moment with tension beat.
- **Half/Full time:** clean interstitial with stat strip (shots, SOT, cards, possession).
- **Ticket impact:** live "your pick is winning/losing" chip + cash-out temptation.
- **Tournament impact:** after FT, "this result moves Group X / bracket path" callout.

---

## 7. Ranked vs Arcade

- **Ranked Season:** fair, hard-to-exploit; *requires* server-authoritative bankroll before it's credible (today bankroll is device-local — label current leaderboards "Friendly / Arcade" until then). Diminishing rescue mechanics, no insurance on boosted parlays (already done).
- **Arcade:** sandbox sims, chaos modes, unlimited top-ups, fortune — fun, never affects Ranked.
- **Matchday Cups:** short daily/round-based events with a fixed entry bankroll.
- **Friend leagues (Crew):** invite-code private boards (already built); surfaced softly under You/Social.

---

## 8. Prioritized roadmap

**P0 — fix before major visual work**
- Verified data integrity everywhere (team-name normalization ✅ done; freshness stamps; "modeled" labels on any non-live stat). *Impact: high · Effort: low–med · Risk: low.* Trust is the foundation.

**P1 — highest-impact UX overhaul**
- Collapse to 4 tabs (Home/Tournament/Play/You) + Home hero/resume reorder. *Impact: high · Effort: med · Risk: med (nav refactor — do behind verification).* This is the single biggest perceived-quality jump.
- 390px layout discipline pass (gutters, chips, tap targets). *Impact: high · Effort: med · Risk: low.*

**P2 — Play & Matchcast upgrades**
- Parlay Lab cinematic leg-by-leg reveal; Matchcast scorebug + chance sequences. *Impact: high · Effort: med–high · Risk: med.* Dopamine + differentiation.

**P3 — gamification / collectibles / Easter eggs**
- Achievements polish, rare tasteful eggs, prestige cosmetics. *Impact: med · Effort: med · Risk: low.* Retention after bankroll growth.

---

## 9. Codex handoff tickets

### Ticket A — Premium app shell + Home + Tournament
**Scope:** Re-map the bottom nav to exactly **Home / Tournament / Play / You** (keep existing render functions; move `schedule/standings/bracket/road/cities` under a Tournament segmented control; move leaderboard/league/profile under You). Reorder Home to: freshness pill → one hero card → resume card (only if active) → one daily card → soft league row → tools drawer. Add a global freshness/status pill (LIVE / SYNCING / NO LIVE MATCHES / DATA DELAYED / OFFLINE) driven by existing `_lastSync` + `navigator.onLine`.
**Testable at 390/430px:** 4 tabs visible; every old screen reachable in ≤2 taps; Home shows exactly one hero; no console errors; Real/Sim separation unchanged; nothing settles from non-final data.
**Guardrails:** don't delete any existing system; don't touch settlement, wallet isolation, or the API layer.

### Ticket B — Play, bet slip, beginner flow
**Scope:** Make Play a clean category nav with markets first and extras (store/missions/fortune) in a collapsible drawer. Bet slip = single sheet with stake chips, plain-language "Risk $X to win $Y," one CTA, Parlay Lab for ≥2 legs. Default odds display to "% chance" for first-time users (toggle persists). Ensure every open bet is settle-able from My Bets (Simulate/Cash out) and futures show the "Play tournament to settle" path. SIM-$ label on every money surface.
**Testable:** a brand-new user can place a single pick in ≤3 taps and watch it resolve; parlay shows risk meter + combined %; no market is presented as "live."
**Guardrails:** keep fair pricing/engine; no insurance on boosted/parlay; no rigged outcomes.

### Ticket C — Matchcast, motion, rewards, profile polish
**Scope:** Upgrade the live sim into a 2.5D Matchcast: broadcast scorebug, momentum bar, chance-surge animation, goal/penalty/HT/FT beats, "your ticket impact" chip, and post-FT "tournament impact" callout. Add premium motion (180–260ms spring) and haptic moments (tap/win/goal/red), respecting reduced-motion. Polish You/profile (bankroll sparkline, play-style tag, trophies, rank/streak) and leaderboard profile drawers.
**Testable at 390px:** Matchcast fits one screen (pitch + scorebug + momentum + ticket impact visible without scroll); goal moment fires flash+haptic+sound; profile renders with 0 console errors.
**Guardrails:** 2.5D only (no console-3D); spectacle only in moments; never label modeled stats as live.
