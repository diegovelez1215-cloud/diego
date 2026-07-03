/* United 2026 · browser-safe Supabase config.
 *
 * This route returns only public client configuration. The service-role key
 * must never be read here, logged here, or serialized to the browser.
 */

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(200).json({
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
  });
}
