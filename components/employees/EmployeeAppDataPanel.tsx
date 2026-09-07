'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { isEmployeesDemoMode, subscribeEmployeeAppData } from '@/lib/employees/employeeFirestore';
import type { EmployeeAppData, EmployeeAppDataTab } from '@/lib/employees/types';

interface EmployeeAppDataPanelProps {
  employeeId: string;
  section: EmployeeAppDataTab;
}

export default function EmployeeAppDataPanel({ employeeId, section }: EmployeeAppDataPanelProps) {
  const { t } = useLanguage();
  const [data, setData] = useState<EmployeeAppData | null>(null);

  useEffect(() => {
    return subscribeEmployeeAppData(employeeId, setData);
  }, [employeeId]);

  const titleKey: Record<EmployeeAppDataTab, string> = {
    time: 'employees.appDataTimeTitle',
    leave: 'employees.appDataLeaveTitle',
    deliveryNotes: 'employees.appDataDeliveryNotesTitle',
    materials: 'employees.appDataMaterialsTitle',
    documentation: 'employees.appDataDocumentationTitle',
    measurement: 'employees.appDataMeasurementTitle',
    machines: 'employees.appDataMachinesTitle',
    reports: 'employees.appDataReportsTitle',
  };

  const descKey: Record<EmployeeAppDataTab, string> = {
    time: 'employees.appDataTimeDesc',
    leave: 'employees.appDataLeaveDesc',
    deliveryNotes: 'employees.appDataDeliveryNotesDesc',
    materials: 'employees.appDataMaterialsDesc',
    documentation: 'employees.appDataDocumentationDesc',
    measurement: 'employees.appDataMeasurementDesc',
    machines: 'employees.appDataMachinesDesc',
    reports: 'employees.appDataReportsDesc',
  };

  const rows = data ? data[section] : [];
  const isEmpty = !rows || rows.length === 0;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900">{t(titleKey[section])}</h3>
        <p className="text-sm text-gray-600 mt-1">{t(descKey[section])}</p>
        {isEmployeesDemoMode() && !isEmpty && (
          <p className="text-xs text-amber-700 mt-1">{t('employees.demoDataBadge')}</p>
        )}
      </div>

      {isEmpty ? (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-8 text-center">
          <p className="text-sm font-medium text-gray-700">{t('employees.noAppDataYet')}</p>
          <p className="mt-1 text-xs text-gray-500">{t('employees.noAppDataHint')}</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-x-auto">
          {section === 'time' && (
            <Table
              headers={[
                t('employees.colDate'),
                t('employees.colType'),
                t('employees.colHours'),
                t('employees.colProject'),
                t('employees.colNote'),
              ]}
              rows={data!.time.map((r) => [
                r.date,
                r.entryType === 'report' ? t('employees.entryReport') : t('employees.entryWorking'),
                String(r.hours),
                r.projectName,
                r.note,
              ])}
            />
          )}
          {section === 'leave' && (
            <Table
              headers={[
                t('employees.colFrom'),
                t('employees.colTo'),
                t('employees.colLeaveType'),
                t('employees.colDays'),
                t('employees.colStatus'),
              ]}
              rows={data!.leave.map((r) => [
                r.from,
                r.to,
                r.leaveType,
                String(r.days),
                r.status,
              ])}
            />
          )}
          {section === 'deliveryNotes' && (
            <Table
              headers={[
                t('employees.colNumber'),
                t('employees.colDate'),
                t('employees.colProject'),
                t('employees.colSupplier'),
                t('employees.colLines'),
                t('employees.colStatus'),
              ]}
              rows={data!.deliveryNotes.map((r) => [
                r.number,
                r.date,
                r.projectName,
                r.supplier,
                String(r.lineCount),
                r.status,
              ])}
            />
          )}
          {section === 'materials' && (
            <Table
              headers={[
                t('employees.colMaterial'),
                t('employees.colProject'),
                t('employees.colDelivered'),
                t('employees.colInstalled'),
                t('employees.colRemaining'),
                t('employees.colUnit'),
              ]}
              rows={data!.materials.map((r) => [
                r.material,
                r.projectName,
                String(r.delivered),
                String(r.installed),
                String(r.remaining),
                r.unit,
              ])}
            />
          )}
          {section === 'documentation' && (
            <Table
              headers={[
                t('employees.colTitle'),
                t('employees.colProject'),
                t('employees.colPhotos'),
                t('employees.colDate'),
              ]}
              rows={data!.documentation.map((r) => [
                r.title,
                r.projectName,
                String(r.photoCount),
                r.date,
              ])}
            />
          )}
          {section === 'measurement' && (
            <Table
              headers={[
                t('employees.colPosition'),
                t('employees.colProject'),
                t('employees.colCompleted'),
                t('employees.colRemaining'),
                t('employees.colUnit'),
                t('employees.colDate'),
              ]}
              rows={data!.measurement.map((r) => [
                r.position,
                r.projectName,
                String(r.completed),
                String(r.remaining),
                r.unit,
                r.date,
              ])}
            />
          )}
          {section === 'machines' && (
            <Table
              headers={[
                t('employees.colMachine'),
                t('employees.colProject'),
                t('employees.colHours'),
                t('employees.colDate'),
              ]}
              rows={data!.machines.map((r) => [
                r.machine,
                r.projectName,
                String(r.hours),
                r.date,
              ])}
            />
          )}
          {section === 'reports' && (
            <Table
              headers={[
                t('employees.colTitle'),
                t('employees.colProject'),
                t('employees.colDate'),
                t('employees.colStatus'),
              ]}
              rows={data!.reports.map((r) => [
                r.title,
                r.projectName,
                r.date,
                r.status,
              ])}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          {headers.map((h) => (
            <th
              key={h}
              className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 bg-white">
        {rows.map((row, i) => (
          <tr key={i} className="hover:bg-green-power-50/20">
            {row.map((cell, j) => (
              <td key={j} className="px-3 py-2 text-xs text-gray-700 whitespace-nowrap">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
