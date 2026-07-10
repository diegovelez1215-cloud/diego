# Shared Soccer Engine v1

Module: `src/core/soccer-engine.js`
Version: `u26-soccer-v1`
Scope: fictional Play matches only.

## Inputs

- Team base strength, attack, midfield, defence, goalkeeper and squad quality
- Team style and formation
- Player availability
- Fatigue, rest, travel and substitutions
- Venue neutrality and bounded home advantage
- Match importance
- Tactic and tactical exposure
- Red/yellow cards
- Minute, score state and strictly bounded momentum
- Seeded random variation

When only a team code exists, sub-ratings are stable deterministic fallbacks around the Play-only overall rating. Results return `stable-fallback` in their source label; the UI must not present these as verified official team metrics.

## Model

The model compares an attacking composite with the opponent's resistance composite. It converts that gap into expected goals with a bounded exponential curve. Explicit multipliers then account for availability, fatigue, rest, travel, substitutions, cards, tactics, formation, score state and venue.

Goals are sampled from a seeded Poisson process with mean-preserving bounded volatility. Aggressive tactics and red cards widen the distribution. Knockout draws proceed through seeded extra time and, if needed, penalties.

## Fairness guarantees

- No user-side or AI-side parameter exists.
- No favorite-team protection exists.
- No forced win/loss branch exists.
- Same inputs and seed replay exactly.
- Every adjustment is bounded and is returned with the result for developer inspection.
- Official fixtures, scores and standings are neither imported nor mutated.

## Tactical profiles

- Balanced: neutral baseline
- Press: more attacking threat, more exposure, more fatigue and volatility
- Counter: modest attack with lower exposure and higher transition variance
- Control: lower exposure and volatility with a midfield-control edge
- Low block: sharply lower attack and exposure

## Ranked use

The module is server-compatible, but local simulation output is not a ranked score. A ranked game must use a signed server challenge or submit a versioned event log that the server replays against the same model version.
