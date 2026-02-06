import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getAdminDb } from '@/lib/server/firebaseAdmin';
import { buildEmailLogoHtml } from '@/lib/emailSignature';

type FileActivityEventType = 'read' | 'approved';

interface FileActivityPayload {
  eventType: FileActivityEventType;
  projectId: string;
  projectName?: string;
  folderPath: string;
  filePath: string;
  fileName?: string;
  customerId?: string;
}

function validatePayload(body: any): FileActivityPayload | null {
  if (!body || typeof body !== 'object') return null;

  const { eventType, projectId, folderPath, filePath, fileName, projectName, customerId } = body;

  if (eventType !== 'read' && eventType !== 'approved') {
    return null;
  }
  if (
    typeof projectId !== 'string' ||
    typeof folderPath !== 'string' ||
    typeof filePath !== 'string'
  ) {
    return null;
  }
  if (!projectId || !folderPath || !filePath) {
    return null;
  }

  return {
    eventType,
    projectId,
    folderPath,
    filePath,
    fileName: typeof fileName === 'string' ? fileName : undefined,
    projectName: typeof projectName === 'string' ? projectName : undefined,
    customerId: typeof customerId === 'string' ? customerId : undefined,
  };
}

// CORS helper – allow customer app origin
function withCors(response: NextResponse) {
  const allowedOrigin = (process.env.NEXT_PUBLIC_CUSTOMER_APP_ORIGIN || 'http://localhost:3001').trim();
  response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
  response.headers.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  return response;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    const db = getAdminDb();
    if (!db) {
      console.log('[file-activity] Admin SDK not configured');
      return withCors(NextResponse.json({ success: false, skipped: true }, { status: 200 }));
    }

    const body = await request.json().catch(() => null);
    const payload = validatePayload(body);
    if (!payload) {
      console.log('[file-activity] Invalid payload:', body);
      return withCors(NextResponse.json({ success: false }, { status: 400 }));
    }

    const { eventType, projectId, folderPath, filePath, fileName, projectName, customerId } = payload;
    console.log('[file-activity] Event received:', payload);

    // Load project – needed for project name / number and customerId when not provided
    let resolvedProjectName = projectName || '';
    let projectNumber: string | null = null;
    let resolvedCustomerId: string | null = customerId || null;

    try {
      const projectDoc = await db.collection('projects').doc(projectId).get();
      if (projectDoc.exists) {
        const data = projectDoc.data() || {};
        resolvedProjectName = resolvedProjectName || data.name || 'Unbenanntes Projekt';
        projectNumber = data.projectNumber || null;
        resolvedCustomerId = resolvedCustomerId || data.customerId || null;
      } else {
        console.log('[file-activity] Project not found for id:', projectId);
      }
    } catch (err) {
      console.error('[file-activity] Error loading project:', err);
    }

    // Load customer info (optional, best-effort)
    let customerNumber: string | null = null;
    let customerEmail: string | null = null;
    if (resolvedCustomerId) {
      try {
        const snap = await db
          .collection('customers')
          .where('uid', '==', resolvedCustomerId)
          .limit(1)
          .get();
        if (!snap.empty) {
          const data = snap.docs[0].data() || {};
          customerNumber = data.customerNumber || null;
          customerEmail = data.email || null;
        }
      } catch (err) {
        console.error('[file-activity] Error loading customer info:', err);
      }
    }

    // Get admin recipients
    const adminsSnapshot = await db.collection('admins').get();
    const adminEmails: string[] = [];
    adminsSnapshot.forEach((doc) => {
      const email = doc.data().email;
      if (email) adminEmails.push(email);
    });
    if (adminEmails.length === 0) {
      console.log('[file-activity] No admin emails found, skipping');
      return withCors(NextResponse.json({ success: false, skipped: true }, { status: 200 }));
    }

    const EMAIL_USER = process.env.EMAIL_USER;
    const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;
    if (!EMAIL_USER || !EMAIL_PASSWORD) {
      console.warn('[file-activity] EMAIL_USER or EMAIL_PASSWORD not set – skipping email send.');
      return withCors(NextResponse.json({ success: false, skipped: true }, { status: 200 }));
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: EMAIL_USER, pass: EMAIL_PASSWORD },
    });

    const activityLabel =
      eventType === 'approved'
        ? 'Report approved by customer'
        : 'Document opened by customer';

    const localizedActivity =
      eventType === 'approved'
        ? 'Bericht vom Kunden genehmigt'
        : 'Dokument vom Kunden geöffnet';

    const subject =
      eventType === 'approved'
        ? `✅ Customer approved report: ${fileName || filePath}`
        : `👁️ Customer opened file: ${fileName || filePath}`;

    const folderName = folderPath.split('/').pop() || folderPath;
    const now = new Date().toLocaleString('de-DE');

    const html = `
      <p style="font-size: 16px; margin: 0 0 16px 0;"><strong>${localizedActivity}</strong></p>
      <p style="margin: 6px 0;"><strong>Projekt:</strong> ${resolvedProjectName}${
        projectNumber ? ` (${projectNumber})` : ''
      }</p>
      <p style="margin: 6px 0;"><strong>Ordner:</strong> ${folderName}</p>
      <p style="margin: 6px 0;"><strong>Datei:</strong> ${fileName || filePath}</p>
      <p style="margin: 6px 0;"><strong>Zeitpunkt:</strong> ${now}</p>
      <p style="margin: 10px 0 0 0; font-size: 12px; color: #666;">
        Kunde: ${customerNumber || '—'}${customerEmail ? ` · ${customerEmail}` : ''}<br/>
        Event: ${activityLabel}
      </p>
    `;

    const textLines = [
      `${localizedActivity}`,
      `Projekt: ${resolvedProjectName}${projectNumber ? ` (${projectNumber})` : ''}`,
      `Ordner: ${folderName}`,
      `Datei: ${fileName || filePath}`,
      `Zeitpunkt: ${now}`,
      `Kunde: ${customerNumber || '—'}${customerEmail ? ` · ${customerEmail}` : ''}`,
    ];

    await transporter.sendMail({
      from: `Grün Power <${EMAIL_USER}>`,
      to: adminEmails.join(','),
      subject,
      html: `<!DOCTYPE html><html><body style="font-family: Arial, sans-serif;">${buildEmailLogoHtml()}${html}</body></html>`,
      text: textLines.join('\n'),
    });

    console.log('[file-activity] ✅ Notification email sent for', eventType, filePath);
    return withCors(NextResponse.json({ success: true }, { status: 200 }));
  } catch (error) {
    console.error('[file-activity] Error:', error);
    return withCors(NextResponse.json({ success: false }, { status: 200 }));
  }
}

