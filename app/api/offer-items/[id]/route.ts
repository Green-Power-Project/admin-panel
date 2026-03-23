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
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body?.name === 'string') updates.name = body.name.trim();
    if (typeof body?.description === 'string') updates.description = body.description.trim();
    if (typeof body?.unit === 'string') updates.unit = body.unit.trim();
    if (typeof body?.price === 'string') updates.price = body.price.trim();
    if (typeof body?.quantityUnit === 'string') updates.quantityUnit = body.quantityUnit.trim();
    if (body?.imageUrl !== undefined) updates.imageUrl = typeof body.imageUrl === 'string' && body.imageUrl.trim() ? body.imageUrl.trim() : null;
    if (body?.imageStorageProvider !== undefined) {
      updates.imageStorageProvider =
        body.imageStorageProvider === 'cloudinary' || body.imageStorageProvider === 'vps'
          ? body.imageStorageProvider
          : null;
    }
    if (body?.imageStoragePath !== undefined) {
      updates.imageStoragePath =
        typeof body.imageStoragePath === 'string' && body.imageStoragePath.trim()
          ? body.imageStoragePath.trim()
          : null;
    }
    if (body?.imageSizeBytes !== undefined) {
      updates.imageSizeBytes = typeof body.imageSizeBytes === 'number' ? body.imageSizeBytes : null;
    }
    if (typeof body?.order === 'number') updates.order = body.order;

    await db.collection('offerItems').doc(id).update(updates);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[offer-items] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
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
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
    }

    const ref = db.collection('offerItems').doc(id);
    const snap = await ref.get();
    const data = snap.exists
      ? (snap.data() as { imageStorageProvider?: string; imageStoragePath?: string } | undefined)
      : undefined;

    await ref.delete();

    if (data?.imageStorageProvider === 'vps' && data.imageStoragePath) {
      await unlink(data.imageStoragePath).catch(() => undefined);
    } else if (data?.imageStorageProvider === 'cloudinary' && data.imageStoragePath) {
      await cloudinary.uploader.destroy(data.imageStoragePath, { resource_type: 'image' }).catch(() => undefined);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[offer-items] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  }
}
