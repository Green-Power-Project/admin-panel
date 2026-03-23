import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebaseAdmin';
import { v2 as cloudinary } from 'cloudinary';
import type { UploadApiResponse } from 'cloudinary';
import { uploadCatalogFileToVpsStorage, getCatalogStorageLimits } from '@/lib/server/catalogStorage';

export const dynamic = 'force-dynamic';
/** Long uploads (supported on Vercel Pro / similar). */
export const maxDuration = 300;

function getHttpStatusForCloudinaryError(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'http_code' in error) {
    const code = (error as { http_code?: number }).http_code;
    if (code === 400) return 400;
    if (code === 401 || code === 403) return 502;
  }
  if (error instanceof Error && /too large|maximum is|file size/i.test(error.message)) {
    return 400;
  }
  return 500;
}

/** Stable codes for the admin UI (i18n). */
export type CatalogUploadErrorCode =
  | 'FILE_TOO_LARGE'
  | 'MISSING_FILE_OR_FOLDER'
  | 'INVALID_FILE_TYPE'
  | 'CLOUDINARY_REJECTED'
  | 'SERVER_CONFIG'
  | 'DATABASE_UNAVAILABLE'
  | 'VPS_STORAGE_ERROR'
  | 'UPLOAD_FAILED';

function errorJson(
  code: CatalogUploadErrorCode,
  status: number,
  opts?: { maxMb?: number; error?: string; provider?: 'cloudinary' | 'vps' }
) {
  const limits = getCatalogStorageLimits();
  const maxMb =
    opts?.maxMb ?? Math.round(limits.maxTotalBytes / (1024 * 1024));
  return NextResponse.json(
    {
      code,
      maxMb,
      ...(opts?.provider ? { provider: opts.provider } : {}),
      ...(opts?.error ? { error: opts.error } : {}),
    },
    { status }
  );
}

function getCloudinaryErrorMessage(error: unknown): string {
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

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Cloudinary v2: `upload(file, options, callback)` — use Promise wrapper for async/await.
 * We use a base64 data URI (same as before). For very large PDFs, prefer direct client uploads later.
 */
function uploadDataUriToCloudinary(dataURI: string): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      dataURI,
      {
        folder: 'catalogue',
        resource_type: 'auto',
        use_filename: true,
        unique_filename: true,
        timeout: 120000,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        if (!result) {
          reject(new Error('Cloudinary returned no result'));
          return;
        }
        resolve(result);
      }
    );
  });
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

    const useCloudinary = buffer.length <= limits.cloudinaryMaxBytes;
    let fileUrl = '';
    let storageProvider: 'cloudinary' | 'vps' = useCloudinary ? 'cloudinary' : 'vps';
    let storagePath = '';

    if (useCloudinary) {
      if (
        !process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ||
        !process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY ||
        !process.env.CLOUDINARY_API_SECRET
      ) {
        console.error('[catalog-entries/upload] Missing Cloudinary env vars');
        return errorJson('SERVER_CONFIG', 500, {
          provider: 'cloudinary',
          error: 'Cloudinary credentials are not set.',
        });
      }
      const dataURI = `data:${mime};base64,${buffer.toString('base64')}`;
      const cloudinaryResponse = await uploadDataUriToCloudinary(dataURI);
      fileUrl = cloudinaryResponse.secure_url;
      storagePath = cloudinaryResponse.public_id || '';
    } else {
      const vpsStored = await uploadCatalogFileToVpsStorage({
        fileBuffer: buffer,
        originalFileName: fileName,
      });
      fileUrl = vpsStored.fileUrl;
      storagePath = vpsStored.storagePath;
      storageProvider = 'vps';
    }

    const existing = await db.collection('catalogEntries').where('folderId', '==', folderId).get();
    const order = existing.size;

    const now = new Date();
    const docData = {
      folderId,
      name: name.trim() || fileName,
      description: description.trim(),
      fileUrl,
      fileName,
      fileSizeBytes: buffer.length,
      storageProvider,
      storagePath,
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
    const message = getCloudinaryErrorMessage(error);
    const status = getHttpStatusForCloudinaryError(error);
    const limits = getCatalogStorageLimits();
    const maxMb = Math.round(limits.maxTotalBytes / (1024 * 1024));

    let code: CatalogUploadErrorCode = 'UPLOAD_FAILED';
    if (message.includes('VPS storage')) {
      code = 'VPS_STORAGE_ERROR';
    } else if (status === 400) {
      code = /too large|maximum is|file size/i.test(message)
        ? 'FILE_TOO_LARGE'
        : 'CLOUDINARY_REJECTED';
    }

    return NextResponse.json(
      {
        code,
        maxMb,
        error: message,
      },
      { status }
    );
  }
}
