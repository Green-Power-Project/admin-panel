import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { getAdminDb } from '@/lib/server/firebaseAdmin';

export const dynamic = 'force-dynamic';

type CatalogFileDoc = {
  fileUrl?: string;
  fileName?: string;
  storageProvider?: 'cloudinary' | 'vps';
  storagePath?: string;
};

function pdfResponse(bytes: Buffer, fileName: string) {
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${encodeURIComponent(fileName || 'catalog.pdf')}"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}

export async function GET(
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

    const snap = await db.collection('catalogEntries').doc(id).get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const data = snap.data() as CatalogFileDoc;
    const fileName = data.fileName || 'catalog.pdf';

    if (data.storageProvider === 'vps' && data.storagePath) {
      const bytes = await readFile(data.storagePath);
      return pdfResponse(bytes, fileName);
    }

    if (!data.fileUrl) {
      return NextResponse.json({ error: 'File URL not found' }, { status: 404 });
    }

    const remote = await fetch(data.fileUrl, { cache: 'no-store' });
    if (!remote.ok || !remote.body) {
      return NextResponse.json({ error: 'Failed to fetch file' }, { status: 502 });
    }
    return new NextResponse(remote.body, {
      status: 200,
      headers: {
        'Content-Type': remote.headers.get('content-type') || 'application/pdf',
        'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error) {
    console.error('[catalog-entries/file] GET error:', error);
    return NextResponse.json({ error: 'Failed to load file' }, { status: 500 });
  }
}
