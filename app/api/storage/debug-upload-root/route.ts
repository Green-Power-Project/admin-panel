import { NextRequest, NextResponse } from 'next/server';
import { getUploadRoot } from '@/lib/server/vpsStorage';

/**
 * Temporary: GET /api/storage/debug-upload-root?secret=STORAGE_DEBUG_SECRET
 * Remove after fixing VPS paths. Set STORAGE_DEBUG_SECRET in .env.production.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.STORAGE_DEBUG_SECRET?.trim();
  const got = request.nextUrl.searchParams.get('secret');
  if (!expected || got !== expected) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.json({
    uploadRoot: getUploadRoot(),
    VPS_UPLOAD_DIR: process.env.VPS_UPLOAD_DIR ?? null,
    cwd: process.cwd(),
  });
}
