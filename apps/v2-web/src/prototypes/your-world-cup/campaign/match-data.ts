import type { MatchTeam } from '../match/engine';

const argentinaLineup = [
  ['gk', 1, 'RO', 'Roldán', 'goalkeeper', 'center'], ['lb', 4, 'MO', 'Montiel', 'defender', 'left'], ['cb1', 5, 'VE', 'Vega', 'defender', 'center'], ['cb2', 2, 'SO', 'Sosa', 'defender', 'center'], ['rb', 3, 'BI', 'Bisanz', 'defender', 'right'], ['dm', 6, 'PA', 'Paredes', 'midfielder', 'center'], ['cm', 8, 'AG', 'Aguilar', 'midfielder', 'left'], ['ten', 10, 'OC', 'Ocampo', 'midfielder', 'right'], ['lw', 7, 'LU', 'Luna', 'forward', 'left'], ['st', 9, 'FE', 'Ferreyra', 'forward', 'center'], ['rw', 11, 'GA', 'Garay', 'forward', 'right'],
] as const;
const nigeriaLineup = [
  ['gk', 1, 'OK', 'Okoye', 'goalkeeper', 'center'], ['lb', 3, 'SA', 'Sani', 'defender', 'left'], ['cb1', 5, 'AD', 'Adamu', 'defender', 'center'], ['cb2', 6, 'BA', 'Balogun', 'defender', 'center'], ['rb', 2, 'AI', 'Aina', 'defender', 'right'], ['dm1', 4, 'ND', 'Ndidi', 'midfielder', 'left'], ['dm2', 8, 'IW', 'Iwobi', 'midfielder', 'center'], ['ten', 10, 'CH', 'Chukwueze', 'midfielder', 'center'], ['lw', 11, 'MO', 'Moses', 'forward', 'left'], ['st', 9, 'OS', 'Osimhen', 'forward', 'center'], ['rw', 7, 'SI', 'Simon', 'forward', 'right'],
] as const;
const toPlayers = (team: string, rows: readonly (readonly [string, number, string, string, 'goalkeeper' | 'defender' | 'midfielder' | 'forward', 'left' | 'center' | 'right'])[]) => rows.map(([id, number, shortLabel, displayName, role, side]) => ({ id: `${team}-${id}`, number, shortLabel, displayName, role, side }));
const argentinaBench = [
  ['sub-f', 18, 'AL', 'Álvarez', 'forward', 'center'],
  ['sub-m', 16, 'FR', 'Franco', 'midfielder', 'center'],
  ['sub-d', 14, 'ME', 'Medina', 'defender', 'center'],
] as const;
const nigeriaBench = [
  ['sub-f', 18, 'BO', 'Boniface', 'forward', 'center'],
  ['sub-m', 15, 'AR', 'Aribo', 'midfielder', 'center'],
  ['sub-d', 12, 'EB', 'Ebuehi', 'defender', 'center'],
] as const;

export const ARGENTINA_TEAM: MatchTeam = Object.freeze({ id: 'arg', name: 'Argentina', shortName: 'ARG', colors: { primary: '#75aadb', secondary: '#ffffff', goalkeeper: '#ff7a00' }, direction: 'south', strengths: { attack: 84, midfield: 86, defense: 82, goalkeeper: 80, pace: 79, discipline: 76 }, lineup: Object.freeze(toPlayers('arg', argentinaLineup)), bench: Object.freeze(toPlayers('arg', argentinaBench)) });
export const NIGERIA_TEAM: MatchTeam = Object.freeze({ id: 'nga', name: 'Nigeria', shortName: 'NGA', colors: { primary: '#07854e', secondary: '#ffffff', goalkeeper: '#ffbf00' }, direction: 'north', strengths: { attack: 80, midfield: 77, defense: 78, goalkeeper: 76, pace: 87, discipline: 72 }, lineup: Object.freeze(toPlayers('nga', nigeriaLineup)), bench: Object.freeze(toPlayers('nga', nigeriaBench)) });
export const campaignFixture = Object.freeze({ id: 'arg-nga', home: ARGENTINA_TEAM, away: NIGERIA_TEAM });
