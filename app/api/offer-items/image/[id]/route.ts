import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getAdminDb } from '@/lib/server/firebaseAdmin';

export const dynamic = 'force-dynamic';

type OfferImageDoc = {
  imageUrl?: string | null;
  imageStorageProvider?: 'cloudinary' | 'vps' | null;
  imageStoragePath?: string | null;
};

function contentTypeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.avif') return 'image/avif';
  return 'application/octet-stream';
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
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
    }

    const snap = await db.collection('offerItems').doc(id).get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const data = snap.data() as OfferImageDoc;

    if (data.imageStorageProvider === 'vps' && data.imageStoragePath) {
      const bytes = await readFile(data.imageStoragePath);
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          'Content-Type': contentTypeFromPath(data.imageStoragePath),
          'Cache-Control': 'private, max-age=300',
        },
      });
    }

    if (!data.imageUrl) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    const remote = await fetch(data.imageUrl, { cache: 'no-store' });
    if (!remote.ok || !remote.body) {
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 });
    }
    return new NextResponse(remote.body, {
      status: 200,
      headers: {
        'Content-Type': remote.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error) {
    console.error('[offer-items/image] GET error:', error);
    return NextResponse.json({ error: 'Failed to load image' }, { status: 500 });
  }
}
