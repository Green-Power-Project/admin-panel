/**
 * Base URL of this admin panel, for server-side use (e.g. calling our own API routes).
 * Set ADMIN_PANEL_URL in Vercel (or .env.local) to your live URL; otherwise defaults to localhost.
 */
export function getAdminServerBaseUrl(): string {
  const url = (process.env.ADMIN_PANEL_URL || 'http://localhost:3000').trim();
  return url.replace(/\/$/, '');
}
