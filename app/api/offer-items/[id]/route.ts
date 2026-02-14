import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebaseAdmin';

export const dynamic = 'force-dynamic';

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

    await db.collection('offerItems').doc(id).delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[offer-items] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  }
}
