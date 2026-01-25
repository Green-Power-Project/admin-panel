import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getAdminDb } from '@/lib/server/firebaseAdmin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerId, customerNumber, customerName, customerEmail } = body;

    if (!customerId || !customerNumber) {
      return NextResponse.json(
        { error: 'Missing required fields: customerId, customerNumber' },
        { status: 400 }
      );
    }

    // Only send email if customer has email stored in system
    if (!customerEmail || customerEmail.trim() === '') {
      console.log('[welcome-customer] Customer does not have email stored in system - skipping email notification');
      return NextResponse.json({ success: false, skipped: true, reason: 'no_email' }, { status: 200 });
    }

    const db = getAdminDb();
    if (!db) {
      console.log('[welcome-customer] Admin SDK not configured');
      return NextResponse.json({ success: false, skipped: true }, { status: 200 });
    }

    const EMAIL_USER = process.env.EMAIL_USER;
    const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;
    const PORTAL_URL = process.env.PORTAL_URL || process.env.NEXT_PUBLIC_CUSTOMER_APP_ORIGIN || 'http://localhost:3001';

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

    const displayName = customerName || customerNumber;

    const subject = 'Welcome to Grün Power Customer Portal';
    
    const emailContent = `
      <p>Dear Sir or Madam,</p>
      <p>to ensure transparent, simple, and well-organized cooperation, we use the Grün Power Customer Portal.</p>
      <p>Below is a short explanation of how our system works.</p>
      
      <h3 style="color: #5d7a5d; margin-top: 20px;">1. Customer and Project Setup</h3>
      <p>Once we register you as a customer in our system, the following information is created:</p>
      <div style="background-color: #f9f9f9; padding: 15px; margin: 15px 0; border-left: 4px solid #5d7a5d;">
        <p style="margin: 5px 0;"><strong>Customer name:</strong> ${displayName}</p>
        <p style="margin: 5px 0;"><strong>Customer number:</strong> ${customerNumber}</p>
      </div>
      
      <h3 style="color: #5d7a5d; margin-top: 20px;">2. Login to the Customer Portal</h3>
      <p>To access your project, simply enter:</p>
      <ul>
        <li>Your customer number: <strong>${customerNumber}</strong></li>
        <li>Your project number (will be provided when your project is created)</li>
      </ul>
      <p>No additional registration and no password are required.</p>
      
      <h3 style="color: #5d7a5d; margin-top: 20px;">3. Automatic Notifications During the Project</h3>
      <p>Whenever we upload new content during the project, such as:</p>
      <ul>
        <li>Construction progress photos</li>
        <li>Documents</li>
        <li>Reports or work records</li>
      </ul>
      <p>you will automatically receive a notification email.</p>
      <p>This email will again include:</p>
      <ul>
        <li>The portal link</li>
        <li>Your customer number</li>
        <li>Your project number</li>
      </ul>
      
      <h3 style="color: #5d7a5d; margin-top: 20px;">4. Full Transparency for the Client</h3>
      <p>After logging in, you can:</p>
      <ul>
        <li>view all uploaded files and photos</li>
        <li>track the current project status</li>
        <li>access documents at any time</li>
      </ul>
      <p>This ensures full transparency, clear documentation, and easy digital access to your project — simple, secure, and efficient.</p>
      
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
              <h2>Welcome to Grün Power Customer Portal</h2>
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

to ensure transparent, simple, and well-organized cooperation, we use the Grün Power Customer Portal.

Below is a short explanation of how our system works.

1. Customer and Project Setup
Once we register you as a customer in our system, the following information is created:
Customer name: ${displayName}
Customer number: ${customerNumber}

2. Login to the Customer Portal
To access your project, simply enter:
- Your customer number: ${customerNumber}
- Your project number (will be provided when your project is created)

No additional registration and no password are required.

3. Automatic Notifications During the Project
Whenever we upload new content during the project, such as:
- Construction progress photos
- Documents
- Reports or work records
you will automatically receive a notification email.

This email will again include:
- The portal link
- Your customer number
- Your project number

4. Full Transparency for the Client
After logging in, you can:
- view all uploaded files and photos
- track the current project status
- access documents at any time

This ensures full transparency, clear documentation, and easy digital access to your project — simple, secure, and efficient.

Access Customer Portal: ${PORTAL_URL}/login

This is an automated notification from Grün Power.`,
    };

    await transporter.sendMail(mailOptions);
    console.log('[welcome-customer] ✅ Welcome email sent successfully to:', customerEmail);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error('[welcome-customer] Unexpected error:', error);
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
