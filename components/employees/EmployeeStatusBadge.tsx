'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import type { EmployeeStatus } from '@/lib/employees/types';

interface EmployeeStatusBadgeProps {
  status: EmployeeStatus;
}

export default function EmployeeStatusBadge({ status }: EmployeeStatusBadgeProps) {
  const { t } = useLanguage();
  const active = status === 'active';

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
        active
          ? 'bg-green-100 text-green-800'
          : 'bg-gray-100 text-gray-600'
      }`}
    >
      {active ? t('employees.statusActive') : t('employees.statusInactive')}
    </span>
  );
}
