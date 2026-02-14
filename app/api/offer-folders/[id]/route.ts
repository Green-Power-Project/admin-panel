import { NextRequest, NextResponse } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
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
      return NextResponse.json({ error: 'Folder ID is required' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const name = typeof body?.name === 'string' ? body.name.trim() : null;
    const order = typeof body?.order === 'number' ? body.order : undefined;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== null) updates.name = name;
    if (order !== undefined) updates.order = order;

    await db.collection('offerFolders').doc(id).update(updates);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[offer-folders] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update folder' }, { status: 500 });
  }
}

async function deleteFolderCascade(db: Firestore, folderId: string): Promise<void> {
  const subfolders = await db.collection('offerFolders').where('parentId', '==', folderId).get();
  for (const doc of subfolders.docs) {
    await deleteFolderCascade(db, doc.id);
  }
  const items = await db.collection('offerItems').where('folderId', '==', folderId).get();
  const batch = db.batch();
  items.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  await db.collection('offerFolders').doc(folderId).delete();
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
      return NextResponse.json({ error: 'Folder ID is required' }, { status: 400 });
    }

    await deleteFolderCascade(db, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[offer-folders] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 });
  }
}
