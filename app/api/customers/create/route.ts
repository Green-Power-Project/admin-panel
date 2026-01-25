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
      canViewAllProjects: false, // Default: customer sees only one project
      createdAt: new Date(),
    });

    // Send welcome email to customer
    try {
      const welcomeResponse = await fetch(`${process.env.NEXT_PUBLIC_ADMIN_API_BASE_URL || 'http://localhost:3000'}/api/notifications/welcome-customer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: uid,
          customerNumber: customerNumber.trim(),
          customerName: name?.trim() || '',
          customerEmail: email.trim(),
        }),
      });
      
      if (welcomeResponse.ok) {
        console.log('[customer-create] Welcome email sent successfully');
      } else {
        console.warn('[customer-create] Failed to send welcome email');
      }
    } catch (emailError) {
      console.error('[customer-create] Error sending welcome email:', emailError);
      // Don't fail customer creation if email fails
    }

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
