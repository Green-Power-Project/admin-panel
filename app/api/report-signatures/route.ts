import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb, PDFImage, type PDFFont } from 'pdf-lib';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/server/firebaseAdmin';
import { getUploadRoot, resolveProjectFileAbsolute } from '@/lib/server/vpsStorage';
import { fileUrlFromFirestoreDoc } from '@/lib/fileDocFields';

export type StampResult = {
  stamped: boolean;
  reason?: string;
};

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

function isPathAllowedForStamp(absPath: string): boolean {
  const norm = path.normalize(absPath);
  const root = path.normalize(getUploadRoot());
  return norm === root || norm.startsWith(root + path.sep);
}

/** Firestore project file docs often omit `fileType`; derive from name like the customer app. */
function isPdfDocument(fileName: string, storedFileType: string): boolean {
  if (storedFileType === 'pdf') return true;
  return fileName.toLowerCase().endsWith('.pdf');
}

/** Resolve file metadata: `fileKey` is the full logical path; Firestore doc id is often only the last segment (customer uploads) or random (admin `addDoc`). */
async function getProjectFileDataForStamp(
  db: Firestore,
  projectId: string,
  folderPathId: string,
  fileKey: string
): Promise<Record<string, unknown> | null> {
  const filesColl = db
    .collection('files')
    .doc('projects')
    .collection(projectId)
    .doc(folderPathId)
    .collection('files');

  const byKey = await filesColl.where('fileKey', '==', fileKey).limit(1).get();
  if (!byKey.empty) {
    return (byKey.docs[0]!.data() as Record<string, unknown>) || {};
  }

  const docId = fileKey.split('/').filter(Boolean).pop() || fileKey;
  const direct = await filesColl.doc(docId).get();
  if (direct.exists) {
    return (direct.data() as Record<string, unknown>) || {};
  }

  const legacy = await filesColl.where('cloudinaryPublicId', '==', fileKey).limit(1).get();
  if (!legacy.empty) {
    return (legacy.docs[0]!.data() as Record<string, unknown>) || {};
  }

  return null;
}

/** Word-wrap to fit max width (PDF points) so each line can be drawn separately — avoids pdf-lib wrap + single lineGap overlap. */
function wrapTextToLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const t = text.trim();
  if (!t) return [];
  const words = t.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
      current = trial;
    } else {
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
      } else {
        let chunk = '';
        for (const ch of word) {
          const next = chunk + ch;
          if (font.widthOfTextAtSize(next, size) <= maxWidth) chunk = next;
          else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        current = chunk;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function stampPdfBuffer(
  pdfInput: Uint8Array | ArrayBuffer,
  opts: {
    fileName: string;
    signatoryName: string;
    addressText: string;
    gps?: { lat?: number; lng?: number };
    signedAt: Date;
    signatureDataUrl?: string;
  }
): Promise<Uint8Array> {
  const { signatoryName, addressText, gps, signedAt, signatureDataUrl } = opts;

  const pdfDoc = await PDFDocument.load(pdfInput);
  const pages = pdfDoc.getPages();
  if (pages.length === 0) {
    throw new Error('pdf_empty');
  }
  const page = pages[pages.length - 1];
  const { width } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let signatureImage: PDFImage | null = null;
  if (signatureDataUrl && typeof signatureDataUrl === 'string' && signatureDataUrl.startsWith('data:image/')) {
    const base64 = signatureDataUrl.split(',')[1];
    if (base64) {
      const imgBytes = Buffer.from(base64, 'base64');
      try {
        signatureImage = await pdfDoc.embedPng(imgBytes);
      } catch {
        // ignore invalid image
      }
    }
  }

  const margin = 32;
  const sigMaxW = 140;
  const sigH = signatureImage ? (signatureImage.height / signatureImage.width) * sigMaxW : 0;

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

  const nameSize = 9;
  const bodySize = 8;
  const sectionLabelSize = 7;
  const labelW = 220;
  const pad = 8;

  /** Section labels + values: Name → Date, time → Address (PDF bottom-left grows upward). */
  const LABEL_NAME = 'Name';
  const LABEL_DATETIME = 'Date, time';
  const LABEL_ADDRESS = 'Address';
  const labelMuted = rgb(0.42, 0.44, 0.48);
  const nameColor = rgb(0.12, 0.14, 0.18);
  const dateColor = rgb(0.35, 0.38, 0.42);
  const addrColor = rgb(0.1, 0.12, 0.16);

  const nameLines = wrapTextToLines(signatoryName.trim() || '—', font, nameSize, labelW);
  const dateLines = wrapTextToLines(signedAtStr, font, bodySize, labelW);
  const addrLines = locationText
    ? wrapTextToLines(locationText, font, bodySize, labelW)
    : wrapTextToLines('—', font, bodySize, labelW);

  type StampRow = { text: string; size: number; color: ReturnType<typeof rgb>; gapAfter: number };
  const rows: StampRow[] = [];

  rows.push({ text: LABEL_NAME, size: sectionLabelSize, color: labelMuted, gapAfter: 8 });
  for (const nl of nameLines) {
    rows.push({ text: nl, size: nameSize, color: nameColor, gapAfter: 12 });
  }
  rows.push({ text: LABEL_DATETIME, size: sectionLabelSize, color: labelMuted, gapAfter: 8 });
  for (const dl of dateLines) {
    rows.push({ text: dl, size: bodySize, color: dateColor, gapAfter: 12 });
  }
  rows.push({ text: LABEL_ADDRESS, size: sectionLabelSize, color: labelMuted, gapAfter: 8 });
  for (const al of addrLines) {
    rows.push({ text: al, size: bodySize, color: addrColor, gapAfter: 12 });
  }

  const textBlockH = rows.reduce((sum, r) => sum + r.gapAfter, 0) + 4;
  const totalH = Math.max(signatureImage ? sigH + pad * 2 : 0, textBlockH + pad * 2);
  const boxW = pad + labelW + pad + sigMaxW + pad;
  const boxX = width - margin - boxW;

  page.drawRectangle({
    x: boxX,
    y: margin,
    width: boxW,
    height: totalH,
    color: rgb(0.99, 0.99, 1),
    borderColor: rgb(0.78, 0.8, 0.85),
    borderWidth: 0.75,
    opacity: 0.95,
  });

  const textLeft = boxX + pad;
  const imgX = textLeft + labelW + pad;
  let textY = margin + pad;

  for (const row of rows) {
    if (row.text.trim()) {
      page.drawText(row.text, {
        x: textLeft,
        y: textY,
        size: row.size,
        font,
        color: row.color,
      });
    }
    textY += row.gapAfter;
  }

  if (signatureImage) {
    page.drawImage(signatureImage, {
      x: imgX,
      y: margin + pad,
      width: sigMaxW,
      height: sigH,
    });
  }

  return pdfDoc.save();
}

/**
 * Stamp signature + metadata on the bottom-right of the last page (no new page).
 * Stamp in place on local disk (VPS path).
 */
async function attachSignatureToPdf(params: {
  db: Firestore;
  projectId: string;
  folderPath: string;
  filePath: string;
  fileName: string;
  signatoryName: string;
  addressText: string;
  gps?: { lat?: number; lng?: number };
  signedAt: Date;
  signatureDataUrl?: string;
}): Promise<StampResult> {
  const {
    db,
    projectId,
    folderPath,
    filePath,
    fileName: paramFileName,
    signatoryName,
    addressText,
    gps,
    signedAt,
    signatureDataUrl,
  } = params;

  const stampOpts = {
    fileName: paramFileName,
    signatoryName,
    addressText,
    gps,
    signedAt,
    signatureDataUrl,
  };

  try {
    const folderPathId = getFolderPathId(folderPath);
    const fileData = await getProjectFileDataForStamp(db, projectId, folderPathId, filePath);
    if (!fileData) {
      console.warn('[report-signatures] File metadata not found for PDF stamping', { projectId, folderPath, filePath });
      return { stamped: false, reason: 'file_not_found' };
    }
    const storedName = typeof fileData.fileName === 'string' ? fileData.fileName : paramFileName;
    const storedFileType = typeof fileData.fileType === 'string' ? fileData.fileType : '';

    if (!isPdfDocument(storedName, storedFileType)) {
      console.warn('[report-signatures] Skipping PDF stamping (not a PDF)', {
        projectId,
        folderPath,
        filePath,
        storedFileType,
      });
      return { stamped: false, reason: 'not_pdf' };
    }

    const stampOptsResolved = { ...stampOpts, fileName: storedName || paramFileName };

    const storagePathRaw = typeof fileData.storagePath === 'string' ? fileData.storagePath : '';

    async function stampAtAbsolute(resolved: string): Promise<StampResult> {
      if (!isPathAllowedForStamp(resolved)) {
        console.warn('[report-signatures] Storage path not allowed', { resolved });
        return { stamped: false, reason: 'vps_path_invalid' };
      }
      try {
        const pdfBuf = await readFile(resolved);
        const stampedBytes = await stampPdfBuffer(pdfBuf, stampOptsResolved);
        await writeFile(resolved, Buffer.from(stampedBytes));
        console.log('[report-signatures] PDF stamped (local)', { projectId, filePath });
        return { stamped: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[report-signatures] Local stamp failed:', e);
        if (/pdf_empty/i.test(msg)) return { stamped: false, reason: 'pdf_empty' };
        return { stamped: false, reason: /ENOENT/i.test(msg) ? 'vps_read_failed' : 'vps_write_failed' };
      }
    }

    if (storagePathRaw) {
      return await stampAtAbsolute(path.resolve(storagePathRaw));
    }

    const resolvedByKey = await resolveProjectFileAbsolute(filePath, storedName);
    if (resolvedByKey) {
      return await stampAtAbsolute(resolvedByKey);
    }

    const fileUrl = fileUrlFromFirestoreDoc(fileData as Record<string, unknown>);
    if (fileUrl.startsWith('/')) {
      const abs = path.join(process.cwd(), 'public', fileUrl.replace(/^\//, ''));
      return await stampAtAbsolute(abs);
    }

    if (fileUrl.startsWith('http')) {
      console.warn('[report-signatures] Remote-only file (e.g. legacy CDN); cannot stamp in place', { projectId, filePath });
      return { stamped: false, reason: 'not_local_file' };
    }

    console.warn('[report-signatures] No local file for PDF stamping', { projectId, filePath });
    return { stamped: false, reason: 'no_source' };
  } catch (err) {
    console.error('[report-signatures] attachSignatureToPdf:', err);
    return { stamped: false, reason: 'stamp_error' };
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
      return withCors(NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 }));
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

    const createdAt = doc.createdAt as Date;
    await db.collection('reportSignatures').add(doc);

    const stampResult = await attachSignatureToPdf({
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
    });

    return withCors(
      NextResponse.json(
        {
          success: true,
          stamped: stampResult.stamped,
          stampReason: stampResult.reason,
        },
        { status: 200 }
      )
    );
  } catch (error) {
    console.error('[report-signatures] Error:', error);
    return withCors(NextResponse.json({ success: false, error: 'Server error' }, { status: 200 }));
  }
}
