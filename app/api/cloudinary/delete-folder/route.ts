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
    const { folderPath } = await request.json();
    if (!folderPath) {
      return NextResponse.json({ error: 'Folder path required' }, { status: 400 });
    }

    const listUrl = new URL(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources`);
    listUrl.searchParams.set('resource_type', 'auto');
    listUrl.searchParams.set('type', 'upload');
    listUrl.searchParams.set('prefix', `${folderPath}/`);
    listUrl.searchParams.set('max_results', '500');

    const listResponse = await fetch(listUrl.toString(), {
      headers: { Authorization: authHeader } as HeadersInit,
    });

    if (!listResponse.ok) {
      const error = await listResponse.text();
      return NextResponse.json(
        { error: `Failed to list folder: ${error}` },
        { status: listResponse.status }
      );
    }

    const data = await listResponse.json();
    const resources = data.resources || [];

    const deletePromises = resources.map((resource: any) => {
      const deleteUrl = new URL(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/${encodeURIComponent(resource.public_id)}`);
      deleteUrl.searchParams.set('resource_type', 'auto');
      return fetch(deleteUrl.toString(), {
        method: 'DELETE',
        headers: { Authorization: authHeader } as HeadersInit,
      });
    });

    await Promise.all(deletePromises);

    return NextResponse.json({ success: true, deleted: resources.length });
  } catch (error: any) {
    console.error('Cloudinary delete folder error:', error);
    return NextResponse.json(
      { error: error.message || 'Delete folder failed' },
      { status: 500 }
    );
  }
}

