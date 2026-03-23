import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import type { UploadApiResponse } from 'cloudinary';
import { getCatalogStorageLimits, uploadOfferImageToVpsStorage } from '@/lib/server/catalogStorage';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type OfferImageUploadErrorCode =
  | 'MISSING_FILE'
  | 'INVALID_IMAGE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'SERVER_CONFIG'
  | 'CLOUDINARY_REJECTED'
  | 'VPS_STORAGE_ERROR'
  | 'UPLOAD_FAILED';

function errorJson(code: OfferImageUploadErrorCode, status: number, error: string) {
  const maxMb = Math.round(getCatalogStorageLimits().maxTotalBytes / (1024 * 1024));
  return NextResponse.json({ code, maxMb, error }, { status });
}

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function uploadImageToCloudinary(dataURI: string): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      dataURI,
      {
        folder: 'offer-items',
        resource_type: 'image',
        use_filename: true,
        unique_filename: true,
        timeout: 120000,
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new Error('Cloudinary returned no result'));
        resolve(result);
      }
    );
  });
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

    const useCloudinary = buffer.length <= limits.cloudinaryMaxBytes;
    let imageUrl = '';
    let storageProvider: 'cloudinary' | 'vps' = useCloudinary ? 'cloudinary' : 'vps';
    let storagePath = '';

    if (useCloudinary) {
      if (
        !process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ||
        !process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY ||
        !process.env.CLOUDINARY_API_SECRET
      ) {
        return errorJson('SERVER_CONFIG', 500, 'Cloudinary credentials are not set');
      }
      const dataURI = `data:${mime};base64,${buffer.toString('base64')}`;
      const result = await uploadImageToCloudinary(dataURI);
      imageUrl = result.secure_url;
      storagePath = result.public_id || '';
      storageProvider = 'cloudinary';
    } else {
      const saved = await uploadOfferImageToVpsStorage({
        fileBuffer: buffer,
        originalFileName: fileName,
      });
      imageUrl = saved.fileUrl;
      storagePath = saved.storagePath;
      storageProvider = 'vps';
    }

    return NextResponse.json({
      imageUrl,
      storageProvider,
      storagePath,
      imageSizeBytes: buffer.length,
    });
  } catch (error) {
    console.error('[offer-items/upload-image] POST error:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to upload image';
    if (/VPS storage write failed/i.test(message)) {
      return errorJson('VPS_STORAGE_ERROR', 500, message);
    }
    if (/too large|maximum is|file size/i.test(message)) {
      return errorJson('FILE_TOO_LARGE', 400, message);
    }
    if (typeof error === 'object' && error !== null && 'http_code' in error) {
      return errorJson('CLOUDINARY_REJECTED', 400, message);
    }
    return errorJson('UPLOAD_FAILED', 500, message);
  }
}
