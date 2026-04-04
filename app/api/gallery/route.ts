import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebaseAdmin';
import { saveGalleryImage } from '@/lib/server/vpsStorage';

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

    const uploadedUrls: string[] = [];
    const storagePaths: string[] = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const saved = await saveGalleryImage({
        buffer,
        category,
        originalName: file.name || 'image',
      });
      uploadedUrls.push(saved.fileUrl);
      storagePaths.push(saved.storagePath);
    }

    // Save as a single gallery record, even when multiple files were uploaded.
    const galleryDoc: Record<string, unknown> = {
      url: uploadedUrls[0] ?? '',
      imageUrls: uploadedUrls,
      storagePaths,
      storageProvider: 'vps',
      publicId: '',
      publicIds: [],
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
