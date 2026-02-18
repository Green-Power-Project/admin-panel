import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebaseAdmin';

export const dynamic = 'force-dynamic';

// List and create catalogue entries (PDFs) for a folder
export async function GET(request: NextRequest) {
  try {
    const db = getAdminDb();
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId');

    if (!folderId) {
      return NextResponse.json({ error: 'folderId is required' }, { status: 400 });
    }

    const snapshot = await db
      .collection('catalogEntries')
      .where('folderId', '==', folderId)
      .get();

    const items = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          folderId: data.folderId ?? '',
          name: data.name ?? '',
          description: typeof data.description === 'string' ? data.description : '',
          fileUrl: typeof data.fileUrl === 'string' ? data.fileUrl : '',
          fileName: typeof data.fileName === 'string' ? data.fileName : '',
          order: typeof data.order === 'number' ? data.order : 0,
          createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
        };
      })
      .sort((a, b) => a.order - b.order);

    return NextResponse.json(items);
  } catch (error) {
    console.error('[catalog-entries] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getAdminDb();
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    const body = await request.json().catch(() => null);
    const folderId = typeof body?.folderId === 'string' ? body.folderId.trim() : '';
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const description = typeof body?.description === 'string' ? body.description.trim() : '';
    const fileUrl = typeof body?.fileUrl === 'string' ? body.fileUrl.trim() : '';
    const fileName = typeof body?.fileName === 'string' ? body.fileName.trim() : '';

    if (!folderId || !name || !fileUrl) {
      return NextResponse.json({ error: 'Folder ID, name and fileUrl are required' }, { status: 400 });
    }

    const existing = await db.collection('catalogEntries').where('folderId', '==', folderId).get();
    const order = existing.size;

    const docData = {
      folderId,
      name,
      description,
      fileUrl,
      fileName,
      order,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const docRef = await db.collection('catalogEntries').add(docData);

    return NextResponse.json({
      id: docRef.id,
      ...docData,
      createdAt: docData.createdAt.toISOString(),
      updatedAt: docData.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('[catalog-entries] POST error:', error);
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 });
  }
}

