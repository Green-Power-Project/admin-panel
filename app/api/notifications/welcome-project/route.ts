import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getAdminDb } from '@/lib/server/firebaseAdmin';
import { logProjectEmail } from '@/lib/server/emailLogger';
import { getContactForEmail, buildGermanEmailClosing, buildEmailLogoHtml } from '@/lib/emailSignature';

const PORTAL_URL_DEFAULT = 'https://customer.gruen-power.cloud';
const CONTACT_EMAIL = 'info@gruen-power.de';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, projectNumber, projectName, customerId, customerNumber, customerName, customerEmail, notificationEmail, language } = body;
    const customerNameSafe = (customerName && String(customerName).trim()) || '';

    if (!projectId || !projectNumber || !customerId || !customerNumber) {
      return NextResponse.json(
        { error: 'Missing required fields: projectId, projectNumber, customerId, customerNumber' },
        { status: 400 }
      );
    }

    const toEmail = (notificationEmail && String(notificationEmail).trim()) || (customerEmail && String(customerEmail).trim());
    if (!toEmail) {
      console.log('[welcome-project] No notification or customer email - skipping');
      return NextResponse.json({ success: false, skipped: true, reason: 'no_email' }, { status: 200 });
    }

    const db = getAdminDb();
    if (!db) {
      console.log('[welcome-project] Admin SDK not configured');
      return NextResponse.json({ success: false, skipped: true }, { status: 200 });
    }

    const EMAIL_USER = process.env.EMAIL_USER;
    const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;
    const PORTAL_URL = process.env.PORTAL_URL || process.env.NEXT_PUBLIC_CUSTOMER_APP_ORIGIN || PORTAL_URL_DEFAULT;

    if (!EMAIL_USER || !EMAIL_PASSWORD) {
      console.warn('[welcome-project] EMAIL_USER or EMAIL_PASSWORD not set – skipping email send.');
      return NextResponse.json({ success: false, skipped: true }, { status: 200 });
    }

    const contact = await getContactForEmail(db);
    const closing = buildGermanEmailClosing(contact);
    const contactEmailForBody = contact.email || CONTACT_EMAIL;
    const portalLoginUrl = `${PORTAL_URL.replace(/\/$/, '')}/login`;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASSWORD,
      },
    });

    const subject = 'Ihr Zugang zum Grün Power Kundenportal – Login-Daten';

    const emailContentHtml = `
<p>Sehr geehrte Damen und Herren,</p>
<p>wir haben für Sie ein Kundenkonto in unserem Grün Power Kundenportal erstellt.</p>
<p>Dort finden Sie alle Unterlagen und Informationen zu Ihrem Projekt.</p>

<p style="margin: 16px 0 8px 0;"><strong>📌 Kundenportal:</strong></p>
<p style="margin: 12px 0 16px 0;"><a href="${portalLoginUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2e7d32; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: bold;">Zum Kundenportal — Login</a></p>

<div style="background-color: #e8f5e9; padding: 16px 20px; margin: 20px 0; border-left: 4px solid #2e7d32; border-radius: 4px;">
  <p style="margin: 0 0 10px 0; font-weight: bold; color: #1b5e20;">🔐 Ihre Zugangsdaten (Login):</p>
  <p style="margin: 6px 0;"><strong>Kunden Nr:</strong> ${customerNumber}</p>
  <p style="margin: 6px 0;"><strong>Projekt Nr:</strong> ${projectNumber}</p>
</div>

<p>Sie können sich ab sofort mit diesen Daten anmelden und die Dokumente, Fotos sowie alle projektbezogenen Informationen einsehen.</p>
<p>Das Portal dient der Transparenz und einer klaren Kommunikation, damit Sie jederzeit über den aktuellen Stand Ihres Projekts informiert sind.</p>
<p>Bei Fragen oder Problemen mit der Anmeldung können Sie uns jederzeit kontaktieren oder eine E-Mail schreiben an:</p>
<p style="margin: 8px 0 0 0;">📧 <a href="mailto:${contactEmailForBody}">${contactEmailForBody}</a></p>
${closing.html}`;

    const emailContentText = `Sehr geehrte Damen und Herren,

wir haben für Sie ein Kundenkonto in unserem Grün Power Kundenportal erstellt.
Dort finden Sie alle Unterlagen und Informationen zu Ihrem Projekt.

📌 Link zum Kundenportal:
${portalLoginUrl}

🔐 Ihre Zugangsdaten (Login):
Kunden Nr: ${customerNumber}
Projekt Nr: ${projectNumber}

Sie können sich ab sofort mit diesen Daten anmelden und die Dokumente, Fotos sowie alle projektbezogenen Informationen einsehen.
Das Portal dient der Transparenz und einer klaren Kommunikation, damit Sie jederzeit über den aktuellen Stand Ihres Projekts informiert sind.

Bei Fragen oder Problemen mit der Anmeldung können Sie uns jederzeit kontaktieren oder eine E-Mail schreiben an:
📧 ${contactEmailForBody}

${closing.text}`;

    const EMAIL_CC = process.env.EMAIL_CC || 'grunpower462@gmail.com';
    const mailOptions = {
      from: `Grün Power <${EMAIL_USER}>`,
      to: toEmail,
      cc: EMAIL_CC,
      subject,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 24px; }
            .content { padding: 24px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="content">
              ${buildEmailLogoHtml()}
              ${emailContentHtml}
            </div>
          </div>
        </body>
        </html>
      `,
      text: emailContentText,
    };

    await transporter.sendMail(mailOptions);
    console.log('[welcome-project] ✅ Project welcome email sent to:', toEmail);

    // Log welcome mail against the project so it appears under "Sent"
    try {
      await logProjectEmail({
        projectId,
        direction: 'outgoing',
        to: [toEmail],
        from: EMAIL_USER,
        subject,
        text: emailContentText,
        html: typeof mailOptions.html === 'string' ? mailOptions.html : undefined,
        related: {
          type: 'welcomeProject',
          customerId,
        },
      });
    } catch (logErr) {
      console.error('[welcome-project] Failed to log email:', logErr);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error('[welcome-project] Unexpected error:', error);
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
