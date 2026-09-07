'use client';

import { useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getDemoAppData,
  getDemoEmployees,
  subscribeDemoStore,
} from '@/lib/employees/demoStore';
import {
  getAdminReports,
  subscribeReportReviews,
} from '@/lib/reports/reportsStore';
import type {
  EmployeeDeliveryNoteRecord,
  EmployeeRecord,
  EmployeeTimeEntry,
} from '@/lib/employees/types';
import {
  buildHoursRows,
  buildLvEvaluation,
  EMPTY_HOURS_FILTER,
  filterTimeEntries,
  hoursRowsToCsv,
  sumHours,
  type HoursCategoryFilter,
  type HoursFilter,
  employeeNameOf,
  filterDatedRecords,
  overviewRowsToCsv,
  type OverviewRow,
} from '@/lib/controlling/hoursControl';

export default function ControllingPage() {
  const { t } = useLanguage();
  return (
    <ProtectedRoute>
      <AdminLayout title={t('controlling.title')}>
        <ControllingContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function ControllingContent() {
  const { t } = useLanguage();
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [entries, setEntries] = useState<EmployeeTimeEntry[]>([]);
  const [filter, setFilter] = useState<HoursFilter>({ ...EMPTY_HOURS_FILTER });
  const [reports, setReports] = useState<
    Array<{ id: string; employeeId: string; date: string; projectName: string; title: string; status: string }>
  >([]);
  const [deliveryNotes, setDeliveryNotes] = useState<EmployeeDeliveryNoteRecord[]>([]);
  const [tab, setTab] = useState<'hours' | 'lv' | 'reports' | 'deliveryNotes'>('hours');

  // One subscription: the same demo store the employee screens read.
  useEffect(
    () =>
      subscribeDemoStore(() => {
        const list = getDemoEmployees();
        setEmployees(list);
        setEntries(list.flatMap((e) => getDemoAppData(e.id).time));
        setReports(getAdminReports());
        setDeliveryNotes(list.flatMap((e) => getDemoAppData(e.id).deliveryNotes));
      }),
    [],
  );

  // Report statuses live in the review store, so refresh when they change.
  useEffect(
    () => subscribeReportReviews(() => setReports(getAdminReports())),
    [],
  );

  const projects = useMemo(
    () =>
      Array.from(
        new Set([
          ...entries.map((e) => e.projectName),
          ...reports.map((r) => r.projectName),
          ...deliveryNotes.map((d) => d.projectName),
        ]),
      ).sort(),
    [entries, reports, deliveryNotes],
  );

  const rows = useMemo(
    () => buildHoursRows(filterTimeEntries(entries, filter), employees),
    [entries, filter, employees],
  );
  const totals = useMemo(() => sumHours(rows), [rows]);
  const lvRows = useMemo(() => buildLvEvaluation(rows), [rows]);

  const reportRows: OverviewRow[] = useMemo(
    () =>
      filterDatedRecords(reports, filter)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map((r) => ({
          id: r.id,
          date: r.date,
          employeeName: employeeNameOf(r.employeeId, employees),
          projectName: r.projectName,
          primary: r.title,
          secondary: '',
          status: r.status,
        })),
    [reports, filter, employees],
  );

  const deliveryNoteRows: OverviewRow[] = useMemo(
    () =>
      filterDatedRecords(deliveryNotes, filter)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map((d) => ({
          id: d.id,
          date: d.date,
          employeeName: employeeNameOf(d.employeeId, employees),
          projectName: d.projectName,
          primary: d.number,
          secondary: `${d.supplier} · ${d.lineCount}`,
          status: d.status,
        })),
    [deliveryNotes, filter, employees],
  );

  const exportCsv = () => {
    if (tab === 'reports' || tab === 'deliveryNotes') {
      const overviewRows = tab === 'reports' ? reportRows : deliveryNoteRows;
      const csv = overviewRowsToCsv(overviewRows, [
        t('controlling.date'), t('controlling.employee'), t('controlling.project'),
        tab === 'reports' ? t('controlling.reportTitle') : t('controlling.number'),
        tab === 'reports' ? '' : t('controlling.supplier'),
        t('controlling.status'),
      ]);
      download(csv, `${tab}-${new Date().toISOString().slice(0, 10)}.csv`);
      return;
    }

    const csv = hoursRowsToCsv(rows, [
      t('controlling.date'), t('controlling.employee'), t('controlling.project'),
      t('controlling.type'), t('controlling.start'), t('controlling.end'),
      t('controlling.break'), t('controlling.net'), t('controlling.target'),
      t('controlling.difference'), t('controlling.lv'),
    ]);
    download(csv, `hours-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{t('controlling.title')}</h2>
        <p className="text-sm text-gray-600 mt-1">{t('controlling.desc')}</p>
      </div>

      {/* Filters (requirement 66) */}
      <div className="rounded-lg border border-gray-200 p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <Field label={t('controlling.filterEmployee')}>
          <select
            value={filter.employeeIds[0] ?? ''}
            onChange={(e) =>
              setFilter({ ...filter, employeeIds: e.target.value ? [e.target.value] : [] })
            }
            className={INPUT}
          >
            <option value="">{t('controlling.allEmployees')}</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{`${e.firstName} ${e.lastName}`}</option>
            ))}
          </select>
        </Field>
        <Field label={t('controlling.filterProject')}>
          <select
            value={filter.projectName}
            onChange={(e) => setFilter({ ...filter, projectName: e.target.value })}
            className={INPUT}
          >
            <option value="">{t('controlling.allProjects')}</option>
            {projects.map((p) => (<option key={p} value={p}>{p}</option>))}
          </select>
        </Field>
        <Field label={t('controlling.filterFrom')}>
          <input type="date" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} className={INPUT} />
        </Field>
        <Field label={t('controlling.filterTo')}>
          <input type="date" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} className={INPUT} />
        </Field>
        <Field label={t('controlling.filterCategory')}>
          <select
            value={filter.category}
            onChange={(e) => setFilter({ ...filter, category: e.target.value as HoursCategoryFilter })}
            className={INPUT}
          >
            <option value="all">{t('controlling.all')}</option>
            <option value="working">{t('controlling.working')}</option>
            <option value="report">{t('controlling.report')}</option>
          </select>
        </Field>
        <div className="md:col-span-5 flex flex-wrap gap-3">
          <button type="button" onClick={() => setFilter({ ...EMPTY_HOURS_FILTER })} className="text-xs font-medium text-gray-600 hover:text-gray-900">
            {t('controlling.resetFilters')}
          </button>
          <button type="button" onClick={exportCsv} disabled={rows.length === 0} className="ml-auto px-3 py-1.5 bg-green-power-600 text-white text-xs font-medium rounded-md hover:bg-green-power-700 disabled:opacity-50">
            {t('controlling.export')}
          </button>
        </div>
      </div>

      <div className="flex gap-1 rounded-lg border border-gray-200 p-0.5 bg-white w-fit">
        {(['hours', 'lv', 'reports', 'deliveryNotes'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-3 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors ${
              tab === key ? 'bg-green-power-600 text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t(
              key === 'hours'
                ? 'controlling.tabHours'
                : key === 'lv'
                  ? 'controlling.tabLv'
                  : key === 'reports'
                    ? 'controlling.tabReports'
                    : 'controlling.tabDeliveryNotes',
            )}
          </button>
        ))}
      </div>

      {tab === 'hours' && <HoursTable rows={rows} totals={totals} />}
      {tab === 'lv' && <LvEvaluation rows={lvRows} />}
      {tab === 'reports' && (
        <OverviewTable
          rows={reportRows}
          primaryLabel={t('controlling.reportTitle')}
          secondaryLabel=""
          emptyMessage={t('controlling.reportsEmpty')}
          hint={t('controlling.reportsHint')}
        />
      )}
      {tab === 'deliveryNotes' && (
        <OverviewTable
          rows={deliveryNoteRows}
          primaryLabel={t('controlling.number')}
          secondaryLabel={t('controlling.supplier')}
          emptyMessage={t('controlling.deliveryNotesEmpty')}
          hint={t('controlling.deliveryNotesHint')}
        />
      )}
    </div>
  );
}

function HoursTable({
  rows,
  totals,
}: {
  rows: ReturnType<typeof buildHoursRows>;
  totals: ReturnType<typeof sumHours>;
}) {
  const { t } = useLanguage();
  if (rows.length === 0) {
    return (
      <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-8 text-center">
        <p className="text-sm font-medium text-gray-700">{t('controlling.empty')}</p>
      </div>
    );
  }

  const headers = ['date', 'employee', 'project', 'type', 'start', 'end', 'break', 'net', 'target', 'difference', 'lv'];

  return (
    <div className="border border-gray-200 rounded-lg overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase whitespace-nowrap">
                {t(`controlling.${h}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50">
              <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap">{row.date}</td>
              <td className="px-3 py-2 text-sm text-gray-900">{row.employeeName}</td>
              <td className="px-3 py-2 text-sm text-gray-600">{row.projectName}</td>
              <td className="px-3 py-2 text-sm">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${row.entryType === 'report' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>
                  {row.entryType === 'report' ? t('controlling.report') : t('controlling.working')}
                </span>
              </td>
              <td className="px-3 py-2 text-sm text-gray-600">{row.startTime || '—'}</td>
              <td className="px-3 py-2 text-sm text-gray-600">{row.endTime || '—'}</td>
              <td className="px-3 py-2 text-sm text-gray-600">{row.breakHours === null ? '—' : row.breakHours}</td>
              <td className="px-3 py-2 text-sm font-medium text-gray-900">{row.netHours}</td>
              <td className="px-3 py-2 text-sm text-gray-600">{row.targetHours || '—'}</td>
              <td className={`px-3 py-2 text-sm font-medium ${row.differenceHours < 0 ? 'text-red-600' : row.differenceHours > 0 ? 'text-green-power-700' : 'text-gray-600'}`}>
                {row.differenceHours > 0 ? `+${row.differenceHours}` : row.differenceHours}
              </td>
              <td className="px-3 py-2 text-sm text-gray-600">{row.lvPosition || '—'}</td>
            </tr>
          ))}
          <tr className="bg-gray-50 font-semibold">
            <td className="px-3 py-2 text-sm text-gray-900" colSpan={7}>{t('controlling.totals')}</td>
            <td className="px-3 py-2 text-sm text-gray-900">{totals.net}</td>
            <td className="px-3 py-2 text-sm text-gray-900">{totals.target}</td>
            <td className="px-3 py-2 text-sm text-gray-900">{totals.difference}</td>
            <td className="px-3 py-2" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function LvEvaluation({ rows }: { rows: ReturnType<typeof buildLvEvaluation> }) {
  const { t } = useLanguage();
  if (rows.length === 0) {
    return (
      <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-8 text-center">
        <p className="text-sm font-medium text-gray-700">{t('controlling.lvEmpty')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">{t('controlling.lvHint')}</p>
      {rows.map((row) => (
        <div key={row.lvPosition} className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between bg-gray-50 px-4 py-2 border-b border-gray-200">
            <span className="text-sm font-semibold text-gray-900">{row.lvPosition}</span>
            <span className="text-sm font-semibold text-green-power-700">
              {t('controlling.lvTotal')}: {row.totalHours} h
            </span>
          </div>
          <table className="min-w-full divide-y divide-gray-100">
            <tbody className="divide-y divide-gray-100">
              {row.byEmployee.map((e) => (
                <tr key={e.employeeId}>
                  <td className="px-4 py-2 text-sm text-gray-900">{e.employeeName}</td>
                  <td className="px-4 py-2 text-sm text-gray-600 text-right w-24">{e.hours} h</td>
                  <td className="px-4 py-2 w-40">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-green-power-500" style={{ width: `${e.percentage}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 w-9 text-right">{e.percentage}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function OverviewTable({
  rows,
  primaryLabel,
  secondaryLabel,
  emptyMessage,
  hint,
}: {
  rows: OverviewRow[];
  primaryLabel: string;
  secondaryLabel: string;
  emptyMessage: string;
  hint: string;
}) {
  const { t } = useLanguage();

  if (rows.length === 0) {
    return (
      <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-8 text-center">
        <p className="text-sm font-medium text-gray-700">{emptyMessage}</p>
      </div>
    );
  }

  const statusLabel = (status: string) => {
    const key = `controlling.status${status.charAt(0).toUpperCase()}${status.slice(1)}`;
    const translated = t(key);
    return translated === key ? status : translated;
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">{hint}</p>
      <div className="border border-gray-200 rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {[
                t('controlling.date'),
                t('controlling.employee'),
                t('controlling.project'),
                primaryLabel,
                ...(secondaryLabel ? [secondaryLabel] : []),
                t('controlling.status'),
              ].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap">{row.date}</td>
                <td className="px-3 py-2 text-sm text-gray-900">{row.employeeName}</td>
                <td className="px-3 py-2 text-sm text-gray-600">{row.projectName}</td>
                <td className="px-3 py-2 text-sm font-medium text-gray-900">{row.primary}</td>
                {secondaryLabel ? (
                  <td className="px-3 py-2 text-sm text-gray-600">{row.secondary || '—'}</td>
                ) : null}
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    row.status === 'submitted' || row.status === 'confirmed'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {statusLabel(row.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function download(csv: string, fileName: string) {
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
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
