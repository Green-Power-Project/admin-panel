import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebaseAdmin';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      );
    }

    const imageId = params.id;
    if (!imageId) {
      return NextResponse.json(
        { error: 'Image ID is required' },
        { status: 400 }
      );
    }

    // Get image data from Firestore
    const imageDoc = await adminDb.collection('gallery').doc(imageId).get();
    if (!imageDoc.exists) {
      return NextResponse.json(
        { error: 'Image not found' },
        { status: 404 }
      );
    }

    const imageData = imageDoc.data();

    // Delete from Cloudinary
    if (imageData?.publicId) {
      try {
        await cloudinary.uploader.destroy(imageData.publicId);
      } catch (cloudinaryError) {
        console.error('Error deleting from Cloudinary:', cloudinaryError);
        // Continue with Firestore deletion even if Cloudinary fails
      }
    }

    // Delete from Firestore
    await adminDb.collection('gallery').doc(imageId).delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting gallery image:', error);
    return NextResponse.json(
      { error: 'Failed to delete image' },
      { status: 500 }
    );
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      );
    }

    const imageId = params.id;
    if (!imageId) {
      return NextResponse.json(
        { error: 'Image ID is required' },
        { status: 400 }
      );
    }

    const docSnap = await adminDb.collection('gallery').doc(imageId).get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    const data = docSnap.data()!;
    const normalizeStringArray = (value: unknown): string[] =>
      Array.isArray(value)
        ? value
            .filter((v): v is string => typeof v === 'string')
            .map((v) => String(v).trim())
            .filter((v) => v.length > 0)
        : [];

    return NextResponse.json({
      id: docSnap.id,
      url: data.url ?? '',
      category: data.category ?? '',
      title: data.title ?? '',
      offerEligible: data.offerEligible === true,
      offerItemName: data.offerItemName ?? '',
      offerThickness: data.offerThickness ?? '',
      offerLength: data.offerLength ?? '',
      offerWidth: data.offerWidth ?? '',
      offerHeight: data.offerHeight ?? '',
      offerColorOptions: normalizeStringArray(data.offerColorOptions),
      offerThicknessOptions: normalizeStringArray(data.offerThicknessOptions),
      offerLengthOptions: normalizeStringArray(data.offerLengthOptions),
      offerWidthOptions: normalizeStringArray(data.offerWidthOptions),
      offerHeightOptions: normalizeStringArray(data.offerHeightOptions),
    });
  } catch (error) {
    console.error('Error fetching gallery image:', error);
    return NextResponse.json(
      { error: 'Failed to fetch image' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      );
    }

    const imageId = params.id;
    const body = await request.json();

    if (!imageId) {
      return NextResponse.json(
        { error: 'Image ID is required' },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.title === 'string') updates.title = body.title.trim();
    if (typeof body.category === 'string' && body.category.trim()) updates.category = body.category.trim();
    if (typeof body.isActive === 'boolean') updates.isActive = body.isActive;
    if (typeof body.offerEligible === 'boolean') updates.offerEligible = body.offerEligible;
    if (typeof body.offerItemName === 'string') updates.offerItemName = body.offerItemName;
    if (typeof body.offerThickness === 'string') updates.offerThickness = body.offerThickness;
    if (typeof body.offerLength === 'string') updates.offerLength = body.offerLength;
    if (typeof body.offerWidth === 'string') updates.offerWidth = body.offerWidth;
    if (typeof body.offerHeight === 'string') updates.offerHeight = body.offerHeight;
    const normalizeStringArray = (value: unknown): string[] | undefined =>
      Array.isArray(value)
        ? value
            .filter((v): v is string => typeof v === 'string')
            .map((v) => v.trim())
            .filter((v) => v.length > 0)
        : undefined;

    const colorOptions = normalizeStringArray(body.offerColorOptions);
    const thicknessOptions = normalizeStringArray(body.offerThicknessOptions);
    const lengthOptions = normalizeStringArray(body.offerLengthOptions);
    const widthOptions = normalizeStringArray(body.offerWidthOptions);
    const heightOptions = normalizeStringArray(body.offerHeightOptions);

    if (colorOptions) updates.offerColorOptions = colorOptions;
    if (thicknessOptions) updates.offerThicknessOptions = thicknessOptions;
    if (lengthOptions) updates.offerLengthOptions = lengthOptions;
    if (widthOptions) updates.offerWidthOptions = widthOptions;
    if (heightOptions) updates.offerHeightOptions = heightOptions;

    await adminDb.collection('gallery').doc(imageId).update(updates);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating gallery image:', error);
    return NextResponse.json(
      { error: 'Failed to update image' },
      { status: 500 }
    );
  }
}
