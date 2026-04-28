'use client';

import { useEffect, useRef, useState } from 'react';
import { getViewportFitColumn, type PdfPageLike } from '@/lib/pdfFitViewport';
import { loadPdfJs } from '@/lib/pdfjsClient';

type Props = {
  pdfUrl: string;
  variant?: 'card' | 'flush';
  rootClassName?: string;
};

type PdfDoc = {
  numPages: number;
  destroy?: () => void;
  getPage: (n: number) => Promise<{
    rotate: number;
    getViewport: (o: { scale: number; rotation?: number }) => { width: number; height: number };
    render: (o: {
      canvasContext: CanvasRenderingContext2D;
      viewport: { width: number; height: number };
      canvas: HTMLCanvasElement;
    }) => { promise: Promise<void> };
  }>;
};

async function openPdfDocument(
  pdfjsLib: { getDocument: (src: object) => { promise: Promise<unknown> } },
  pdfUrl: string
): Promise<PdfDoc> {
  const baseOpts = { disableRange: true, disableStream: true, verbosity: 0 } as const;
  const isSameOriginUrl = (() => {
    if (pdfUrl.startsWith('/')) return true;
    if (typeof window === 'undefined') return false;
    try {
      return new URL(pdfUrl).origin === window.location.origin;
    } catch {
      return false;
    }
  })();
  if (isSameOriginUrl) {
    const res = await fetch(pdfUrl, { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) throw new Error(`PDF fetch ${res.status}`);
    const buf = await res.arrayBuffer();
    return (await pdfjsLib
      .getDocument({ data: new Uint8Array(buf), ...baseOpts })
      .promise) as unknown as PdfDoc;
  }
  try {
    return (await pdfjsLib.getDocument({ url: pdfUrl, ...baseOpts }).promise) as unknown as PdfDoc;
  } catch {
    const res = await fetch(pdfUrl, { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) throw new Error(`PDF fetch ${res.status}`);
    const buf = await res.arrayBuffer();
    return (await pdfjsLib
      .getDocument({ data: new Uint8Array(buf), ...baseOpts })
      .promise) as unknown as PdfDoc;
  }
}

function drawPageRenderFailed(canvas: HTMLCanvasElement, layoutWidth: number, pageNum: number) {
  const w = Math.max(120, Math.min(layoutWidth || 320, 800));
  const h = 72;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#f9fafb';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#e5e7eb';
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  ctx.fillStyle = '#6b7280';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(`Page ${pageNum} could not be previewed here.`, 12, 28);
}

export default function PdfCanvasViewer({ pdfUrl, variant = 'card', rootClassName = '' }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<PdfDoc | null>(null);
  const canvasByPageRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const [numPages, setNumPages] = useState(0);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [layoutWidth, setLayoutWidth] = useState(0);

  useEffect(() => {
    let cancelled = false;
    pdfDocRef.current = null;
    setPhase('loading');
    setNumPages(0);
    canvasByPageRef.current.clear();

    (async () => {
      try {
        const pdfjsLib = await loadPdfJs();
        const pdf = await openPdfDocument(
          pdfjsLib as { getDocument: (src: object) => { promise: Promise<unknown> } },
          pdfUrl
        );
        if (cancelled) {
          pdf.destroy?.();
          return;
        }
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        setPhase('ready');
      } catch {
        if (!cancelled) setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
      const d = pdfDocRef.current;
      pdfDocRef.current = null;
      d?.destroy?.();
    };
  }, [pdfUrl]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const w =
        el.clientWidth ||
        el.parentElement?.clientWidth ||
        (typeof window !== 'undefined' ? Math.min(window.innerWidth, 1600) : 0);
      setLayoutWidth((prev) => (w > 0 ? w : prev));
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase]);

  useEffect(() => {
    if (phase !== 'ready' || !numPages || layoutWidth <= 0) return;
    const pdf = pdfDocRef.current;
    if (!pdf) return;
    let cancelled = false;

    (async () => {
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        if (cancelled) return;
        const canvas = canvasByPageRef.current.get(pageNum);
        if (!canvas) continue;
        try {
          const page = await pdf.getPage(pageNum);
          const { viewport, rotation, scale } = getViewportFitColumn(
            page as unknown as PdfPageLike,
            layoutWidth,
            8
          );
          const dpr = typeof window !== 'undefined' ? Math.max(1, Math.min(window.devicePixelRatio || 1, 2)) : 1;
          const renderViewport = (page as unknown as PdfPageLike).getViewport({
            scale: scale * dpr,
            rotation,
          });
          canvas.width = Math.max(1, Math.floor(renderViewport.width));
          canvas.height = Math.max(1, Math.floor(renderViewport.height));
          canvas.style.width = `${Math.max(1, Math.floor(viewport.width))}px`;
          canvas.style.height = `${Math.max(1, Math.floor(viewport.height))}px`;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport: renderViewport, canvas }).promise;
        } catch {
          drawPageRenderFailed(canvas, layoutWidth, pageNum);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, numPages, layoutWidth, pdfUrl]);

  const cardShell =
    variant === 'card'
      ? 'w-full max-w-4xl max-h-[90vh] flex flex-col rounded-lg bg-white overflow-hidden border border-gray-200 shadow-lg min-w-0'
      : 'w-full flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden bg-white';

  const placeholderShell =
    variant === 'card'
      ? 'w-full h-[min(90vh,640px)] max-w-4xl rounded-lg bg-white flex flex-col items-center justify-center border border-gray-200 min-w-0'
      : 'w-full flex flex-1 min-h-[min(200px,40vh)] flex-col items-center justify-center bg-white min-w-0';

  if (phase === 'loading') {
    return (
      <div className={`${placeholderShell} ${rootClassName}`.trim()}>
        <span className="text-gray-500 text-sm">Loading...</span>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className={`${placeholderShell} ${rootClassName}`.trim()}>
        <p className="text-gray-600 text-sm text-center px-4 max-w-md">
          PDF preview unavailable.{' '}
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
            Open in new tab
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className={`${cardShell} ${rootClassName}`.trim()}>
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 min-w-0 w-full overflow-y-auto overflow-x-hidden overscroll-x-contain touch-pan-y bg-gray-50"
      >
        <div className="flex flex-col items-stretch gap-3 p-2 w-full max-w-full min-w-0">
          {Array.from({ length: numPages }, (_, idx) => {
            const pageIndex = idx + 1;
            return (
              <div key={`${pdfUrl}-${pageIndex}`} className="w-full min-w-0 flex justify-center">
                <canvas
                  ref={(el) => {
                    if (el) canvasByPageRef.current.set(pageIndex, el);
                    else canvasByPageRef.current.delete(pageIndex);
                  }}
                  className="block max-w-full h-auto w-auto bg-white shadow-sm"
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
