import { NextRequest, NextResponse } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/server/firebaseAdmin';
import { unlink } from 'node:fs/promises';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

    await db.collection('catalogFolders').doc(id).update(updates);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[catalog-folders] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update folder' }, { status: 500 });
  }
}

async function deleteCatalogFolderCascade(db: Firestore, folderId: string): Promise<void> {
  const subfolders = await db.collection('catalogFolders').where('parentId', '==', folderId).get();
  for (const doc of subfolders.docs) {
    await deleteCatalogFolderCascade(db, doc.id);
  }

  const entries = await db.collection('catalogEntries').where('folderId', '==', folderId).get();
  for (const entryDoc of entries.docs) {
    const entryData = entryDoc.data() as { storageProvider?: string; storagePath?: string };

    // Delete underlying storage first (so we don't leave orphaned files).
    if (entryData?.storageProvider === 'vps' && entryData.storagePath) {
      try {
        await unlink(entryData.storagePath);
      } catch (error: any) {
        if (error?.code !== 'ENOENT') throw error;
      }
    } else if (entryData?.storageProvider === 'cloudinary' && entryData.storagePath) {
      const result = await cloudinary.uploader.destroy(entryData.storagePath, { resource_type: 'raw' });
      const storageResult = typeof result?.result === 'string' ? result.result : 'ok';
      if (storageResult !== 'ok' && storageResult !== 'not found') {
        throw new Error(`Cloudinary delete failed: ${storageResult}`);
      }
    }

    // Then delete Firestore metadata.
    await entryDoc.ref.delete();
  }

  // Finally delete the folder itself.
  await db.collection('catalogFolders').doc(folderId).delete();
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

    await deleteCatalogFolderCascade(db, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[catalog-folders] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 });
  }
}

