# Stable Phase 2C Live-Feed-Fixed Baseline

Production URL: https://worldcupapp-alpha.vercel.app/

## Confirmed Stable

- Phone-first Home / Tournament / Play / You shell is restored from the stable pre-Phase-3A baseline.
- Tournament Matches, Standings, Bracket, and More remain available.
- Play landing, active tickets, bet slip, and simulated-dollar disclosure remain available.
- Match Details, Matchcast routes, wallet, tickets, settlement, leaderboard, odds, standings, and bracket behavior are preserved.
- All-groups standings keep GD and Pts visible on phone layouts.
- Live matches and started/unconfirmed matches are not offered as new Play markets.
- Official standings, bracket advancement, and ticket settlement still wait for confirmed final states.

## Live Data Providers

- `/api/live` uses API-Sports `fixtures?live=all` first for real in-progress World Cup matches.
- If API-Sports returns no active World Cup candidates, `/api/live` checks the existing Football-Data World Cup matches source for confirmed live, held, or finished statuses.
- `/api/results` uses Football-Data World Cup matches for finished results and official final confirmation.
- `/api/odds` uses The Odds API for market odds when configured.
- `/api/scorers` uses Football-Data scorer data when configured.
- Weather and modeled data are supporting context only and must not decide official match status.

## Do Not Change Casually

- Official-final-only standings and bracket advancement.
- Ticket settlement and wallet logic.
- Real World Cup vs My Sim separation.
- MARKET ODDS wording and simulated-dollar/no-cash-value disclosure.
- API key handling: provider keys must stay server-side only.
- `/api/live` caching, rate limiting, request coalescing, stale fallback, and live-status normalization.
- Service worker update behavior.

## Local Rollback

To return the local project to this stable baseline:

```bash
git reset --hard stable-phase2c-live-feed-fixed
```

To create a new branch from this baseline:

```bash
git switch -c your-branch-name stable-phase2c-live-feed-fixed
```
