'use server';

import { getAdminDb } from '@/lib/server/firebaseAdmin';

export type EmailDirection = 'incoming' | 'outgoing';

export interface LogProjectEmailParams {
  projectId: string;
  direction: EmailDirection;
  to: string[]; // recipients
  from: string;
  subject?: string;
  text?: string;
  html?: string;
  related?: {
    type:
      | 'offer'
      | 'fileUpload'
      | 'fileActivity'
      | 'welcomeProject'
      | 'welcomeCustomer'
      | 'other';
    id?: string;
    folderPath?: string;
    filePath?: string;
    customerId?: string;
  };
}

function buildSnippet(text?: string, html?: string): string {
  const base = (text && text.trim()) || (html && stripHtml(html)) || '';
  if (!base) return '';
  const snippet = base.replace(/\s+/g, ' ').slice(0, 260);
  return snippet.length === base.length ? snippet : `${snippet}…`;
}

function stripHtml(html: string): string {
  try {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  } catch {
    return html;
  }
}

/**
 * Log an email in the per-project E-Mails collection.
 * Best-effort only – failures are logged to console but never thrown.
 */
export async function logProjectEmail(params: LogProjectEmailParams): Promise<void> {
  try {
    const db = getAdminDb();
    if (!db) {
      console.warn('[emailLogger] Admin DB not available, skipping email log');
      return;
    }

    const { projectId, direction, to, from, subject, text, html, related } = params;
    if (!projectId) return;

    const snippet = buildSnippet(text, html);

    const doc: Record<string, unknown> = {
      projectId,
      direction,
      to,
      from,
      subject: subject || '',
      snippet,
      bodyText: text || '',
      bodyHtml: html || '',
      createdAt: new Date(),
    };

    if (related) {
      doc.related = {
        type: related.type,
        id: related.id || null,
        folderPath: related.folderPath || null,
        filePath: related.filePath || null,
        customerId: related.customerId || null,
      };
    }

    await db.collection('projectEmails').add(doc);
  } catch (err) {
    console.error('[emailLogger] Failed to log project email:', err);
  }
}

