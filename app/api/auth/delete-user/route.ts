import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp } from '@/lib/server/firebaseAdmin';
import { getAuth } from 'firebase-admin/auth';

/**
 * Delete a Firebase Auth user by uid (admin only).
 * Used when deleting a customer so the email can be reused.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { uid } = body;

    if (!uid || typeof uid !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid uid' },
        { status: 400 }
      );
    }

    const adminApp = getAdminApp();
    if (!adminApp) {
      return NextResponse.json(
        { error: 'Firebase Admin not initialized' },
        { status: 500 }
      );
    }

    const adminAuth = getAuth(adminApp);
    await adminAuth.deleteUser(uid);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete user';
    console.error('Auth delete-user error:', error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
