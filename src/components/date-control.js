// United 2026 — date control for Matches: Today / Tomorrow / All Dates.

import { segmentedControl } from './segmented-control.js';

export function dateControl(value) {
  return segmentedControl({
    id: 'matches-date',
    label: 'Match dates',
    value,
    options: [
      { value: 'today', label: 'Today' },
      { value: 'tomorrow', label: 'Tomorrow' },
      { value: 'all', label: 'All Dates' },
    ],
  });
}
