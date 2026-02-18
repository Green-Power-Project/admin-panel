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

    await db.collection('catalogEntries').doc(id).delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[catalog-entries] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 });
  }
}

