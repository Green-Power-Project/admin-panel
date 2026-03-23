'use client';

export default function UnreadBadge({
  count,
  className = '',
  size = 'md',
}: {
  count: number;
  className?: string;
  size?: 'sm' | 'md';
}) {
  if (count <= 0) return null;
  const sizeCls =
    size === 'sm'
      ? 'min-w-[16px] h-4 px-1 text-[10px]'
      : 'min-w-[20px] h-5 px-1.5 text-xs';
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-red-500 text-white font-bold leading-none ${sizeCls} ${className}`}
      aria-label={String(count)}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
