import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getAdminDb } from '@/lib/server/firebaseAdmin';
import { buildEmailLogoHtml } from '@/lib/emailSignature';
import { generateOfferPdfBuffer } from '@/lib/offerPdf';

export interface OfferRequestItem {
  itemType?: 'gallery' | 'folder' | 'catalogue';
  imageId?: string;
  offerItemId?: string;
  imageUrl: string;
  itemName: string;
  color: string;
  quantityMeters?: string;
  quantityPieces?: string;
  dimension?: string;
  note?: string;
  photoUrls?: string[];
  price?: string;
}

export interface OfferSubmitPayload {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  address: string;
  projectNote?: string;
  projectPhotoUrls?: string[];
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
  const projectNote = b.projectNote;
  const projectPhotoUrlsRaw = b.projectPhotoUrls;
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
    const rawType = item.itemType;
    const itemType: 'gallery' | 'folder' | 'catalogue' =
      rawType === 'folder' ? 'folder' : rawType === 'catalogue' ? 'catalogue' : 'gallery';
    const hasImageId = typeof item.imageId === 'string' && item.imageId.trim();
    const hasOfferItemId = typeof item.offerItemId === 'string' && item.offerItemId.trim();
    if (typeof item.itemName !== 'string' || !item.itemName.trim()) continue;
    if (itemType === 'folder' && !hasOfferItemId) continue;
    if (itemType === 'gallery' && !hasImageId) continue;
    const photoUrlsRaw = item.photoUrls;
    const photoUrls =
      Array.isArray(photoUrlsRaw)
        ? photoUrlsRaw
            .filter((v): v is string => typeof v === 'string')
            .map((v) => v.trim())
            .filter((v) => v.length > 0)
        : undefined;

    validItems.push({
      itemType,
      imageId: hasImageId ? (item.imageId as string) : undefined,
      offerItemId: hasOfferItemId ? (item.offerItemId as string) : undefined,
      imageUrl: typeof item.imageUrl === 'string' ? (item.imageUrl as string) : '',
      itemName: item.itemName as string,
      color: typeof item.color === 'string' ? (item.color as string) : '',
      quantityMeters: typeof item.quantityMeters === 'string' ? (item.quantityMeters as string) : undefined,
      quantityPieces: typeof item.quantityPieces === 'string' ? (item.quantityPieces as string) : undefined,
      dimension: typeof item.dimension === 'string' ? (item.dimension as string) : undefined,
      note: typeof item.note === 'string' ? (item.note as string) : undefined,
      photoUrls,
      price: typeof item.price === 'string' && item.price.trim() ? (item.price as string).trim() : undefined,
    });
  }
  if (validItems.length === 0) return null;

  const projectPhotoUrls =
    Array.isArray(projectPhotoUrlsRaw)
      ? projectPhotoUrlsRaw
          .filter((v): v is string => typeof v === 'string')
          .map((v) => v.trim())
          .filter((v) => v.length > 0)
      : undefined;

  return {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim(),
    mobile: mobile.trim(),
    address: address.trim(),
    projectNote: typeof projectNote === 'string' && projectNote.trim() ? projectNote.trim() : undefined,
    projectPhotoUrls: projectPhotoUrls?.length ? projectPhotoUrls : undefined,
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
        itemType: item.itemType ?? 'gallery',
        imageUrl: item.imageUrl ?? '',
        itemName: item.itemName,
        color: item.color ?? '',
      };
      if (item.imageId) rec.imageId = item.imageId;
      if (item.offerItemId) rec.offerItemId = item.offerItemId;
      if (item.quantityMeters !== undefined) rec.quantityMeters = item.quantityMeters;
      if (item.quantityPieces !== undefined) rec.quantityPieces = item.quantityPieces;
      if (item.dimension !== undefined) rec.dimension = item.dimension;
      if (item.note !== undefined) rec.note = item.note;
      if (item.photoUrls !== undefined && item.photoUrls.length > 0) rec.photoUrls = item.photoUrls;
      if (item.price !== undefined && item.price.trim()) rec.price = item.price.trim();
      return rec;
    });

    const docData: Record<string, unknown> = {
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      mobile: payload.mobile,
      address: payload.address,
      items: itemsForFirestore,
      createdAt: new Date(),
    };
    if (payload.projectNote !== undefined) docData.projectNote = payload.projectNote;
    if (payload.projectPhotoUrls !== undefined && payload.projectPhotoUrls.length > 0) docData.projectPhotoUrls = payload.projectPhotoUrls;
    const docRef = await db.collection('offerRequests').add(docData);

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

      const pdfBuffer =       generateOfferPdfBuffer({
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        address: payload.address,
        projectNote: payload.projectNote,
        projectPhotoUrls: payload.projectPhotoUrls,
        items: payload.items.map((it) => ({
          itemName: it.itemName,
          color: it.color,
          dimension: it.dimension,
          quantityMeters: it.quantityMeters,
          quantityPieces: it.quantityPieces,
          note: it.note,
          imageUrl: it.imageUrl,
          photoUrls: it.photoUrls,
          price: it.price,
        })),
        createdAt: new Date().toISOString(),
      });

      const adminPanelBase = (process.env.NEXT_PUBLIC_ADMIN_PANEL_URL || '').trim();
      const offersUrl = adminPanelBase ? `${adminPanelBase.replace(/\/+$/, '')}/offers` : '';

      const html = `
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8" /></head>
          <body style="font-family: Arial, sans-serif; color: #1a1a1a; background-color: #f3f4f6; margin: 0; padding: 16px;">
            <div style="max-width: 560px; margin: 0 auto;">
              ${buildEmailLogoHtml()}
              <div style="background: #ffffff; border-radius: 12px; padding: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
                <h2 style="margin: 0 0 8px; font-size: 18px;">Neue Angebotsanfrage</h2>
                <p style="margin: 0 0 12px; font-size: 14px; color: #4b5563;">Die Details der Anfrage finden Sie in der angehängten PDF-Datei (Deutsch, Querformat).</p>
                <p style="margin: 0 0 8px; font-size: 14px;"><strong>Kunde:</strong> ${payload.firstName} ${payload.lastName}</p>
                <p style="margin: 0 0 8px; font-size: 14px;"><strong>E-Mail:</strong> ${payload.email}</p>
                ${offersUrl ? `<p style="margin-top: 16px;"><a href="${offersUrl}" style="display: inline-block; padding: 8px 16px; border-radius: 8px; background: #16a34a; color: #ffffff; text-decoration: none; font-weight: 600;">Im Admin-Bereich öffnen</a></p>` : ''}
                <p style="margin-top: 16px; font-size: 12px; color: #6b7280;">Anfrage-ID: ${docRef.id}</p>
              </div>
            </div>
          </body>
        </html>
      `;

      const text = `Neue Angebotsanfrage\n\nKunde: ${payload.firstName} ${payload.lastName}\nE-Mail: ${payload.email}\n\nDie vollständigen Details finden Sie in der angehängten PDF-Datei.\n\n${offersUrl ? `Admin-Bereich: ${offersUrl}\n\n` : ''}Anfrage-ID: ${docRef.id}`;

      await transporter.sendMail({
        from: `Grün Power <${EMAIL_USER}>`,
        to: adminEmails,
        subject: `Neue Angebotsanfrage von ${payload.firstName} ${payload.lastName}`,
        html,
        text,
        attachments: [
          {
            filename: `Angebotsanfrage-${payload.firstName}-${payload.lastName}-${docRef.id}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      } as any);
    }

    return withCors(NextResponse.json({ success: true, id: docRef.id }));
  } catch (error) {
    console.error('[offers/submit] Error:', error);
    return withCors(NextResponse.json({ success: false, error: 'Server error' }, { status: 500 }));
  }
}

