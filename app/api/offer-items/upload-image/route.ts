import { NextRequest, NextResponse } from 'next/server';
import { getCatalogStorageLimits, uploadOfferImageToVpsStorage } from '@/lib/server/catalogStorage';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type OfferImageUploadErrorCode =
  | 'MISSING_FILE'
  | 'INVALID_IMAGE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'VPS_STORAGE_ERROR'
  | 'UPLOAD_FAILED';

function errorJson(code: OfferImageUploadErrorCode, status: number, error: string) {
  const maxMb = Math.round(getCatalogStorageLimits().maxTotalBytes / (1024 * 1024));
  return NextResponse.json({ code, maxMb, error }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return errorJson('MISSING_FILE', 400, 'Missing image file');

    const mime = file.type || '';
    if (!/^image\/(png|jpe?g|webp|gif|avif)$/i.test(mime)) {
      return errorJson('INVALID_IMAGE_TYPE', 400, 'Only image files are allowed');
    }

    const fileName = file.name || 'item-image';
    const buffer = Buffer.from(await file.arrayBuffer());
    const limits = getCatalogStorageLimits();
    if (buffer.length > limits.maxTotalBytes) {
      const maxMb = Math.round(limits.maxTotalBytes / (1024 * 1024));
      return NextResponse.json(
        { code: 'FILE_TOO_LARGE', maxMb, error: `File exceeds ${maxMb} MB limit` },
        { status: 400 }
      );
    }

    const saved = await uploadOfferImageToVpsStorage({
      fileBuffer: buffer,
      originalFileName: fileName,
    });

    return NextResponse.json({
      imageUrl: saved.fileUrl,
      storageProvider: 'vps' as const,
      storagePath: saved.storagePath,
      imageSizeBytes: buffer.length,
    });
  } catch (error) {
    console.error('[offer-items/upload-image] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to upload image';
    if (/VPS storage write failed/i.test(message)) {
      return errorJson('VPS_STORAGE_ERROR', 500, message);
    }
    if (/too large|maximum is|file size/i.test(message)) {
      return errorJson('FILE_TOO_LARGE', 400, message);
    }
    return errorJson('UPLOAD_FAILED', 500, message);
  }
}
