'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import { DEFAULT_EMPLOYEE_ROLES } from '@/lib/employees/types';
import type { EmployeeRecord, EmployeeRoleDefinition } from '@/lib/employees/types';

interface PersonalInfoSectionProps {
  employee: EmployeeRecord;
  editing: boolean;
  form: Partial<EmployeeRecord>;
  onChange: (field: keyof EmployeeRecord, value: string) => void;
}

export default function PersonalInfoSection({
  employee,
  editing,
  form,
  onChange,
}: PersonalInfoSectionProps) {
  const { t } = useLanguage();

  const currentRole = (editing ? (form.role as string) : employee.role) ?? '';
  const roles: EmployeeRoleDefinition[] = [
    ...DEFAULT_EMPLOYEE_ROLES,
    ...(currentRole && !DEFAULT_EMPLOYEE_ROLES.some((r) => r.id === currentRole)
      ? [{ id: currentRole, label: currentRole, isCustom: true }]
      : []),
  ];

  const fields: Array<{
    key: keyof EmployeeRecord;
    label: string;
    type?: string;
  }> = [
    { key: 'employeeNumber', label: t('employees.employeeId') },
    { key: 'firstName', label: t('employees.firstName') },
    { key: 'lastName', label: t('employees.lastName') },
    { key: 'email', label: t('common.email'), type: 'email' },
    { key: 'phone', label: t('employees.phone'), type: 'tel' },
    { key: 'role', label: t('employees.role') },
    { key: 'jobTitle', label: t('employees.jobTitle') },
    { key: 'department', label: t('employees.department') },
    { key: 'startDate', label: t('employees.startDate'), type: 'date' },
    { key: 'notes', label: t('employees.notes') },
  ];

  // Built-in roles are translated; admin-added roles fall back to their label.
  const roleLabel = (role: EmployeeRecord['role']) => {
    const definition = roles.find((r) => r.id === role);
    if (!definition) return role || '—';
    if (definition.isCustom) return definition.label;
    const key = `employees.role${
      definition.id.charAt(0).toUpperCase() + definition.id.slice(1)
    }`;
    const translated = t(key);
    return translated === key ? definition.label : translated;
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-gray-900">{t('employees.personalInfoTitle')}</h3>
        <p className="text-sm text-gray-600 mt-1">{t('employees.personalInfoDesc')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map(({ key, label, type }) => {
          const value = editing ? (form[key] as string) ?? '' : (employee[key] as string) ?? '';

          if (key === 'role') {
            if (editing) {
              return (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">{label}</label>
                  <select
                    value={value}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        const name = window
                          .prompt(t('employees.roleCustomPrompt'))
                          ?.trim();
                        if (name) onChange('role', name);
                        return;
                      }
                      onChange('role', e.target.value);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500"
                  >
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {roleLabel(role.id)}
                      </option>
                    ))}
                    <option value="__custom__">
                      {t('employees.roleAddCustom')}
                    </option>
                  </select>
                </div>
              );
            }
            return (
              <div key={key}>
                <p className="text-xs font-medium text-gray-500">{label}</p>
                <p className="text-sm text-gray-900 mt-0.5">{roleLabel(employee.role)}</p>
              </div>
            );
          }

          if (key === 'notes') {
            if (editing) {
              return (
                <div key={key} className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">{label}</label>
                  <textarea
                    value={value}
                    onChange={(e) => onChange('notes', e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500"
                  />
                </div>
              );
            }
            return (
              <div key={key} className="md:col-span-2">
                <p className="text-xs font-medium text-gray-500">{label}</p>
                <p className="text-sm text-gray-900 mt-0.5 whitespace-pre-wrap">
                  {employee.notes || '—'}
                </p>
              </div>
            );
          }

          if (editing) {
            return (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">{label}</label>
                <input
                  type={type ?? 'text'}
                  value={value}
                  onChange={(e) => onChange(key, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500"
                />
              </div>
            );
          }

          return (
            <div key={key}>
              <p className="text-xs font-medium text-gray-500">{label}</p>
              <p className="text-sm text-gray-900 mt-0.5">{value || '—'}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
