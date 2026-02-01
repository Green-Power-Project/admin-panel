import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getAdminDb } from '@/lib/server/firebaseAdmin';

const PORTAL_URL_DEFAULT = 'https://window-app-roan.vercel.app';
const CONTACT_EMAIL = 'info@gruen-power.de';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, projectNumber, projectName, customerId, customerNumber, customerName, customerEmail, notificationEmail, language } = body;

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

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASSWORD,
      },
    });

    const isDe = language === 'de';

    const subject = isDe
      ? 'Neues Projekt in unserem Grün Power Kundenportal'
      : 'New project in our Grün Power Customer Portal';

    const emailContentHtml = isDe
      ? `<p>Sehr geehrte Damen und Herren,</p>
<p>wir haben ein neues Projekt in unserem Grün Power Kundenportal für Sie erstellt.</p>
<p><strong>Link zum Kundenportal:</strong><br><a href="${PORTAL_URL}/login">${PORTAL_URL}/login</a></p>
<p>Bitte melden Sie sich mit Ihrer E-Mail-Adresse an, um die für Ihr Projekt bereitgestellten Unterlagen einzusehen.</p>
<p>Bei Fragen oder Problemen können Sie sich jederzeit gerne bei uns melden oder uns eine E-Mail an ${CONTACT_EMAIL} schreiben.</p>
<p>Mit freundlichen Grüßen<br>Grün Power Garten- und Landschaftsbau</p>`
      : `<p>Dear Sir or Madam,</p>
<p>we have created a new project for you in our Grün Power Customer Portal.</p>
<p><strong>Customer portal link:</strong><br><a href="${PORTAL_URL}/login">${PORTAL_URL}/login</a></p>
<p>Please log in using your email address to view the documents provided for your project.</p>
<p>If you have any questions or experience any issues, feel free to contact us anytime or email us at ${CONTACT_EMAIL}.</p>
<p>Kind regards,<br>Grün Power Garten- und Landschaftsbau</p>`;

    const emailContentText = isDe
      ? `Sehr geehrte Damen und Herren,

wir haben ein neues Projekt in unserem Grün Power Kundenportal für Sie erstellt.

Link zum Kundenportal:
${PORTAL_URL}/login

Bitte melden Sie sich mit Ihrer E-Mail-Adresse an, um die für Ihr Projekt bereitgestellten Unterlagen einzusehen.

Bei Fragen oder Problemen können Sie sich jederzeit gerne bei uns melden oder uns eine E-Mail an ${CONTACT_EMAIL} schreiben.

Mit freundlichen Grüßen
Grün Power Garten- und Landschaftsbau`
      : `Dear Sir or Madam,

we have created a new project for you in our Grün Power Customer Portal.

Customer portal link:
${PORTAL_URL}/login

Please log in using your email address to view the documents provided for your project.

If you have any questions or experience any issues, feel free to contact us anytime or email us at ${CONTACT_EMAIL}.

Kind regards,
Grün Power Garten- und Landschaftsbau`;

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
              <p>This is an automated notification from Grün Power.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: emailContentText,
    };

    await transporter.sendMail(mailOptions);
    console.log('[welcome-project] ✅ Project welcome email sent to:', toEmail);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error('[welcome-project] Unexpected error:', error);
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
