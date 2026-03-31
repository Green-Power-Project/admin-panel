import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getAdminDb } from '@/lib/server/firebaseAdmin';

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

function withCors(response: NextResponse) {
  const allowedOrigin = (process.env.NEXT_PUBLIC_CUSTOMER_APP_ORIGIN || 'http://localhost:3001').trim();
  response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
  response.headers.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  return response;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

function getFolderPathId(folderPath: string): string {
  return folderPath
    .split('/')
    .filter(Boolean)
    .join('__');
}

function getCloudinaryAuthHeader() {
  if (!API_KEY || !API_SECRET) return null;
  return `Basic ${Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64')}`;
}

async function attachSignatureToPdf(params: {
  db: FirebaseFirestore.Firestore;
  projectId: string;
  folderPath: string;
  filePath: string;
  fileName: string;
  signatoryName: string;
  addressText: string;
  gps?: { lat?: number; lng?: number };
  signedAt: Date;
  signatureDataUrl?: string;
}) {
  try {
    const { db, projectId, folderPath, filePath, fileName, signatoryName, addressText, gps, signedAt, signatureDataUrl } =
      params;

    if (!CLOUD_NAME) {
      console.warn('[report-signatures] Cloudinary not configured, skipping PDF stamping');
      return;
    }
    const authHeader = getCloudinaryAuthHeader();
    if (!authHeader) {
      console.warn('[report-signatures] Cloudinary credentials missing, skipping PDF stamping');
      return;
    }

    const folderPathId = getFolderPathId(folderPath);
    const fileRef = db
      .collection('files')
      .doc('projects')
      .collection(projectId)
      .doc(folderPathId)
      .collection('files')
      .doc(filePath);

    const fileSnap = await fileRef.get();
    if (!fileSnap.exists) {
      console.warn('[report-signatures] File metadata not found for PDF stamping', {
        projectId,
        folderPath,
        filePath,
      });
      return;
    }

    const fileData = fileSnap.data() || {};
    const cloudinaryUrl = typeof fileData.cloudinaryUrl === 'string' ? fileData.cloudinaryUrl : '';
    const fileType = typeof fileData.fileType === 'string' ? fileData.fileType : '';
    if (!cloudinaryUrl || fileType !== 'pdf') {
      console.warn('[report-signatures] Skipping PDF stamping (no cloudinaryUrl or not a PDF)', {
        projectId,
        folderPath,
        filePath,
        fileType,
      });
      return;
    }

    // Download original PDF
    const originalRes = await fetch(cloudinaryUrl);
    if (!originalRes.ok) {
      console.warn('[report-signatures] Failed to download original PDF for stamping', {
        status: originalRes.status,
        statusText: originalRes.statusText,
      });
      return;
    }
    const originalBytes = await originalRes.arrayBuffer();

    const pdfDoc = await PDFDocument.load(originalBytes);
    const pages = pdfDoc.getPages();
    if (pages.length === 0) {
      console.warn('[report-signatures] PDF has no pages, skipping stamping');
      return;
    }
    const lastPage = pages[pages.length - 1];
    const { width, height } = lastPage.getSize();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Decode signature image if supplied
    let signatureImage: any = null;
    if (signatureDataUrl && typeof signatureDataUrl === 'string' && signatureDataUrl.startsWith('data:image/')) {
      const base64 = signatureDataUrl.split(',')[1];
      if (base64) {
        const imgBytes = Buffer.from(base64, 'base64');
        signatureImage = await pdfDoc.embedPng(imgBytes);
      }
    }

    const margin = 40;
    const boxHeight = 140;
    const boxWidth = width - margin * 2;
    const startY = margin + boxHeight;

    // Draw a light box at the bottom of the last page
    lastPage.drawRectangle({
      x: margin,
      y: margin,
      width: boxWidth,
      height: boxHeight,
      color: rgb(0.96, 0.97, 0.99),
      borderColor: rgb(0.75, 0.78, 0.85),
      borderWidth: 1,
    });

    const textSize = 10;
    const labelSize = 9;

    const signedAtStr = signedAt.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const locationText =
      (addressText && addressText.trim()) ||
      (gps && typeof gps.lat === 'number' && typeof gps.lng === 'number'
        ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`
        : '');

    let cursorY = startY - 16;
    const drawLabelAndValue = (label: string, value: string) => {
      if (!value) return;
      lastPage.drawText(label, {
        x: margin + 10,
        y: cursorY,
        size: labelSize,
        font,
        color: rgb(0.35, 0.4, 0.5),
      });
      lastPage.drawText(value, {
        x: margin + 90,
        y: cursorY,
        size: textSize,
        font,
        color: rgb(0.15, 0.18, 0.24),
      });
      cursorY -= 14;
    };

    drawLabelAndValue('Bericht:', fileName || filePath);
    drawLabelAndValue('Name des Unterzeichners:', signatoryName);
    drawLabelAndValue('Datum / Uhrzeit:', signedAtStr);
    if (locationText) {
      drawLabelAndValue('Ort:', locationText);
    }

    if (signatureImage) {
      const sigWidth = 180;
      const sigHeight = (signatureImage.height / signatureImage.width) * sigWidth;
      lastPage.drawText('Unterschrift:', {
        x: margin + 10,
        y: margin + 50 + sigHeight,
        size: labelSize,
        font,
        color: rgb(0.35, 0.4, 0.5),
      });
      lastPage.drawImage(signatureImage, {
        x: margin + 90,
        y: margin + 40,
        width: sigWidth,
        height: sigHeight,
      });
    }

    const stampedBytes = await pdfDoc.save();
    const stampedBase64 = Buffer.from(stampedBytes).toString('base64');

    // Upload back to Cloudinary using same public_id (overwrite)
    const uploadForm = new FormData();
    uploadForm.append('file', `data:application/pdf;base64,${stampedBase64}`);
    uploadForm.append('resource_type', 'raw');
    uploadForm.append('public_id', filePath);
    uploadForm.append('overwrite', 'true');

    const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/upload`;
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
      } as HeadersInit,
      body: uploadForm,
    });

    if (!uploadRes.ok) {
      const errorText = await uploadRes.text().catch(() => '');
      console.error('[report-signatures] Cloudinary upload (signed PDF) failed:', errorText);
      return;
    }

    console.log('[report-signatures] Signed PDF successfully stamped and uploaded for', {
      projectId,
      folderPath,
      filePath,
    });
  } catch (err) {
    console.error('[report-signatures] Failed to attach signature to PDF:', err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getAdminDb();
    if (!db) {
      return withCors(
        NextResponse.json({ success: false, skipped: true, reason: 'admin_db_unavailable' }, { status: 200 })
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return withCors(NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 }));
    }

    const {
      projectId,
      folderPath,
      filePath,
      fileName,
      customerId,
      signatoryName,
      addressText,
      gps,
      signatureDataUrl,
    } = body as Record<string, unknown>;

    if (
      typeof projectId !== 'string' ||
      !projectId ||
      typeof folderPath !== 'string' ||
      !folderPath ||
      typeof filePath !== 'string' ||
      !filePath ||
      typeof signatoryName !== 'string' ||
      !signatoryName.trim()
    ) {
      return withCors(
        NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
      );
    }

    const doc: Record<string, unknown> = {
      projectId,
      folderPath,
      filePath,
      fileName: typeof fileName === 'string' ? fileName : '',
      customerId: typeof customerId === 'string' ? customerId : null,
      signatoryName: signatoryName.trim(),
      addressText: typeof addressText === 'string' ? addressText.trim() : '',
      createdAt: new Date(),
    };

    if (gps && typeof gps === 'object') {
      const g = gps as { lat?: number; lng?: number; accuracy?: number };
      if (typeof g.lat === 'number' && typeof g.lng === 'number') {
        doc.gps = {
          lat: g.lat,
          lng: g.lng,
          accuracy: typeof g.accuracy === 'number' ? g.accuracy : null,
        };
      }
    }

    if (typeof signatureDataUrl === 'string' && signatureDataUrl.startsWith('data:image/')) {
      doc.signatureDataUrl = signatureDataUrl;
    }

    const createdAt = new Date();
    doc.createdAt = createdAt;

    await db.collection('reportSignatures').add(doc);

    // Best-effort: stamp the signature onto the last page of the PDF
    attachSignatureToPdf({
      db,
      projectId,
      folderPath,
      filePath,
      fileName: typeof fileName === 'string' ? fileName : '',
      signatoryName: signatoryName.trim(),
      addressText: typeof addressText === 'string' ? addressText.trim() : '',
      gps: gps && typeof gps === 'object' ? (gps as { lat?: number; lng?: number }) : undefined,
      signedAt: createdAt,
      signatureDataUrl: typeof signatureDataUrl === 'string' ? signatureDataUrl : undefined,
    }).catch((e) => {
      console.error('[report-signatures] Error while stamping PDF (non-fatal):', e);
    });

    return withCors(NextResponse.json({ success: true }, { status: 200 }));
  } catch (error) {
    console.error('[report-signatures] Error:', error);
    return withCors(
      NextResponse.json({ success: false, error: 'Server error' }, { status: 200 })
    );
  }
}

