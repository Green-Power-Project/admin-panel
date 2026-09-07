'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getEmployeeActivityItems,
  isEmployeesDemoMode,
} from '@/lib/employees/employeeFirestore';
import { subscribeDemoStore } from '@/lib/employees/demoStore';
import type { EmployeeActivityType, ProjectOption } from '@/lib/employees/types';

interface ActivitySectionProps {
  employeeId: string;
  projects: ProjectOption[];
}

export default function ActivitySection({ employeeId, projects }: ActivitySectionProps) {
  const { t } = useLanguage();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<EmployeeActivityType | ''>('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isEmployeesDemoMode()) return;
    return subscribeDemoStore(() => setTick((n) => n + 1));
  }, []);

  const activityTypes: EmployeeActivityType[] = useMemo(
    () => [
      'time',
      'leave',
      'deliveryNotes',
      'materials',
      'documentation',
      'measurement',
      'machines',
      'reports',
    ],
    [],
  );

  const typeLabel: Record<EmployeeActivityType, string> = {
    time: t('employees.appDataTime'),
    leave: t('employees.appDataLeave'),
    deliveryNotes: t('employees.appDataDeliveryNotes'),
    materials: t('employees.appDataMaterials'),
    documentation: t('employees.appDataDocumentation'),
    measurement: t('employees.appDataMeasurement'),
    machines: t('employees.appDataMachines'),
    reports: t('employees.appDataReports'),
  };

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.id, p.name);
    return map;
  }, [projects]);

  const filtered = useMemo(() => {
    void tick;
    let items = getEmployeeActivityItems(employeeId);

    if (typeFilter) {
      items = items.filter((a) => a.type === typeFilter);
    }

    if (projectFilter) {
      const name = projectNameById.get(projectFilter);
      if (name) {
        items = items.filter((a) => a.projectName === name);
      }
    }

    if (dateFrom) {
      const from = new Date(dateFrom);
      items = items.filter((a) => a.date >= from);
    }

    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      items = items.filter((a) => a.date <= to);
    }

    return items;
  }, [employeeId, typeFilter, projectFilter, projectNameById, dateFrom, dateTo, tick]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-gray-900">{t('employees.activityTitle')}</h3>
        <p className="text-sm text-gray-600 mt-1">{t('employees.activityDesc')}</p>
        {isEmployeesDemoMode() && filtered.length > 0 && (
          <p className="text-xs text-amber-700 mt-1">{t('employees.demoDataBadge')}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            {t('employees.filterDateFrom')}
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            {t('employees.filterDateTo')}
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            {t('employees.filterProject')}
          </label>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
          >
            <option value="">{t('employees.allProjects')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            {t('employees.filterActivityType')}
          </label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as EmployeeActivityType | '')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
          >
            <option value="">{t('employees.allActivityTypes')}</option>
            {activityTypes.map((type) => (
              <option key={type} value={type}>
                {typeLabel[type]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-8 text-center">
          <p className="text-sm font-medium text-gray-700">{t('employees.noActivityYet')}</p>
          <p className="mt-1 text-xs text-gray-500">{t('employees.noActivityHint')}</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">
                  {t('employees.colDate')}
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">
                  {t('employees.filterActivityType')}
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">
                  {t('employees.colTitle')}
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">
                  {t('employees.colProject')}
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">
                  {t('employees.colSummary')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-green-power-50/20">
                  <td className="px-3 py-2 text-xs text-gray-700 whitespace-nowrap">
                    {item.date.toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                    {typeLabel[item.type]}
                  </td>
                  <td className="px-3 py-2 text-xs font-medium text-gray-900">{item.title}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{item.projectName}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{item.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
