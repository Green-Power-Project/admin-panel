import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebaseAdmin';

export const dynamic = 'force-dynamic';

// List and create catalogue folders
export async function GET() {
  try {
    const db = getAdminDb();
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    const snapshot = await db.collection('catalogFolders').orderBy('order').get();

    const folders = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name ?? '',
        parentId: data.parentId ?? null,
        order: typeof data.order === 'number' ? data.order : 0,
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
      };
    });

    return NextResponse.json(folders);
  } catch (error) {
    console.error('[catalog-folders] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch folders' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getAdminDb();
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    const body = await request.json().catch(() => null);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const parentId = typeof body?.parentId === 'string' && body.parentId.trim() ? body.parentId.trim() : null;

    if (!name) {
      return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
    }

    const parentFolders = parentId
      ? await db.collection('catalogFolders').where('parentId', '==', parentId).get()
      : await db.collection('catalogFolders').where('parentId', '==', null).get();

    const order = parentFolders.size;

    const docData = {
      name,
      parentId,
      order,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const docRef = await db.collection('catalogFolders').add(docData);

    return NextResponse.json({
      id: docRef.id,
      name,
      parentId,
      order,
      createdAt: docData.createdAt.toISOString(),
      updatedAt: docData.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('[catalog-folders] POST error:', error);
    return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 });
  }
}

