import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/server/firebaseAdmin';
import {
  DuplicateFileNameError,
  folderPathToDirId,
  parseProjectPublicId,
  saveProjectUpload,
  unlinkQuiet,
} from '@/lib/server/vpsStorage';

type UploadStep = 'upload' | 'metadata' | 'notification' | 'response';

function isReportFolder(folderPath: string): boolean {
  return folderPath.startsWith('03_Reports');
}

function addWorkingDays(date: Date, days: number): Date {
  const result = new Date(date);
  let addedDays = 0;
  while (addedDays < days) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      addedDays++;
    }
  }
  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryWithDelay<T>(task: () => Promise<T>, attempts: number, delayMs: number): Promise<T> {
  let lastError: unknown = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (i < attempts) {
        await sleep(delayMs);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unknown retry failure');
}

function errorResponse(error: string, step: UploadStep, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, step, ...(extra || {}) }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const folder = (formData.get('folder') as string) || '';
    const publicId = formData.get('public_id') as string | null;

    if (!file || !(file instanceof Blob)) {
      return errorResponse('No file provided', 'upload', 400);
    }

    const f = file as File;
    const originalName = f.name || 'upload.bin';
    const buffer = Buffer.from(await f.arrayBuffer());

    let targetPublicId: string;
    if (publicId && publicId.trim()) {
      targetPublicId = publicId.trim();
    } else if (folder) {
      const base = originalName.replace(/\.[^/.]+$/, '');
      const safe = base.replace(/[^a-zA-Z0-9._-]/g, '-') || 'file';
      targetPublicId = `${folder.replace(/\/+$/, '')}/${safe}`;
    } else {
      return errorResponse('folder or public_id required', 'upload', 400);
    }

    const result = await saveProjectUpload({
      buffer,
      publicId: targetPublicId,
      originalName,
    });

    const parsed = parseProjectPublicId(result.public_id);
    if (parsed) {
      const adminDb = getAdminDb();
      if (!adminDb) {
        await unlinkQuiet(result.storagePath);
        return errorResponse('Firestore Admin SDK not configured', 'metadata', 500);
      }

      try {
        const folderPathId = folderPathToDirId(parsed.folderPath);
        const fileDocId = result.public_id.replace(/\//g, '__');
        const metadataRef = adminDb
          .collection('files')
          .doc('projects')
          .collection(parsed.projectId)
          .doc(folderPathId)
          .collection('files')
          .doc(fileDocId);

        const metadataPayload: Record<string, unknown> = {
          fileName: originalName,
          fileUrl: result.secure_url,
          fileKey: result.public_id,
          storageProvider: 'vps',
          uploadedAt: FieldValue.serverTimestamp(),
          customerDownloadCount: 0,
        };
        if (result.storagePath) metadataPayload.storagePath = result.storagePath;
        if (isReportFolder(parsed.folderPath) && originalName.toLowerCase().endsWith('.pdf')) {
          metadataPayload.autoApproveDate = Timestamp.fromDate(addWorkingDays(new Date(), 5));
        }

        await retryWithDelay(() => metadataRef.set(metadataPayload, { merge: true }), 3, 1000);

        const projectSnap = await retryWithDelay(
          () => adminDb.collection('projects').doc(parsed.projectId).get(),
          3,
          1000
        );
        const customerId = projectSnap.exists ? (projectSnap.data()?.customerId as string | undefined) : undefined;
        if (customerId) {
          const adminReadDocId = result.public_id.replace(/\//g, '__');
          await retryWithDelay(
            () =>
              adminDb.collection('adminFileReadStatus').doc(adminReadDocId).set(
                {
                  adminRead: true,
                  filePath: result.public_id,
                  projectId: parsed.projectId,
                  customerId,
                  readAt: FieldValue.serverTimestamp(),
                },
                { merge: true }
              ),
            3,
            1000
          );
        }
      } catch (metadataError: unknown) {
        await unlinkQuiet(result.storagePath);
        const detail = metadataError instanceof Error ? metadataError.message : 'Metadata write failed';
        return errorResponse('metadata_write_failed', 'metadata', 500, { detail });
      }
    }

    return NextResponse.json({
      public_id: result.public_id,
      secure_url: result.secure_url,
      bytes: result.bytes,
      format: result.format,
      resource_type: result.resource_type,
      storagePath: result.storagePath,
      storageProvider: result.storageProvider,
    });
  } catch (error: unknown) {
    if (error instanceof DuplicateFileNameError) {
      return errorResponse('duplicate_file_name', 'upload', 409, { fileName: error.fileName });
    }
    const message = error instanceof Error ? error.message : 'Upload failed';
    console.error('[storage/upload]', error);
    return errorResponse(message, 'upload', 500);
  }
}
