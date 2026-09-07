'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import { useLanguage } from '@/contexts/LanguageContext';
import { getDemoEmployees } from '@/lib/employees/demoStore';
import type { EmployeeRecord } from '@/lib/employees/types';
import {
  addTask,
  deleteTask,
  getTasks,
  setTaskStatus,
  subscribeOperations,
} from '@/lib/operations/operationsStore';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskRecord,
  type TaskStatus,
} from '@/lib/operations/types';

const EMPTY = {
  projectName: '',
  title: '',
  description: '',
  date: new Date().toISOString().slice(0, 10),
  appointment: '',
  priority: 'normal' as TaskPriority,
  adminNote: '',
};

export default function TasksPage() {
  const { t } = useLanguage();
  return (
    <ProtectedRoute>
      <AdminLayout title={t('operations.tasksTitle')}>
        <TasksContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function TasksContent() {
  const { t } = useLanguage();
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [assigned, setAssigned] = useState<string[]>([]);
  const [error, setError] = useState('');

  useEffect(() => subscribeOperations(() => setTasks(getTasks())), []);
  useEffect(() => setEmployees(getDemoEmployees()), []);

  const label = (prefix: string, value: string) =>
    t(`operations.${prefix}${value.charAt(0).toUpperCase()}${value.slice(1)}`);

  const nameOf = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? `${e.firstName} ${e.lastName}` : id;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError(t('operations.titleRequired'));
      return;
    }
    setError('');
    addTask({ ...form, status: 'open', assignedEmployeeIds: assigned });
    setForm({ ...EMPTY });
    setAssigned([]);
  };

  const toggleAssigned = (id: string) =>
    setAssigned((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{t('operations.tasksTitle')}</h2>
        <p className="text-sm text-gray-600 mt-1">{t('operations.tasksDesc')}</p>
      </div>

      <form onSubmit={submit} className="rounded-lg border border-gray-200 p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label={t('operations.title')}>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={INPUT} />
          </Field>
          <Field label={t('operations.project')}>
            <input value={form.projectName} onChange={(e) => setForm({ ...form, projectName: e.target.value })} className={INPUT} />
          </Field>
          <Field label={t('operations.priority')}>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })} className={INPUT}>
              {TASK_PRIORITIES.map((p) => (<option key={p} value={p}>{label('priority', p)}</option>))}
            </select>
          </Field>
          <Field label={t('operations.date')}>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={INPUT} />
          </Field>
          <Field label={t('operations.appointment')}>
            <input type="datetime-local" value={form.appointment} onChange={(e) => setForm({ ...form, appointment: e.target.value })} className={INPUT} />
          </Field>
          <Field label={t('operations.adminNote')}>
            <input value={form.adminNote} onChange={(e) => setForm({ ...form, adminNote: e.target.value })} className={INPUT} />
          </Field>
        </div>

        <Field label={t('operations.description')}>
          <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={INPUT} />
        </Field>

        <div>
          <p className="text-xs font-medium text-gray-700 mb-2">{t('operations.assignedTo')}</p>
          <div className="flex flex-wrap gap-2">
            {employees.map((e) => {
              const on = assigned.includes(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => toggleAssigned(e.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    on
                      ? 'bg-green-power-600 text-white border-green-power-600'
                      : 'bg-white text-gray-600 border-gray-300'
                  }`}
                >
                  {e.firstName} {e.lastName}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-2">{t('operations.assignHint')}</p>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="submit" className="px-4 py-2 bg-green-power-600 text-white text-sm font-medium rounded-lg hover:bg-green-power-700 transition-colors">
          {t('operations.addTask')}
        </button>
      </form>

      {tasks.length === 0 ? (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-8 text-center">
          <p className="text-sm font-medium text-gray-700">{t('operations.tasksEmpty')}</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['date', 'title', 'project', 'appointment', 'priority', 'assignedTo', 'status'].map((k) => (
                  <th key={k} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase whitespace-nowrap">
                    {t(`operations.${k}`)}
                  </th>
                ))}
                <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap">{task.date}</td>
                  <td className="px-3 py-2 text-sm font-medium text-gray-900">{task.title}</td>
                  <td className="px-3 py-2 text-sm text-gray-600">{task.projectName || '—'}</td>
                  <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">{task.appointment ? task.appointment.replace('T', ' ') : '—'}</td>
                  <td className="px-3 py-2 text-sm text-gray-600">{label('priority', task.priority)}</td>
                  <td className="px-3 py-2 text-sm text-gray-600">
                    {task.assignedEmployeeIds.length === 0
                      ? t('operations.noEmployees')
                      : task.assignedEmployeeIds.map(nameOf).join(', ')}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={task.status}
                      onChange={(e) => setTaskStatus(task.id, e.target.value as TaskStatus)}
                      className="px-2 py-1 border border-gray-300 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500"
                    >
                      {TASK_STATUSES.map((s) => (<option key={s} value={s}>{label('status', s)}</option>))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => { if (window.confirm(t('operations.deleteConfirm'))) deleteTask(task.id); }}
                      className="text-xs font-medium text-red-600 hover:text-red-700"
                    >
                      {t('operations.delete')}
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
