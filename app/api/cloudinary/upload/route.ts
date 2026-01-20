import { NextRequest, NextResponse } from 'next/server';

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

function getAuthHeader() {
  if (!API_KEY || !API_SECRET) return null;
  return `Basic ${Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64')}`;
}

export async function POST(request: NextRequest) {
  if (!CLOUD_NAME) {
    return NextResponse.json({ error: 'Cloudinary not configured' }, { status: 500 });
  }

  const authHeader = getAuthHeader();
  if (!authHeader) {
    return NextResponse.json({ error: 'Cloudinary credentials missing' }, { status: 500 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const folder = (formData.get('folder') as string) || '';
    const publicId = formData.get('public_id') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Determine resource type based on file type
    const fileName = (file as File).name || '';
    const isPDF = fileName.toLowerCase().endsWith('.pdf');
    const resourceType = isPDF ? 'raw' : 'auto';
    
    const uploadForm = new FormData();
    uploadForm.append('file', file);
    
    // Explicitly set resource_type for PDFs
    if (isPDF) {
      uploadForm.append('resource_type', 'raw');
    }
    
    // If public_id is provided and contains a path (has slashes), don't use folder
    // public_id should be the full path including folder structure
    if (publicId) {
      uploadForm.append('public_id', publicId);
      // Don't append folder if public_id already contains the full path
    } else if (folder) {
      // Only use folder if public_id is not provided
      uploadForm.append('folder', folder);
    }
    
    const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || process.env.CLOUDINARY_UPLOAD_PRESET;
    if (preset) {
      uploadForm.append('upload_preset', preset);
    }

    const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
      } as HeadersInit,
      body: uploadForm,
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: `Cloudinary upload failed: ${error}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Cloudinary upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Upload failed' },
      { status: 500 }
    );
  }
}

