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
    const data = snap.exists ? (snap.data() as { storageProvider?: string; storagePath?: string } | undefined) : undefined;

    await ref.delete();

    // Cleanup storage best-effort; entry delete should not fail if file is already gone.
    if (data?.storageProvider === 'vps' && data.storagePath) {
      await unlink(data.storagePath).catch(() => undefined);
    } else if (data?.storageProvider === 'cloudinary' && data.storagePath) {
      await cloudinary.uploader.destroy(data.storagePath, { resource_type: 'raw' }).catch(() => undefined);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[catalog-entries] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 });
  }
}

