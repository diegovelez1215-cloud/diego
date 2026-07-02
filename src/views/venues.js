// United 2026 — Venues. Stadium-first explorer over canonical fixtures plus
// validated scores/status from the provider overlay.

import { allFixtures, STAGE_NAMES } from '../core/canonical-truth.js';
import { VENUES } from '../data/fixtures.js';
import { fixtureModel } from '../data/tournament-model.js';
import { matchRow, esc } from '../components/match-row.js';

function venueRecord(city, overlay) {
  const v = VENUES[city] || [];
  const matches = allFixtures()
    .filter((f) => f.venue === city)
    .map((f) => fixtureModel(f, overlay))
    .sort((a, b) => a.epoch - b.epoch || a.id - b.id);
  return {
    city,
    stadium: v[1] || v[0] || city,
    locality: v[2] || city,
    flag: v[3] || '',
    region: v[4] || '',
    capacity: v[5] || null,
    matches,
    played: matches.filter((m) => m.final).length,
    upcoming: matches.filter((m) => !m.final).length,
  };
}

export function renderVenues(overlay) {
  const venues = Object.keys(VENUES)
    .map((city) => venueRecord(city, overlay))
    .sort((a, b) => a.matches[0].epoch - b.matches[0].epoch || a.city.localeCompare(b.city));

  const liveCity = venues.find((v) => v.matches.some((m) => m.live));
  return `<section class="venues-pane" aria-label="Venues">
    <div class="venue-lede">
      <p class="venue-kicker">Venue map</p>
      <h2>Stadiums, in match order</h2>
      ${liveCity ? `<p class="venue-live-note"><span class="live-dot" aria-hidden="true"></span>Football is live in ${esc(liveCity.locality)}</p>` : ''}
    </div>
    <div class="venue-list">
      ${venues.map((v) => {
    const live = v.matches.find((m) => m.live);
    const next = v.matches.find((m) => !m.final && !m.live);
    const status = live
      ? `<span class="venue-status live"><span class="live-dot" aria-hidden="true"></span>LIVE now</span>`
      : next
        ? `<span class="venue-status next">Next · ${esc(next.dateLabel)} ${esc(next.time)}</span>`
        : '<span class="venue-status done">Hosting complete</span>';
    return `<article class="venue-card${live ? ' hosting-live' : ''}">
        <header class="venue-head">
          <div>
            <p>${v.flag} ${esc(v.locality)}${v.region ? ' · ' + esc(v.region) : ''}</p>
            <h3>${esc(v.stadium)}</h3>
          </div>
          <span>${v.played}/${v.matches.length}</span>
        </header>
        <div class="venue-mini">
          <span>${v.capacity ? Number(v.capacity).toLocaleString() + ' capacity' : 'World Cup venue'}</span>
          ${status}
        </div>
        <div class="venue-matches">
          ${v.matches.map((m) => matchRow(m, { context: `${STAGE_NAMES[m.stage] || m.stage} · Match ${m.id}` })).join('')}
        </div>
      </article>`;
  }).join('')}
    </div>
  </section>`;
}
