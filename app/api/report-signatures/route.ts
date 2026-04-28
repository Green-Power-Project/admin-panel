import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFImage,
  type PDFFont,
  pushGraphicsState,
  popGraphicsState,
  translate,
  rotateRadians,
  reduceRotation,
  adjustDimsForRotation,
  degreesToRadians,
} from 'pdf-lib';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/server/firebaseAdmin';
import {
  absolutePathFromPublicFileUrl,
  getUploadRoot,
  resolveProjectFileAbsolute,
} from '@/lib/server/vpsStorage';
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

/** Must match `projects.signConsentReportFull` in window-app `locales/de/common.json`. */
const STAMP_CONFIRMATION_TEXT =
  'Ich bestätige, dass ich alle Seiten des Berichts gelesen und geprüft habe.';

/** Basic IANA zone guard so request bodies cannot inject odd strings into Intl. */
function isSafeIanaTimeZone(z: string): boolean {
  if (z.length < 2 || z.length > 80) return false;
  if (!/^[A-Za-z0-9_/+-]+$/.test(z)) return false;
  if (z.includes('..') || z.startsWith('/') || z.endsWith('/')) return false;
  return true;
}

/**
 * Same instant as `signedAt`, shown in the signer's local zone (from the device) so the PDF
 * matches the phone status bar. Falls back to Europe/Berlin if the zone is missing or invalid.
 */
function formatSignedAtDe(signedAt: Date, displayTimeZone?: string): string {
  const tz =
    typeof displayTimeZone === 'string' && isSafeIanaTimeZone(displayTimeZone.trim())
      ? displayTimeZone.trim()
      : 'Europe/Berlin';
  const opts: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: tz,
  };
  try {
    return signedAt.toLocaleString('de-DE', opts);
  } catch {
    return signedAt.toLocaleString('de-DE', { ...opts, timeZone: 'Europe/Berlin' });
  }
}

type StampTextRow = {
  text: string;
  size: number;
  color: ReturnType<typeof rgb>;
  gapAfter: number;
  bold?: boolean;
};

function truncateLinesWithEllipsis(lines: string[], maxLines: number): string[] {
  if (maxLines <= 0) return [];
  if (lines.length <= maxLines) return lines;
  const clipped = lines.slice(0, maxLines);
  const last = clipped[maxLines - 1] ?? '';
  clipped[maxLines - 1] = last.endsWith('...') ? last : `${last}...`;
  return clipped;
}

/**
 * Lower-left corner of the stamp box in **default user space** so it lands on the
 * viewer's bottom-right after the page's `/Rotate` is applied (0, 90, 180, 270).
 * Without this, stamps drawn at (width-margin, margin) appear top-right or sideways on rotated pages.
 */
function stampBoxLowerLeftInUserSpace(
  mediaW: number,
  mediaH: number,
  pageRotation: ReturnType<typeof reduceRotation>,
  margin: number,
  boxW: number,
  totalH: number
): { boxX: number; boxY: number } {
  switch (pageRotation) {
    case 0:
      return { boxX: mediaW - margin - boxW, boxY: margin };
    case 90:
      return { boxX: margin, boxY: margin };
    case 180:
      return { boxX: margin, boxY: mediaH - margin - totalH };
    case 270:
      return { boxX: mediaW - margin - boxW, boxY: mediaH - margin - totalH };
    default:
      return { boxX: mediaW - margin - boxW, boxY: margin };
  }
}

async function stampPdfBuffer(
  pdfInput: Uint8Array | ArrayBuffer,
  opts: {
    signRole: 'client' | 'representative';
    signatoryName: string;
    placeText: string;
    signedAt: Date;
    /** Browser `Intl.DateTimeFormat().resolvedOptions().timeZone` — PDF clock matches device status bar. */
    displayTimeZone?: string;
    signatureDataUrl?: string;
  }
): Promise<Uint8Array> {
  const { signatoryName, placeText, signedAt, signatureDataUrl, signRole, displayTimeZone } = opts;

  const pdfDoc = await PDFDocument.load(pdfInput);
  const pages = pdfDoc.getPages();
  if (pages.length === 0) {
    throw new Error('pdf_empty');
  }
  const page = pages[pages.length - 1];
  const { width: mediaW, height: mediaH } = page.getSize();
  const pageRotation = reduceRotation(page.getRotation().angle);
  const eff = adjustDimsForRotation({ width: mediaW, height: mediaH }, pageRotation);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

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
  const pad = 10;
  const colW = Math.min(280, eff.width - margin * 2 - 24);
  const sigSideInset = 10;
  const sigTopBottomInset = 4;
  const sigBoxMaxW = Math.min(138, Math.max(80, colW - sigSideInset * 2));
  const sigBoxMaxH = 54;
  let sigDrawW = 0;
  let sigDrawH = 0;
  if (signatureImage) {
    const w = Math.max(1, signatureImage.width);
    const h = Math.max(1, signatureImage.height);
    // contain-fit: preserve aspect ratio inside the signature box, no clipping.
    const scale = Math.min(sigBoxMaxW / w, sigBoxMaxH / h);
    sigDrawW = Math.max(1, Math.floor(w * scale));
    sigDrawH = Math.max(1, Math.floor(h * scale));
  }
  const maxStampHeight = eff.height - margin * 2 - 40;
  if (signatureImage && sigDrawH > maxStampHeight * 0.22) {
    const shrink = (maxStampHeight * 0.22) / sigDrawH;
    sigDrawW = Math.max(1, Math.floor(sigDrawW * shrink));
    sigDrawH = Math.max(1, Math.floor(sigDrawH * shrink));
  }

  const signedAtStr = formatSignedAtDe(signedAt, displayTimeZone);

  const bodySize = 8;
  const sectionLabelSize = 7;
  const roleLineSize = 9;
  const topBodySize = 7;
  // Deep black for print-safe readability.
  const labelMuted = rgb(0, 0, 0);
  const bodyColor = rgb(0, 0, 0);
  const dateColor = rgb(0, 0, 0);
  const placeColor = rgb(0, 0, 0);

  const nameSafe = signatoryName.trim() || '—';
  const placeSafe = placeText.trim() || '—';
  const roleLine =
    signRole === 'client'
      ? `Auftraggeber: „${nameSafe}“`
      : `Bevollmächtigte: „${nameSafe}“`;

  const placeLines = wrapTextToLines(placeSafe, font, bodySize, colW);
  const dateLines = wrapTextToLines(signedAtStr, font, bodySize, colW);
  const confirmationLines = truncateLinesWithEllipsis(
    wrapTextToLines(STAMP_CONFIRMATION_TEXT, font, topBodySize, colW),
    2
  );

  const gapSection = 7;
  const gapBeforeImage = 6;
  const gapAfterImage = 6;

  /** Bottom → top (PDF y): role+name, signature image, place/date, confirmation at top. */
  const bottomRows: StampTextRow[] = [
    { text: roleLine, size: roleLineSize, color: bodyColor, gapAfter: gapSection, bold: true },
  ];
  const hBottom = bottomRows.reduce((s, r) => s + r.gapAfter, 0);
  const hImageBlock = signatureImage
    ? gapBeforeImage + sigTopBottomInset + sigDrawH + sigTopBottomInset + gapAfterImage
    : 0;

  const middleRows: StampTextRow[] = [];
  middleRows.push({ text: 'Ort', size: sectionLabelSize, color: labelMuted, gapAfter: 6, bold: true });
  for (const pl of placeLines) {
    middleRows.push({ text: pl, size: bodySize, color: placeColor, gapAfter: 11 });
  }
  middleRows.push({
    text: 'Datum, Uhrzeit',
    size: sectionLabelSize,
    color: labelMuted,
    gapAfter: 6,
    bold: true,
  });
  for (const dl of dateLines) {
    middleRows.push({ text: dl, size: bodySize, color: dateColor, gapAfter: 11 });
  }
  const hMiddle = middleRows.reduce((s, r) => s + r.gapAfter, 0);

  const topRows: StampTextRow[] = [];
  for (const cl of confirmationLines) {
    topRows.push({ text: cl, size: topBodySize, color: bodyColor, gapAfter: 9 });
  }
  const hTop = topRows.reduce((s, r) => s + r.gapAfter, 0);

  const totalH = pad * 2 + hBottom + hImageBlock + hMiddle + hTop + gapSection * 2 + 2;
  const boxW = colW + pad * 2;
  const { boxX, boxY } = stampBoxLowerLeftInUserSpace(mediaW, mediaH, pageRotation, margin, boxW, totalH);
  const stampRad = -degreesToRadians(pageRotation);

  page.pushOperators(pushGraphicsState(), translate(boxX, boxY), rotateRadians(stampRad));

  page.drawRectangle({
    x: 0,
    y: 0,
    width: boxW,
    height: totalH,
    color: rgb(0.99, 0.99, 1),
    borderColor: rgb(0.78, 0.8, 0.85),
    borderWidth: 0.75,
    opacity: 1,
  });

  const textLeft = pad;
  let textY = pad;

  const drawRows = (rows: StampTextRow[]) => {
    for (const row of rows) {
      if (row.text.trim()) {
        page.drawText(row.text, {
          x: textLeft,
          y: textY,
          size: row.size,
          font: row.bold ? fontBold : font,
          color: row.color,
        });
      }
      textY += row.gapAfter;
    }
  };

  drawRows(bottomRows);

  if (signatureImage) {
    textY += gapBeforeImage;
    textY += sigTopBottomInset;
    const sigX = textLeft + sigSideInset + Math.max(0, (sigBoxMaxW - sigDrawW) / 2);
    page.drawImage(signatureImage, {
      x: sigX,
      y: textY,
      width: sigDrawW,
      height: sigDrawH,
    });
    // Slight overdraw to make thin strokes print darker without changing box size.
    page.drawImage(signatureImage, {
      x: sigX + 0.35,
      y: textY,
      width: sigDrawW,
      height: sigDrawH,
    });
    textY += sigDrawH + sigTopBottomInset + gapAfterImage;
  }

  textY += gapSection;
  drawRows(middleRows);
  textY += gapSection;
  drawRows(topRows);

  page.pushOperators(popGraphicsState());

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
  signRole: 'client' | 'representative';
  signatoryName: string;
  placeText: string;
  signedAt: Date;
  displayTimeZone?: string;
  signatureDataUrl?: string;
}): Promise<StampResult> {
  const {
    db,
    projectId,
    folderPath,
    filePath,
    fileName: paramFileName,
    signRole,
    signatoryName,
    placeText,
    signedAt,
    displayTimeZone,
    signatureDataUrl,
  } = params;

  const stampOpts = {
    signRole,
    signatoryName,
    placeText,
    signedAt,
    displayTimeZone,
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

    const storagePathRaw = typeof fileData.storagePath === 'string' ? fileData.storagePath : '';

    async function stampAtAbsolute(resolved: string): Promise<StampResult> {
      if (!isPathAllowedForStamp(resolved)) {
        console.warn('[report-signatures] Storage path not allowed', { resolved });
        return { stamped: false, reason: 'vps_path_invalid' };
      }
      try {
        const pdfBuf = await readFile(resolved);
        const stampedBytes = await stampPdfBuffer(pdfBuf, stampOpts);
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

    // Prefer storagePath when it points at this server's upload root. If it is stale (e.g. dev
    // machine path) or outside VPS_UPLOAD_DIR, fall through to fileKey / fileUrl resolution.
    if (storagePathRaw) {
      const fromStorage = await stampAtAbsolute(path.resolve(storagePathRaw));
      if (fromStorage.stamped) return fromStorage;
      console.warn('[report-signatures] Stamping via storagePath failed; trying fileKey / fileUrl', {
        projectId,
        filePath,
        reason: fromStorage.reason,
      });
    }

    const resolvedByKey = await resolveProjectFileAbsolute(filePath, storedName);
    if (resolvedByKey) {
      return await stampAtAbsolute(resolvedByKey);
    }

    const fileUrl = fileUrlFromFirestoreDoc(fileData as Record<string, unknown>);
    const fromVpsUrl = absolutePathFromPublicFileUrl(fileUrl);
    if (fromVpsUrl) {
      return await stampAtAbsolute(fromVpsUrl);
    }

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
      signRole: signRoleRaw,
      placeText: placeTextRaw,
      confirmationAccepted,
      addressText,
      gps,
      signatureDataUrl,
      displayTimeZone: displayTimeZoneRaw,
    } = body as Record<string, unknown>;

    const displayTimeZone =
      typeof displayTimeZoneRaw === 'string' && displayTimeZoneRaw.trim()
        ? displayTimeZoneRaw.trim()
        : undefined;

    const signRole =
      signRoleRaw === 'representative' || signRoleRaw === 'client' ? signRoleRaw : null;
    const placeText = typeof placeTextRaw === 'string' ? placeTextRaw.trim() : '';

    if (
      typeof projectId !== 'string' ||
      !projectId ||
      typeof folderPath !== 'string' ||
      !folderPath ||
      typeof filePath !== 'string' ||
      !filePath ||
      typeof signatoryName !== 'string' ||
      !signatoryName.trim() ||
      !signRole ||
      !placeText ||
      confirmationAccepted !== true
    ) {
      return withCors(NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 }));
    }

    const alreadySigned = await db
      .collection('reportSignatures')
      .where('filePath', '==', filePath)
      .limit(1)
      .get();
    if (!alreadySigned.empty) {
      return withCors(
        NextResponse.json(
          { success: false, error: 'already_signed', code: 'ALREADY_SIGNED' },
          { status: 409 }
        )
      );
    }

    const signedAt = new Date();
    const doc: Record<string, unknown> = {
      projectId,
      folderPath,
      filePath,
      fileName: typeof fileName === 'string' ? fileName : '',
      customerId: typeof customerId === 'string' ? customerId : null,
      signatoryName: signatoryName.trim(),
      signRole,
      placeText,
      confirmationAccepted: true,
      addressText: typeof addressText === 'string' ? addressText.trim() : '',
      createdAt: signedAt,
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

    await db.collection('reportSignatures').add(doc);

    const stampResult = await attachSignatureToPdf({
      db,
      projectId,
      folderPath,
      filePath,
      fileName: typeof fileName === 'string' ? fileName : '',
      signRole,
      signatoryName: signatoryName.trim(),
      placeText,
      signedAt,
      displayTimeZone,
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
