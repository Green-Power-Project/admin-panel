import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebaseAdmin';
import { uploadCatalogFileToVpsStorage, getCatalogStorageLimits } from '@/lib/server/catalogStorage';

export const dynamic = 'force-dynamic';
/** Long uploads (supported on Vercel Pro / similar). */
export const maxDuration = 300;

/** Stable codes for the admin UI (i18n). */
export type CatalogUploadErrorCode =
  | 'FILE_TOO_LARGE'
  | 'MISSING_FILE_OR_FOLDER'
  | 'INVALID_FILE_TYPE'
  | 'SERVER_CONFIG'
  | 'DATABASE_UNAVAILABLE'
  | 'VPS_STORAGE_ERROR'
  | 'UPLOAD_FAILED';

function errorJson(
  code: CatalogUploadErrorCode,
  status: number,
  opts?: { maxMb?: number; error?: string }
) {
  const limits = getCatalogStorageLimits();
  const maxMb = opts?.maxMb ?? Math.round(limits.maxTotalBytes / (1024 * 1024));
  return NextResponse.json(
    {
      code,
      maxMb,
      ...(opts?.error ? { error: opts.error } : {}),
    },
    { status }
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return 'Failed to upload PDF';
}

export async function POST(request: NextRequest) {
  try {
    const db = getAdminDb();
    if (!db) {
      return errorJson('DATABASE_UNAVAILABLE', 500, {
        error: 'Database not available',
      });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folderId = formData.get('folderId') as string | null;
    const name = (formData.get('name') as string | null) ?? '';
    const description = (formData.get('description') as string | null) ?? '';

    if (!file || !folderId) {
      return errorJson('MISSING_FILE_OR_FOLDER', 400, {
        error: 'Missing file or folder',
      });
    }

    const limits = getCatalogStorageLimits();
    const fileName = file.name || 'catalog.pdf';
    const mime = file.type || 'application/pdf';
    if (mime !== 'application/pdf') {
      return errorJson('INVALID_FILE_TYPE', 400, {
        error: 'Only PDF uploads are allowed in catalogue.',
      });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const maxMb = Math.round(limits.maxTotalBytes / (1024 * 1024));
    if (buffer.length > limits.maxTotalBytes) {
      return errorJson('FILE_TOO_LARGE', 400, {
        maxMb,
        error: `File exceeds ${maxMb} MB limit`,
      });
    }

    const vpsStored = await uploadCatalogFileToVpsStorage({
      fileBuffer: buffer,
      originalFileName: fileName,
    });

    const existing = await db.collection('catalogEntries').where('folderId', '==', folderId).get();
    const order = existing.size;

    const now = new Date();
    const docData = {
      folderId,
      name: name.trim() || fileName,
      description: description.trim(),
      fileUrl: vpsStored.fileUrl,
      fileName,
      fileSizeBytes: buffer.length,
      storageProvider: 'vps' as const,
      storagePath: vpsStored.storagePath,
      order,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection('catalogEntries').add(docData);

    return NextResponse.json({
      id: docRef.id,
      folderId,
      name: docData.name,
      description: docData.description,
      fileUrl: docData.fileUrl,
      fileName: docData.fileName,
      storageProvider: docData.storageProvider,
      fileSizeBytes: docData.fileSizeBytes,
      order,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  } catch (error) {
    console.error('[catalog-entries/upload] POST error:', error);
    const message = getErrorMessage(error);
    const limits = getCatalogStorageLimits();
    const maxMb = Math.round(limits.maxTotalBytes / (1024 * 1024));

    let code: CatalogUploadErrorCode = 'UPLOAD_FAILED';
    if (message.includes('VPS storage')) {
      code = 'VPS_STORAGE_ERROR';
    } else if (/too large|maximum is|file size/i.test(message)) {
      code = 'FILE_TOO_LARGE';
    }

    return NextResponse.json(
      {
        code,
        maxMb,
        error: message,
      },
      { status: 500 }
    );
  }
}
