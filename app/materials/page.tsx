'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import CatalogTable, { type CatalogColumn } from '@/components/catalog/CatalogTable';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  addMaterial,
  deleteMaterial,
  getMaterials,
  subscribeCatalog,
  updateMaterial,
} from '@/lib/catalog/catalogStore';
import { MATERIAL_UNITS, type MaterialCatalogItem } from '@/lib/catalog/types';

const EMPTY = {
  name: '',
  materialNumber: '',
  category: '',
  unit: MATERIAL_UNITS[0] as string,
  supplier: '',
  description: '',
};

export default function MaterialsPage() {
  const { t } = useLanguage();
  return (
    <ProtectedRoute>
      <AdminLayout title={t('catalog.materialsTitle')}>
        <MaterialsContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function MaterialsContent() {
  const { t } = useLanguage();
  const [items, setItems] = useState<MaterialCatalogItem[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [error, setError] = useState('');

  useEffect(() => subscribeCatalog(() => setItems(getMaterials())), []);

  const activeCount = items.filter((i) => i.isActive).length;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError(t('catalog.nameRequired'));
      return;
    }
    setError('');
    addMaterial({ ...form, isActive: true });
    setForm({ ...EMPTY });
  };

  const columns: CatalogColumn<MaterialCatalogItem>[] = [
    { key: 'name', label: t('catalog.name'), value: (i) => i.name, primary: true },
    { key: 'number', label: t('catalog.materialNumber'), value: (i) => i.materialNumber },
    { key: 'category', label: t('catalog.category'), value: (i) => i.category },
    { key: 'unit', label: t('catalog.unit'), value: (i) => i.unit },
    { key: 'supplier', label: t('catalog.supplier'), value: (i) => i.supplier },
    { key: 'description', label: t('catalog.description'), value: (i) => i.description },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{t('catalog.materialsTitle')}</h2>
        <p className="text-sm text-gray-600 mt-1">{t('catalog.materialsDesc')}</p>
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
          <Field label={t('catalog.materialNumber')}>
            <input value={form.materialNumber} onChange={(e) => setForm({ ...form, materialNumber: e.target.value })} className={INPUT} />
          </Field>
          <Field label={t('catalog.category')}>
            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={INPUT} />
          </Field>
          <Field label={t('catalog.unit')}>
            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className={INPUT}>
              {MATERIAL_UNITS.map((u) => (<option key={u} value={u}>{u}</option>))}
            </select>
          </Field>
          <Field label={t('catalog.supplier')}>
            <input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className={INPUT} />
          </Field>
          <Field label={t('catalog.description')}>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={INPUT} />
          </Field>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="submit" className="px-4 py-2 bg-green-power-600 text-white text-sm font-medium rounded-lg hover:bg-green-power-700 transition-colors">
          {t('catalog.addMaterial')}
        </button>
      </form>

      <CatalogTable
        items={items}
        columns={columns}
        emptyMessage={t('catalog.noMaterials')}
        onToggleActive={(item) => updateMaterial(item.id, { isActive: !item.isActive })}
        onDelete={(item) => {
          if (window.confirm(t('catalog.deleteConfirm'))) deleteMaterial(item.id);
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
