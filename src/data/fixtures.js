// United 2026 — canonical official fixture registry (identity + schedule ONLY).
// Extracted from the official 2026 schedule embedded in the production baseline.
// HARD RULE: this file must never contain scores, results, live status, or
// standings. Scores/finality come exclusively from the validated provider
// overlay at runtime (src/core/provider-overlay.js).
// Kickoff instants are stored with the fixed tournament offset (UTC-4). During
// June–July 2026 U.S. Eastern time equals Puerto Rico time (AST, no DST).

/** code -> [displayName, flagEmoji] */
export const TEAMS = {
 "MEX": [
  "Mexico",
  "🇲🇽"
 ],
 "RSA": [
  "South Africa",
  "🇿🇦"
 ],
 "KOR": [
  "Korea Republic",
  "🇰🇷"
 ],
 "CZE": [
  "Czechia",
  "🇨🇿"
 ],
 "CAN": [
  "Canada",
  "🇨🇦"
 ],
 "BIH": [
  "Bosnia & Herzegovina",
  "🇧🇦"
 ],
 "QAT": [
  "Qatar",
  "🇶🇦"
 ],
 "SUI": [
  "Switzerland",
  "🇨🇭"
 ],
 "BRA": [
  "Brazil",
  "🇧🇷"
 ],
 "MAR": [
  "Morocco",
  "🇲🇦"
 ],
 "HAI": [
  "Haiti",
  "🇭🇹"
 ],
 "SCO": [
  "Scotland",
  "🏴󠁧󠁢󠁳󠁣󠁴󠁿"
 ],
 "USA": [
  "USA",
  "🇺🇸"
 ],
 "PAR": [
  "Paraguay",
  "🇵🇾"
 ],
 "AUS": [
  "Australia",
  "🇦🇺"
 ],
 "TUR": [
  "Türkiye",
  "🇹🇷"
 ],
 "GER": [
  "Germany",
  "🇩🇪"
 ],
 "CUW": [
  "Curaçao",
  "🇨🇼"
 ],
 "CIV": [
  "Côte d'Ivoire",
  "🇨🇮"
 ],
 "ECU": [
  "Ecuador",
  "🇪🇨"
 ],
 "NED": [
  "Netherlands",
  "🇳🇱"
 ],
 "JPN": [
  "Japan",
  "🇯🇵"
 ],
 "SWE": [
  "Sweden",
  "🇸🇪"
 ],
 "TUN": [
  "Tunisia",
  "🇹🇳"
 ],
 "BEL": [
  "Belgium",
  "🇧🇪"
 ],
 "EGY": [
  "Egypt",
  "🇪🇬"
 ],
 "IRN": [
  "IR Iran",
  "🇮🇷"
 ],
 "NZL": [
  "New Zealand",
  "🇳🇿"
 ],
 "ESP": [
  "Spain",
  "🇪🇸"
 ],
 "CPV": [
  "Cabo Verde",
  "🇨🇻"
 ],
 "KSA": [
  "Saudi Arabia",
  "🇸🇦"
 ],
 "URU": [
  "Uruguay",
  "🇺🇾"
 ],
 "FRA": [
  "France",
  "🇫🇷"
 ],
 "SEN": [
  "Senegal",
  "🇸🇳"
 ],
 "IRQ": [
  "Iraq",
  "🇮🇶"
 ],
 "NOR": [
  "Norway",
  "🇳🇴"
 ],
 "ARG": [
  "Argentina",
  "🇦🇷"
 ],
 "ALG": [
  "Algeria",
  "🇩🇿"
 ],
 "AUT": [
  "Austria",
  "🇦🇹"
 ],
 "JOR": [
  "Jordan",
  "🇯🇴"
 ],
 "POR": [
  "Portugal",
  "🇵🇹"
 ],
 "COD": [
  "Congo DR",
  "🇨🇩"
 ],
 "UZB": [
  "Uzbekistan",
  "🇺🇿"
 ],
 "COL": [
  "Colombia",
  "🇨🇴"
 ],
 "ENG": [
  "England",
  "🏴󠁧󠁢󠁥󠁮󠁧󠁿"
 ],
 "CRO": [
  "Croatia",
  "🇭🇷"
 ],
 "GHA": [
  "Ghana",
  "🇬🇭"
 ],
 "PAN": [
  "Panama",
  "🇵🇦"
 ]
};

/** city -> [displayName, stadium, locality, flag, region, capacity] */
export const VENUES = {
 "Vancouver": [
  "BC Place",
  "BC Place",
  "Vancouver",
  "🇨🇦",
  "West",
  54500
 ],
 "Seattle": [
  "Seattle Stadium",
  "Lumen Field",
  "Seattle",
  "🇺🇸",
  "West",
  69000
 ],
 "San Francisco Bay Area": [
  "SF Bay Area Stadium",
  "Levi's Stadium",
  "Santa Clara, CA",
  "🇺🇸",
  "West",
  70900
 ],
 "Los Angeles": [
  "Los Angeles Stadium",
  "SoFi Stadium",
  "Inglewood, CA",
  "🇺🇸",
  "West",
  70240
 ],
 "Guadalajara": [
  "Estadio Guadalajara",
  "Estadio Akron",
  "Guadalajara",
  "🇲🇽",
  "Central",
  48000
 ],
 "Mexico City": [
  "Estadio Ciudad de México",
  "Estadio Azteca",
  "Mexico City",
  "🇲🇽",
  "Central",
  83000
 ],
 "Monterrey": [
  "Estadio Monterrey",
  "Estadio BBVA",
  "Guadalupe",
  "🇲🇽",
  "Central",
  53500
 ],
 "Houston": [
  "Houston Stadium",
  "NRG Stadium",
  "Houston",
  "🇺🇸",
  "Central",
  72000
 ],
 "Dallas": [
  "Dallas Stadium",
  "AT&T Stadium",
  "Arlington, TX",
  "🇺🇸",
  "Central",
  80000
 ],
 "Kansas City": [
  "Kansas City Stadium",
  "Arrowhead Stadium",
  "Kansas City",
  "🇺🇸",
  "Central",
  76600
 ],
 "Atlanta": [
  "Atlanta Stadium",
  "Mercedes-Benz Stadium",
  "Atlanta",
  "🇺🇸",
  "East",
  71000
 ],
 "Miami": [
  "Miami Stadium",
  "Hard Rock Stadium",
  "Miami Gardens, FL",
  "🇺🇸",
  "East",
  65300
 ],
 "Toronto": [
  "Toronto Stadium",
  "BMO Field",
  "Toronto",
  "🇨🇦",
  "East",
  45000
 ],
 "Boston": [
  "Boston Stadium",
  "Gillette Stadium",
  "Foxborough, MA",
  "🇺🇸",
  "East",
  65900
 ],
 "Philadelphia": [
  "Philadelphia Stadium",
  "Lincoln Financial Field",
  "Philadelphia",
  "🇺🇸",
  "East",
  69300
 ],
 "New York New Jersey": [
  "New York New Jersey Stadium",
  "MetLife Stadium",
  "East Rutherford, NJ",
  "🇺🇸",
  "East",
  82500
 ]
};

/**
 * 104 canonical fixtures. id = official match number.
 * Group fixtures: home/away are team codes.
 * Knockout fixtures: home/away are slot specs —
 *   "1A"/"2B" (group rank), "3:ABCDF" (third-place pool), "W89"/"L101" (edges).
 */
export const FIXTURES = [
 {
  "id": 1,
  "stage": "group",
  "group": "A",
  "kickoff": "2026-06-11T15:00:00-04:00",
  "venue": "Mexico City",
  "home": "MEX",
  "away": "RSA"
 },
 {
  "id": 2,
  "stage": "group",
  "group": "A",
  "kickoff": "2026-06-11T22:00:00-04:00",
  "venue": "Guadalajara",
  "home": "KOR",
  "away": "CZE"
 },
 {
  "id": 3,
  "stage": "group",
  "group": "B",
  "kickoff": "2026-06-12T15:00:00-04:00",
  "venue": "Toronto",
  "home": "CAN",
  "away": "BIH"
 },
 {
  "id": 4,
  "stage": "group",
  "group": "D",
  "kickoff": "2026-06-12T21:00:00-04:00",
  "venue": "Los Angeles",
  "home": "USA",
  "away": "PAR"
 },
 {
  "id": 5,
  "stage": "group",
  "group": "C",
  "kickoff": "2026-06-13T21:00:00-04:00",
  "venue": "Boston",
  "home": "HAI",
  "away": "SCO"
 },
 {
  "id": 6,
  "stage": "group",
  "group": "D",
  "kickoff": "2026-06-13T00:00:00-04:00",
  "venue": "Vancouver",
  "home": "AUS",
  "away": "TUR"
 },
 {
  "id": 7,
  "stage": "group",
  "group": "C",
  "kickoff": "2026-06-13T18:00:00-04:00",
  "venue": "New York New Jersey",
  "home": "BRA",
  "away": "MAR"
 },
 {
  "id": 8,
  "stage": "group",
  "group": "B",
  "kickoff": "2026-06-13T15:00:00-04:00",
  "venue": "San Francisco Bay Area",
  "home": "QAT",
  "away": "SUI"
 },
 {
  "id": 9,
  "stage": "group",
  "group": "E",
  "kickoff": "2026-06-14T19:00:00-04:00",
  "venue": "Philadelphia",
  "home": "CIV",
  "away": "ECU"
 },
 {
  "id": 10,
  "stage": "group",
  "group": "E",
  "kickoff": "2026-06-14T13:00:00-04:00",
  "venue": "Houston",
  "home": "GER",
  "away": "CUW"
 },
 {
  "id": 11,
  "stage": "group",
  "group": "F",
  "kickoff": "2026-06-14T16:00:00-04:00",
  "venue": "Dallas",
  "home": "NED",
  "away": "JPN"
 },
 {
  "id": 12,
  "stage": "group",
  "group": "F",
  "kickoff": "2026-06-14T22:00:00-04:00",
  "venue": "Monterrey",
  "home": "SWE",
  "away": "TUN"
 },
 {
  "id": 13,
  "stage": "group",
  "group": "H",
  "kickoff": "2026-06-15T18:00:00-04:00",
  "venue": "Miami",
  "home": "KSA",
  "away": "URU"
 },
 {
  "id": 14,
  "stage": "group",
  "group": "H",
  "kickoff": "2026-06-15T12:00:00-04:00",
  "venue": "Atlanta",
  "home": "ESP",
  "away": "CPV"
 },
 {
  "id": 15,
  "stage": "group",
  "group": "G",
  "kickoff": "2026-06-15T21:00:00-04:00",
  "venue": "Los Angeles",
  "home": "IRN",
  "away": "NZL"
 },
 {
  "id": 16,
  "stage": "group",
  "group": "G",
  "kickoff": "2026-06-15T15:00:00-04:00",
  "venue": "Seattle",
  "home": "BEL",
  "away": "EGY"
 },
 {
  "id": 17,
  "stage": "group",
  "group": "I",
  "kickoff": "2026-06-16T15:00:00-04:00",
  "venue": "New York New Jersey",
  "home": "FRA",
  "away": "SEN"
 },
 {
  "id": 18,
  "stage": "group",
  "group": "I",
  "kickoff": "2026-06-16T18:00:00-04:00",
  "venue": "Boston",
  "home": "IRQ",
  "away": "NOR"
 },
 {
  "id": 19,
  "stage": "group",
  "group": "J",
  "kickoff": "2026-06-16T21:00:00-04:00",
  "venue": "Kansas City",
  "home": "ARG",
  "away": "ALG"
 },
 {
  "id": 20,
  "stage": "group",
  "group": "J",
  "kickoff": "2026-06-16T00:00:00-04:00",
  "venue": "San Francisco Bay Area",
  "home": "AUT",
  "away": "JOR"
 },
 {
  "id": 21,
  "stage": "group",
  "group": "L",
  "kickoff": "2026-06-17T19:00:00-04:00",
  "venue": "Toronto",
  "home": "GHA",
  "away": "PAN"
 },
 {
  "id": 22,
  "stage": "group",
  "group": "L",
  "kickoff": "2026-06-17T16:00:00-04:00",
  "venue": "Dallas",
  "home": "ENG",
  "away": "CRO"
 },
 {
  "id": 23,
  "stage": "group",
  "group": "K",
  "kickoff": "2026-06-17T13:00:00-04:00",
  "venue": "Houston",
  "home": "POR",
  "away": "COD"
 },
 {
  "id": 24,
  "stage": "group",
  "group": "K",
  "kickoff": "2026-06-17T22:00:00-04:00",
  "venue": "Mexico City",
  "home": "UZB",
  "away": "COL"
 },
 {
  "id": 25,
  "stage": "group",
  "group": "A",
  "kickoff": "2026-06-18T12:00:00-04:00",
  "venue": "Atlanta",
  "home": "CZE",
  "away": "RSA"
 },
 {
  "id": 26,
  "stage": "group",
  "group": "B",
  "kickoff": "2026-06-18T15:00:00-04:00",
  "venue": "Los Angeles",
  "home": "SUI",
  "away": "BIH"
 },
 {
  "id": 27,
  "stage": "group",
  "group": "B",
  "kickoff": "2026-06-18T18:00:00-04:00",
  "venue": "Vancouver",
  "home": "CAN",
  "away": "QAT"
 },
 {
  "id": 28,
  "stage": "group",
  "group": "A",
  "kickoff": "2026-06-18T21:00:00-04:00",
  "venue": "Guadalajara",
  "home": "MEX",
  "away": "KOR"
 },
 {
  "id": 29,
  "stage": "group",
  "group": "C",
  "kickoff": "2026-06-19T20:30:00-04:00",
  "venue": "Philadelphia",
  "home": "BRA",
  "away": "HAI"
 },
 {
  "id": 30,
  "stage": "group",
  "group": "C",
  "kickoff": "2026-06-19T18:00:00-04:00",
  "venue": "Boston",
  "home": "SCO",
  "away": "MAR"
 },
 {
  "id": 31,
  "stage": "group",
  "group": "D",
  "kickoff": "2026-06-19T23:00:00-04:00",
  "venue": "San Francisco Bay Area",
  "home": "TUR",
  "away": "PAR"
 },
 {
  "id": 32,
  "stage": "group",
  "group": "D",
  "kickoff": "2026-06-19T15:00:00-04:00",
  "venue": "Seattle",
  "home": "USA",
  "away": "AUS"
 },
 {
  "id": 33,
  "stage": "group",
  "group": "E",
  "kickoff": "2026-06-20T16:00:00-04:00",
  "venue": "Toronto",
  "home": "GER",
  "away": "CIV"
 },
 {
  "id": 34,
  "stage": "group",
  "group": "E",
  "kickoff": "2026-06-20T20:00:00-04:00",
  "venue": "Kansas City",
  "home": "ECU",
  "away": "CUW"
 },
 {
  "id": 35,
  "stage": "group",
  "group": "F",
  "kickoff": "2026-06-20T13:00:00-04:00",
  "venue": "Houston",
  "home": "NED",
  "away": "SWE"
 },
 {
  "id": 36,
  "stage": "group",
  "group": "F",
  "kickoff": "2026-06-20T00:00:00-04:00",
  "venue": "Monterrey",
  "home": "TUN",
  "away": "JPN"
 },
 {
  "id": 37,
  "stage": "group",
  "group": "H",
  "kickoff": "2026-06-21T18:00:00-04:00",
  "venue": "Miami",
  "home": "URU",
  "away": "CPV"
 },
 {
  "id": 38,
  "stage": "group",
  "group": "H",
  "kickoff": "2026-06-21T12:00:00-04:00",
  "venue": "Atlanta",
  "home": "ESP",
  "away": "KSA"
 },
 {
  "id": 39,
  "stage": "group",
  "group": "G",
  "kickoff": "2026-06-21T15:00:00-04:00",
  "venue": "Los Angeles",
  "home": "BEL",
  "away": "IRN"
 },
 {
  "id": 40,
  "stage": "group",
  "group": "G",
  "kickoff": "2026-06-21T21:00:00-04:00",
  "venue": "Vancouver",
  "home": "NZL",
  "away": "EGY"
 },
 {
  "id": 41,
  "stage": "group",
  "group": "I",
  "kickoff": "2026-06-22T20:00:00-04:00",
  "venue": "New York New Jersey",
  "home": "NOR",
  "away": "SEN"
 },
 {
  "id": 42,
  "stage": "group",
  "group": "I",
  "kickoff": "2026-06-22T17:00:00-04:00",
  "venue": "Philadelphia",
  "home": "FRA",
  "away": "IRQ"
 },
 {
  "id": 43,
  "stage": "group",
  "group": "J",
  "kickoff": "2026-06-22T13:00:00-04:00",
  "venue": "Dallas",
  "home": "ARG",
  "away": "AUT"
 },
 {
  "id": 44,
  "stage": "group",
  "group": "J",
  "kickoff": "2026-06-22T23:00:00-04:00",
  "venue": "San Francisco Bay Area",
  "home": "JOR",
  "away": "ALG"
 },
 {
  "id": 45,
  "stage": "group",
  "group": "L",
  "kickoff": "2026-06-23T16:00:00-04:00",
  "venue": "Boston",
  "home": "ENG",
  "away": "GHA"
 },
 {
  "id": 46,
  "stage": "group",
  "group": "L",
  "kickoff": "2026-06-23T19:00:00-04:00",
  "venue": "Toronto",
  "home": "PAN",
  "away": "CRO"
 },
 {
  "id": 47,
  "stage": "group",
  "group": "K",
  "kickoff": "2026-06-23T13:00:00-04:00",
  "venue": "Houston",
  "home": "POR",
  "away": "UZB"
 },
 {
  "id": 48,
  "stage": "group",
  "group": "K",
  "kickoff": "2026-06-23T22:00:00-04:00",
  "venue": "Guadalajara",
  "home": "COL",
  "away": "COD"
 },
 {
  "id": 49,
  "stage": "group",
  "group": "C",
  "kickoff": "2026-06-24T18:00:00-04:00",
  "venue": "Miami",
  "home": "SCO",
  "away": "BRA"
 },
 {
  "id": 50,
  "stage": "group",
  "group": "C",
  "kickoff": "2026-06-24T18:00:00-04:00",
  "venue": "Atlanta",
  "home": "MAR",
  "away": "HAI"
 },
 {
  "id": 51,
  "stage": "group",
  "group": "B",
  "kickoff": "2026-06-24T15:00:00-04:00",
  "venue": "Vancouver",
  "home": "SUI",
  "away": "CAN"
 },
 {
  "id": 52,
  "stage": "group",
  "group": "B",
  "kickoff": "2026-06-24T15:00:00-04:00",
  "venue": "Seattle",
  "home": "BIH",
  "away": "QAT"
 },
 {
  "id": 53,
  "stage": "group",
  "group": "A",
  "kickoff": "2026-06-24T21:00:00-04:00",
  "venue": "Mexico City",
  "home": "CZE",
  "away": "MEX"
 },
 {
  "id": 54,
  "stage": "group",
  "group": "A",
  "kickoff": "2026-06-24T21:00:00-04:00",
  "venue": "Monterrey",
  "home": "RSA",
  "away": "KOR"
 },
 {
  "id": 55,
  "stage": "group",
  "group": "E",
  "kickoff": "2026-06-25T16:00:00-04:00",
  "venue": "Philadelphia",
  "home": "CUW",
  "away": "CIV"
 },
 {
  "id": 56,
  "stage": "group",
  "group": "E",
  "kickoff": "2026-06-25T16:00:00-04:00",
  "venue": "New York New Jersey",
  "home": "ECU",
  "away": "GER"
 },
 {
  "id": 57,
  "stage": "group",
  "group": "F",
  "kickoff": "2026-06-25T19:00:00-04:00",
  "venue": "Dallas",
  "home": "JPN",
  "away": "SWE"
 },
 {
  "id": 58,
  "stage": "group",
  "group": "F",
  "kickoff": "2026-06-25T19:00:00-04:00",
  "venue": "Kansas City",
  "home": "TUN",
  "away": "NED"
 },
 {
  "id": 59,
  "stage": "group",
  "group": "D",
  "kickoff": "2026-06-25T22:00:00-04:00",
  "venue": "Los Angeles",
  "home": "TUR",
  "away": "USA"
 },
 {
  "id": 60,
  "stage": "group",
  "group": "D",
  "kickoff": "2026-06-25T22:00:00-04:00",
  "venue": "San Francisco Bay Area",
  "home": "PAR",
  "away": "AUS"
 },
 {
  "id": 61,
  "stage": "group",
  "group": "I",
  "kickoff": "2026-06-26T15:00:00-04:00",
  "venue": "Boston",
  "home": "NOR",
  "away": "FRA"
 },
 {
  "id": 62,
  "stage": "group",
  "group": "I",
  "kickoff": "2026-06-26T15:00:00-04:00",
  "venue": "Toronto",
  "home": "SEN",
  "away": "IRQ"
 },
 {
  "id": 63,
  "stage": "group",
  "group": "G",
  "kickoff": "2026-06-26T23:00:00-04:00",
  "venue": "Seattle",
  "home": "EGY",
  "away": "IRN"
 },
 {
  "id": 64,
  "stage": "group",
  "group": "G",
  "kickoff": "2026-06-26T23:00:00-04:00",
  "venue": "Vancouver",
  "home": "NZL",
  "away": "BEL"
 },
 {
  "id": 65,
  "stage": "group",
  "group": "H",
  "kickoff": "2026-06-26T20:00:00-04:00",
  "venue": "Houston",
  "home": "CPV",
  "away": "KSA"
 },
 {
  "id": 66,
  "stage": "group",
  "group": "H",
  "kickoff": "2026-06-26T20:00:00-04:00",
  "venue": "Guadalajara",
  "home": "URU",
  "away": "ESP"
 },
 {
  "id": 67,
  "stage": "group",
  "group": "L",
  "kickoff": "2026-06-27T17:00:00-04:00",
  "venue": "New York New Jersey",
  "home": "PAN",
  "away": "ENG"
 },
 {
  "id": 68,
  "stage": "group",
  "group": "L",
  "kickoff": "2026-06-27T17:00:00-04:00",
  "venue": "Philadelphia",
  "home": "CRO",
  "away": "GHA"
 },
 {
  "id": 69,
  "stage": "group",
  "group": "J",
  "kickoff": "2026-06-27T22:00:00-04:00",
  "venue": "Kansas City",
  "home": "ALG",
  "away": "AUT"
 },
 {
  "id": 70,
  "stage": "group",
  "group": "J",
  "kickoff": "2026-06-27T22:00:00-04:00",
  "venue": "Dallas",
  "home": "JOR",
  "away": "ARG"
 },
 {
  "id": 71,
  "stage": "group",
  "group": "K",
  "kickoff": "2026-06-27T19:30:00-04:00",
  "venue": "Miami",
  "home": "COL",
  "away": "POR"
 },
 {
  "id": 72,
  "stage": "group",
  "group": "K",
  "kickoff": "2026-06-27T19:30:00-04:00",
  "venue": "Atlanta",
  "home": "COD",
  "away": "UZB"
 },
 {
  "id": 73,
  "stage": "r32",
  "group": null,
  "kickoff": "2026-06-28T15:00:00-04:00",
  "venue": "Los Angeles",
  "home": "2A",
  "away": "2B"
 },
 {
  "id": 74,
  "stage": "r32",
  "group": null,
  "kickoff": "2026-06-29T16:30:00-04:00",
  "venue": "Boston",
  "home": "1E",
  "away": "3:ABCDF"
 },
 {
  "id": 75,
  "stage": "r32",
  "group": null,
  "kickoff": "2026-06-29T21:00:00-04:00",
  "venue": "Monterrey",
  "home": "1F",
  "away": "2C"
 },
 {
  "id": 76,
  "stage": "r32",
  "group": null,
  "kickoff": "2026-06-29T13:00:00-04:00",
  "venue": "Houston",
  "home": "1C",
  "away": "2F"
 },
 {
  "id": 77,
  "stage": "r32",
  "group": null,
  "kickoff": "2026-06-30T17:00:00-04:00",
  "venue": "New York New Jersey",
  "home": "1I",
  "away": "3:CDFGH"
 },
 {
  "id": 78,
  "stage": "r32",
  "group": null,
  "kickoff": "2026-06-30T13:00:00-04:00",
  "venue": "Dallas",
  "home": "2E",
  "away": "2I"
 },
 {
  "id": 79,
  "stage": "r32",
  "group": null,
  "kickoff": "2026-06-30T21:00:00-04:00",
  "venue": "Mexico City",
  "home": "1A",
  "away": "3:CEFHI"
 },
 {
  "id": 80,
  "stage": "r32",
  "group": null,
  "kickoff": "2026-07-01T12:00:00-04:00",
  "venue": "Atlanta",
  "home": "1L",
  "away": "3:EHIJK"
 },
 {
  "id": 81,
  "stage": "r32",
  "group": null,
  "kickoff": "2026-07-01T20:00:00-04:00",
  "venue": "San Francisco Bay Area",
  "home": "1D",
  "away": "3:BEFIJ"
 },
 {
  "id": 82,
  "stage": "r32",
  "group": null,
  "kickoff": "2026-07-01T16:00:00-04:00",
  "venue": "Seattle",
  "home": "1G",
  "away": "3:AEHIJ"
 },
 {
  "id": 83,
  "stage": "r32",
  "group": null,
  "kickoff": "2026-07-02T19:00:00-04:00",
  "venue": "Toronto",
  "home": "2K",
  "away": "2L"
 },
 {
  "id": 84,
  "stage": "r32",
  "group": null,
  "kickoff": "2026-07-02T15:00:00-04:00",
  "venue": "Los Angeles",
  "home": "1H",
  "away": "2J"
 },
 {
  "id": 85,
  "stage": "r32",
  "group": null,
  "kickoff": "2026-07-02T23:00:00-04:00",
  "venue": "Vancouver",
  "home": "1B",
  "away": "3:EFGIJ"
 },
 {
  "id": 86,
  "stage": "r32",
  "group": null,
  "kickoff": "2026-07-03T18:00:00-04:00",
  "venue": "Miami",
  "home": "1J",
  "away": "2H"
 },
 {
  "id": 87,
  "stage": "r32",
  "group": null,
  "kickoff": "2026-07-03T21:30:00-04:00",
  "venue": "Kansas City",
  "home": "1K",
  "away": "3:DEIJL"
 },
 {
  "id": 88,
  "stage": "r32",
  "group": null,
  "kickoff": "2026-07-03T14:00:00-04:00",
  "venue": "Dallas",
  "home": "2D",
  "away": "2G"
 },
 {
  "id": 89,
  "stage": "r16",
  "group": null,
  "kickoff": "2026-07-04T17:00:00-04:00",
  "venue": "Philadelphia",
  "home": "W74",
  "away": "W77"
 },
 {
  "id": 90,
  "stage": "r16",
  "group": null,
  "kickoff": "2026-07-04T13:00:00-04:00",
  "venue": "Houston",
  "home": "W73",
  "away": "W75"
 },
 {
  "id": 91,
  "stage": "r16",
  "group": null,
  "kickoff": "2026-07-05T16:00:00-04:00",
  "venue": "New York New Jersey",
  "home": "W76",
  "away": "W78"
 },
 {
  "id": 92,
  "stage": "r16",
  "group": null,
  "kickoff": "2026-07-05T20:00:00-04:00",
  "venue": "Mexico City",
  "home": "W79",
  "away": "W80"
 },
 {
  "id": 93,
  "stage": "r16",
  "group": null,
  "kickoff": "2026-07-06T15:00:00-04:00",
  "venue": "Dallas",
  "home": "W83",
  "away": "W84"
 },
 {
  "id": 94,
  "stage": "r16",
  "group": null,
  "kickoff": "2026-07-06T20:00:00-04:00",
  "venue": "Seattle",
  "home": "W81",
  "away": "W82"
 },
 {
  "id": 95,
  "stage": "r16",
  "group": null,
  "kickoff": "2026-07-07T12:00:00-04:00",
  "venue": "Atlanta",
  "home": "W86",
  "away": "W88"
 },
 {
  "id": 96,
  "stage": "r16",
  "group": null,
  "kickoff": "2026-07-07T16:00:00-04:00",
  "venue": "Vancouver",
  "home": "W85",
  "away": "W87"
 },
 {
  "id": 97,
  "stage": "qf",
  "group": null,
  "kickoff": "2026-07-09T16:00:00-04:00",
  "venue": "Boston",
  "home": "W89",
  "away": "W90"
 },
 {
  "id": 98,
  "stage": "qf",
  "group": null,
  "kickoff": "2026-07-10T15:00:00-04:00",
  "venue": "Los Angeles",
  "home": "W93",
  "away": "W94"
 },
 {
  "id": 99,
  "stage": "qf",
  "group": null,
  "kickoff": "2026-07-11T17:00:00-04:00",
  "venue": "Miami",
  "home": "W91",
  "away": "W92"
 },
 {
  "id": 100,
  "stage": "qf",
  "group": null,
  "kickoff": "2026-07-11T21:00:00-04:00",
  "venue": "Kansas City",
  "home": "W95",
  "away": "W96"
 },
 {
  "id": 101,
  "stage": "sf",
  "group": null,
  "kickoff": "2026-07-14T15:00:00-04:00",
  "venue": "Dallas",
  "home": "W97",
  "away": "W98"
 },
 {
  "id": 102,
  "stage": "sf",
  "group": null,
  "kickoff": "2026-07-15T15:00:00-04:00",
  "venue": "Atlanta",
  "home": "W99",
  "away": "W100"
 },
 {
  "id": 103,
  "stage": "bronze",
  "group": null,
  "kickoff": "2026-07-18T17:00:00-04:00",
  "venue": "Miami",
  "home": "L101",
  "away": "L102"
 },
 {
  "id": 104,
  "stage": "final",
  "group": null,
  "kickoff": "2026-07-19T15:00:00-04:00",
  "venue": "New York New Jersey",
  "home": "W101",
  "away": "W102"
 }
];

/**
 * FIFA third-place allocation matrix: sorted 8-group combination -> the group
 * whose third-placed team fills each R32 third-place slot, in TP3_SLOTS order.
 */
export const TP3 = {"EFGHIJKL":"EJIFHGLK","DFGHIJKL":"HGIDJFLK","DEGHIJKL":"EJIDHGLK","DEFHIJKL":"EJIDHFLK","DEFGIJKL":"EGIDJFLK","DEFGHJKL":"EGJDHFLK","DEFGHIKL":"EGIDHFLK","DEFGHIJL":"EGJDHFLI","DEFGHIJK":"EGJDHFIK","CFGHIJKL":"HGICJFLK","CEGHIJKL":"EJICHGLK","CEFHIJKL":"EJICHFLK","CEFGIJKL":"EGICJFLK","CEFGHJKL":"EGJCHFLK","CEFGHIKL":"EGICHFLK","CEFGHIJL":"EGJCHFLI","CEFGHIJK":"EGJCHFIK","CDGHIJKL":"HGICJDLK","CDFHIJKL":"CJIDHFLK","CDFGIJKL":"CGIDJFLK","CDFGHJKL":"CGJDHFLK","CDFGHIKL":"CGIDHFLK","CDFGHIJL":"CGJDHFLI","CDFGHIJK":"CGJDHFIK","CDEHIJKL":"EJICHDLK","CDEGIJKL":"EGICJDLK","CDEGHJKL":"EGJCHDLK","CDEGHIKL":"EGICHDLK","CDEGHIJL":"EGJCHDLI","CDEGHIJK":"EGJCHDIK","CDEFIJKL":"CJEDIFLK","CDEFHJKL":"CJEDHFLK","CDEFHIKL":"CEIDHFLK","CDEFHIJL":"CJEDHFLI","CDEFHIJK":"CJEDHFIK","CDEFGJKL":"CGEDJFLK","CDEFGIKL":"CGEDIFLK","CDEFGIJL":"CGEDJFLI","CDEFGIJK":"CGEDJFIK","CDEFGHKL":"CGEDHFLK","CDEFGHJL":"CGJDHFLE","CDEFGHJK":"CGJDHFEK","CDEFGHIL":"CGEDHFLI","CDEFGHIK":"CGEDHFIK","CDEFGHIJ":"CGJDHFEI","BFGHIJKL":"HJBFIGLK","BEGHIJKL":"EJIBHGLK","BEFHIJKL":"EJBFIHLK","BEFGIJKL":"EJBFIGLK","BEFGHJKL":"EJBFHGLK","BEFGHIKL":"EGBFIHLK","BEFGHIJL":"EJBFHGLI","BEFGHIJK":"EJBFHGIK","BDGHIJKL":"HJBDIGLK","BDFHIJKL":"HJBDIFLK","BDFGIJKL":"IGBDJFLK","BDFGHJKL":"HGBDJFLK","BDFGHIKL":"HGBDIFLK","BDFGHIJL":"HGBDJFLI","BDFGHIJK":"HGBDJFIK","BDEHIJKL":"EJBDIHLK","BDEGIJKL":"EJBDIGLK","BDEGHJKL":"EJBDHGLK","BDEGHIKL":"EGBDIHLK","BDEGHIJL":"EJBDHGLI","BDEGHIJK":"EJBDHGIK","BDEFIJKL":"EJBDIFLK","BDEFHJKL":"EJBDHFLK","BDEFHIKL":"EIBDHFLK","BDEFHIJL":"EJBDHFLI","BDEFHIJK":"EJBDHFIK","BDEFGJKL":"EGBDJFLK","BDEFGIKL":"EGBDIFLK","BDEFGIJL":"EGBDJFLI","BDEFGIJK":"EGBDJFIK","BDEFGHKL":"EGBDHFLK","BDEFGHJL":"HGBDJFLE","BDEFGHJK":"HGBDJFEK","BDEFGHIL":"EGBDHFLI","BDEFGHIK":"EGBDHFIK","BDEFGHIJ":"HGBDJFEI","BCGHIJKL":"HJBCIGLK","BCFHIJKL":"HJBCIFLK","BCFGIJKL":"IGBCJFLK","BCFGHJKL":"HGBCJFLK","BCFGHIKL":"HGBCIFLK","BCFGHIJL":"HGBCJFLI","BCFGHIJK":"HGBCJFIK","BCEHIJKL":"EJBCIHLK","BCEGIJKL":"EJBCIGLK","BCEGHJKL":"EJBCHGLK","BCEGHIKL":"EGBCIHLK","BCEGHIJL":"EJBCHGLI","BCEGHIJK":"EJBCHGIK","BCEFIJKL":"EJBCIFLK","BCEFHJKL":"EJBCHFLK","BCEFHIKL":"EIBCHFLK","BCEFHIJL":"EJBCHFLI","BCEFHIJK":"EJBCHFIK","BCEFGJKL":"EGBCJFLK","BCEFGIKL":"EGBCIFLK","BCEFGIJL":"EGBCJFLI","BCEFGIJK":"EGBCJFIK","BCEFGHKL":"EGBCHFLK","BCEFGHJL":"HGBCJFLE","BCEFGHJK":"HGBCJFEK","BCEFGHIL":"EGBCHFLI","BCEFGHIK":"EGBCHFIK","BCEFGHIJ":"HGBCJFEI","BCDHIJKL":"HJBCIDLK","BCDGIJKL":"IGBCJDLK","BCDGHJKL":"HGBCJDLK","BCDGHIKL":"HGBCIDLK","BCDGHIJL":"HGBCJDLI","BCDGHIJK":"HGBCJDIK","BCDFIJKL":"CJBDIFLK","BCDFHJKL":"CJBDHFLK","BCDFHIKL":"CIBDHFLK","BCDFHIJL":"CJBDHFLI","BCDFHIJK":"CJBDHFIK","BCDFGJKL":"CGBDJFLK","BCDFGIKL":"CGBDIFLK","BCDFGIJL":"CGBDJFLI","BCDFGIJK":"CGBDJFIK","BCDFGHKL":"CGBDHFLK","BCDFGHJL":"CGBDHFLJ","BCDFGHJK":"HGBCJFDK","BCDFGHIL":"CGBDHFLI","BCDFGHIK":"CGBDHFIK","BCDFGHIJ":"HGBCJFDI","BCDEIJKL":"EJBCIDLK","BCDEHJKL":"EJBCHDLK","BCDEHIKL":"EIBCHDLK","BCDEHIJL":"EJBCHDLI","BCDEHIJK":"EJBCHDIK","BCDEGJKL":"EGBCJDLK","BCDEGIKL":"EGBCIDLK","BCDEGIJL":"EGBCJDLI","BCDEGIJK":"EGBCJDIK","BCDEGHKL":"EGBCHDLK","BCDEGHJL":"HGBCJDLE","BCDEGHJK":"HGBCJDEK","BCDEGHIL":"EGBCHDLI","BCDEGHIK":"EGBCHDIK","BCDEGHIJ":"HGBCJDEI","BCDEFJKL":"CJBDEFLK","BCDEFIKL":"CEBDIFLK","BCDEFIJL":"CJBDEFLI","BCDEFIJK":"CJBDEFIK","BCDEFHKL":"CEBDHFLK","BCDEFHJL":"CJBDHFLE","BCDEFHJK":"CJBDHFEK","BCDEFHIL":"CEBDHFLI","BCDEFHIK":"CEBDHFIK","BCDEFHIJ":"CJBDHFEI","BCDEFGKL":"CGBDEFLK","BCDEFGJL":"CGBDJFLE","BCDEFGJK":"CGBDJFEK","BCDEFGIL":"CGBDEFLI","BCDEFGIK":"CGBDEFIK","BCDEFGIJ":"CGBDJFEI","BCDEFGHL":"CGBDHFLE","BCDEFGHK":"CGBDHFEK","BCDEFGHJ":"HGBCJFDE","BCDEFGHI":"CGBDHFEI","AFGHIJKL":"HJIFAGLK","AEGHIJKL":"EJIAHGLK","AEFHIJKL":"EJIFAHLK","AEFGIJKL":"EJIFAGLK","AEFGHJKL":"EGJFAHLK","AEFGHIKL":"EGIFAHLK","AEFGHIJL":"EGJFAHLI","AEFGHIJK":"EGJFAHIK","ADGHIJKL":"HJIDAGLK","ADFHIJKL":"HJIDAFLK","ADFGIJKL":"IGJDAFLK","ADFGHJKL":"HGJDAFLK","ADFGHIKL":"HGIDAFLK","ADFGHIJL":"HGJDAFLI","ADFGHIJK":"HGJDAFIK","ADEHIJKL":"EJIDAHLK","ADEGIJKL":"EJIDAGLK","ADEGHJKL":"EGJDAHLK","ADEGHIKL":"EGIDAHLK","ADEGHIJL":"EGJDAHLI","ADEGHIJK":"EGJDAHIK","ADEFIJKL":"EJIDAFLK","ADEFHJKL":"HJEDAFLK","ADEFHIKL":"HEIDAFLK","ADEFHIJL":"HJEDAFLI","ADEFHIJK":"HJEDAFIK","ADEFGJKL":"EGJDAFLK","ADEFGIKL":"EGIDAFLK","ADEFGIJL":"EGJDAFLI","ADEFGIJK":"EGJDAFIK","ADEFGHKL":"HGEDAFLK","ADEFGHJL":"HGJDAFLE","ADEFGHJK":"HGJDAFEK","ADEFGHIL":"HGEDAFLI","ADEFGHIK":"HGEDAFIK","ADEFGHIJ":"HGJDAFEI","ACGHIJKL":"HJICAGLK","ACFHIJKL":"HJICAFLK","ACFGIJKL":"IGJCAFLK","ACFGHJKL":"HGJCAFLK","ACFGHIKL":"HGICAFLK","ACFGHIJL":"HGJCAFLI","ACFGHIJK":"HGJCAFIK","ACEHIJKL":"EJICAHLK","ACEGIJKL":"EJICAGLK","ACEGHJKL":"EGJCAHLK","ACEGHIKL":"EGICAHLK","ACEGHIJL":"EGJCAHLI","ACEGHIJK":"EGJCAHIK","ACEFIJKL":"EJICAFLK","ACEFHJKL":"HJECAFLK","ACEFHIKL":"HEICAFLK","ACEFHIJL":"HJECAFLI","ACEFHIJK":"HJECAFIK","ACEFGJKL":"EGJCAFLK","ACEFGIKL":"EGICAFLK","ACEFGIJL":"EGJCAFLI","ACEFGIJK":"EGJCAFIK","ACEFGHKL":"HGECAFLK","ACEFGHJL":"HGJCAFLE","ACEFGHJK":"HGJCAFEK","ACEFGHIL":"HGECAFLI","ACEFGHIK":"HGECAFIK","ACEFGHIJ":"HGJCAFEI","ACDHIJKL":"HJICADLK","ACDGIJKL":"IGJCADLK","ACDGHJKL":"HGJCADLK","ACDGHIKL":"HGICADLK","ACDGHIJL":"HGJCADLI","ACDGHIJK":"HGJCADIK","ACDFIJKL":"CJIDAFLK","ACDFHJKL":"HJFCADLK","ACDFHIKL":"HFICADLK","ACDFHIJL":"HJFCADLI","ACDFHIJK":"HJFCADIK","ACDFGJKL":"CGJDAFLK","ACDFGIKL":"CGIDAFLK","ACDFGIJL":"CGJDAFLI","ACDFGIJK":"CGJDAFIK","ACDFGHKL":"HGFCADLK","ACDFGHJL":"CGJDAFLH","ACDFGHJK":"HGJCAFDK","ACDFGHIL":"HGFCADLI","ACDFGHIK":"HGFCADIK","ACDFGHIJ":"HGJCAFDI","ACDEIJKL":"EJICADLK","ACDEHJKL":"HJECADLK","ACDEHIKL":"HEICADLK","ACDEHIJL":"HJECADLI","ACDEHIJK":"HJECADIK","ACDEGJKL":"EGJCADLK","ACDEGIKL":"EGICADLK","ACDEGIJL":"EGJCADLI","ACDEGIJK":"EGJCADIK","ACDEGHKL":"HGECADLK","ACDEGHJL":"HGJCADLE","ACDEGHJK":"HGJCADEK","ACDEGHIL":"HGECADLI","ACDEGHIK":"HGECADIK","ACDEGHIJ":"HGJCADEI","ACDEFJKL":"CJEDAFLK","ACDEFIKL":"CEIDAFLK","ACDEFIJL":"CJEDAFLI","ACDEFIJK":"CJEDAFIK","ACDEFHKL":"HEFCADLK","ACDEFHJL":"HJFCADLE","ACDEFHJK":"HJECAFDK","ACDEFHIL":"HEFCADLI","ACDEFHIK":"HEFCADIK","ACDEFHIJ":"HJECAFDI","ACDEFGKL":"CGEDAFLK","ACDEFGJL":"CGJDAFLE","ACDEFGJK":"CGJDAFEK","ACDEFGIL":"CGEDAFLI","ACDEFGIK":"CGEDAFIK","ACDEFGIJ":"CGJDAFEI","ACDEFGHL":"HGFCADLE","ACDEFGHK":"HGECAFDK","ACDEFGHJ":"HGJCAFDE","ACDEFGHI":"HGECAFDI","ABGHIJKL":"HJBAIGLK","ABFHIJKL":"HJBAIFLK","ABFGIJKL":"IJBFAGLK","ABFGHJKL":"HJBFAGLK","ABFGHIKL":"HGBAIFLK","ABFGHIJL":"HJBFAGLI","ABFGHIJK":"HJBFAGIK","ABEHIJKL":"EJBAIHLK","ABEGIJKL":"EJBAIGLK","ABEGHJKL":"EJBAHGLK","ABEGHIKL":"EGBAIHLK","ABEGHIJL":"EJBAHGLI","ABEGHIJK":"EJBAHGIK","ABEFIJKL":"EJBAIFLK","ABEFHJKL":"EJBFAHLK","ABEFHIKL":"EIBFAHLK","ABEFHIJL":"EJBFAHLI","ABEFHIJK":"EJBFAHIK","ABEFGJKL":"EJBFAGLK","ABEFGIKL":"EGBAIFLK","ABEFGIJL":"EJBFAGLI","ABEFGIJK":"EJBFAGIK","ABEFGHKL":"EGBFAHLK","ABEFGHJL":"HJBFAGLE","ABEFGHJK":"HJBFAGEK","ABEFGHIL":"EGBFAHLI","ABEFGHIK":"EGBFAHIK","ABEFGHIJ":"HJBFAGEI","ABDHIJKL":"IJBDAHLK","ABDGIJKL":"IJBDAGLK","ABDGHJKL":"HJBDAGLK","ABDGHIKL":"IGBDAHLK","ABDGHIJL":"HJBDAGLI","ABDGHIJK":"HJBDAGIK","ABDFIJKL":"IJBDAFLK","ABDFHJKL":"HJBDAFLK","ABDFHIKL":"HIBDAFLK","ABDFHIJL":"HJBDAFLI","ABDFHIJK":"HJBDAFIK","ABDFGJKL":"FJBDAGLK","ABDFGIKL":"IGBDAFLK","ABDFGIJL":"FJBDAGLI","ABDFGIJK":"FJBDAGIK","ABDFGHKL":"HGBDAFLK","ABDFGHJL":"HGBDAFLJ","ABDFGHJK":"HGBDAFJK","ABDFGHIL":"HGBDAFLI","ABDFGHIK":"HGBDAFIK","ABDFGHIJ":"HGBDAFIJ","ABDEIJKL":"EJBAIDLK","ABDEHJKL":"EJBDAHLK","ABDEHIKL":"EIBDAHLK","ABDEHIJL":"EJBDAHLI","ABDEHIJK":"EJBDAHIK","ABDEGJKL":"EJBDAGLK","ABDEGIKL":"EGBAIDLK","ABDEGIJL":"EJBDAGLI","ABDEGIJK":"EJBDAGIK","ABDEGHKL":"EGBDAHLK","ABDEGHJL":"HJBDAGLE","ABDEGHJK":"HJBDAGEK","ABDEGHIL":"EGBDAHLI","ABDEGHIK":"EGBDAHIK","ABDEGHIJ":"HJBDAGEI","ABDEFJKL":"EJBDAFLK","ABDEFIKL":"EIBDAFLK","ABDEFIJL":"EJBDAFLI","ABDEFIJK":"EJBDAFIK","ABDEFHKL":"HEBDAFLK","ABDEFHJL":"HJBDAFLE","ABDEFHJK":"HJBDAFEK","ABDEFHIL":"HEBDAFLI","ABDEFHIK":"HEBDAFIK","ABDEFHIJ":"HJBDAFEI","ABDEFGKL":"EGBDAFLK","ABDEFGJL":"EGBDAFLJ","ABDEFGJK":"EGBDAFJK","ABDEFGIL":"EGBDAFLI","ABDEFGIK":"EGBDAFIK","ABDEFGIJ":"EGBDAFIJ","ABDEFGHL":"HGBDAFLE","ABDEFGHK":"HGBDAFEK","ABDEFGHJ":"HGBDAFEJ","ABDEFGHI":"HGBDAFEI","ABCHIJKL":"IJBCAHLK","ABCGIJKL":"IJBCAGLK","ABCGHJKL":"HJBCAGLK","ABCGHIKL":"IGBCAHLK","ABCGHIJL":"HJBCAGLI","ABCGHIJK":"HJBCAGIK","ABCFIJKL":"IJBCAFLK","ABCFHJKL":"HJBCAFLK","ABCFHIKL":"HIBCAFLK","ABCFHIJL":"HJBCAFLI","ABCFHIJK":"HJBCAFIK","ABCFGJKL":"CJBFAGLK","ABCFGIKL":"IGBCAFLK","ABCFGIJL":"CJBFAGLI","ABCFGIJK":"CJBFAGIK","ABCFGHKL":"HGBCAFLK","ABCFGHJL":"HGBCAFLJ","ABCFGHJK":"HGBCAFJK","ABCFGHIL":"HGBCAFLI","ABCFGHIK":"HGBCAFIK","ABCFGHIJ":"HGBCAFIJ","ABCEIJKL":"EJBAICLK","ABCEHJKL":"EJBCAHLK","ABCEHIKL":"EIBCAHLK","ABCEHIJL":"EJBCAHLI","ABCEHIJK":"EJBCAHIK","ABCEGJKL":"EJBCAGLK","ABCEGIKL":"EGBAICLK","ABCEGIJL":"EJBCAGLI","ABCEGIJK":"EJBCAGIK","ABCEGHKL":"EGBCAHLK","ABCEGHJL":"HJBCAGLE","ABCEGHJK":"HJBCAGEK","ABCEGHIL":"EGBCAHLI","ABCEGHIK":"EGBCAHIK","ABCEGHIJ":"HJBCAGEI","ABCEFJKL":"EJBCAFLK","ABCEFIKL":"EIBCAFLK","ABCEFIJL":"EJBCAFLI","ABCEFIJK":"EJBCAFIK","ABCEFHKL":"HEBCAFLK","ABCEFHJL":"HJBCAFLE","ABCEFHJK":"HJBCAFEK","ABCEFHIL":"HEBCAFLI","ABCEFHIK":"HEBCAFIK","ABCEFHIJ":"HJBCAFEI","ABCEFGKL":"EGBCAFLK","ABCEFGJL":"EGBCAFLJ","ABCEFGJK":"EGBCAFJK","ABCEFGIL":"EGBCAFLI","ABCEFGIK":"EGBCAFIK","ABCEFGIJ":"EGBCAFIJ","ABCEFGHL":"HGBCAFLE","ABCEFGHK":"HGBCAFEK","ABCEFGHJ":"HGBCAFEJ","ABCEFGHI":"HGBCAFEI","ABCDIJKL":"IJBCADLK","ABCDHJKL":"HJBCADLK","ABCDHIKL":"HIBCADLK","ABCDHIJL":"HJBCADLI","ABCDHIJK":"HJBCADIK","ABCDGJKL":"CJBDAGLK","ABCDGIKL":"IGBCADLK","ABCDGIJL":"CJBDAGLI","ABCDGIJK":"CJBDAGIK","ABCDGHKL":"HGBCADLK","ABCDGHJL":"HGBCADLJ","ABCDGHJK":"HGBCADJK","ABCDGHIL":"HGBCADLI","ABCDGHIK":"HGBCADIK","ABCDGHIJ":"HGBCADIJ","ABCDFJKL":"CJBDAFLK","ABCDFIKL":"CIBDAFLK","ABCDFIJL":"CJBDAFLI","ABCDFIJK":"CJBDAFIK","ABCDFHKL":"HFBCADLK","ABCDFHJL":"CJBDAFLH","ABCDFHJK":"HJBCAFDK","ABCDFHIL":"HFBCADLI","ABCDFHIK":"HFBCADIK","ABCDFHIJ":"HJBCAFDI","ABCDFGKL":"CGBDAFLK","ABCDFGJL":"CGBDAFLJ","ABCDFGJK":"CGBDAFJK","ABCDFGIL":"CGBDAFLI","ABCDFGIK":"CGBDAFIK","ABCDFGIJ":"CGBDAFIJ","ABCDFGHL":"CGBDAFLH","ABCDFGHK":"HGBCAFDK","ABCDFGHJ":"HGBCAFDJ","ABCDFGHI":"HGBCAFDI","ABCDEJKL":"EJBCADLK","ABCDEIKL":"EIBCADLK","ABCDEIJL":"EJBCADLI","ABCDEIJK":"EJBCADIK","ABCDEHKL":"HEBCADLK","ABCDEHJL":"HJBCADLE","ABCDEHJK":"HJBCADEK","ABCDEHIL":"HEBCADLI","ABCDEHIK":"HEBCADIK","ABCDEHIJ":"HJBCADEI","ABCDEGKL":"EGBCADLK","ABCDEGJL":"EGBCADLJ","ABCDEGJK":"EGBCADJK","ABCDEGIL":"EGBCADLI","ABCDEGIK":"EGBCADIK","ABCDEGIJ":"EGBCADIJ","ABCDEGHL":"HGBCADLE","ABCDEGHK":"HGBCADEK","ABCDEGHJ":"HGBCADEJ","ABCDEGHI":"HGBCADEI","ABCDEFKL":"CEBDAFLK","ABCDEFJL":"CJBDAFLE","ABCDEFJK":"CJBDAFEK","ABCDEFIL":"CEBDAFLI","ABCDEFIK":"CEBDAFIK","ABCDEFIJ":"CJBDAFEI","ABCDEFHL":"HFBCADLE","ABCDEFHK":"HEBCAFDK","ABCDEFHJ":"HJBCAFDE","ABCDEFHI":"HEBCAFDI","ABCDEFGL":"CGBDAFLE","ABCDEFGK":"CGBDAFEK","ABCDEFGJ":"CGBDAFEJ","ABCDEFGI":"CGBDAFEI","ABCDEFGH":"HGBCAFDE"};
/** R32 match ids that receive third-placed teams, in TP3 string order. */
export const TP3_SLOTS = [79,85,81,74,82,77,87,80];

/** Team strength ratings — used ONLY by Play simulations, never by real views. */
export const RATINGS = {"FRA":95,"ESP":93,"ENG":92,"POR":92,"ARG":91,"BRA":90,"GER":89,"NED":88,"NOR":85,"MAR":84,"BEL":84,"USA":84,"COL":82,"MEX":82,"JPN":82,"SUI":80,"URU":79,"CRO":79,"SWE":79,"ECU":79,"SEN":79,"AUT":78,"TUR":78,"CIV":77,"KOR":75,"AUS":75,"SCO":75,"CAN":74,"EGY":73,"GHA":73,"BIH":73,"ALG":72,"PAR":72,"CZE":70,"TUN":70,"IRN":69,"COD":67,"KSA":67,"PAN":67,"QAT":67,"CPV":67,"NZL":65,"UZB":65,"RSA":65,"IRQ":65,"JOR":62,"CUW":62,"HAI":62};

/**
 * Primary team accent colors (home-kit hues). Used ONLY at meaningful moments:
 * score stage identity, bracket path glow, knockout drama. Never decoration.
 */
export const TEAM_COLORS = {
  MEX: "#0a6644", RSA: "#e8b923", KOR: "#c81438", CZE: "#d7141a",
  CAN: "#d52b1e", BIH: "#1f4e9c", QAT: "#8a1538", SUI: "#d52b1e",
  BRA: "#f6c445", MAR: "#c1272d", HAI: "#00209f", SCO: "#003078",
  USA: "#1f3a93", PAR: "#d52b1e", AUS: "#f2c400", CIV: "#f77f00",
  ARG: "#75aadb", ALG: "#0a6640", AUT: "#ed2939", JOR: "#007a3d",
  POR: "#046a38", URU: "#55b5e5", COL: "#fcd116", KSA: "#0a6640",
  FRA: "#0f2a5a", SEN: "#0a6640", IRQ: "#ce1126", NOR: "#ba0c2f",
  GER: "#ffffff", CUW: "#002b7f", CRO: "#e03a3e", ECU: "#ffd100",
  NED: "#f36c21", JPN: "#1b2a6b", TUN: "#e70013", CPV: "#003893",
  BEL: "#ed2939", EGY: "#ce1126", IRN: "#239f40", NZL: "#1a1a1a",
  ESP: "#c60b1e", UZB: "#0099b5", PAN: "#da121a", GHA: "#fcd116",
  ENG: "#ffffff", SWE: "#ffcd00", TUR: "#e30a17", COD: "#007fff",
};
