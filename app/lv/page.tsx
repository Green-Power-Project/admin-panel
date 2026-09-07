'use client';

import { useEffect, useRef, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import { useLanguage } from '@/contexts/LanguageContext';
import { getDemoProjects } from '@/lib/employees/demoStore';
import {
  addLvPosition,
  deleteLvPosition,
  getLvPositions,
  getLvSourceFile,
  importLvCsv,
  subscribeLv,
  updateLvPosition,
} from '@/lib/lv/lvStore';
import { LV_UNITS, type LvPositionRecord } from '@/lib/lv/types';
import type { ProjectOption } from '@/lib/employees/types';

const EMPTY = { code: '', title: '', description: '', unit: LV_UNITS[0] as string };

export default function LvPage() {
  const { t } = useLanguage();
  return (
    <ProtectedRoute>
      <AdminLayout title={t('lv.title')}>
        <LvContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function LvContent() {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState('');
  const [positions, setPositions] = useState<LvPositionRecord[]>([]);
  const [sourceFile, setSourceFile] = useState('');
  const [form, setForm] = useState({ ...EMPTY });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const list = getDemoProjects();
    setProjects(list);
    setProjectId((current) => current || list[0]?.id || '');
  }, []);

  useEffect(() => {
    if (!projectId) return;
    return subscribeLv(() => {
      setPositions(getLvPositions(projectId));
      setSourceFile(getLvSourceFile(projectId));
    });
  }, [projectId]);

  const activeCount = positions.filter((p) => p.isActive).length;

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;
    const content = await file.text();
    const result = importLvCsv(projectId, file.name, content);
    setMessage(
      result.imported > 0
        ? t('lv.imported').replace('{count}', String(result.imported))
        : t('lv.importFailed'),
    );
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.title.trim() || !projectId) {
      setError(t('lv.codeRequired'));
      return;
    }
    setError('');
    addLvPosition({ ...form, projectId, unitPrice: null, isActive: true });
    setForm({ ...EMPTY });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{t('lv.title')}</h2>
        <p className="text-sm text-gray-600 mt-1">{t('lv.desc')}</p>
      </div>

      <div className="rounded-lg border border-gray-200 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">{t('lv.project')}</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={INPUT}>
              {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">{t('lv.sourceFile')}</label>
            <p className="text-sm text-gray-900 pt-2">{sourceFile || t('lv.noSourceFile')}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleImport} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!projectId}
            className="px-4 py-2 bg-green-power-600 text-white text-sm font-medium rounded-lg hover:bg-green-power-700 disabled:opacity-50 transition-colors"
          >
            {t('lv.import')}
          </button>
          <span className="text-xs text-gray-500">{t('lv.importHint')}</span>
        </div>
        <p className="text-xs text-amber-700">{t('lv.replaceWarning')}</p>
        {message && <p className="text-xs text-green-power-700">{message}</p>}
      </div>

      <form onSubmit={submit} className="rounded-lg border border-gray-200 p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label={t('lv.code')}>
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={INPUT} placeholder="01.02" />
          </Field>
          <Field label={t('lv.positionTitle')}>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={INPUT} />
          </Field>
          <Field label={t('lv.details')}>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={INPUT} />
          </Field>
          <Field label={t('lv.unit')}>
            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className={INPUT}>
              {LV_UNITS.map((u) => (<option key={u} value={u}>{u}</option>))}
            </select>
          </Field>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="submit" className="px-4 py-2 bg-green-power-600 text-white text-sm font-medium rounded-lg hover:bg-green-power-700 transition-colors">
          {t('lv.addPosition')}
        </button>
      </form>

      <p className="text-xs text-gray-500">
        {t('lv.activeCount').replace('{active}', String(activeCount)).replace('{total}', String(positions.length))}
        {' · '}
        {t('lv.employeePreview')}: {t('lv.code')}, {t('lv.positionTitle')}, {t('lv.unit')} — {t('lv.priceHidden')}
      </p>

      {positions.length === 0 ? (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-8 text-center">
          <p className="text-sm font-medium text-gray-700">{t('lv.empty')}</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[t('lv.code'), t('lv.positionTitle'), t('lv.details'), t('lv.unit'), t('lv.status')].map((h) => (
                  <th key={h} className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
                <th className="px-4 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {positions.map((p) => (
                <tr key={p.id} className={p.isActive ? 'hover:bg-gray-50' : 'bg-gray-50/60'}>
                  <td className={`px-4 py-2.5 text-sm font-medium ${p.isActive ? 'text-gray-900' : 'text-gray-400'}`}>{p.code}</td>
                  <td className={`px-4 py-2.5 text-sm ${p.isActive ? 'text-gray-900' : 'text-gray-400'}`}>{p.title}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-600">{p.description || '—'}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-600">{p.unit || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${p.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
                      {p.isActive ? t('lv.active') : t('lv.inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right space-x-3 whitespace-nowrap">
                    <button type="button" onClick={() => updateLvPosition(projectId, p.id, { isActive: !p.isActive })} className="text-xs font-medium text-green-power-700 hover:text-green-power-800">
                      {p.isActive ? t('lv.deactivate') : t('lv.activate')}
                    </button>
                    <button type="button" onClick={() => { if (window.confirm(t('lv.deleteConfirm'))) deleteLvPosition(projectId, p.id); }} className="text-xs font-medium text-red-600 hover:text-red-700">
                      {t('lv.delete')}
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
