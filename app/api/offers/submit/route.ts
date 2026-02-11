import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getAdminDb } from '@/lib/server/firebaseAdmin';
import { buildEmailLogoHtml } from '@/lib/emailSignature';

export interface OfferRequestItem {
  imageId: string;
  imageUrl: string;
  itemName: string;
  color: string;
  quantityMeters?: string;
  quantityPieces?: string;
}

export interface OfferSubmitPayload {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  address: string;
  items: OfferRequestItem[];
}

function validatePayload(body: unknown): OfferSubmitPayload | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  const firstName = b.firstName;
  const lastName = b.lastName;
  const email = b.email;
  const mobile = b.mobile;
  const address = b.address;
  const items = b.items;

  if (typeof firstName !== 'string' || !firstName.trim()) return null;
  if (typeof lastName !== 'string' || !lastName.trim()) return null;
  if (typeof email !== 'string' || !email.trim()) return null;
  if (typeof mobile !== 'string' || !mobile.trim()) return null;
  if (typeof address !== 'string' || !address.trim()) return null;
  if (!Array.isArray(items) || items.length === 0) return null;

  const validItems: OfferRequestItem[] = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const item = it as Record<string, unknown>;
    if (
      typeof item.imageId !== 'string' ||
      typeof item.imageUrl !== 'string' ||
      typeof item.itemName !== 'string'
    )
      continue;
    validItems.push({
      imageId: item.imageId as string,
      imageUrl: item.imageUrl as string,
      itemName: item.itemName as string,
      color: typeof item.color === 'string' ? (item.color as string) : '',
      quantityMeters: typeof item.quantityMeters === 'string' ? (item.quantityMeters as string) : undefined,
      quantityPieces: typeof item.quantityPieces === 'string' ? (item.quantityPieces as string) : undefined,
    });
  }
  if (validItems.length === 0) return null;

  return {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim(),
    mobile: mobile.trim(),
    address: address.trim(),
    items: validItems,
  };
}

function withCors(res: NextResponse) {
  const origin = (process.env.NEXT_PUBLIC_CUSTOMER_APP_ORIGIN || 'http://localhost:3000').trim();
  res.headers.set('Access-Control-Allow-Origin', origin);
  res.headers.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return res;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    const db = getAdminDb();
    if (!db) {
      return withCors(NextResponse.json({ success: false, error: 'Service unavailable' }, { status: 503 }));
    }

    const body = await request.json().catch(() => null);
    const payload = validatePayload(body);
    if (!payload) {
      return withCors(NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 }));
    }

    const docRef = await db.collection('offerRequests').add({
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      mobile: payload.mobile,
      address: payload.address,
      items: payload.items,
      createdAt: new Date(),
    });

    const adminSnapshot = await db.collection('admins').get();
    const adminEmails: string[] = [];
    adminSnapshot.forEach((doc) => {
      const email = (doc.data() as any).email;
      if (email) adminEmails.push(email);
    });

    const EMAIL_USER = process.env.EMAIL_USER;
    const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;

    if (adminEmails.length > 0 && EMAIL_USER && EMAIL_PASSWORD) {
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: { user: EMAIL_USER, pass: EMAIL_PASSWORD },
      } as any);

      // Basic text summary of requested items (no image links)
      const itemsText = payload.items
        .map(
          (i, idx) =>
            `${idx + 1}. ${i.itemName} | Color: ${i.color || '-'}${i.quantityMeters ? ` | Meters: ${i.quantityMeters}` : ''}${
              i.quantityPieces ? ` | Pieces: ${i.quantityPieces}` : ''
            }`,
        )
        .join('\n');

      // Simple HTML table for items (no image or image links)
      const itemsRowsHtml = payload.items
        .map(
          (i, idx) => `
            <tr>
              <td style="padding: 6px 8px; border-bottom: 1px solid #eeeeee;">${idx + 1}</td>
              <td style="padding: 6px 8px; border-bottom: 1px solid #eeeeee;">${i.itemName}</td>
              <td style="padding: 6px 8px; border-bottom: 1px solid #eeeeee;">${i.color || '-'}</td>
              <td style="padding: 6px 8px; border-bottom: 1px solid #eeeeee;">${i.quantityMeters || '-'}</td>
              <td style="padding: 6px 8px; border-bottom: 1px solid #eeeeee;">${i.quantityPieces || '-'}</td>
            </tr>`,
        )
        .join('');

      const adminPanelBase = (process.env.NEXT_PUBLIC_ADMIN_PANEL_URL || '').trim();
      const offersUrl = adminPanelBase ? `${adminPanelBase.replace(/\/+$/, '')}/offers` : '';

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body { font-family: Arial, sans-serif; color: #1a1a1a; background-color: #f3f4f6; }
              .container { max-width: 640px; margin: 0 auto; padding: 16px; }
              .card {
                background: #ffffff;
                border-radius: 12px;
                padding: 20px 22px;
                box-shadow: 0 6px 18px rgba(0, 0, 0, 0.06);
              }
              h2 { margin: 0 0 8px; font-size: 20px; }
              p { margin: 4px 0; font-size: 14px; }
              .section-title { margin-top: 18px; margin-bottom: 6px; font-size: 15px; font-weight: 600; }
              table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 4px; }
              th {
                padding: 6px 8px;
                background: #f5f5f5;
                border-bottom: 1px solid #e5e7eb;
                text-align: left;
                font-weight: 600;
              }
              .meta { margin-top: 16px; font-size: 12px; color: #6b7280; }
              .link-button {
                display: inline-block;
                margin-top: 14px;
                padding: 8px 14px;
                border-radius: 999px;
                background: #16a34a;
                color: #ffffff !important;
                text-decoration: none;
                font-size: 13px;
                font-weight: 600;
              }
            </style>
          </head>
          <body>
            <div class="container">
              ${buildEmailLogoHtml()}
              <div class="card">
                <h2>New offer request</h2>
                <p><strong>Customer:</strong> ${payload.firstName} ${payload.lastName}</p>
                <p><strong>Email:</strong> ${payload.email}</p>
                <p><strong>Mobile:</strong> ${payload.mobile}</p>
                <p><strong>Address:</strong> ${payload.address}</p>

                <div class="section-title">Requested items</div>
                <table>
                  <thead>
                    <tr>
                      <th style="width: 40px;">#</th>
                      <th>Item</th>
                      <th style="width: 120px;">Color</th>
                      <th style="width: 90px;">Meters</th>
                      <th style="width: 90px;">Pieces</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemsRowsHtml}
                  </tbody>
                </table>

                ${
                  offersUrl
                    ? `<a class="link-button" href="${offersUrl}" target="_blank" rel="noopener noreferrer">
                        Open in admin panel
                       </a>`
                    : ''
                }

                <p class="meta">Request ID: ${docRef.id}</p>
              </div>
            </div>
          </body>
        </html>
      `;

      await transporter.sendMail({
        from: `Grün Power <${EMAIL_USER}>`,
        to: adminEmails,
        subject: `Offer request from ${payload.firstName} ${payload.lastName}`,
        html,
        text: `New offer request

Customer: ${payload.firstName} ${payload.lastName}
Email: ${payload.email}
Mobile: ${payload.mobile}
Address: ${payload.address}

Items:
${itemsText}

${offersUrl ? `Admin panel: ${offersUrl}\n\n` : ''}Request ID: ${docRef.id}`,
      });
    }

    return withCors(NextResponse.json({ success: true, id: docRef.id }));
  } catch (error) {
    console.error('[offers/submit] Error:', error);
    return withCors(NextResponse.json({ success: false, error: 'Server error' }, { status: 500 }));
  }
}

