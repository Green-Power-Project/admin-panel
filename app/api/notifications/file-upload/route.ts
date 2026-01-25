import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getAdminDb } from '@/lib/server/firebaseAdmin';

interface FileUploadNotificationPayload {
  projectId: string;
  filePath: string;
  folderPath: string;
  fileName: string;
  isReport?: boolean;
}

function validatePayload(body: any): FileUploadNotificationPayload | null {
  if (!body || typeof body !== 'object') return null;

  const { projectId, filePath, folderPath, fileName, isReport } = body;

  if (
    typeof projectId !== 'string' ||
    typeof filePath !== 'string' ||
    typeof folderPath !== 'string' ||
    typeof fileName !== 'string'
  ) {
    return null;
  }

  if (!projectId || !filePath || !folderPath || !fileName) {
    return null;
  }

  return {
    projectId,
    filePath,
    folderPath,
    fileName,
    isReport: Boolean(isReport),
  };
}

// Helper to add CORS headers (for customer app on a different origin)
function withCors(response: NextResponse) {
  const allowedOrigin = process.env.NEXT_PUBLIC_CUSTOMER_APP_ORIGIN || 'http://localhost:3001';
  response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
  response.headers.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  return response;
}

// Handle CORS preflight
export async function OPTIONS() {
  const res = new NextResponse(null, { status: 204 });
  return withCors(res);
}

export async function POST(request: NextRequest) {
  try {
    console.log('[file-upload-notification] API called');
    const db = getAdminDb();
    if (!db) {
      console.log('[file-upload-notification] Admin SDK not configured');
      // Admin SDK not configured – safely skip email without exposing details
      return NextResponse.json({ success: false, skipped: true }, { status: 200 });
    }

    const body = await request.json().catch(() => null);
    const payload = validatePayload(body);

    if (!payload) {
      console.log('[file-upload-notification] Invalid payload:', body);
      return withCors(NextResponse.json({ success: false }, { status: 400 }));
    }

    const { projectId, filePath, folderPath, fileName, isReport } = payload;
    console.log('[file-upload-notification] Payload:', { projectId, folderPath, fileName, isReport });

    // Detect if this is a customer upload (in "Your Uploads" folder)
    const isCustomerUpload = folderPath.startsWith('01_Customer_Uploads');
    console.log('[file-upload-notification] Upload type:', isCustomerUpload ? 'CUSTOMER UPLOAD (notify admin)' : 'ADMIN UPLOAD (notify customer)');

    // Look up project to get customerId, name, and projectNumber
    const projectDoc = await db.collection('projects').doc(projectId).get();
    if (!projectDoc.exists) {
      console.log('[file-upload-notification] Project not found:', projectId);
      return withCors(NextResponse.json({ success: false }, { status: 200 }));
    }

    const projectData = projectDoc.data() || {};
    const projectName: string = projectData.name || 'Unknown Project';
    const projectNumber: string = projectData.projectNumber || '';
    const customerId: string | undefined = projectData.customerId;
    console.log('[file-upload-notification] Project found:', { projectName, projectNumber, customerId });

    if (!customerId) {
      console.log('[file-upload-notification] Customer ID missing from project');
      return withCors(NextResponse.json({ success: false }, { status: 200 }));
    }

    let recipientEmail: string | null = null;
    let recipientType: 'admin' | 'customer' = 'customer';
    let customerEmail: string | null = null;
    let customerName: string | null = null;
    let customerNumber: string | null = null;

    // Always fetch customer details (needed for both admin and customer notifications)
    try {
      const customerQuery = db.collection('customers').where('uid', '==', customerId).limit(1);
      const customerSnapshot = await customerQuery.get();
      
      if (!customerSnapshot.empty) {
        const customerDoc = customerSnapshot.docs[0];
        const customerData = customerDoc.data() || {};
        customerEmail = customerData.email || null;
        customerName = customerData.name || customerData.customerNumber || 'Customer';
        customerNumber = customerData.customerNumber || null;
        console.log('[file-upload-notification] Customer details found:', { 
          customerId, 
          email: customerEmail || 'NO EMAIL',
          name: customerName,
          customerNumber: customerNumber || 'NO NUMBER'
        });
      } else {
        console.log('[file-upload-notification] Customer document not found with uid:', customerId);
      }
    } catch (error) {
      console.error('[file-upload-notification] Error fetching customer doc:', error);
    }

    if (isCustomerUpload) {
      // Customer uploaded → notify ADMIN
      // Find all admin users (users in 'admins' collection)
      try {
        const adminsSnapshot = await db.collection('admins').get();
        const adminEmails: string[] = [];
        
        adminsSnapshot.forEach((adminDoc) => {
          const adminData = adminDoc.data();
          if (adminData.email) {
            adminEmails.push(adminData.email);
          }
        });

        if (adminEmails.length > 0) {
          recipientEmail = adminEmails.join(','); // Send to all admins
          recipientType = 'admin';
          console.log('[file-upload-notification] Admin emails found:', adminEmails);
        } else {
          console.log('[file-upload-notification] No admin emails found in admins collection');
        }
      } catch (error) {
        console.error('[file-upload-notification] Error fetching admin emails:', error);
      }
    } else {
      // Admin uploaded → notify CUSTOMER
      recipientEmail = customerEmail;
      recipientType = 'customer';
    }

    if (!recipientEmail) {
      console.log(`[file-upload-notification] ${recipientType === 'admin' ? 'Admin' : 'Customer'} email not found - skipping email`);
      // If we cannot determine email, silently skip
      return withCors(NextResponse.json({ success: false }, { status: 200 }));
    }

    // For customer notifications, ensure customer has email stored in system
    if (recipientType === 'customer' && !customerEmail) {
      console.log('[file-upload-notification] Customer does not have email stored in system - skipping email notification');
      return withCors(NextResponse.json({ success: false, skipped: true, reason: 'no_email' }, { status: 200 }));
    }

    const EMAIL_USER = process.env.EMAIL_USER;
    const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;
    const PORTAL_URL = process.env.PORTAL_URL || 'https://your-portal-url.com';

    console.log('[file-upload-notification] Email config check:', { 
      hasEmailUser: !!EMAIL_USER, 
      hasEmailPassword: !!EMAIL_PASSWORD,
      portalUrl: PORTAL_URL 
    });

    if (!EMAIL_USER || !EMAIL_PASSWORD) {
      console.warn('[file-upload-notification] EMAIL_USER or EMAIL_PASSWORD not set – skipping email send.');
      return withCors(NextResponse.json({ success: false, skipped: true }, { status: 200 }));
    }

    console.log('[file-upload-notification] Creating email transporter...');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASSWORD,
      },
    });

    const folderName = folderPath.split('/').pop() || folderPath;

    // Different email content based on recipient type
    let subject: string;
    let emailContent: string;
    let fromName: string = 'Green Power'; // Default value
    let replyTo: string | undefined;

    if (isCustomerUpload) {
      // Customer uploaded → notify admin (email appears to come from customer)
      const customerDisplayName = customerName || customerNumber || 'Customer';
      subject = `New File Uploaded - ${projectName}`;
      fromName = customerDisplayName;
      replyTo = customerEmail || undefined;
      
      emailContent = `
        <p>Hello,</p>
        <p>I have uploaded a new file to my project.</p>
        <div class="customer-info" style="background-color: #e8f5e9; padding: 15px; margin: 15px 0; border-left: 4px solid #5d7a5d; border-radius: 4px;">
          <p style="margin: 0; font-weight: bold; color: #2e7d32;">Customer Information:</p>
          ${customerName ? `<p style="margin: 5px 0;"><strong>Name:</strong> ${customerName}</p>` : ''}
          ${customerNumber ? `<p style="margin: 5px 0;"><strong>Customer Number:</strong> ${customerNumber}</p>` : ''}
          ${customerEmail ? `<p style="margin: 5px 0;"><strong>Email:</strong> ${customerEmail}</p>` : ''}
        </div>
        <div class="file-info">
          <p style="margin: 5px 0;"><strong>Project:</strong> ${projectName}</p>
          <p style="margin: 5px 0;"><strong>Folder:</strong> ${folderName}</p>
          <p style="margin: 5px 0;"><strong>File Name:</strong> ${fileName}</p>
        </div>
        <p>Please review the uploaded file in the admin panel.</p>
        <p style="margin-top: 20px; color: #666; font-size: 12px;">This email was sent from the Customer Portal.</p>
        <a href="${process.env.ADMIN_PANEL_URL || 'http://localhost:3000'}" class="button">View in Admin Panel</a>
      `;
    } else {
      // Admin uploaded → notify customer
      subject = isReport
        ? `Work Report Available for Approval: ${projectName}`
        : `New File Available: ${projectName}`;

      emailContent = isReport
        ? `
          <p>Hello,</p>
          <p>A new <strong>Work Report</strong> has been uploaded to your project and requires your review.</p>
          <div style="background-color: #e8f5e9; padding: 15px; margin: 15px 0; border-left: 4px solid #5d7a5d; border-radius: 4px;">
            <p style="margin: 5px 0; font-weight: bold; color: #2e7d32;">Your Login Information:</p>
            ${customerNumber ? `<p style="margin: 5px 0;"><strong>Customer Number:</strong> ${customerNumber}</p>` : ''}
            ${projectNumber ? `<p style="margin: 5px 0;"><strong>Project Number:</strong> ${projectNumber}</p>` : ''}
          </div>
          <div class="file-info">
            <p><strong>Project:</strong> ${projectName}</p>
            <p><strong>Report:</strong> ${fileName}</p>
            <p><strong>Folder:</strong> ${folderName}</p>
          </div>
          <p><strong>Important:</strong> Please review and approve this report within 5 working days. If no objection is received, the report will be automatically approved.</p>
          <p>Please log in to your customer portal to view and approve the report.</p>
          <div style="text-align: center; margin: 20px 0;">
            <a href="${PORTAL_URL}/login" style="display: inline-block; padding: 12px 24px; background-color: #5d7a5d; color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">Review & Approve Report</a>
          </div>
        `
        : `
          <p>Hello,</p>
          <p>A new file has been uploaded to your project.</p>
          <div style="background-color: #e8f5e9; padding: 15px; margin: 15px 0; border-left: 4px solid #5d7a5d; border-radius: 4px;">
            <p style="margin: 5px 0; font-weight: bold; color: #2e7d32;">Your Login Information:</p>
            ${customerNumber ? `<p style="margin: 5px 0;"><strong>Customer Number:</strong> ${customerNumber}</p>` : ''}
            ${projectNumber ? `<p style="margin: 5px 0;"><strong>Project Number:</strong> ${projectNumber}</p>` : ''}
          </div>
          <div class="file-info">
            <p><strong>Project:</strong> ${projectName}</p>
            <p><strong>Folder:</strong> ${folderName}</p>
            <p><strong>File Name:</strong> ${fileName}</p>
          </div>
          <p>Please log in to your customer portal to view and download the file.</p>
          <div style="text-align: center; margin: 20px 0;">
            <a href="${PORTAL_URL}/login" style="display: inline-block; padding: 12px 24px; background-color: #5d7a5d; color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">Access Customer Portal</a>
          </div>
        `;
    }

    const mailOptions = {
      from: isCustomerUpload && fromName 
        ? `${fromName} <${EMAIL_USER}>` 
        : `Green Power <${EMAIL_USER}>`,
      replyTo: replyTo || EMAIL_USER,
      to: recipientEmail,
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
            .file-info { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #5d7a5d; }
            .button { display: inline-block; padding: 12px 24px; background-color: #5d7a5d; color: white; text-decoration: none; border-radius: 4px; margin-top: 20px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>${isReport ? 'New Work Report Available' : 'New File Available'}</h2>
            </div>
            <div class="content">
              ${emailContent}
            </div>
            <div class="footer">
              <p>This is an automated notification from Green Power.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: isCustomerUpload
        ? `Hello,\n\nI have uploaded a new file to my project.\n\nCustomer Information:\n${customerName ? `Name: ${customerName}\n` : ''}${customerNumber ? `Customer Number: ${customerNumber}\n` : ''}${customerEmail ? `Email: ${customerEmail}\n` : ''}\nProject: ${projectName}\nFolder: ${folderName}\nFile Name: ${fileName}\n\nPlease review the uploaded file in the admin panel.\n\nThis email was sent from the Customer Portal.\n\n${process.env.ADMIN_PANEL_URL || 'http://localhost:3000'}`
        : isReport
        ? `A new work report has been uploaded for project ${projectName}.\n\nYour Login Information:\n${customerNumber ? `Customer Number: ${customerNumber}\n` : ''}${projectNumber ? `Project Number: ${projectNumber}\n` : ''}\nReport: ${fileName}\nFolder: ${folderName}\n\nPlease log in to your customer portal to review and approve it.\n\nPortal Link: ${PORTAL_URL}/login`
        : `A new file has been uploaded for project ${projectName}.\n\nYour Login Information:\n${customerNumber ? `Customer Number: ${customerNumber}\n` : ''}${projectNumber ? `Project Number: ${projectNumber}\n` : ''}\nFile: ${fileName}\nFolder: ${folderName}\n\nPlease log in to your customer portal to view it.\n\nPortal Link: ${PORTAL_URL}/login`,
    };

    console.log('[file-upload-notification] ========================================');
    console.log('[file-upload-notification] EMAIL DETAILS:');
    console.log('[file-upload-notification]   FROM:', mailOptions.from);
    if (replyTo) {
      console.log('[file-upload-notification]   REPLY-TO:', replyTo);
    }
    console.log('[file-upload-notification]   TO:', recipientEmail);
    console.log('[file-upload-notification]   TYPE:', recipientType.toUpperCase());
    if (isCustomerUpload && customerName) {
      console.log('[file-upload-notification]   CUSTOMER:', customerName, customerNumber ? `(${customerNumber})` : '');
    }
    console.log('[file-upload-notification]   SUBJECT:', subject);
    console.log('[file-upload-notification] ========================================');
    
    await transporter.sendMail(mailOptions);
    console.log('[file-upload-notification] ✅ Email sent successfully to:', recipientEmail);

    return withCors(NextResponse.json({ success: true }, { status: 200 }));
  } catch (error) {
    console.error('[file-upload-notification] Unexpected error:', error);
    // Do not expose error details to client
    return withCors(NextResponse.json({ success: false }, { status: 200 }));
  }
}

