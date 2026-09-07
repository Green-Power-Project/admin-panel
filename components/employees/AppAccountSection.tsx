'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import EmployeeStatusBadge from '@/components/employees/EmployeeStatusBadge';
import type { EmployeeRecord } from '@/lib/employees/types';

interface AppAccountSectionProps {
  employee: EmployeeRecord;
  editing: boolean;
  form: Partial<EmployeeRecord>;
  onChange: (field: keyof EmployeeRecord, value: string | boolean) => void;
}

export default function AppAccountSection({
  employee,
  editing,
  form,
  onChange,
}: AppAccountSectionProps) {
  const { t } = useLanguage();

  const appAccessEnabled = editing
    ? form.appAccessEnabled !== false
    : employee.appAccessEnabled;
  const language = editing
    ? (form.language ?? employee.language)
    : employee.language;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-gray-900">{t('employees.appAccountTitle')}</h3>
        <p className="text-sm text-gray-600 mt-1">{t('employees.appAccountDesc')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium text-gray-500">{t('employees.employmentStatus')}</p>
          <div className="mt-1">
            <EmployeeStatusBadge status={employee.status} />
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-gray-500">{t('employees.appAccess')}</p>
          {editing ? (
            <label className="mt-2 flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={appAccessEnabled}
                onChange={(e) => onChange('appAccessEnabled', e.target.checked)}
                className="rounded border-gray-300 text-green-power-600 focus:ring-green-power-500"
              />
              <span className="text-sm text-gray-900">{t('employees.appAccessEnabled')}</span>
            </label>
          ) : (
            <p className="text-sm text-gray-900 mt-0.5">
              {appAccessEnabled ? t('employees.appAccessEnabled') : t('employees.appAccessDisabled')}
            </p>
          )}
        </div>

        <div>
          <p className="text-xs font-medium text-gray-500">{t('common.email')}</p>
          <p className="text-sm text-gray-900 mt-0.5">{employee.email || '—'}</p>
          <p className="text-xs text-gray-500 mt-1">{t('employees.loginEmailHint')}</p>
        </div>

        <div>
          <p className="text-xs font-medium text-gray-500">{t('employees.appLanguage')}</p>
          {editing ? (
            <select
              value={language}
              onChange={(e) => onChange('language', e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500"
            >
              <option value="de">{t('employees.languageDe')}</option>
              <option value="en">{t('employees.languageEn')}</option>
            </select>
          ) : (
            <p className="text-sm text-gray-900 mt-0.5">
              {language === 'en' ? t('employees.languageEn') : t('employees.languageDe')}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
        <p className="text-xs text-amber-800">{t('employees.noPasswordDisplay')}</p>
      </div>
    </div>
  );
}
