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
        const pdf = (await pdfjsLib.getDocument({ url: pdfUrl }).promise) as unknown as PdfDoc;
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
          const { viewport } = getViewportFitColumn(page as unknown as PdfPageLike, layoutWidth, 8);
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        } catch {
          if (!cancelled) setPhase('error');
          return;
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
    const iframeShell =
      variant === 'card'
        ? 'w-full max-w-4xl max-h-[90vh] flex flex-col rounded-lg bg-white overflow-hidden border border-gray-200 shadow-lg min-w-0 min-h-[min(90vh,640px)]'
        : 'w-full flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden bg-white min-h-[min(55vh,480px)]';
    const iframeMin = variant === 'card' ? 'min-h-[min(70vh,560px)]' : 'min-h-[min(50vh,420px)]';
    return (
      <div className={`${iframeShell} ${rootClassName}`.trim()}>
        <iframe src={pdfUrl} title="PDF" className={`block w-full flex-1 border-0 bg-white ${iframeMin}`} />
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
