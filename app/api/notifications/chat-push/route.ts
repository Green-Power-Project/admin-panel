import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebaseAdmin';
import { sendOneSignalPush } from '@/lib/server/onesignal';

function withCors(response: NextResponse) {
  const allowedOrigin = (process.env.NEXT_PUBLIC_CUSTOMER_APP_ORIGIN || 'http://localhost:3001').trim();
  response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
  response.headers.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  return response;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    const db = getAdminDb();
    if (!db) {
      return withCors(NextResponse.json({ success: false, skipped: true }, { status: 200 }));
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return withCors(NextResponse.json({ success: false }, { status: 400 }));
    }

    const { projectId, projectName, messagePreview, targetUserId } = body;
    if (!projectId || typeof projectId !== 'string') {
      return withCors(NextResponse.json({ success: false }, { status: 400 }));
    }

    // Resolve targetUserId: use provided value or look it up from the project document
    let recipientId: string | undefined = typeof targetUserId === 'string' ? targetUserId.trim() : undefined;

    if (!recipientId) {
      const projectDoc = await db.collection('projects').doc(projectId).get();
      if (!projectDoc.exists) {
        console.log('[chat-push] Project not found:', projectId);
        return withCors(NextResponse.json({ success: false }, { status: 200 }));
      }
      recipientId = (projectDoc.data()?.customerId as string | undefined) ?? undefined;
    }

    if (!recipientId) {
      console.log('[chat-push] No recipient ID — skipping push');
      return withCors(NextResponse.json({ success: false, skipped: true }, { status: 200 }));
    }

    const portalBase = (process.env.PORTAL_URL ?? 'https://customer.gruen-power.cloud').replace(/\/$/, '');
    const pushUrl = portalBase.startsWith('https://')
      ? `${portalBase}/project/${projectId}`
      : `https://customer.gruen-power.cloud/project/${projectId}`;

    const title = 'Neue Nachricht';
    const body_text = projectName
      ? `${projectName}: ${messagePreview || '…'}`
      : (messagePreview || 'Sie haben eine neue Nachricht.');

    await sendOneSignalPush({
      externalUserId: recipientId,
      title,
      body: body_text,
      url: pushUrl,
    });

    return withCors(NextResponse.json({ success: true }, { status: 200 }));
  } catch (error) {
    console.error('[chat-push] Unexpected error:', error);
    return withCors(NextResponse.json({ success: false }, { status: 200 }));
  }
}
