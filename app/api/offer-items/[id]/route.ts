import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebaseAdmin';
import { unlink } from 'node:fs/promises';

export const dynamic = 'force-dynamic';

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v): v is string => v.length > 0);
}

async function deleteOfferImageFromStorage(
  data: { imageStorageProvider?: string; imageStoragePath?: string } | undefined
) {
  if (!data?.imageStoragePath || data.imageStorageProvider !== 'vps') return;
  try {
    await unlink(data.imageStoragePath);
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
    if (code !== 'ENOENT') {
      throw new Error('Failed to delete VPS image');
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
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body?.name === 'string') updates.name = body.name.trim();
    if (typeof body?.description === 'string') updates.description = body.description.trim();
    if (typeof body?.unit === 'string') updates.unit = body.unit.trim();
    if (typeof body?.price === 'string') updates.price = body.price.trim();
    if (typeof body?.quantityUnit === 'string') updates.quantityUnit = body.quantityUnit.trim();
    if (body?.colorOptions !== undefined) updates.colorOptions = toStringArray(body.colorOptions);
    if (body?.dimensionOptions !== undefined) updates.dimensionOptions = toStringArray(body.dimensionOptions);
    if (body?.imageUrl !== undefined) updates.imageUrl = typeof body.imageUrl === 'string' && body.imageUrl.trim() ? body.imageUrl.trim() : null;
    if (body?.imageStorageProvider !== undefined) {
      updates.imageStorageProvider = body.imageStorageProvider === 'vps' ? 'vps' : null;
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
    if (!snap.exists) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
    const data = snap.data() as { imageStorageProvider?: string; imageStoragePath?: string } | undefined;

    // Strict mode: storage + database must both be deleted.
    await deleteOfferImageFromStorage(data);
    await ref.delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[offer-items] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  }
}
