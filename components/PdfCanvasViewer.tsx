'use client';

type Props = {
  pdfUrl: string;
  variant?: 'card' | 'flush';
  rootClassName?: string;
};

export default function PdfCanvasViewer({ pdfUrl, variant = 'card', rootClassName = '' }: Props) {
  const shell =
    variant === 'card'
      ? 'w-full max-w-4xl rounded-lg bg-white border border-gray-200 shadow-lg min-w-0 p-6'
      : 'w-full rounded-lg bg-white border border-gray-200 min-w-0 p-6';

  return (
    <div className={`${shell} ${rootClassName}`.trim()}>
      <div className="flex flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-gray-600">PDF preview opens in a new tab.</p>
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-4 py-2 rounded-lg bg-green-power-600 text-white text-sm font-medium hover:bg-green-power-700"
        >
          Open PDF
        </a>
      </div>
    </div>
  );
}
