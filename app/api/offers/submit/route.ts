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
   thickness?: string;
   length?: string;
   width?: string;
   height?: string;
   note?: string;
   photoUrls?: string[];
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
    const photoUrlsRaw = item.photoUrls;
    const photoUrls =
      Array.isArray(photoUrlsRaw)
        ? photoUrlsRaw
            .filter((v): v is string => typeof v === 'string')
            .map((v) => v.trim())
            .filter((v) => v.length > 0)
        : undefined;

    validItems.push({
      imageId: item.imageId as string,
      imageUrl: item.imageUrl as string,
      itemName: item.itemName as string,
      color: typeof item.color === 'string' ? (item.color as string) : '',
      quantityMeters: typeof item.quantityMeters === 'string' ? (item.quantityMeters as string) : undefined,
      quantityPieces: typeof item.quantityPieces === 'string' ? (item.quantityPieces as string) : undefined,
      thickness: typeof item.thickness === 'string' ? (item.thickness as string) : undefined,
      length: typeof item.length === 'string' ? (item.length as string) : undefined,
      width: typeof item.width === 'string' ? (item.width as string) : undefined,
      height: typeof item.height === 'string' ? (item.height as string) : undefined,
      note: typeof item.note === 'string' ? (item.note as string) : undefined,
      photoUrls,
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

    // Firestore does not accept undefined; strip undefined from items
    const itemsForFirestore = payload.items.map((item) => {
      const rec: Record<string, unknown> = {
        imageId: item.imageId,
        imageUrl: item.imageUrl,
        itemName: item.itemName,
        color: item.color,
      };
      if (item.quantityMeters !== undefined) rec.quantityMeters = item.quantityMeters;
      if (item.quantityPieces !== undefined) rec.quantityPieces = item.quantityPieces;
      if (item.thickness !== undefined) rec.thickness = item.thickness;
      if (item.length !== undefined) rec.length = item.length;
      if (item.width !== undefined) rec.width = item.width;
      if (item.height !== undefined) rec.height = item.height;
      if (item.note !== undefined) rec.note = item.note;
      if (item.photoUrls !== undefined && item.photoUrls.length > 0) rec.photoUrls = item.photoUrls;
      return rec;
    });

    const docRef = await db.collection('offerRequests').add({
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      mobile: payload.mobile,
      address: payload.address,
      items: itemsForFirestore,
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
        .map((i, idx) => {
          const parts: string[] = [];
          parts.push(`${idx + 1}. ${i.itemName}`);
          parts.push(`Color: ${i.color || '-'}`);
          if (i.thickness) parts.push(`Thickness: ${i.thickness}`);
          if (i.length) parts.push(`Length: ${i.length}`);
          if (i.width) parts.push(`Width: ${i.width}`);
          if (i.height) parts.push(`Height: ${i.height}`);
          if (i.quantityMeters) parts.push(`Meters: ${i.quantityMeters}`);
          if (i.quantityPieces) parts.push(`Pieces: ${i.quantityPieces}`);
          if (i.note) parts.push(`Note: ${i.note}`);
          if (i.photoUrls && i.photoUrls.length) parts.push(`Photos: ${i.photoUrls.join(', ')}`);
          return parts.join(' | ');
        })
        .join('\n');

      // Simple HTML table for items (no image or image links)
      const itemsRowsHtml = payload.items
        .map(
          (i, idx) => `
            <tr>
              <td style="padding: 6px 8px; border-bottom: 1px solid #eeeeee; vertical-align: top;">${idx + 1}</td>
              <td style="padding: 6px 8px; border-bottom: 1px solid #eeeeee; vertical-align: top;">
                <div><strong>${i.itemName}</strong></div>
                <div style="margin-top: 4px; font-size: 12px; color: #4b5563;">
                  <div><strong>Color:</strong> ${i.color || '-'}</div>
                  ${
                    i.thickness || i.length || i.width || i.height
                      ? `<div><strong>Specs:</strong>
                          ${i.thickness ? ` Thickness: ${i.thickness};` : ''}
                          ${i.length ? ` Length: ${i.length};` : ''}
                          ${i.width ? ` Width: ${i.width};` : ''}
                          ${i.height ? ` Height: ${i.height};` : ''}
                        </div>`
                      : ''
                  }
                  ${
                    i.quantityMeters || i.quantityPieces
                      ? `<div><strong>Requested:</strong>
                          ${i.quantityMeters ? ` ${i.quantityMeters} m;` : ''}
                          ${i.quantityPieces ? ` ${i.quantityPieces} pcs;` : ''}
                        </div>`
                      : ''
                  }
                  ${i.note ? `<div><strong>Note:</strong> ${i.note}</div>` : ''}
                  ${
                    i.photoUrls && i.photoUrls.length
                      ? `<div style="margin-top: 4px;"><strong>Photos:</strong> ${
                          i.photoUrls
                            .map(
                              (url, photoIdx) =>
                                `<a href="${url}" target="_blank" rel="noopener noreferrer">Photo ${photoIdx + 1}</a>`,
                            )
                            .join(' · ')
                        }</div>`
                      : ''
                  }
                </div>
              </td>
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
                      <th>Item & details</th>
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

