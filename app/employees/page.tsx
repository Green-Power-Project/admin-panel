'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import Pagination from '@/components/Pagination';
import EmployeeStatusBadge from '@/components/employees/EmployeeStatusBadge';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  enrichEmployeesWithProjects,
  fullName,
  isEmployeesDemoMode,
  loadAllAssignments,
  subscribeEmployees,
  updateEmployee,
} from '@/lib/employees/employeeFirestore';
import type { EmployeeListItem, EmployeeStatus } from '@/lib/employees/types';

type StatusFilter = 'all' | EmployeeStatus;
type AppAccessFilter = 'all' | 'enabled' | 'disabled';

export default function EmployeesPage() {
  const { t } = useLanguage();
  return (
    <ProtectedRoute>
      <AdminLayout title={t('employees.title')}>
        <EmployeesContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function EmployeesContent() {
  const { t } = useLanguage();
  const router = useRouter();
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [appAccessFilter, setAppAccessFilter] = useState<AppAccessFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    let records: EmployeeListItem[] = [];

    const unsub = subscribeEmployees(
      async (list) => {
        const assignments = await loadAllAssignments();
        records = enrichEmployeesWithProjects(list, assignments);
        setEmployees(records);
        setLoading(false);
      },
      () => {
        setLoadError(true);
        setLoading(false);
      },
    );

    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    let list = [...employees];
    const term = search.trim().toLowerCase();

    if (term) {
      list = list.filter((e) => {
        const name = fullName(e).toLowerCase();
        return (
          name.includes(term) ||
          e.employeeNumber.toLowerCase().includes(term) ||
          e.email.toLowerCase().includes(term)
        );
      });
    }

    if (statusFilter !== 'all') {
      list = list.filter((e) => e.status === statusFilter);
    }

    if (appAccessFilter === 'enabled') {
      list = list.filter((e) => e.appAccessEnabled);
    } else if (appAccessFilter === 'disabled') {
      list = list.filter((e) => !e.appAccessEnabled);
    }

    return list;
  }, [employees, search, statusFilter, appAccessFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, appAccessFilter]);

  const handleToggleStatus = async (e: React.MouseEvent, employee: EmployeeListItem) => {
    e.stopPropagation();
    setTogglingId(employee.id);
    const nextStatus: EmployeeStatus = employee.status === 'active' ? 'inactive' : 'active';
    await updateEmployee(employee.id, { status: nextStatus });
    setTogglingId(null);
  };

  const paginated = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-4 sm:space-y-6 min-w-0 max-w-full">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-green-power-50 to-green-power-100">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-lg md:text-xl font-semibold text-gray-900">{t('employees.title')}</h2>
              <p className="text-xs md:text-sm text-gray-600 mt-1">{t('employees.description')}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-3 py-2 rounded-lg bg-white/90 border border-gray-200">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">{t('common.total')}</p>
                <p className="text-sm font-semibold text-gray-900">{filtered.length}</p>
              </div>
              <Link
                href="/employees/new"
                className="px-4 py-2 bg-green-power-600 text-white text-sm font-medium rounded-lg hover:bg-green-power-700 transition-colors"
              >
                + {t('employees.addEmployee')}
              </Link>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/60">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                {t('employees.filterStatus')}
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
              >
                <option value="all">{t('employees.filterAll')}</option>
                <option value="active">{t('employees.statusActive')}</option>
                <option value="inactive">{t('employees.statusInactive')}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                {t('employees.filterAppAccess')}
              </label>
              <select
                value={appAccessFilter}
                onChange={(e) => setAppAccessFilter(e.target.value as AppAccessFilter)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
              >
                <option value="all">{t('employees.filterAll')}</option>
                <option value="enabled">{t('employees.appAccessEnabled')}</option>
                <option value="disabled">{t('employees.appAccessDisabled')}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                {t('employees.searchLabel')}
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('employees.searchPlaceholder')}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500 placeholder:text-gray-400"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4">
          {loadError && !isEmployeesDemoMode() && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              {t('employees.loadErrorHint')}
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 animate-pulse">
                  <div className="h-8 w-8 rounded-full bg-gray-200" />
                  <div className="h-3 w-40 rounded bg-gray-200" />
                  <div className="h-3 w-24 rounded bg-gray-200" />
                  <div className="h-3 w-20 rounded bg-gray-200" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-8 text-center">
              <p className="text-sm font-medium text-gray-700">{t('employees.noEmployees')}</p>
              <p className="mt-1 text-xs text-gray-500">
                {search ? t('employees.tryAdjustingSearch') : t('employees.createFirstEmployee')}
              </p>
              {!search && (
                <Link href="/employees/new" className="mt-4 inline-block text-sm text-green-power-600 hover:text-green-power-700 font-medium">
                  {t('employees.addEmployee')} →
                </Link>
              )}
            </div>
          ) : (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">{t('employees.employeeName')}</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">{t('employees.employeeId')}</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">{t('employees.status')}</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">{t('employees.assignedProjects')}</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">{t('employees.appAccess')}</th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginated.map((employee) => (
                      <tr
                        key={employee.id}
                        onClick={() => router.push(`/employees/${employee.id}`)}
                        className="hover:bg-green-power-50/30 transition-colors cursor-pointer group"
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                              <span className="text-white font-semibold text-xs">
                                {(employee.firstName || employee.lastName || '?').charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="text-xs font-semibold text-gray-900 group-hover:text-green-power-700">
                              {fullName(employee) || '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-600">{employee.employeeNumber || '—'}</td>
                        <td className="px-3 py-2.5">
                          <EmployeeStatusBadge status={employee.status} />
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-600">{employee.assignedProjectCount}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-600">
                          {employee.appAccessEnabled ? t('employees.appAccessEnabled') : t('employees.appAccessDisabled')}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            <Link
                              href={`/employees/${employee.id}`}
                              className="text-[11px] text-green-power-700 hover:text-green-power-800 font-medium"
                            >
                              {t('employees.viewEmployee')}
                            </Link>
                            <Link
                              href={`/employees/${employee.id}?edit=1`}
                              className="text-[11px] text-gray-600 hover:text-gray-800 font-medium"
                            >
                              {t('common.edit')}
                            </Link>
                            <button
                              type="button"
                              onClick={(e) => handleToggleStatus(e, employee)}
                              disabled={togglingId === employee.id}
                              className="text-[11px] text-amber-700 hover:text-amber-800 font-medium disabled:opacity-50"
                            >
                              {employee.status === 'active'
                                ? t('employees.deactivate')
                                : t('employees.activate')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                currentPage={currentPage}
                totalPages={Math.max(1, Math.ceil(filtered.length / itemsPerPage))}
                totalItems={filtered.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={setItemsPerPage}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
