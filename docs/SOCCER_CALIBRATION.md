# Soccer Engine Calibration Report

Run date: 2026-07-10
Model: `u26-soccer-v1`
Method: deterministic Monte Carlo using unique seeded matches. These are model checks, not predictions or official statistics.

## 50,000-match checks

| Scenario | Home win | Draw | Away win | Goals / match |
| --- | ---: | ---: | ---: | ---: |
| France vs Curaçao, neutral | 84.71% | 10.99% | 4.31% | 3.33 |
| Switzerland vs Switzerland, normal home edge | 42.63% | 25.78% | 31.60% | 2.72 |

France averaged 2.82 goals and Curaçao 0.51. France is a heavy favorite while draws and Curaçao wins remain possible; the model does not force the favorite.

## 30,000-match volatility check

| Scenario | Goals / match | Total-goal variance |
| --- | ---: | ---: |
| Argentina vs Brazil, neutral | 2.26 | 2.24 |
| Same matchup, one red card each | 3.21 | 3.45 |

The red-card state widens the distribution and increases match volatility without removing any result class.

## Automated claims

The calibration suite also verifies:

- Replays are identical for the same seed.
- Fatigue measurably lowers late attacking output.
- Substitutions recover part, not all, of a fatigue penalty.
- Pressing creates more chances and more exposure than a low block.
- Peers retain credible draw and goal-total ranges.
- The module has no user-side or AI-side boost surface.

Status: ready as the shared fictional-match foundation. Match Lab and tactical games still need staged migration before the project can claim that every Play mode uses this one engine.
