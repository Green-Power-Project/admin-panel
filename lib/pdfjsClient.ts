/**
 * PDF.js needs workerSrc configured in the browser before rendering pages.
 */
export async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;
  }
  return pdfjs;
}
