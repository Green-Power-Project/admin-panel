import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/server/firebaseAdmin';

type ListItem = {
  id: string;
  filePath: string;
  fileName: string;
  customerId: string | null;
  signatoryName: string;
  signRole: 'client' | 'representative' | null;
  placeText: string;
  addressText: string;
  gps: { lat: number; lng: number; accuracy: number | null } | null;
  createdAt: string | null;
  signatureDataUrl?: string;
};

function toIso(data: DocumentData, key: string): string | null {
  const v = data[key];
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (v && typeof (v as { toDate?: () => Date }).toDate === 'function') {
    return (v as Timestamp).toDate().toISOString();
  }
  return null;
}

function serializeDoc(id: string, data: DocumentData): ListItem {
  const gpsRaw = data.gps as { lat?: number; lng?: number; accuracy?: number } | undefined;
  let gps: ListItem['gps'] = null;
  if (gpsRaw && typeof gpsRaw.lat === 'number' && typeof gpsRaw.lng === 'number') {
    gps = {
      lat: gpsRaw.lat,
      lng: gpsRaw.lng,
      accuracy: typeof gpsRaw.accuracy === 'number' ? gpsRaw.accuracy : null,
    };
  }
  const sig =
    typeof data.signatureDataUrl === 'string' && data.signatureDataUrl.startsWith('data:image/')
      ? data.signatureDataUrl
      : undefined;
  const sr = data.signRole;
  const signRole =
    sr === 'client' || sr === 'representative' ? sr : null;
  return {
    id,
    filePath: typeof data.filePath === 'string' ? data.filePath : '',
    fileName: typeof data.fileName === 'string' ? data.fileName : '',
    customerId: typeof data.customerId === 'string' ? data.customerId : null,
    signatoryName: typeof data.signatoryName === 'string' ? data.signatoryName : '',
    signRole,
    placeText: typeof data.placeText === 'string' ? data.placeText : '',
    addressText: typeof data.addressText === 'string' ? data.addressText : '',
    gps,
    createdAt: toIso(data, 'createdAt'),
    signatureDataUrl: sig,
  };
}

export async function GET(request: NextRequest) {
  try {
    const adminApp = getAdminApp();
    const db = getAdminDb();
    if (!adminApp || !db) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    let uid: string;
    try {
      const decoded = await getAuth(adminApp).verifyIdToken(idToken);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const adminSnap = await db.collection('admins').doc(uid).get();
    if (!adminSnap.exists) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const projectId = request.nextUrl.searchParams.get('projectId');
    const folderPath = request.nextUrl.searchParams.get('folderPath');
    if (!projectId?.trim() || !folderPath?.trim()) {
      return NextResponse.json({ error: 'Missing projectId or folderPath' }, { status: 400 });
    }

    const snap = await db
      .collection('reportSignatures')
      .where('projectId', '==', projectId)
      .where('folderPath', '==', folderPath)
      .get();

    const items: ListItem[] = snap.docs.map((d) => serializeDoc(d.id, d.data()));

    return NextResponse.json({ items });
  } catch (e) {
    console.error('[report-signatures/list]', e);
    return NextResponse.json({ error: 'Failed to load report signatures' }, { status: 500 });
  }
}
