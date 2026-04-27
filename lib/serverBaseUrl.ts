/**
 * Base URL of this admin panel, for server-side use (e.g. calling our own API routes).
 * Set ADMIN_PANEL_URL in .env.local / deployment to override (e.g. http://localhost:3000 for local dev).
 */
export function getAdminServerBaseUrl(): string {
  const url = (process.env.ADMIN_PANEL_URL || 'https://admin.gruen-power.cloud').trim();
  return url.replace(/\/$/, '');
}
