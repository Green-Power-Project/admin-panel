'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import type { EmployeeDetailTab } from '@/lib/employees/types';

interface EmployeeDetailTabsProps {
  activeTab: EmployeeDetailTab;
  onChange: (tab: EmployeeDetailTab) => void;
}

const TABS: EmployeeDetailTab[] = [
  'personal',
  'employment',
  'permissions',
  'appAccount',
  'projects',
  'documents',
  'appData',
  'activity',
];

export default function EmployeeDetailTabs({ activeTab, onChange }: EmployeeDetailTabsProps) {
  const { t } = useLanguage();

  const labelKey: Record<EmployeeDetailTab, string> = {
    personal: 'employees.tabPersonal',
    employment: 'employees.tabEmployment',
    permissions: 'employees.tabPermissions',
    appAccount: 'employees.tabAppAccount',
    projects: 'employees.tabProjects',
    documents: 'employees.tabDocuments',
    appData: 'employees.tabAppData',
    activity: 'employees.tabActivity',
  };

  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-gray-200 p-0.5 bg-white">
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={`px-3 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === tab
              ? 'bg-green-power-600 text-white'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {t(labelKey[tab])}
        </button>
      ))}
    </div>
  );
}
