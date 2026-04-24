import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function isAllowedDownloadTarget(rawUrl: string): boolean {
  // Allow same-origin relative paths (e.g. /uploads/...)
  if (rawUrl.startsWith('/')) return true;

  try {
    const target = new URL(rawUrl);
    const allowed = new Set<string>();

    const adminBase = process.env.ADMIN_PANEL_URL?.trim();
    if (adminBase) {
      try {
        allowed.add(new URL(adminBase).origin);
      } catch {
        // Ignore invalid env value
      }
    }

    const publicBase = process.env.VPS_PUBLIC_BASE_URL?.trim();
    if (publicBase && /^https?:\/\//i.test(publicBase)) {
      try {
        allowed.add(new URL(publicBase).origin);
      } catch {
        // Ignore invalid env value
      }
    }

    // Local dev default allow-list
    allowed.add('http://localhost:3000');
    allowed.add('https://admin.gruen-power.cloud');

    return allowed.has(target.origin);
  } catch {
    return false;
  }
}

function contentDisposition(fileName: string): string {
  const safe = (fileName || 'download').replace(/[\r\n"]/g, '_');
  return `attachment; filename="${safe}"`;
}

export async function GET(request: NextRequest) {
  try {
    const rawUrl = request.nextUrl.searchParams.get('url') || '';
    const fileName = request.nextUrl.searchParams.get('fileName') || 'download';

    if (!rawUrl) {
      return NextResponse.json({ error: 'Missing url' }, { status: 400 });
    }
    if (!isAllowedDownloadTarget(rawUrl)) {
      return NextResponse.json({ error: 'Forbidden target' }, { status: 403 });
    }

    let targetUrl = rawUrl;
    if (rawUrl.startsWith('/')) {
      targetUrl = new URL(rawUrl, request.nextUrl.origin).toString();
    }

    const upstream = await fetch(targetUrl, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow',
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: `Upstream failed (${upstream.status})` }, { status: 502 });
    }

    const bytes = await upstream.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
        'Content-Disposition': contentDisposition(fileName),
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('[storage/proxy-download] GET error:', error);
    return NextResponse.json({ error: 'Failed to proxy download' }, { status: 500 });
  }
}

