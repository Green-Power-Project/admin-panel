import { NextRequest, NextResponse } from 'next/server';
import { listProjectResourcesByPrefix } from '@/lib/server/vpsStorage';

export async function GET(request: NextRequest) {
  const folder = request.nextUrl.searchParams.get('folder') || '';

  try {
    const resources = await listProjectResourcesByPrefix(folder);
    return NextResponse.json({ resources });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list files';
    console.error('[storage/list]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
