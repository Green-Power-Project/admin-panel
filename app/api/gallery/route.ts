import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebaseAdmin';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function GET() {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      );
    }

    const gallerySnapshot = await adminDb.collection('gallery')
      .orderBy('uploadedAt', 'desc')
      .get();

    const images = gallerySnapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        url: data.url,
        imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : (data.url ? [data.url] : []),
        category: data.category,
        title: data.title || '',
        uploadedAt: data.uploadedAt?.toDate() || new Date(),
        uploadedBy: data.uploadedBy,
        isActive: data.isActive !== false,
        offerEligible: data.offerEligible === true,
        offerItemName: data.offerItemName || '',
        offerPrice: typeof data.offerPrice === 'string' ? data.offerPrice : '',
        offerQuantityUnit: typeof data.offerQuantityUnit === 'string' ? data.offerQuantityUnit : '',
        offerColorOptions: Array.isArray(data.offerColorOptions) ? data.offerColorOptions : [],
        offerDimensionOptions: Array.isArray(data.offerDimensionOptions) ? data.offerDimensionOptions : [],
        internalNotes: typeof data.internalNotes === 'string' ? data.internalNotes : '',
      };
    });

    return NextResponse.json(images);
  } catch (error) {
    console.error('Error fetching gallery images:', error);
    return NextResponse.json(
      { error: 'Failed to fetch gallery images' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const category = formData.get('category') as string;
    const title = formData.get('title') as string;
    const uploadedBy = formData.get('uploadedBy') as string;
    const projectIdsRaw = formData.get('projectIds') as string | null;
    let projectIds: string[] = [];
    if (projectIdsRaw) {
      try {
        const parsed = JSON.parse(projectIdsRaw);
        projectIds = Array.isArray(parsed) ? parsed.filter((id: unknown) => typeof id === 'string') : [];
      } catch {
        projectIds = [];
      }
    }

    if (!files.length || !category || !uploadedBy) {
      return NextResponse.json(
        { error: 'Missing required fields (files, category, or uploadedBy)' },
        { status: 400 }
      );
    }

    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
      return NextResponse.json(
        { error: 'Gallery upload is not configured (Cloudinary credentials missing).' },
        { status: 500 }
      );
    }

    const uploadedUrls: string[] = [];
    const uploadedPublicIds: string[] = [];

    for (const file of files) {
      // Upload to Cloudinary
      const buffer = await file.arrayBuffer();
      const base64String = Buffer.from(buffer).toString('base64');
      const dataURI = `data:${file.type};base64,${base64String}`;

      const cloudinaryResponse = await cloudinary.uploader.upload(dataURI, {
        folder: `gallery/${category.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        resource_type: 'image',
        transformation: [
          { width: 1200, height: 1200, crop: 'limit', quality: 'auto' },
          { fetch_format: 'auto' }
        ]
      });

      uploadedUrls.push(cloudinaryResponse.secure_url);
      uploadedPublicIds.push(cloudinaryResponse.public_id);
    }

    // Save as a single gallery record, even when multiple files were uploaded.
    const galleryDoc: Record<string, unknown> = {
      url: uploadedUrls[0] ?? '',
      imageUrls: uploadedUrls,
      publicId: uploadedPublicIds[0] ?? '',
      publicIds: uploadedPublicIds,
      category,
      title: title || '',
      uploadedBy,
      uploadedAt: new Date(),
      isActive: true,
      fileCount: files.length,
      fileSize: files.reduce((sum, f) => sum + (f.size || 0), 0),
      fileType: files[0]?.type || '',
    };
    if (projectIds.length > 0) galleryDoc.projectIds = projectIds;

    const docRef = await adminDb.collection('gallery').add(galleryDoc);

    return NextResponse.json({ 
      success: true, 
      uploadedImages: [
        {
          id: docRef.id,
          url: uploadedUrls[0] ?? '',
          imageUrls: uploadedUrls,
          category,
          title: title || '',
        },
      ],
    });
  } catch (error: unknown) {
    console.error('Error uploading gallery images:', error);
    const message = error instanceof Error ? error.message : 'Failed to upload images';
    const isConfig = /cloudinary|credentials|config|environment/i.test(message);
    return NextResponse.json(
      { error: isConfig ? 'Gallery upload is not configured (check Cloudinary and Firebase).' : message },
      { status: 500 }
    );
  }
}
