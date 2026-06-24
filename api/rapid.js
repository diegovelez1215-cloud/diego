/* RapidAPI disabled.
 * This project no longer calls RapidAPI at runtime because the account may be
 * hard-limited or ban-sensitive. Keep this route as a safe no-op so older
 * clients/deploys fail gracefully instead of touching RapidAPI.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=3600');
  res.status(200).json({ configured: false, disabled: true, goals: [], assists: [] });
}
