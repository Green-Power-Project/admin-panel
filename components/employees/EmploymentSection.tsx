'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import {
  DEFAULT_WORKING_TIME_MODELS,
  WEEK_DAYS,
  weeklyTargetHours,
  workingTimeFromModel,
  type BreakRule,
  type EmployeeRecord,
  type EmployeeWorkingTime,
  type EmploymentType,
  type WeekDay,
  type WorkingTimeModel,
} from '@/lib/employees/types';

interface EmploymentSectionProps {
  employee: EmployeeRecord;
  editing: boolean;
  form: Partial<EmployeeRecord>;
  onChangeField: (field: keyof EmployeeRecord, value: string) => void;
  onChangeWorkingTime: (workingTime: EmployeeWorkingTime) => void;
  /** Templates offered in the picker; defaults to the built-ins. */
  models?: WorkingTimeModel[];
}

const EMPLOYMENT_TYPES: EmploymentType[] = ['fullTime', 'partTime', 'miniJob'];

const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  fullTime: 'employees.employmentFullTime',
  partTime: 'employees.employmentPartTime',
  miniJob: 'employees.employmentMiniJob',
};

const DAY_LABEL: Record<WeekDay, string> = {
  mon: 'Mo',
  tue: 'Tu',
  wed: 'We',
  thu: 'Th',
  fri: 'Fr',
  sat: 'Sa',
  sun: 'Su',
};

/** Contract dates, working-time model and break rules (requirements 50, 53). */
export default function EmploymentSection({
  employee,
  editing,
  form,
  onChangeField,
  onChangeWorkingTime,
  models = DEFAULT_WORKING_TIME_MODELS,
}: EmploymentSectionProps) {
  const { t } = useLanguage();

  const workingTime =
    (editing ? form.workingTime : employee.workingTime) ?? employee.workingTime;
  const startDate = (editing ? form.startDate : employee.startDate) ?? '';
  const endDate = (editing ? form.endDate : employee.endDate) ?? '';

  const patch = (changes: Partial<EmployeeWorkingTime>) => {
    onChangeWorkingTime({
      ...workingTime,
      ...changes,
      // Any manual edit detaches the employee from the template.
      modelId: changes.modelId !== undefined ? changes.modelId : null,
    });
  };

  const applyModel = (modelId: string) => {
    const model = models.find((m) => m.id === modelId);
    if (!model) return;
    onChangeWorkingTime(workingTimeFromModel(model));
  };

  const toggleDay = (day: WeekDay) => {
    const next = workingTime.workingDays.includes(day)
      ? workingTime.workingDays.filter((d) => d !== day)
      : [...workingTime.workingDays, day];
    patch({
      workingDays: WEEK_DAYS.filter((d) => next.includes(d)),
    });
  };

  const updateRule = (index: number, changes: Partial<BreakRule>) => {
    const rules = workingTime.breakRules.map((rule, i) =>
      i === index ? { ...rule, ...changes } : rule,
    );
    patch({ breakRules: rules });
  };

  const modelName =
    models.find((m) => m.id === workingTime.modelId)?.name ??
    t('employees.workingTimeModelCustom');

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-gray-900">
          {t('employees.employmentTitle')}
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          {t('employees.employmentDesc')}
        </p>
      </div>

      {/* Contract dates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label={t('employees.startDate')}>
          {editing ? (
            <input
              type="date"
              value={startDate}
              onChange={(e) => onChangeField('startDate', e.target.value)}
              className={inputClass}
            />
          ) : (
            <p className="text-sm text-gray-900 mt-0.5">{startDate || '—'}</p>
          )}
        </Field>

        <Field label={t('employees.endDate')}>
          {editing ? (
            <input
              type="date"
              value={endDate}
              onChange={(e) => onChangeField('endDate', e.target.value)}
              className={inputClass}
            />
          ) : (
            <p className="text-sm text-gray-900 mt-0.5">
              {endDate || t('employees.endDateNone')}
            </p>
          )}
        </Field>
      </div>

      {/* Template */}
      <div className="rounded-lg border border-gray-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-gray-500">
              {t('employees.workingTimeModel')}
            </p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">
              {modelName}
            </p>
          </div>
          {editing && (
            <select
              value={workingTime.modelId ?? ''}
              onChange={(e) => applyModel(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500"
            >
              <option value="">{t('employees.workingTimeApply')}</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {editing && (
          <p className="text-xs text-gray-500">
            {t('employees.workingTimeModelHint')}
          </p>
        )}
      </div>

      {/* Employment type + hours */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label={t('employees.employmentType')}>
          {editing ? (
            <select
              value={workingTime.employmentType}
              onChange={(e) =>
                patch({ employmentType: e.target.value as EmploymentType })
              }
              className={inputClass}
            >
              {EMPLOYMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(EMPLOYMENT_LABEL[type])}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-gray-900 mt-0.5">
              {t(EMPLOYMENT_LABEL[workingTime.employmentType])}
            </p>
          )}
        </Field>

        <Field label={t('employees.targetHoursPerDay')}>
          {editing ? (
            <input
              type="number"
              min={0}
              max={24}
              step={0.25}
              value={workingTime.targetHoursPerDay}
              onChange={(e) =>
                patch({ targetHoursPerDay: Number(e.target.value) || 0 })
              }
              className={inputClass}
            />
          ) : (
            <p className="text-sm text-gray-900 mt-0.5">
              {workingTime.targetHoursPerDay} h
            </p>
          )}
        </Field>
      </div>

      {/* Working days */}
      <div>
        <p className="text-xs font-medium text-gray-700 mb-2">
          {t('employees.workingDays')}
        </p>
        <div className="flex flex-wrap gap-2">
          {WEEK_DAYS.map((day) => {
            const active = workingTime.workingDays.includes(day);
            return (
              <button
                key={day}
                type="button"
                disabled={!editing}
                onClick={() => toggleDay(day)}
                className={`w-11 h-9 rounded-md text-xs font-semibold border transition-colors ${
                  active
                    ? 'bg-green-power-600 text-white border-green-power-600'
                    : 'bg-white text-gray-500 border-gray-300'
                } ${editing ? 'cursor-pointer' : 'cursor-default opacity-90'}`}
              >
                {DAY_LABEL[day]}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {t('employees.targetHoursPerWeek')}:{' '}
          <span className="font-semibold text-gray-700">
            {weeklyTargetHours(workingTime).toFixed(2).replace(/\.00$/, '')} h
          </span>
        </p>
      </div>

      {/* Break rules */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-gray-700">
            {t('employees.breakRules')}
          </p>
          {editing && (
            <button
              type="button"
              onClick={() =>
                patch({
                  breakRules: [
                    ...workingTime.breakRules,
                    { afterHours: 6, breakMinutes: 30 },
                  ],
                })
              }
              className="text-xs font-medium text-green-power-700 hover:underline"
            >
              + {t('employees.breakRuleAdd')}
            </button>
          )}
        </div>

        {workingTime.breakRules.length === 0 ? (
          <p className="text-sm text-gray-500">
            {t('employees.breakRulesEmpty')}
          </p>
        ) : (
          <div className="space-y-2">
            {workingTime.breakRules.map((rule, index) => (
              <div
                key={index}
                className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 px-3 py-2"
              >
                {editing ? (
                  <>
                    <label className="text-xs text-gray-500">
                      {t('employees.breakRuleAfterHours')}
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={rule.afterHours}
                      onChange={(e) =>
                        updateRule(index, {
                          afterHours: Number(e.target.value) || 0,
                        })
                      }
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                    <label className="text-xs text-gray-500">
                      {t('employees.breakRuleMinutes')}
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={5}
                      value={rule.breakMinutes}
                      onChange={(e) =>
                        updateRule(index, {
                          breakMinutes: Number(e.target.value) || 0,
                        })
                      }
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        patch({
                          breakRules: workingTime.breakRules.filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                      className="ml-auto text-xs text-red-600 hover:underline"
                    >
                      {t('employees.breakRuleRemove')}
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-gray-900">
                    {t('employees.breakRuleRow')
                      .replace('{hours}', String(rule.afterHours))
                      .replace('{minutes}', String(rule.breakMinutes))}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500';

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
