import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getAdminDb } from '@/lib/server/firebaseAdmin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, projectNumber, projectName, customerId, customerNumber, customerName, customerEmail } = body;

    if (!projectId || !projectNumber || !customerId || !customerNumber) {
      return NextResponse.json(
        { error: 'Missing required fields: projectId, projectNumber, customerId, customerNumber' },
        { status: 400 }
      );
    }

    // Only send email if customer has email stored in system
    if (!customerEmail || customerEmail.trim() === '') {
      console.log('[welcome-project] Customer does not have email stored in system - skipping email notification');
      return NextResponse.json({ success: false, skipped: true, reason: 'no_email' }, { status: 200 });
    }

    const db = getAdminDb();
    if (!db) {
      console.log('[welcome-project] Admin SDK not configured');
      return NextResponse.json({ success: false, skipped: true }, { status: 200 });
    }

    const EMAIL_USER = process.env.EMAIL_USER;
    const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;
    const PORTAL_URL = process.env.PORTAL_URL || process.env.NEXT_PUBLIC_CUSTOMER_APP_ORIGIN || 'http://localhost:3001';

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

    const subject = 'Your project has been created in our customer portal';
    
    const emailContent = `
      <p>Dear Sir or Madam,</p>
      <p>Your project has been created in our customer portal.</p>
      
      <div style="background-color: #e8f5e9; padding: 20px; margin: 20px 0; border-left: 4px solid #5d7a5d; border-radius: 4px;">
        <p style="margin: 10px 0;"><strong>Project name:</strong> ${projectName || 'Your Project'}</p>
        <p style="margin: 10px 0;"><strong>Project number:</strong> ${projectNumber}</p>
        <p style="margin: 10px 0;"><strong>Customer number:</strong> ${customerNumber}</p>
      </div>
      
      <p style="margin: 20px 0;"><strong>To access your project, enter your Customer Number and Project Number.</strong></p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${PORTAL_URL}/login" style="display: inline-block; padding: 12px 24px; background-color: #5d7a5d; color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">
          Access Customer Portal
        </a>
      </div>
    `;

    const mailOptions = {
      from: `Grün Power <${EMAIL_USER}>`,
      to: customerEmail,
      subject,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #5d7a5d; color: white; padding: 20px; text-align: center; }
            .content { background-color: #f9f9f9; padding: 20px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            h3 { margin-top: 20px; }
            ul { margin: 10px 0; padding-left: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>Your Project Has Been Created</h2>
            </div>
            <div class="content">
              ${emailContent}
            </div>
            <div class="footer">
              <p>This is an automated notification from Grün Power.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Dear Sir or Madam,

Your project has been created in our customer portal.

Project name: ${projectName || 'Your Project'}
Project number: ${projectNumber}
Customer number: ${customerNumber}

To access your project, enter your Customer Number and Project Number.

Access Customer Portal: ${PORTAL_URL}/login

This is an automated notification from Grün Power.`,
    };

    await transporter.sendMail(mailOptions);
    console.log('[welcome-project] ✅ Project welcome email sent successfully to:', customerEmail);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error('[welcome-project] Unexpected error:', error);
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
