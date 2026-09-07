'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import type { AdminReportStatus } from '@/lib/reports/types';

const TONE: Record<AdminReportStatus, string> = {
  submitted: 'bg-gray-100 text-gray-700',
  checked: 'bg-blue-100 text-blue-800',
  edited: 'bg-amber-100 text-amber-800',
  released: 'bg-green-100 text-green-800',
};

/** Current office state of a report (requirement 61). */
export default function ReportStatusBadge({
  status,
}: {
  status: AdminReportStatus;
}) {
  const { t } = useLanguage();
  const key = `adminReports.status${status.charAt(0).toUpperCase()}${status.slice(1)}`;

  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${TONE[status]}`}
    >
      {t(key)}
    </span>
  );
}
