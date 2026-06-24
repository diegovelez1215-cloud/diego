/* RapidAPI/FotMob match stats disabled.
 * Detailed third-party match stats are intentionally off to avoid any RapidAPI
 * usage. The frontend shows a local, clearly-labeled model profile instead.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=3600');
  res.status(200).json({ configured: false, disabled: true, stats: [] });
}
