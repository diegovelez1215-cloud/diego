/* RapidAPI/FotMob matchday lookup disabled.
 * The app now uses Football-Data/API-Sports for real tournament data and a local
 * model profile for match-sheet depth. This route remains as a compatibility
 * no-op and never calls RapidAPI.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=3600');
  res.status(200).json({ configured: false, disabled: true, matches: [] });
}
