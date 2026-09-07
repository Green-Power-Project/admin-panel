'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import { useLanguage } from '@/contexts/LanguageContext';
import { createEmployee } from '@/lib/employees/employeeFirestore';
import {
  getWorkingTimeModels,
  subscribeTemplates,
} from '@/lib/templates/templatesStore';
import type { WorkingTimeModel } from '@/lib/employees/types';
import {
  DEFAULT_EMPLOYEE_ROLES,
  DEFAULT_PERMISSIONS,
  DEFAULT_WORKING_TIME_MODELS,
  PERMISSION_KEYS,
  weeklyTargetHours,
  workingTimeFromModel,
} from '@/lib/employees/types';
import type {
  EmployeePermissions,
  EmployeeRecord,
} from '@/lib/employees/types';

const defaultForm: Omit<EmployeeRecord, 'id' | 'createdAt' | 'updatedAt'> = {
  employeeNumber: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  role: 'skilledWorker',
  status: 'active',
  appAccessEnabled: true,
  language: 'de',
  jobTitle: '',
  department: '',
  startDate: '',
  endDate: '',
  workingTime: workingTimeFromModel(DEFAULT_WORKING_TIME_MODELS[0]),
  permissions: { ...DEFAULT_PERMISSIONS },
  notes: '',
  assignedProjectIds: [],
};

export default function NewEmployeePage() {
  const { t } = useLanguage();
  return (
    <ProtectedRoute>
      <AdminLayout title={t('employeesNew.title')}>
        <NewEmployeeContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function NewEmployeeContent() {
  const { t } = useLanguage();
  const router = useRouter();
  const [form, setForm] = useState(defaultForm);
  const [workingTimeModels, setWorkingTimeModels] = useState<
    WorkingTimeModel[]
  >(DEFAULT_WORKING_TIME_MODELS);

  useEffect(
    () => subscribeTemplates(() => setWorkingTimeModels(getWorkingTimeModels())),
    [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Built-in roles are translated; fall back to the catalogue label.
  const roleLabel = (id: string, fallback: string) => {
    const key = `employees.role${id.charAt(0).toUpperCase()}${id.slice(1)}`;
    const translated = t(key);
    return translated === key ? fallback : translated;
  };

  const applyWorkingTimeModel = (modelId: string) => {
    const model = workingTimeModels.find((m) => m.id === modelId);
    if (!model) return;
    setForm((prev) => ({ ...prev, workingTime: workingTimeFromModel(model) }));
  };

  const togglePermission = (key: keyof EmployeePermissions, value: boolean) => {
    setForm((prev) => ({
      ...prev,
      permissions: { ...prev.permissions, [key]: value },
    }));
  };

  const permissionLabel = (key: keyof EmployeePermissions) =>
    t(`employees.perm${key.charAt(0).toUpperCase()}${key.slice(1)}`);

  const update = (field: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError(t('employeesNew.nameRequired'));
      return;
    }
    if (!form.employeeNumber.trim()) {
      setError(t('employeesNew.employeeIdRequired'));
      return;
    }

    setSaving(true);
    const id = await createEmployee(form);
    setSaving(false);

    if (id) {
      router.push(`/employees/${id}`);
      return;
    }

    setError(t('employeesNew.saveFailed'));
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
      <div className="max-w-3xl mx-auto">
        <Link href="/employees" className="text-sm text-green-power-600 hover:text-green-power-700 font-medium">
          ← {t('employeesNew.backToEmployees')}
        </Link>

        <div className="mt-4 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-green-power-50 to-green-power-100">
            <h2 className="text-lg font-semibold text-gray-900">{t('employeesNew.title')}</h2>
            <p className="text-sm text-gray-600 mt-1">{t('employeesNew.description')}</p>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-6 space-y-6">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">{t('employees.personalInfoTitle')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label={t('employees.employeeId')} required>
                  <input
                    value={form.employeeNumber}
                    onChange={(e) => update('employeeNumber', e.target.value)}
                    className="field-input"
                    required
                  />
                </Field>
                <Field label={t('employees.role')}>
                  <select
                    value={form.role}
                    onChange={(e) => update('role', e.target.value)}
                    className="field-input"
                  >
                    {DEFAULT_EMPLOYEE_ROLES.map((role) => (
                      <option key={role.id} value={role.id}>
                        {roleLabel(role.id, role.label)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('employees.firstName')} required>
                  <input value={form.firstName} onChange={(e) => update('firstName', e.target.value)} className="field-input" required />
                </Field>
                <Field label={t('employees.lastName')} required>
                  <input value={form.lastName} onChange={(e) => update('lastName', e.target.value)} className="field-input" required />
                </Field>
                <Field label={t('common.email')}>
                  <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} className="field-input" />
                </Field>
                <Field label={t('employees.phone')}>
                  <input type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} className="field-input" />
                </Field>
                <Field label={t('employees.jobTitle')}>
                  <input value={form.jobTitle} onChange={(e) => update('jobTitle', e.target.value)} className="field-input" />
                </Field>
                <Field label={t('employees.department')}>
                  <input value={form.department} onChange={(e) => update('department', e.target.value)} className="field-input" />
                </Field>
                <Field label={t('employees.startDate')}>
                  <input type="date" value={form.startDate} onChange={(e) => update('startDate', e.target.value)} className="field-input" />
                </Field>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">
                {t('employees.employmentTitle')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label={t('employees.workingTimeModel')}>
                  <select
                    value={form.workingTime.modelId ?? ''}
                    onChange={(e) => applyWorkingTimeModel(e.target.value)}
                    className="field-input"
                  >
                    {workingTimeModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('employees.targetHoursPerWeek')}>
                  <p className="text-sm text-gray-900 pt-2">
                    {weeklyTargetHours(form.workingTime)
                      .toFixed(2)
                      .replace(/\.00$/, '')}{' '}
                    h
                  </p>
                </Field>
              </div>
              <p className="text-xs text-gray-500">
                {t('employees.workingTimeModelHint')}
              </p>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">
                {t('employees.permissionsTitle')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {PERMISSION_KEYS.map((key) => (
                  <label
                    key={key}
                    className="flex items-center gap-3 rounded-lg border border-gray-300 px-3 py-2 cursor-pointer hover:border-green-power-400"
                  >
                    <input
                      type="checkbox"
                      checked={form.permissions[key]}
                      onChange={(e) => togglePermission(key, e.target.checked)}
                      className="rounded border-gray-300 text-green-power-600 focus:ring-green-power-500"
                    />
                    <span className="text-sm text-gray-900">
                      {permissionLabel(key)}
                    </span>
                  </label>
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">{t('employees.appAccountTitle')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label={t('employees.appLanguage')}>
                  <select value={form.language} onChange={(e) => update('language', e.target.value)} className="field-input">
                    <option value="de">{t('employees.languageDe')}</option>
                    <option value="en">{t('employees.languageEn')}</option>
                  </select>
                </Field>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      checked={form.appAccessEnabled}
                      onChange={(e) => update('appAccessEnabled', e.target.checked)}
                      className="rounded border-gray-300 text-green-power-600 focus:ring-green-power-500"
                    />
                    <span className="text-sm text-gray-900">{t('employees.appAccessEnabled')}</span>
                  </label>
                </div>
              </div>
            </section>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-green-power-600 text-white text-sm font-medium rounded-lg hover:bg-green-power-700 disabled:opacity-50"
              >
                {saving ? t('employeesNew.saving') : t('employeesNew.createEmployee')}
              </button>
              <Link
                href="/employees"
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                {t('common.cancel')}
              </Link>
            </div>
          </form>
        </div>
      </div>

      <style jsx global>{`
        .field-input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          background: white;
        }
        .field-input:focus {
          outline: none;
          ring: 1px;
          border-color: #16a34a;
          box-shadow: 0 0 0 1px #16a34a;
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1.5">
        {label}
        {required && ' *'}
      </label>
      {children}
    </div>
  );
}
