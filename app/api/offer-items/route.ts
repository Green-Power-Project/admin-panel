import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebaseAdmin';

export const dynamic = 'force-dynamic';

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
      .collection('offerItems')
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
        unit: typeof data.unit === 'string' ? data.unit : '',
        price: typeof data.price === 'string' ? data.price : '',
        quantityUnit: typeof data.quantityUnit === 'string' ? data.quantityUnit : '',
        imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : null,
        order: typeof data.order === 'number' ? data.order : 0,
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
      };
    })
      .sort((a, b) => a.order - b.order);

    return NextResponse.json(items);
  } catch (error) {
    console.error('[offer-items] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 });
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
    const unit = typeof body?.unit === 'string' ? body.unit.trim() : '';
    const price = typeof body?.price === 'string' ? body.price.trim() : '';
    const quantityUnit = typeof body?.quantityUnit === 'string' ? body.quantityUnit.trim() : '';
    const imageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl.trim() || null : null;

    if (!folderId || !name) {
      return NextResponse.json({ error: 'Folder ID and item name are required' }, { status: 400 });
    }

    const existing = await db.collection('offerItems').where('folderId', '==', folderId).get();
    const order = existing.size;

    const docData = {
      folderId,
      name,
      description,
      unit,
      price,
      quantityUnit,
      imageUrl,
      order,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const docRef = await db.collection('offerItems').add(docData);

    return NextResponse.json({
      id: docRef.id,
      ...docData,
      createdAt: docData.createdAt.toISOString(),
      updatedAt: docData.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('[offer-items] POST error:', error);
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 });
  }
}
