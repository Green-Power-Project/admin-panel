import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminApp } from '@/lib/server/firebaseAdmin';
import { getAuth } from 'firebase-admin/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, mobileNumber, email, password, customerNumber, enabled } = body;

    if (!email || !password || !customerNumber) {
      return NextResponse.json(
        { error: 'Missing required fields: email, password, customerNumber' },
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
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Firebase Admin not initialized' },
        { status: 500 }
      );
    }

    // Create customer account using Admin SDK (doesn't sign in the user on client)
    const userRecord = await adminAuth.createUser({
      email: email.trim(),
      password: password,
      emailVerified: false,
    });

    const uid = userRecord.uid;

    // Create customer document using Admin SDK (bypasses security rules)
    await adminDb.collection('customers').add({
      uid,
      name: name?.trim() || '',
      mobileNumber: mobileNumber?.trim() || '',
      email: email.trim(),
      customerNumber: customerNumber.trim(),
      enabled: enabled !== false,
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true, uid });
  } catch (error: any) {
    console.error('Error creating customer:', error);
    
    // Handle specific Firebase Auth errors
    if (error.code === 'auth/email-already-exists') {
      return NextResponse.json(
        { error: 'This email is already registered' },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to create customer account' },
      { status: 500 }
    );
  }
}
