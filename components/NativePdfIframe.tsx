'use client';

type Props = {
  src: string;
  title?: string;
  className?: string;
};

/** Native browser PDF viewer in an iframe (consistent across devices vs PDF.js). */
export default function NativePdfIframe({ src, title = 'PDF', className = '' }: Props) {
  return (
    <iframe
      src={src}
      title={title}
      className={`block w-full max-w-full border-0 bg-white [color-scheme:light] ${className}`.trim()}
    />
  );
}
