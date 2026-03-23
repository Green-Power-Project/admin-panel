import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebaseAdmin';
import { unlink } from 'node:fs/promises';
import { v2 as cloudinary } from 'cloudinary';

export const dynamic = 'force-dynamic';

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function deleteCatalogFileFromStorage(
  data: { storageProvider?: string; storagePath?: string } | undefined
) {
  if (!data?.storagePath || !data.storageProvider) return;

  if (data.storageProvider === 'vps') {
    try {
      await unlink(data.storagePath);
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code)
          : '';
      if (code !== 'ENOENT') {
        throw new Error('Failed to delete VPS file');
      }
    }
    return;
  }

  if (data.storageProvider === 'cloudinary') {
    const result = await cloudinary.uploader.destroy(data.storagePath, { resource_type: 'raw' });
    const status = typeof result?.result === 'string' ? result.result : 'ok';
    if (status !== 'ok' && status !== 'not found') {
      throw new Error(`Cloudinary delete failed: ${status}`);
    }
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getAdminDb();
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: 'Entry ID is required' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body?.name === 'string') updates.name = body.name.trim();
    if (typeof body?.description === 'string') updates.description = body.description.trim();
    if (typeof body?.fileUrl === 'string') updates.fileUrl = body.fileUrl.trim();
    if (typeof body?.fileName === 'string') updates.fileName = body.fileName.trim();
    if (typeof body?.order === 'number') updates.order = body.order;

    await db.collection('catalogEntries').doc(id).update(updates);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[catalog-entries] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getAdminDb();
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: 'Entry ID is required' }, { status: 400 });
    }

    const ref = db.collection('catalogEntries').doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }
    const data = snap.data() as { storageProvider?: string; storagePath?: string } | undefined;

    // Strict mode: storage + database must both be deleted.
    await deleteCatalogFileFromStorage(data);
    await ref.delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[catalog-entries] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 });
  }
}

