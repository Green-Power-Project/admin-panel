'use client';

import { useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import ReportStatusBadge from '@/components/reports/ReportStatusBadge';
import ReportReviewPanel from '@/components/reports/ReportReviewPanel';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getAdminReports,
  subscribeReportReviews,
} from '@/lib/reports/reportsStore';
import { subscribeDemoStore } from '@/lib/employees/demoStore';
import {
  ADMIN_REPORT_STATUSES,
  type AdminReport,
  type AdminReportStatus,
} from '@/lib/reports/types';

export default function AdminReportsPage() {
  const { t } = useLanguage();
  return (
    <ProtectedRoute>
      <AdminLayout title={t('adminReports.title')}>
        <ReportsContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

interface Filter {
  employeeId: string;
  projectName: string;
  status: 'all' | AdminReportStatus;
  from: string;
  to: string;
}

const EMPTY_FILTER: Filter = {
  employeeId: '',
  projectName: '',
  status: 'all',
  from: '',
  to: '',
};

function ReportsContent() {
  const { t } = useLanguage();
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [filter, setFilter] = useState<Filter>({ ...EMPTY_FILTER });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Both stores feed the list: the employee data supplies the reports, the
  // review store supplies their office status.
  useEffect(() => {
    const recompute = () => setReports(getAdminReports());
    const unsubEmployees = subscribeDemoStore(recompute);
    const unsubReviews = subscribeReportReviews(recompute);
    return () => {
      unsubEmployees();
      unsubReviews();
    };
  }, []);

  const employees = useMemo(() => {
    const map = new Map<string, string>();
    reports.forEach((r) => map.set(r.employeeId, r.employeeName));
    return Array.from(map.entries());
  }, [reports]);

  const projects = useMemo(
    () => Array.from(new Set(reports.map((r) => r.projectName))).sort(),
    [reports],
  );

  const visible = useMemo(
    () =>
      reports.filter((r) => {
        if (filter.employeeId && r.employeeId !== filter.employeeId) return false;
        if (filter.projectName && r.projectName !== filter.projectName) return false;
        if (filter.status !== 'all' && r.status !== filter.status) return false;
        if (filter.from && r.date < filter.from) return false;
        if (filter.to && r.date > filter.to) return false;
        return true;
      }),
    [reports, filter],
  );

  const selected = useMemo(
    () => reports.find((r) => r.id === selectedId) ?? null,
    [reports, selectedId],
  );

  if (selected) {
    return (
      <ReportReviewPanel
        report={selected}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{t('adminReports.title')}</h2>
        <p className="text-sm text-gray-600 mt-1">{t('adminReports.desc')}</p>
      </div>

      <div className="rounded-lg border border-gray-200 p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <Field label={t('adminReports.filterEmployee')}>
          <select value={filter.employeeId} onChange={(e) => setFilter({ ...filter, employeeId: e.target.value })} className={INPUT}>
            <option value="">{t('adminReports.allEmployees')}</option>
            {employees.map(([id, name]) => (<option key={id} value={id}>{name}</option>))}
          </select>
        </Field>
        <Field label={t('adminReports.filterProject')}>
          <select value={filter.projectName} onChange={(e) => setFilter({ ...filter, projectName: e.target.value })} className={INPUT}>
            <option value="">{t('adminReports.allProjects')}</option>
            {projects.map((p) => (<option key={p} value={p}>{p}</option>))}
          </select>
        </Field>
        <Field label={t('adminReports.filterStatus')}>
          <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value as 'all' | AdminReportStatus })} className={INPUT}>
            <option value="all">{t('adminReports.allStatuses')}</option>
            {ADMIN_REPORT_STATUSES.map((s) => (
              <option key={s} value={s}>{t(`adminReports.status${s.charAt(0).toUpperCase()}${s.slice(1)}`)}</option>
            ))}
          </select>
        </Field>
        <Field label={t('adminReports.filterFrom')}>
          <input type="date" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} className={INPUT} />
        </Field>
        <Field label={t('adminReports.filterTo')}>
          <input type="date" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} className={INPUT} />
        </Field>
        <div className="md:col-span-5">
          <button type="button" onClick={() => setFilter({ ...EMPTY_FILTER })} className="text-xs font-medium text-gray-600 hover:text-gray-900">
            {t('adminReports.reset')}
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-8 text-center">
          <p className="text-sm font-medium text-gray-700">{t('adminReports.empty')}</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['date', 'reportTitle', 'employee', 'project', 'status'].map((k) => (
                  <th key={k} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase whitespace-nowrap">
                    {t(`adminReports.${k}`)}
                  </th>
                ))}
                <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((report) => (
                <tr key={report.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap">{report.date}</td>
                  <td className="px-3 py-2 text-sm font-medium text-gray-900">{report.title}</td>
                  <td className="px-3 py-2 text-sm text-gray-600">{report.employeeName}</td>
                  <td className="px-3 py-2 text-sm text-gray-600">{report.projectName}</td>
                  <td className="px-3 py-2"><ReportStatusBadge status={report.status} /></td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => setSelectedId(report.id)} className="text-xs font-medium text-green-power-700 hover:text-green-power-800">
                      {t('adminReports.open')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const INPUT =
  'w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
