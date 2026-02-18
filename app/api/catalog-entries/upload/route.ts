import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebaseAdmin';
import { v2 as cloudinary } from 'cloudinary';

export const dynamic = 'force-dynamic';

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(request: NextRequest) {
  try {
    const db = getAdminDb();
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folderId = formData.get('folderId') as string | null;
    const name = (formData.get('name') as string | null) ?? '';
    const description = (formData.get('description') as string | null) ?? '';

    if (!file || !folderId) {
      return NextResponse.json({ error: 'Missing file or folderId' }, { status: 400 });
    }

    const fileName = file.name || 'catalog.pdf';
    const buffer = await file.arrayBuffer();
    const base64String = Buffer.from(buffer).toString('base64');
    const dataURI = `data:${file.type || 'application/pdf'};base64,${base64String}`;

    const cloudinaryResponse = await cloudinary.uploader.upload(dataURI, {
      folder: 'catalogue',
      resource_type: 'auto',
    });

    const existing = await db.collection('catalogEntries').where('folderId', '==', folderId).get();
    const order = existing.size;

    const now = new Date();
    const docData = {
      folderId,
      name: name.trim() || fileName,
      description: description.trim(),
      fileUrl: cloudinaryResponse.secure_url,
      fileName,
      order,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection('catalogEntries').add(docData);

    return NextResponse.json({
      id: docRef.id,
      folderId,
      name: docData.name,
      description: docData.description,
      fileUrl: docData.fileUrl,
      fileName: docData.fileName,
      order,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  } catch (error) {
    console.error('[catalog-entries/upload] POST error:', error);
    return NextResponse.json({ error: 'Failed to upload PDF' }, { status: 500 });
  }
}

