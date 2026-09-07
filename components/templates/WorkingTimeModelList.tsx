'use client';

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  WEEK_DAYS,
  type EmploymentType,
  type WeekDay,
  type WorkingTimeModel,
} from '@/lib/employees/types';

interface WorkingTimeModelListProps {
  models: WorkingTimeModel[];
  onAdd: (model: Omit<WorkingTimeModel, 'id' | 'isCustom'>) => void;
  onDelete: (id: string) => void;
}

const DAY_LABEL: Record<WeekDay, string> = {
  mon: 'Mo',
  tue: 'Tu',
  wed: 'We',
  thu: 'Th',
  fri: 'Fr',
  sat: 'Sa',
  sun: 'Su',
};

const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  fullTime: 'employees.employmentFullTime',
  partTime: 'employees.employmentPartTime',
  miniJob: 'employees.employmentMiniJob',
};

/** Admin-managed working-time templates (requirement 53). */
export default function WorkingTimeModelList({
  models,
  onAdd,
  onDelete,
}: WorkingTimeModelListProps) {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [employmentType, setEmploymentType] =
    useState<EmploymentType>('fullTime');
  const [days, setDays] = useState<WeekDay[]>(['mon', 'tue', 'wed', 'thu', 'fri']);
  const [hoursPerDay, setHoursPerDay] = useState(8.5);
  const [error, setError] = useState('');

  const toggleDay = (day: WeekDay) => {
    setDays((prev) =>
      WEEK_DAYS.filter((d) =>
        prev.includes(day) ? prev.includes(d) && d !== day : prev.includes(d) || d === day,
      ),
    );
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('templates.modelNameRequired'));
      return;
    }
    setError('');
    onAdd({
      name: name.trim(),
      employmentType,
      workingDays: days,
      targetHoursPerDay: hoursPerDay,
      breakRules: [{ afterHours: 6, breakMinutes: 30 }],
    });
    setName('');
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={submit}
        className="rounded-lg border border-gray-200 p-4 space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              {t('templates.modelName')}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              {t('employees.employmentType')}
            </label>
            <select
              value={employmentType}
              onChange={(e) =>
                setEmploymentType(e.target.value as EmploymentType)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500"
            >
              {(['fullTime', 'partTime', 'miniJob'] as EmploymentType[]).map(
                (type) => (
                  <option key={type} value={type}>
                    {t(EMPLOYMENT_LABEL[type])}
                  </option>
                ),
              )}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              {t('templates.modelHoursPerDay')}
            </label>
            <input
              type="number"
              min={0}
              max={24}
              step={0.25}
              value={hoursPerDay}
              onChange={(e) => setHoursPerDay(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500"
            />
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-gray-700 mb-2">
            {t('templates.modelDays')}
          </p>
          <div className="flex flex-wrap gap-2">
            {WEEK_DAYS.map((day) => {
              const active = days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`w-11 h-9 rounded-md text-xs font-semibold border transition-colors ${
                    active
                      ? 'bg-green-power-600 text-white border-green-power-600'
                      : 'bg-white text-gray-500 border-gray-300'
                  }`}
                >
                  {DAY_LABEL[day]}
                </button>
              );
            })}
          </div>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <button
          type="submit"
          className="px-4 py-2 bg-green-power-600 text-white text-sm font-medium rounded-lg hover:bg-green-power-700 transition-colors"
        >
          {t('templates.addModel')}
        </button>
      </form>

      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
        {models.map((model) => (
          <div
            key={model.id}
            className="flex flex-wrap items-center gap-3 px-4 py-3"
          >
            <div className="flex-1 min-w-[12rem]">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900">{model.name}</p>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    model.isCustom
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {model.isCustom
                    ? t('templates.modelCustom')
                    : t('templates.modelBuiltIn')}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {t(EMPLOYMENT_LABEL[model.employmentType])} ·{' '}
                {model.workingDays.map((d) => DAY_LABEL[d]).join(' ')} ·{' '}
                {model.targetHoursPerDay} h/
                {t('templates.modelWeekly')}:{' '}
                {(model.workingDays.length * model.targetHoursPerDay)
                  .toFixed(2)
                  .replace(/\.00$/, '')}{' '}
                h
              </p>
              <p className="text-xs text-gray-500">
                {t('templates.modelBreaks')}:{' '}
                {model.breakRules.length === 0
                  ? t('templates.modelNoBreaks')
                  : model.breakRules
                      .map(
                        (rule) => `${rule.afterHours} h → ${rule.breakMinutes} min`,
                      )
                      .join(', ')}
              </p>
            </div>

            <button
              type="button"
              disabled={!model.isCustom}
              title={
                model.isCustom ? undefined : t('templates.modelDeleteBuiltIn')
              }
              onClick={() => {
                if (window.confirm(t('templates.modelDeleteConfirm'))) {
                  onDelete(model.id);
                }
              }}
              className="text-xs font-medium text-red-600 hover:text-red-700 disabled:text-gray-300 disabled:cursor-not-allowed"
            >
              {t('templates.delete')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
