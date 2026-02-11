import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebaseAdmin';

export async function GET() {
  try {
    const db = getAdminDb();
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    const snapshot = await db.collection('offerRequests').orderBy('createdAt', 'desc').limit(500).get();

    const list = snapshot.docs.map((doc) => {
      const data = doc.data() as Record<string, any>;
      const createdAt = data.createdAt?.toDate?.();
      return {
        id: doc.id,
        firstName: data.firstName ?? '',
        lastName: data.lastName ?? '',
        email: data.email ?? '',
        mobile: data.mobile ?? '',
        address: data.address ?? '',
        items: Array.isArray(data.items) ? data.items : [],
        createdAt: createdAt ? createdAt.toISOString() : null,
      };
    });

    return NextResponse.json(list);
  } catch (error) {
    console.error('[offers] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch offers' }, { status: 500 });
  }
}

