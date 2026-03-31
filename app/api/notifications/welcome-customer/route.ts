import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getAdminDb } from '@/lib/server/firebaseAdmin';
import { getContactForEmail, buildGermanEmailClosing, buildEmailLogoHtml } from '@/lib/emailSignature';
import { logProjectEmail } from '@/lib/server/emailLogger';

const PORTAL_URL_DEFAULT = 'https://window-app-roan.vercel.app';
const CONTACT_EMAIL = 'info@gruen-power.de';

/** Customer portal base URL (no trailing slash). */
function getPortalBaseUrl(): string {
  const base =
    process.env.CUSTOMER_PORTAL_URL ||
    process.env.PORTAL_URL ||
    process.env.NEXT_PUBLIC_CUSTOMER_APP_ORIGIN ||
    PORTAL_URL_DEFAULT;
  return base.replace(/\/$/, '');
}

function getPortalLoginUrl(): string {
  return `${getPortalBaseUrl()}/login`;
}

function getForgotPasswordUrl(): string {
  return `${getPortalBaseUrl()}/forgot-password`;
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

    const contact = await getContactForEmail(db);
    const closing = buildGermanEmailClosing(contact);
    const contactEmailForBody = contact.email || CONTACT_EMAIL;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASSWORD,
      },
    });

    const loginEmail = customerEmail.trim();
    const hasPassword = password && String(password).trim();
    const passwordValue = hasPassword ? String(password).trim() : '(automatisch generiert – siehe Link unten zum Setzen)';
    const forgotPasswordUrl = getForgotPasswordUrl();

    const subject = 'Ihr Zugang zum Grün Power Kundenportal – Login-Daten';

    const emailContentHtml = `
<p>Sehr geehrte Damen und Herren,</p>
<p>wir haben für Sie ein Kundenkonto in unserem Grün Power Kundenportal erstellt.</p>
<p>Dort finden Sie alle Unterlagen und Informationen zu Ihrem Projekt.</p>

<p style="margin: 16px 0 8px 0;"><strong>📌 Kundenportal:</strong></p>
<p style="margin: 12px 0 16px 0;"><a href="${portalLoginUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2e7d32; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: bold;">Zum Kundenportal — Login</a></p>

<div style="background-color: #e8f5e9; padding: 16px 20px; margin: 20px 0; border-left: 4px solid #2e7d32; border-radius: 4px;">
  <p style="margin: 0 0 10px 0; font-weight: bold; color: #1b5e20;">🔐 Ihre Zugangsdaten (Login):</p>
  <p style="margin: 6px 0;"><strong>E-Mail:</strong> ${loginEmail}</p>
  <p style="margin: 6px 0;"><strong>Passwort:</strong> ${passwordValue}</p>
  ${!hasPassword ? `<p style="margin: 12px 0 0 0;"><a href="${forgotPasswordUrl}" style="display: inline-block; padding: 10px 20px; background-color: #1b5e20; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: bold;">Passwort setzen / zurücksetzen</a></p>` : ''}
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
E-Mail: ${loginEmail}
Passwort: ${passwordValue}
${!hasPassword ? `\nPasswort setzen: ${forgotPasswordUrl}` : ''}

Sie können sich ab sofort mit diesen Daten anmelden und die Dokumente, Fotos sowie alle projektbezogenen Informationen einsehen.
Das Portal dient der Transparenz und einer klaren Kommunikation, damit Sie jederzeit über den aktuellen Stand Ihres Projekts informiert sind.

Bei Fragen oder Problemen mit der Anmeldung können Sie uns jederzeit kontaktieren oder eine E-Mail schreiben an:
📧 ${contactEmailForBody}

${closing.text}`;

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
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; }
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
    console.log('[welcome-customer] ✅ Welcome email sent to:', customerEmail);

    // Log welcome email for project email history (uses customerId as projectId surrogate)
    try {
      await logProjectEmail({
        projectId: String(customerId),
        direction: 'outgoing',
        to: [customerEmail],
        from: EMAIL_USER,
        subject,
        text: emailContentText,
        html: emailContentHtml,
        related: {
          type: 'welcomeCustomer',
          customerId: String(customerId),
        },
      });
    } catch (logErr) {
      console.error('[welcome-customer] Failed to log email:', logErr);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error('[welcome-customer] Unexpected error:', error);
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
