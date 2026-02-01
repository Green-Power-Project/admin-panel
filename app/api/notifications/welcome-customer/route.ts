import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getAdminDb } from '@/lib/server/firebaseAdmin';

const PORTAL_URL_DEFAULT = 'https://window-app-roan.vercel.app';
const CONTACT_EMAIL = 'info@gruen-power.de';

/** Customer portal login URL – from env (CUSTOMER_PORTAL_URL, PORTAL_URL, or NEXT_PUBLIC_CUSTOMER_APP_ORIGIN). */
function getPortalLoginUrl(): string {
  const base =
    process.env.CUSTOMER_PORTAL_URL ||
    process.env.PORTAL_URL ||
    process.env.NEXT_PUBLIC_CUSTOMER_APP_ORIGIN ||
    PORTAL_URL_DEFAULT;
  const url = base.replace(/\/$/, '');
  return `${url}/login`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerId, customerNumber, customerName, customerEmail, password } = body;

    if (!customerId || !customerNumber) {
      return NextResponse.json(
        { error: 'Missing required fields: customerId, customerNumber' },
        { status: 400 }
      );
    }

    if (!customerEmail || customerEmail.trim() === '') {
      console.log('[welcome-customer] No customer email - skipping');
      return NextResponse.json({ success: false, skipped: true, reason: 'no_email' }, { status: 200 });
    }

    const db = getAdminDb();
    if (!db) {
      console.log('[welcome-customer] Admin SDK not configured');
      return NextResponse.json({ success: false, skipped: true }, { status: 200 });
    }

    const EMAIL_USER = process.env.EMAIL_USER;
    const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;
    const portalLoginUrl = getPortalLoginUrl();

    if (!EMAIL_USER || !EMAIL_PASSWORD) {
      console.warn('[welcome-customer] EMAIL_USER or EMAIL_PASSWORD not set – skipping email send.');
      return NextResponse.json({ success: false, skipped: true }, { status: 200 });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASSWORD,
      },
    });

    // Welcome customer email is always in German (Deutsch).
    const loginEmail = customerEmail.trim();
    const hasPassword = password && String(password).trim();
    const passwordLine = hasPassword
      ? `Ihr Passwort: ${password}`
      : 'Ihr Passwort wurde automatisch generiert. Sie können es nach der ersten Anmeldung im Portal ändern.';

    const subject = 'Ihr Kundenkonto im Grün Power Kundenportal';

    const emailContentHtml = `<p>Sehr geehrte Damen und Herren,</p>
<p>wir haben für Sie ein Kundenkonto in unserem Grün Power Kundenportal erstellt.</p>
<p><strong>Link zum Kundenportal:</strong><br><a href="${portalLoginUrl}">${portalLoginUrl}</a></p>
<p><strong>Anmeldung (E-Mail):</strong> ${loginEmail}</p>
<p><strong>${passwordLine}</strong></p>
<p>Sie können sich ab sofort mit Ihrer E-Mail-Adresse im Portal anmelden und die für Ihr Projekt bereitgestellten Unterlagen einsehen.</p>
<p>Bei Fragen oder Problemen mit dem Login können Sie sich jederzeit gerne bei uns melden oder uns eine E-Mail an ${CONTACT_EMAIL} schreiben.</p>
<p>Mit freundlichen Grüßen<br>Grün Power Garten- und Landschaftsbau</p>`;

    const emailContentText = `Sehr geehrte Damen und Herren,

wir haben für Sie ein Kundenkonto in unserem Grün Power Kundenportal erstellt.

Link zum Kundenportal:
${portalLoginUrl}

Anmeldung (E-Mail): ${loginEmail}
${passwordLine}

Sie können sich ab sofort mit Ihrer E-Mail-Adresse im Portal anmelden und die für Ihr Projekt bereitgestellten Unterlagen einsehen.

Bei Fragen oder Problemen mit dem Login können Sie sich jederzeit gerne bei uns melden oder uns eine E-Mail an ${CONTACT_EMAIL} schreiben.

Mit freundlichen Grüßen
Grün Power Garten- und Landschaftsbau`;

    const EMAIL_CC = process.env.EMAIL_CC || 'grunpower462@gmail.com';
    const mailOptions = {
      from: `Grün Power <${EMAIL_USER}>`,
      to: customerEmail,
      cc: EMAIL_CC,
      subject,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .content { background-color: #f9f9f9; padding: 20px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="content">
              ${emailContentHtml}
            </div>
            <div class="footer">
              <p>Dies ist eine automatische Benachrichtigung von Grün Power.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: emailContentText,
    };

    await transporter.sendMail(mailOptions);
    console.log('[welcome-customer] ✅ Welcome email sent to:', customerEmail);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error('[welcome-customer] Unexpected error:', error);
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
