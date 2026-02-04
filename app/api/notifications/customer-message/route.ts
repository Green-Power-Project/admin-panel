import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getAdminDb } from '@/lib/server/firebaseAdmin';
import { buildEmailLogoHtml } from '@/lib/emailSignature';

export async function POST(request: NextRequest) {
  try {
    const db = getAdminDb();
    if (!db) {
      return NextResponse.json({ success: false, skipped: true }, { status: 200 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false }, { status: 400 });
    }

    const { projectId, projectName, customerId, message, folderPath, fileName, subject } = body;
    if (!projectId || !projectName || !message || !folderPath) {
      return NextResponse.json({ success: false }, { status: 400 });
    }

    const adminsSnapshot = await db.collection('admins').get();
    const adminEmails: string[] = [];
    adminsSnapshot.forEach((doc) => {
      const email = doc.data().email;
      if (email) adminEmails.push(email);
    });

    if (adminEmails.length === 0) {
      return NextResponse.json({ success: false, skipped: true }, { status: 200 });
    }

    const EMAIL_USER = process.env.EMAIL_USER;
    const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;
    if (!EMAIL_USER || !EMAIL_PASSWORD) {
      return NextResponse.json({ success: false, skipped: true }, { status: 200 });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: EMAIL_USER, pass: EMAIL_PASSWORD },
    });

    const isFileComment = !!fileName?.trim();
    const notificationTitle = isFileComment
      ? `✅ The customer commented on file: ${fileName}`
      : 'The customer sent a message for this folder';
    const subjectLine = subject ? `Subject: ${subject}` : '';
    const html = `
      <p style="font-size: 16px; margin: 0 0 16px 0;"><strong>${notificationTitle}</strong></p>
      ${subjectLine ? `<p style="margin: 0 0 8px 0;"><strong>Comment subject:</strong> ${String(subject).replace(/</g, '&lt;')}</p>` : ''}
      <p style="margin: 8px 0;"><strong>Project:</strong> ${projectName}</p>
      <p style="margin: 8px 0;"><strong>Folder:</strong> ${folderPath}</p>
      <p style="margin: 12px 0 4px 0;"><strong>Message:</strong></p>
      <p style="white-space: pre-wrap; background: #f5f5f5; padding: 12px; border-radius: 4px;">${String(message).replace(/</g, '&lt;')}</p>
      <p style="margin-top: 16px; font-size: 12px; color: #666;">Customer ID: ${customerId || '—'}</p>
    `;
    const text = `${notificationTitle}\n${subjectLine ? subjectLine + '\n' : ''}Project: ${projectName}\nFolder: ${folderPath}\n\nMessage:\n${message}\n\nCustomer ID: ${customerId || '—'}`;

    const emailSubject = isFileComment
      ? `✅ Customer commented on file: ${fileName}`
      : 'New customer message';

    await transporter.sendMail({
      from: `Grün Power <${EMAIL_USER}>`,
      to: adminEmails.join(','),
      subject: emailSubject,
      html: `<!DOCTYPE html><html><body style="font-family: Arial, sans-serif;">${buildEmailLogoHtml()}${html}</body></html>`,
      text,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('[customer-message] Error:', error);
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
