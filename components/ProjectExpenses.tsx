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
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLanguage } from '@/contexts/LanguageContext';
import { DateInput } from '@/components/DateInput';

export type ExpenseType = 'material' | 'vehicle' | 'staff' | 'machine' | 'disposal' | 'other';

interface Expense {
  id: string;
  projectId: string;
  type: ExpenseType;
  amount: number;
  date: Date;
  invoiceNumber: string;
  note: string;
  timePeriod: string;
  isPaid: boolean;
  createdAt: Date | null;
}

interface FormState {
  type: ExpenseType;
  amount: string;
  date: string;
  invoiceNumber: string;
  note: string;
  timePeriod: string;
  isPaid: boolean;
}

const EXPENSE_TYPE_KEYS: { value: ExpenseType; color: string; bg: string }[] = [
  { value: 'material', color: 'text-green-700',  bg: 'bg-green-100'  },
  { value: 'vehicle',  color: 'text-blue-700',   bg: 'bg-blue-100'   },
  { value: 'staff',    color: 'text-purple-700', bg: 'bg-purple-100' },
  { value: 'machine',  color: 'text-orange-700', bg: 'bg-orange-100' },
  { value: 'disposal', color: 'text-yellow-700', bg: 'bg-yellow-100' },
  { value: 'other',    color: 'text-gray-700',   bg: 'bg-gray-100'   },
];

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

const EMPTY_FORM: FormState = {
  type: 'material',
  amount: '',
  date: todayISO(),
  invoiceNumber: '',
  note: '',
  timePeriod: '',
  isPaid: false,
};

export default function ProjectExpenses({ projectId }: { projectId: string }) {
  const { t } = useLanguage();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const expenseTypes = useMemo(() =>
    EXPENSE_TYPE_KEYS.map((e) => ({
      ...e,
      label: t(`expenses.types.${e.value}`),
    })),
    [t]
  );

  function getTypeConfig(type: ExpenseType) {
    return expenseTypes.find((t) => t.value === type) ?? expenseTypes[4];
  }

  useEffect(() => {
    if (!db || !projectId) return;
    const q = query(
      collection(db, 'projectExpenses'),
      where('projectId', '==', projectId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Expense[] = snap.docs.map((d) => {
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
            type: (data.type as ExpenseType) || 'other',
            amount: typeof data.amount === 'number' ? data.amount : 0,
            date,
            invoiceNumber: typeof data.invoiceNumber === 'string' ? data.invoiceNumber : '',
            note: typeof data.note === 'string' ? data.note : '',
            timePeriod: typeof data.timePeriod === 'string' ? data.timePeriod : '',
            isPaid: typeof data.isPaid === 'boolean' ? data.isPaid : false,
            createdAt: data.createdAt?.toDate?.() ?? null,
          };
        });
        list.sort((a, b) => b.date.getTime() - a.date.getTime());
        setExpenses(list);
        setLoading(false);
      },
      (err) => {
        console.error('projectExpenses listener error:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [projectId]);

  const total = useMemo(
    () => expenses.reduce((sum, e) => sum + e.amount, 0),
    [expenses]
  );

  const totalByType = useMemo(() => {
    const map: Record<ExpenseType, number> = { material: 0, vehicle: 0, staff: 0, machine: 0, disposal: 0, other: 0 };
    for (const e of expenses) map[e.type] = (map[e.type] ?? 0) + e.amount;
    return map;
  }, [expenses]);

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
    if (!form.type) { setFormError(t('expenses.form.typeRequired')); return; }
    if (!form.date) { setFormError(t('expenses.form.dateRequired')); return; }
    if (!form.amount || isNaN(amount) || amount <= 0) { setFormError(t('expenses.form.amountRequired')); return; }
    if (!db) return;
    setSaving(true);
    setFormError('');
    try {
      await addDoc(collection(db, 'projectExpenses'), {
        projectId,
        type: form.type,
        amount,
        date: Timestamp.fromDate(new Date(form.date)),
        invoiceNumber: form.invoiceNumber.trim(),
        note: form.note.trim(),
        timePeriod: form.timePeriod.trim(),
        isPaid: form.isPaid,
        createdAt: serverTimestamp(),
      });
      closeModal();
    } catch (err) {
      console.error('Error saving expense:', err);
      setFormError(t('expenses.form.saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!db) return;
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, 'projectExpenses', id));
    } catch (err) {
      console.error('Error deleting expense:', err);
    } finally {
      setDeletingId(null);
      setDeleteConfirmId(null);
    }
  }

  async function togglePaid(expense: Expense) {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'projectExpenses', expense.id), { isPaid: !expense.isPaid });
    } catch (err) {
      console.error('Error toggling paid status:', err);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-50 to-green-100 px-6 py-4 border-b border-emerald-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💶</span>
            <div>
              <h3 className="text-base font-bold text-gray-900">{t('expenses.title')}</h3>
              <p className="text-xs text-gray-600">{t('expenses.subtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={openModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            {t('expenses.addExpense')}
          </button>
        </div>

        {/* Total + per-type breakdown */}
        <div className="px-6 py-5">
          <div className="flex flex-wrap gap-4 items-start">
            <div className="flex-1 min-w-[200px]">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">{t('expenses.totalExpenses')}</p>
              <p className="text-3xl font-bold text-gray-900">
                {total.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                <span className="text-base font-normal text-gray-500 ml-1">netto</span>
              </p>
              <p className="text-sm text-gray-500 mt-1">
                + 19% MwSt ({(total * 0.19).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })})
              </p>
              <p className="text-lg font-bold text-gray-800 mt-0.5 border-t border-gray-200 pt-1">
                = {(total * 1.19).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                <span className="text-sm font-normal text-gray-500 ml-1">brutto</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">{expenses.length} {t('expenses.entriesCount')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {expenseTypes.filter((et) => totalByType[et.value] > 0).map((et) => (
                <div key={et.value} className={`${et.bg} ${et.color} rounded-lg px-3 py-2 text-xs`}>
                  <p className="font-semibold">{et.label}</p>
                  <p className="font-bold text-sm">
                    {totalByType[et.value].toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Expenses list */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-base font-bold text-gray-900">{t('expenses.entriesTitle')}</h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent" />
          </div>
        ) : expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
            <span className="text-4xl">📭</span>
            <p className="text-sm">{t('expenses.noExpenses')}</p>
            <button
              type="button"
              onClick={openModal}
              className="mt-1 text-sm text-emerald-600 hover:underline font-medium"
            >
              {t('expenses.addFirst')}
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {expenses.map((expense) => {
              const cfg = getTypeConfig(expense.type);
              return (
                <li key={expense.id} className="px-6 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors">
                  {/* Type badge */}
                  <span className={`flex-shrink-0 mt-0.5 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
                    {cfg.label}
                  </span>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <span className="font-medium text-gray-700">
                        {expense.date.toLocaleDateString('de-DE')}
                      </span>
                      {expense.invoiceNumber && (
                        <>
                          <span>·</span>
                          <span>{t('expenses.invoicePrefix')} {expense.invoiceNumber}</span>
                        </>
                      )}
                      {expense.timePeriod && (
                        <>
                          <span>·</span>
                          <span>{expense.timePeriod}</span>
                        </>
                      )}
                    </div>
                    {expense.note && (
                      <p className="text-sm text-gray-700 mt-1">{expense.note}</p>
                    )}
                  </div>

                  {/* Amount + Paid status */}
                  <div className="flex-shrink-0 text-right space-y-1">
                    <p className="text-base font-bold text-red-600">
                      -{expense.amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                    </p>
                    <button
                      type="button"
                      onClick={() => void togglePaid(expense)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold transition-colors ${
                        expense.isPaid
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-red-100 text-red-700 hover:bg-red-200'
                      }`}
                      title={expense.isPaid ? t('expenses.form.markUnpaid') : t('expenses.form.markPaid')}
                    >
                      {expense.isPaid ? (
                        <><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>{t('expenses.form.paid')}</>
                      ) : (
                        <><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/></svg>{t('expenses.form.unpaid')}</>
                      )}
                    </button>
                  </div>

                  {/* Delete */}
                  <div className="flex-shrink-0">
                    {deleteConfirmId === expense.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleDelete(expense.id)}
                          disabled={deletingId === expense.id}
                          className="text-xs text-red-600 hover:underline disabled:opacity-50"
                        >
                          {deletingId === expense.id ? '…' : t('expenses.delete')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(null)}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          {t('expenses.deleteCancel')}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(expense.id)}
                        className="text-gray-300 hover:text-red-400 transition-colors"
                        title={t('expenses.delete')}
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

      {/* Add expense modal */}
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
              <h2 className="text-base font-bold text-gray-900">{t('expenses.newExpense')}</h2>
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
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">{t('expenses.form.type')}</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {expenseTypes.map((et) => (
                    <button
                      key={et.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, type: et.value }))}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all text-left ${
                        form.type === et.value
                          ? `${et.bg} ${et.color} border-current`
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {et.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount + Date */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">{t('expenses.form.amount')}</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder={t('expenses.form.amountPlaceholder')}
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <DateInput
                  label={t('expenses.form.date')}
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  focusClassName="focus:border-emerald-500"
                />
              </div>

              {/* Invoice number */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">{t('expenses.form.invoiceNumber')}</label>
                <input
                  type="text"
                  placeholder={t('expenses.form.invoiceNumberPlaceholder')}
                  value={form.invoiceNumber}
                  onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">{t('expenses.form.note')}</label>
                <textarea
                  rows={2}
                  placeholder={t('expenses.form.notePlaceholder')}
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              {/* Time period */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">{t('expenses.form.timePeriod')}</label>
                <input
                  type="text"
                  placeholder={t('expenses.form.timePeriodPlaceholder')}
                  value={form.timePeriod}
                  onChange={(e) => setForm((f) => ({ ...f, timePeriod: e.target.value }))}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
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
                className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {saving ? t('expenses.saving') : t('expenses.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
