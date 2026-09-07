'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import CatalogTable, { type CatalogColumn } from '@/components/catalog/CatalogTable';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  addMachine,
  deleteMachine,
  getMachines,
  subscribeCatalog,
  updateMachine,
} from '@/lib/catalog/catalogStore';
import { MACHINE_UNITS, type MachineCatalogItem } from '@/lib/catalog/types';

const EMPTY = {
  name: '',
  machineNumber: '',
  type: '',
  registrationNumber: '',
  unit: MACHINE_UNITS[0] as string,
};

export default function MachinesPage() {
  const { t } = useLanguage();
  return (
    <ProtectedRoute>
      <AdminLayout title={t('catalog.machinesTitle')}>
        <MachinesContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function MachinesContent() {
  const { t } = useLanguage();
  const [items, setItems] = useState<MachineCatalogItem[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [error, setError] = useState('');

  useEffect(() => subscribeCatalog(() => setItems(getMachines())), []);

  const activeCount = items.filter((i) => i.isActive).length;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError(t('catalog.nameRequired'));
      return;
    }
    setError('');
    addMachine({ ...form, isActive: true });
    setForm({ ...EMPTY });
  };

  const columns: CatalogColumn<MachineCatalogItem>[] = [
    { key: 'name', label: t('catalog.name'), value: (i) => i.name, primary: true },
    { key: 'number', label: t('catalog.machineNumber'), value: (i) => i.machineNumber },
    { key: 'type', label: t('catalog.type'), value: (i) => i.type },
    { key: 'registration', label: t('catalog.registrationNumber'), value: (i) => i.registrationNumber },
    { key: 'unit', label: t('catalog.unit'), value: (i) => i.unit },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{t('catalog.machinesTitle')}</h2>
        <p className="text-sm text-gray-600 mt-1">{t('catalog.machinesDesc')}</p>
        <p className="text-xs text-gray-500 mt-1">
          {t('catalog.activeCount')
            .replace('{active}', String(activeCount))
            .replace('{total}', String(items.length))}
          {' · '}
          {t('catalog.appHint')}
        </p>
      </div>

      <form onSubmit={submit} className="rounded-lg border border-gray-200 p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label={t('catalog.name')}>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={INPUT} />
          </Field>
          <Field label={t('catalog.machineNumber')}>
            <input value={form.machineNumber} onChange={(e) => setForm({ ...form, machineNumber: e.target.value })} className={INPUT} />
          </Field>
          <Field label={t('catalog.type')}>
            <input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={INPUT} />
          </Field>
          <Field label={t('catalog.registrationNumber')}>
            <input value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} className={INPUT} />
          </Field>
          <Field label={t('catalog.unit')}>
            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className={INPUT}>
              {MACHINE_UNITS.map((u) => (<option key={u} value={u}>{u}</option>))}
            </select>
          </Field>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="submit" className="px-4 py-2 bg-green-power-600 text-white text-sm font-medium rounded-lg hover:bg-green-power-700 transition-colors">
          {t('catalog.addMachine')}
        </button>
      </form>

      <CatalogTable
        items={items}
        columns={columns}
        emptyMessage={t('catalog.noMachines')}
        onToggleActive={(item) => updateMachine(item.id, { isActive: !item.isActive })}
        onDelete={(item) => {
          if (window.confirm(t('catalog.deleteConfirm'))) deleteMachine(item.id);
        }}
      />
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
