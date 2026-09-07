'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import {
  PERMISSION_KEYS,
  type EmployeePermissions,
  type EmployeeRecord,
} from '@/lib/employees/types';

interface PermissionsSectionProps {
  employee: EmployeeRecord;
  editing: boolean;
  form: Partial<EmployeeRecord>;
  onChange: (permissions: EmployeePermissions) => void;
}

const LABEL_KEY: Record<keyof EmployeePermissions, string> = {
  recordOwnHours: 'employees.permRecordOwnHours',
  recordColleagueHours: 'employees.permRecordColleagueHours',
  correctHours: 'employees.permCorrectHours',
  createReports: 'employees.permCreateReports',
  orderMaterial: 'employees.permOrderMaterial',
  createMeasurements: 'employees.permCreateMeasurements',
  scanDeliveryNotes: 'employees.permScanDeliveryNotes',
  viewProjectDocuments: 'employees.permViewProjectDocuments',
  editTasks: 'employees.permEditTasks',
  viewOtherEmployees: 'employees.permViewOtherEmployees',
};

/** Per-employee app permissions (requirement 52). */
export default function PermissionsSection({
  employee,
  editing,
  form,
  onChange,
}: PermissionsSectionProps) {
  const { t } = useLanguage();

  const permissions = (editing ? form.permissions : employee.permissions) ??
    employee.permissions;

  const grantedCount = PERMISSION_KEYS.filter((key) => permissions[key]).length;

  const toggle = (key: keyof EmployeePermissions, value: boolean) => {
    onChange({ ...permissions, [key]: value });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-gray-900">
          {t('employees.permissionsTitle')}
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          {t('employees.permissionsDesc')}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {t('employees.permissionsGranted')
            .replace('{count}', String(grantedCount))
            .replace('{total}', String(PERMISSION_KEYS.length))}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {PERMISSION_KEYS.map((key) => {
          const granted = permissions[key];
          return (
            <label
              key={key}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                editing
                  ? 'cursor-pointer border-gray-300 hover:border-green-power-400'
                  : 'border-gray-200 bg-gray-50'
              }`}
            >
              <input
                type="checkbox"
                checked={granted}
                disabled={!editing}
                onChange={(e) => toggle(key, e.target.checked)}
                className="rounded border-gray-300 text-green-power-600 focus:ring-green-power-500 disabled:opacity-60"
              />
              <span
                className={`text-sm ${
                  granted ? 'text-gray-900' : 'text-gray-500'
                }`}
              >
                {t(LABEL_KEY[key])}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
