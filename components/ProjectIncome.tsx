'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLanguage } from '@/contexts/LanguageContext';

export type IncomeType =
  | 'progress_payment'
  | 'cash'
  | 'bank_transfer'
  | 'partial_payment'
  | 'discount_skonto';

interface IncomeEntry {
  id: string;
  projectId: string;
  type: IncomeType;
  amount: number;
  date: Date;
  note: string;
  createdAt: Date | null;
}

interface FormState {
  type: IncomeType;
  amount: string;
  date: string;
  note: string;
}

const INCOME_TYPE_KEYS: { value: IncomeType; color: string; bg: string }[] = [
  { value: 'progress_payment', color: 'text-blue-700',   bg: 'bg-blue-100'   },
  { value: 'cash',             color: 'text-green-700',  bg: 'bg-green-100'  },
  { value: 'bank_transfer',    color: 'text-indigo-700', bg: 'bg-indigo-100' },
  { value: 'partial_payment',  color: 'text-purple-700', bg: 'bg-purple-100' },
  { value: 'discount_skonto',  color: 'text-orange-700', bg: 'bg-orange-100' },
];

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

const EMPTY_FORM: FormState = {
  type: 'progress_payment',
  amount: '',
  date: todayISO(),
  note: '',
};

export default function ProjectIncome({ projectId }: { projectId: string }) {
  const { t } = useLanguage();
  const [entries, setEntries] = useState<IncomeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const incomeTypes = useMemo(
    () => INCOME_TYPE_KEYS.map((e) => ({ ...e, label: t(`income.types.${e.value}`) })),
    [t]
  );

  function getTypeConfig(type: IncomeType) {
    return incomeTypes.find((t) => t.value === type) ?? incomeTypes[0];
  }

  useEffect(() => {
    if (!db || !projectId) return;
    const q = query(
      collection(db, 'projectIncome'),
      where('projectId', '==', projectId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: IncomeEntry[] = snap.docs.map((d) => {
          const data = d.data();
          const rawDate = data.date;
          const date: Date =
            rawDate instanceof Timestamp
              ? rawDate.toDate()
              : typeof rawDate === 'string'
              ? new Date(rawDate)
              : new Date();
          return {
            id: d.id,
            projectId: data.projectId as string,
            type: (data.type as IncomeType) || 'progress_payment',
            amount: typeof data.amount === 'number' ? data.amount : 0,
            date,
            note: typeof data.note === 'string' ? data.note : '',
            createdAt: data.createdAt?.toDate?.() ?? null,
          };
        });
        list.sort((a, b) => b.date.getTime() - a.date.getTime());
        setEntries(list);
        setLoading(false);
      },
      (err) => {
        console.error('projectIncome listener error:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [projectId]);

  const total = useMemo(
    () => entries.reduce((sum, e) => sum + e.amount, 0),
    [entries]
  );

  const totalByType = useMemo(() => {
    const map: Record<IncomeType, number> = {
      progress_payment: 0,
      cash: 0,
      bank_transfer: 0,
      partial_payment: 0,
      discount_skonto: 0,
    };
    for (const e of entries) map[e.type] = (map[e.type] ?? 0) + e.amount;
    return map;
  }, [entries]);

  function openModal() {
    setForm({ ...EMPTY_FORM, date: todayISO() });
    setFormError('');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setFormError('');
  }

  async function handleSave() {
    const amount = parseFloat(form.amount.replace(',', '.'));
    if (!form.type) { setFormError(t('income.form.typeRequired')); return; }
    if (!form.date) { setFormError(t('income.form.dateRequired')); return; }
    if (!form.amount || isNaN(amount) || amount <= 0) { setFormError(t('income.form.amountRequired')); return; }
    if (!db) return;
    setSaving(true);
    setFormError('');
    try {
      await addDoc(collection(db, 'projectIncome'), {
        projectId,
        type: form.type,
        amount,
        date: Timestamp.fromDate(new Date(form.date)),
        note: form.note.trim(),
        createdAt: serverTimestamp(),
      });
      closeModal();
    } catch (err) {
      console.error('Error saving income entry:', err);
      setFormError(t('income.form.saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!db) return;
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, 'projectIncome', id));
    } catch (err) {
      console.error('Error deleting income entry:', err);
    } finally {
      setDeletingId(null);
      setDeleteConfirmId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-100 px-6 py-4 border-b border-blue-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💰</span>
            <div>
              <h3 className="text-base font-bold text-gray-900">{t('income.title')}</h3>
              <p className="text-xs text-gray-600">{t('income.subtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={openModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            {t('income.addPayment')}
          </button>
        </div>

        {/* Total + per-type breakdown */}
        <div className="px-6 py-5">
          <div className="flex flex-wrap gap-4 items-start">
            <div className="flex-1 min-w-[160px]">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">{t('income.totalReceived')}</p>
              <p className="text-3xl font-bold text-gray-900">
                {total.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{entries.length} {t('income.entriesCount')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {incomeTypes.filter((it) => totalByType[it.value] > 0).map((it) => (
                <div key={it.value} className={`${it.bg} ${it.color} rounded-lg px-3 py-2 text-xs`}>
                  <p className="font-semibold">{it.label}</p>
                  <p className="font-bold text-sm">
                    {totalByType[it.value].toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Entries list */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-base font-bold text-gray-900">{t('income.entriesTitle')}</h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
            <span className="text-4xl">📭</span>
            <p className="text-sm">{t('income.noIncome')}</p>
            <button
              type="button"
              onClick={openModal}
              className="mt-1 text-sm text-blue-600 hover:underline font-medium"
            >
              {t('income.addFirst')}
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {entries.map((entry) => {
              const cfg = getTypeConfig(entry.type);
              return (
                <li key={entry.id} className="px-6 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors">
                  {/* Type badge */}
                  <span className={`flex-shrink-0 mt-0.5 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
                    {cfg.label}
                  </span>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <span className="font-medium text-gray-700">
                        {entry.date.toLocaleDateString('de-DE')}
                      </span>
                    </div>
                    {entry.note && (
                      <p className="text-sm text-gray-700 mt-1">{entry.note}</p>
                    )}
                  </div>

                  {/* Amount */}
                  <div className="flex-shrink-0 text-right">
                    <p className="text-base font-bold text-green-600">
                      +{entry.amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                    </p>
                  </div>

                  {/* Delete */}
                  <div className="flex-shrink-0">
                    {deleteConfirmId === entry.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleDelete(entry.id)}
                          disabled={deletingId === entry.id}
                          className="text-xs text-red-600 hover:underline disabled:opacity-50"
                        >
                          {deletingId === entry.id ? '…' : t('income.delete')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(null)}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          {t('income.deleteCancel')}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(entry.id)}
                        className="text-gray-300 hover:text-red-400 transition-colors"
                        title={t('income.delete')}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Add payment modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">{t('income.newPayment')}</h2>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Form */}
            <div className="px-6 py-5 space-y-4">
              {formError && (
                <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-2 text-sm rounded-r">
                  {formError}
                </div>
              )}

              {/* Type selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">{t('income.form.type')}</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {incomeTypes.map((it) => (
                    <button
                      key={it.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, type: it.value }))}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all text-left ${
                        form.type === it.value
                          ? `${it.bg} ${it.color} border-current`
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {it.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount + Date */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">{t('income.form.amount')}</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder={t('income.form.amountPlaceholder')}
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">{t('income.form.date')}</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">{t('income.form.note')}</label>
                <textarea
                  rows={2}
                  placeholder={t('income.form.notePlaceholder')}
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? t('income.saving') : t('income.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
