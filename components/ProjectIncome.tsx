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
import { DateInput } from '@/components/DateInput';

// Standard German VAT rate used for the Net / VAT / Gross breakdown.
const VAT_RATE = 0.19;

export type IncomeType =
  | 'progress_payment' // Abschlagsrechnung (payment)
  | 'final_invoice'    // Schlussrechnung (payment)
  | 'cash'             // Barzahlung (payment)
  | 'quotation'        // Angebot (project value)
  | 'change_order'     // Nachtrag (project value)
  | 'report'           // Rapport (project value)
  // legacy types kept so older entries still render correctly
  | 'bank_transfer'
  | 'partial_payment'
  | 'discount_skonto';

export type ChangeOrderSubType = 'report' | 'quotation' | 'additional_work';

// Types that raise the project value (Total / Outstanding). Everything else is a payment.
const VALUE_TYPES: IncomeType[] = ['quotation', 'change_order', 'report'];
// Types that show the invoice fields (discount, invoice number, payment date).
const INVOICE_TYPES: IncomeType[] = ['progress_payment', 'final_invoice'];
// Types offered as quick-add buttons / selectable in the form.
const SELECTABLE_TYPES: IncomeType[] = [
  'progress_payment',
  'final_invoice',
  'cash',
  'quotation',
  'change_order',
  'report',
];

interface IncomeEntry {
  id: string;
  projectId: string;
  type: IncomeType;
  amount: number;
  date: Date;
  note: string;
  discount: number | null;
  cashPercent: number | null;
  invoiceNumber: string | null;
  paymentDate: Date | null;
  changeOrderSubType: ChangeOrderSubType | null;
  createdAt: Date | null;
}

interface FormState {
  type: IncomeType;
  amount: string;
  date: string;
  note: string;
  discount: string;
  cashPercent: string;
  invoiceNumber: string;
  paymentDate: string;
  changeOrderSubType: ChangeOrderSubType | '';
}

const TYPE_STYLE: Record<string, { color: string; bg: string }> = {
  progress_payment: { color: 'text-blue-700',   bg: 'bg-blue-100'   },
  final_invoice:    { color: 'text-teal-700',   bg: 'bg-teal-100'   },
  cash:             { color: 'text-green-700',  bg: 'bg-green-100'  },
  quotation:        { color: 'text-indigo-700', bg: 'bg-indigo-100' },
  change_order:     { color: 'text-purple-700', bg: 'bg-purple-100' },
  report:           { color: 'text-amber-700',  bg: 'bg-amber-100'  },
  // legacy
  bank_transfer:    { color: 'text-indigo-700', bg: 'bg-indigo-100' },
  partial_payment:  { color: 'text-purple-700', bg: 'bg-purple-100' },
  discount_skonto:  { color: 'text-orange-700', bg: 'bg-orange-100' },
};

const CHANGE_ORDER_SUBTYPES: ChangeOrderSubType[] = ['report', 'quotation', 'additional_work'];

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function parseNum(value: string): number {
  const n = parseFloat((value || '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function fmtEUR(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

// Net amount of an entry after applying its discount (invoices) or surcharge (cash).
function netOf(args: {
  type: IncomeType;
  amount: number;
  discount: number | null;
  cashPercent: number | null;
}): number {
  const base = args.amount || 0;
  if (args.type === 'cash') return base * (1 + (args.cashPercent ?? 0) / 100);
  if (INVOICE_TYPES.includes(args.type)) return base * (1 - (args.discount ?? 0) / 100);
  return base;
}

const EMPTY_FORM: FormState = {
  type: 'progress_payment',
  amount: '',
  date: todayISO(),
  note: '',
  discount: '',
  cashPercent: '',
  invoiceNumber: '',
  paymentDate: '',
  changeOrderSubType: '',
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

  function typeLabel(type: IncomeType): string {
    return t(`income.types.${type}`);
  }
  function typeStyle(type: IncomeType) {
    return TYPE_STYLE[type] ?? { color: 'text-gray-700', bg: 'bg-gray-100' };
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
            discount: typeof data.discount === 'number' ? data.discount : null,
            cashPercent: typeof data.cashPercent === 'number' ? data.cashPercent : null,
            invoiceNumber:
              typeof data.invoiceNumber === 'string'
                ? data.invoiceNumber
                : typeof data.advanceNumber === 'string'
                ? data.advanceNumber
                : null,
            paymentDate:
              data.paymentDate instanceof Timestamp ? data.paymentDate.toDate() : null,
            changeOrderSubType:
              (data.changeOrderSubType as ChangeOrderSubType) || null,
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

  // Total (project value) vs Paid, each as Net / VAT / Gross.
  const summary = useMemo(() => {
    let totalNet = 0;
    let paidNet = 0;
    for (const e of entries) {
      const net = netOf(e);
      if (VALUE_TYPES.includes(e.type)) totalNet += net;
      else paidNet += net;
    }
    const outstandingNet = totalNet - paidNet;
    const withVat = (net: number) => ({
      net,
      vat: net * VAT_RATE,
      gross: net * (1 + VAT_RATE),
    });
    return {
      total: withVat(totalNet),
      paid: withVat(paidNet),
      outstanding: withVat(outstandingNet),
    };
  }, [entries]);

  // Live Net / VAT / Gross preview for the entry being edited.
  const formNet = useMemo(
    () =>
      netOf({
        type: form.type,
        amount: parseNum(form.amount),
        discount: parseNum(form.discount),
        cashPercent: parseNum(form.cashPercent),
      }),
    [form.type, form.amount, form.discount, form.cashPercent]
  );

  function openModal(type: IncomeType) {
    setForm({ ...EMPTY_FORM, type, date: todayISO() });
    setFormError('');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setFormError('');
  }

  async function handleSave() {
    const amount = parseNum(form.amount);
    if (!form.type) { setFormError(t('income.form.typeRequired')); return; }
    if (!form.date) { setFormError(t('income.form.dateRequired')); return; }
    if (!form.amount || amount <= 0) { setFormError(t('income.form.amountRequired')); return; }
    if (form.type === 'change_order' && !form.changeOrderSubType) {
      setFormError(t('income.form.subTypeRequired'));
      return;
    }
    if (!db) return;
    setSaving(true);
    setFormError('');
    try {
      const payload: Record<string, unknown> = {
        projectId,
        type: form.type,
        amount,
        date: Timestamp.fromDate(new Date(form.date)),
        note: form.note.trim(),
        createdAt: serverTimestamp(),
      };
      if (INVOICE_TYPES.includes(form.type)) {
        payload.discount = form.discount ? parseNum(form.discount) : null;
        payload.invoiceNumber = form.invoiceNumber.trim() || null;
        payload.paymentDate = form.paymentDate
          ? Timestamp.fromDate(new Date(form.paymentDate))
          : null;
      } else if (form.type === 'cash') {
        payload.cashPercent = form.cashPercent ? parseNum(form.cashPercent) : null;
      } else if (form.type === 'change_order') {
        payload.changeOrderSubType = form.changeOrderSubType || null;
        payload.invoiceNumber = form.invoiceNumber.trim() || null;
      } else if (form.type === 'quotation' || form.type === 'report') {
        payload.invoiceNumber = form.invoiceNumber.trim() || null;
      }
      await addDoc(collection(db, 'projectIncome'), payload);
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

  const showInvoiceFields = INVOICE_TYPES.includes(form.type);
  const isCash = form.type === 'cash';
  const isChangeOrder = form.type === 'change_order';
  const showNumberField =
    form.type === 'quotation' || form.type === 'report' || isChangeOrder;

  return (
    <div className="space-y-6">
      {/* Summary card — Total / Paid / Outstanding (Net / VAT / Gross) */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-100 px-6 py-4 border-b border-blue-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💰</span>
            <div>
              <h3 className="text-base font-bold text-gray-900">{t('income.title')}</h3>
              <p className="text-xs text-gray-600">{t('income.subtitle')}</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {([
            { key: 'total', data: summary.total, accent: 'text-gray-900' },
            { key: 'paid', data: summary.paid, accent: 'text-green-600' },
            { key: 'outstanding', data: summary.outstanding, accent: 'text-orange-600' },
          ] as const).map(({ key, data, accent }) => (
            <div key={key} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                {t(`income.summary.${key}`)}
              </p>
              <p className={`text-2xl font-bold ${accent}`}>{fmtEUR(data.gross)}</p>
              <p className="text-[11px] text-gray-400">{t('income.summary.gross')}</p>
              <div className="mt-2 space-y-0.5 text-xs text-gray-500">
                <div className="flex justify-between">
                  <span>{t('income.summary.net')}</span>
                  <span className="font-medium text-gray-700">{fmtEUR(data.net)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('income.summary.vat')}</span>
                  <span className="font-medium text-gray-700">{fmtEUR(data.vat)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick-add type buttons */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-700 mb-3">{t('income.chooseType')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {SELECTABLE_TYPES.map((type) => {
            const s = typeStyle(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => openModal(type)}
                className={`px-3 py-3 rounded-lg text-xs font-semibold border-2 border-gray-200 hover:border-current transition-all ${s.bg} ${s.color}`}
              >
                {typeLabel(type)}
              </button>
            );
          })}
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
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {entries.map((entry) => {
              const s = typeStyle(entry.type);
              const isValue = VALUE_TYPES.includes(entry.type);
              const net = netOf(entry);
              const gross = net * (1 + VAT_RATE);
              return (
                <li key={entry.id} className="px-6 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors">
                  <span className={`flex-shrink-0 mt-0.5 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.color}`}>
                    {typeLabel(entry.type)}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <span className="font-medium text-gray-700">
                        {entry.date.toLocaleDateString('de-DE')}
                      </span>
                      {entry.invoiceNumber && (
                        <span className="text-gray-400">· {t('income.form.numberShort')} {entry.invoiceNumber}</span>
                      )}
                      {entry.changeOrderSubType && (
                        <span className="text-gray-400">· {t(`income.subTypes.${entry.changeOrderSubType}`)}</span>
                      )}
                    </div>
                    {entry.note && (
                      <p className="text-sm text-gray-700 mt-1">{entry.note}</p>
                    )}
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {t('income.summary.net')} {fmtEUR(net)} · {t('income.summary.vat')} {fmtEUR(net * VAT_RATE)}
                    </p>
                  </div>

                  <div className="flex-shrink-0 text-right">
                    <p className={`text-base font-bold ${isValue ? 'text-gray-700' : 'text-green-600'}`}>
                      {isValue ? '' : '+'}{fmtEUR(gross)}
                    </p>
                    <p className="text-[11px] text-gray-400">{t('income.summary.gross')}</p>
                  </div>

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

      {/* Entry modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-base font-bold text-gray-900">
                {t('income.newEntry')} · {typeLabel(form.type)}
              </h2>
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
                  {SELECTABLE_TYPES.map((type) => {
                    const s = typeStyle(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, type }))}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all text-left ${
                          form.type === type
                            ? `${s.bg} ${s.color} border-current`
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {typeLabel(type)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Change-order sub-type */}
              {isChangeOrder && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">{t('income.form.subType')}</label>
                  <div className="grid grid-cols-3 gap-2">
                    {CHANGE_ORDER_SUBTYPES.map((sub) => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, changeOrderSubType: sub }))}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${
                          form.changeOrderSubType === sub
                            ? 'bg-purple-100 text-purple-700 border-current'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {t(`income.subTypes.${sub}`)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Amount + Date */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">{t('income.form.amountNet')}</label>
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
                <DateInput
                  label={t('income.form.date')}
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>

              {/* Invoice fields: discount, invoice number, payment date */}
              {showInvoiceFields && (
                <div className="grid grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">{t('income.form.discount')}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={t('income.form.discountPlaceholder')}
                      value={form.discount}
                      onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">{t('income.form.invoiceNumber')}</label>
                    <input
                      type="text"
                      placeholder={t('income.form.invoiceNumberPlaceholder')}
                      value={form.invoiceNumber}
                      onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <DateInput
                    label={t('income.form.paymentDate')}
                    value={form.paymentDate}
                    onChange={(e) => setForm((f) => ({ ...f, paymentDate: e.target.value }))}
                  />
                </div>
              )}

              {/* Cash surcharge percentage */}
              {isCash && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">{t('income.form.cashPercent')}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={t('income.form.cashPercentPlaceholder')}
                    value={form.cashPercent}
                    onChange={(e) => setForm((f) => ({ ...f, cashPercent: e.target.value }))}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">{t('income.form.cashPercentHint')}</p>
                </div>
              )}

              {/* Number field for quotation / report / change order */}
              {showNumberField && !showInvoiceFields && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">{t('income.form.number')}</label>
                  <input
                    type="text"
                    placeholder={t('income.form.numberPlaceholder')}
                    value={form.invoiceNumber}
                    onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

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

              {/* Live Net / VAT / Gross preview */}
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-gray-700 space-y-1">
                <div className="flex justify-between">
                  <span>{t('income.summary.net')}</span>
                  <span className="font-semibold">{fmtEUR(formNet)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('income.summary.vat')}</span>
                  <span className="font-semibold">{fmtEUR(formNet * VAT_RATE)}</span>
                </div>
                <div className="flex justify-between text-sm text-blue-700">
                  <span className="font-semibold">{t('income.summary.gross')}</span>
                  <span className="font-bold">{fmtEUR(formNet * (1 + VAT_RATE))}</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3 sticky bottom-0 bg-white">
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
