'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import type { EmployeeAppDataTab } from '@/lib/employees/types';

interface EmployeeAppDataTabsProps {
  activeTab: EmployeeAppDataTab;
  onChange: (tab: EmployeeAppDataTab) => void;
}

const TABS: EmployeeAppDataTab[] = [
  'time',
  'leave',
  'deliveryNotes',
  'materials',
  'documentation',
  'measurement',
  'machines',
  'reports',
];

export default function EmployeeAppDataTabs({ activeTab, onChange }: EmployeeAppDataTabsProps) {
  const { t } = useLanguage();

  const labelKey: Record<EmployeeAppDataTab, string> = {
    time: 'employees.appDataTime',
    leave: 'employees.appDataLeave',
    deliveryNotes: 'employees.appDataDeliveryNotes',
    materials: 'employees.appDataMaterials',
    documentation: 'employees.appDataDocumentation',
    measurement: 'employees.appDataMeasurement',
    machines: 'employees.appDataMachines',
    reports: 'employees.appDataReports',
  };

  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-gray-200 p-0.5 bg-gray-50">
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={`px-2.5 py-1.5 text-[11px] sm:text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === tab
              ? 'bg-green-power-600 text-white'
              : 'text-gray-600 hover:text-gray-900 bg-white'
          }`}
        >
          {t(labelKey[tab])}
        </button>
      ))}
    </div>
  );
}
