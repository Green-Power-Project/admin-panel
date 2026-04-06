/** Read `fileUrl` / `fileKey` from project file Firestore documents (after migration). */

/**
 * Same as window-app: rewrite localhost `fileUrl` to production admin when configured.
 * Uses NEXT_PUBLIC_* on the client; `ADMIN_PANEL_URL` on the server (API routes).
 */
export function normalizeFileUrlForDeployment(fileUrl: string): string {
  const raw = (fileUrl || '').trim();
  if (!raw) return raw;
  const adminBase = (
    process.env.NEXT_PUBLIC_ADMIN_PANEL_URL ||
    process.env.NEXT_PUBLIC_ADMIN_API_BASE_URL ||
    process.env.ADMIN_PANEL_URL ||
    ''
  ).trim();
  if (!adminBase) return raw;
  try {
    const adminUrl = new URL(adminBase);
    if (adminUrl.hostname === 'localhost' || adminUrl.hostname === '127.0.0.1') {
      return raw;
    }
    const u = new URL(raw);
    if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
      return raw;
    }
    return `${adminUrl.origin}${u.pathname}${u.search}${u.hash}`;
  } catch {
    return raw;
  }
}

export function fileUrlFromFirestoreDoc(data: Record<string, unknown>): string {
  const v = data.fileUrl;
  const s = typeof v === 'string' && v ? v : '';
  return normalizeFileUrlForDeployment(s);
}

export function fileKeyFromFirestoreDoc(data: Record<string, unknown>): string {
  const v = data.fileKey;
  return typeof v === 'string' && v ? v : '';
}
