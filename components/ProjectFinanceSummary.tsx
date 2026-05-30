'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLanguage } from '@/contexts/LanguageContext';

interface SummaryProps {
  projectId: string;
}

interface FinanceConfig {
  contractValueNet: number | null;
  contractValueGross: number | null;
}

function fmt(value: number): string {
  return value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

export default function ProjectFinanceSummary({ projectId }: SummaryProps) {
  const { t } = useLanguage();
  const [totalIncome, setTotalIncome] = useState<number>(0);
  const [totalExpenses, setTotalExpenses] = useState<number>(0);
  const [config, setConfig] = useState<FinanceConfig>({ contractValueNet: null, contractValueGross: null });
  const [editing, setEditing] = useState(false);
  const [editNet, setEditNet] = useState('');
  const [editGross, setEditGross] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Real-time income total
  useEffect(() => {
    if (!db || !projectId) return;
    const q = query(collection(db, 'projectIncome'), where('projectId', '==', projectId));
    return onSnapshot(q, (snap) => {
      const sum = snap.docs.reduce((acc, d) => {
        const amt = d.data().amount;
        return acc + (typeof amt === 'number' ? amt : 0);
      }, 0);
      setTotalIncome(sum);
    });
  }, [projectId]);

  // Real-time expenses total
  useEffect(() => {
    if (!db || !projectId) return;
    const q = query(collection(db, 'projectExpenses'), where('projectId', '==', projectId));
    return onSnapshot(q, (snap) => {
      const sum = snap.docs.reduce((acc, d) => {
        const amt = d.data().amount;
        return acc + (typeof amt === 'number' ? amt : 0);
      }, 0);
      setTotalExpenses(sum);
    });
  }, [projectId]);

  // Load contract value config
  useEffect(() => {
    if (!db || !projectId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'projectFinanceConfig', projectId));
        if (snap.exists()) {
          const data = snap.data();
          setConfig({
            contractValueNet: typeof data.contractValueNet === 'number' ? data.contractValueNet : null,
            contractValueGross: typeof data.contractValueGross === 'number' ? data.contractValueGross : null,
          });
        }
      } catch {
        // config not yet created — fine
      }
    })();
  }, [projectId]);

  const profitLoss = useMemo(
    () => totalIncome - totalExpenses,
    [totalIncome, totalExpenses]
  );

  const outstanding = useMemo(
    () => Math.max(0, totalExpenses - totalIncome),
    [totalIncome, totalExpenses]
  );

  function openEdit() {
    setEditNet(config.contractValueNet != null ? String(config.contractValueNet) : '');
    setEditGross(config.contractValueGross != null ? String(config.contractValueGross) : '');
    setSaveError('');
    setEditing(true);
  }

  async function handleSaveConfig() {
    if (!db) return;
    const net = editNet.trim() ? parseFloat(editNet.replace(',', '.')) : null;
    const gross = editGross.trim() ? parseFloat(editGross.replace(',', '.')) : null;
    setSaving(true);
    setSaveError('');
    try {
      await setDoc(
        doc(db, 'projectFinanceConfig', projectId),
        {
          projectId,
          contractValueNet: net,
          contractValueGross: gross,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );
      setConfig({ contractValueNet: net, contractValueGross: gross });
      setEditing(false);
    } catch {
      setSaveError(t('financeSummary.saveError'));
    } finally {
      setSaving(false);
    }
  }

  const isProfit = profitLoss >= 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-6 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📊</span>
          <div>
            <h3 className="text-base font-bold text-white">{t('financeSummary.title')}</h3>
            <p className="text-xs text-gray-400">{t('financeSummary.subtitle')}</p>
          </div>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={openEdit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            {t('financeSummary.editContractValue')}
          </button>
        )}
      </div>

      {/* Edit contract value */}
      {editing && (
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">{t('financeSummary.contractValueNet')}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={t('financeSummary.netPlaceholder')}
                  value={editNet}
                  onChange={(e) => setEditNet(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg pl-7 pr-3 py-2 focus:outline-none focus:border-gray-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">{t('financeSummary.contractValueGross')}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={t('financeSummary.grossPlaceholder')}
                  value={editGross}
                  onChange={(e) => setEditGross(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg pl-7 pr-3 py-2 focus:outline-none focus:border-gray-500"
                />
              </div>
            </div>
          </div>
          {saveError && (
            <p className="text-xs text-red-600">{saveError}</p>
          )}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100"
            >
              {t('financeSummary.cancelEdit')}
            </button>
            <button
              type="button"
              onClick={() => void handleSaveConfig()}
              disabled={saving}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-gray-800 rounded-lg hover:bg-gray-900 disabled:opacity-50"
            >
              {saving ? '…' : t('financeSummary.saveContractValue')}
            </button>
          </div>
        </div>
      )}

      {/* Summary grid */}
      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* Contract Net */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-500 font-medium mb-1">{t('financeSummary.contractValueNet')}</p>
            <p className="text-xl font-bold text-gray-800">
              {config.contractValueNet != null ? fmt(config.contractValueNet) : <span className="text-gray-400 text-sm font-normal">{t('financeSummary.notSet')}</span>}
            </p>
          </div>

          {/* Contract Gross */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-500 font-medium mb-1">{t('financeSummary.contractValueGross')}</p>
            <p className="text-xl font-bold text-gray-800">
              {config.contractValueGross != null ? fmt(config.contractValueGross) : <span className="text-gray-400 text-sm font-normal">{t('financeSummary.notSet')}</span>}
            </p>
          </div>

          {/* Total received */}
          <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-3">
            <p className="text-xs text-green-600 font-medium mb-1">{t('financeSummary.totalReceived')}</p>
            <p className="text-xl font-bold text-green-700">{fmt(totalIncome)}</p>
          </div>

          {/* Total spent */}
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3">
            <p className="text-xs text-red-600 font-medium mb-1">{t('financeSummary.totalSpent')}</p>
            <p className="text-xl font-bold text-red-700">{fmt(totalExpenses)}</p>
          </div>

          {/* Outstanding */}
          <div className="rounded-xl border border-orange-100 bg-orange-50 px-4 py-3">
            <p className="text-xs text-orange-600 font-medium mb-1">{t('financeSummary.outstanding')}</p>
            <p className="text-xl font-bold text-orange-700">{fmt(outstanding)}</p>
          </div>

          {/* Profit / Loss */}
          <div className={`rounded-xl border px-4 py-3 ${isProfit ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
            <p className={`text-xs font-medium mb-1 ${isProfit ? 'text-emerald-600' : 'text-red-600'}`}>
              {t('financeSummary.profitLoss')}
            </p>
            <p className={`text-xl font-bold ${isProfit ? 'text-emerald-700' : 'text-red-700'}`}>
              {isProfit ? '+' : ''}{fmt(profitLoss)}
            </p>
            <p className={`text-xs font-semibold mt-0.5 ${isProfit ? 'text-emerald-500' : 'text-red-500'}`}>
              {isProfit ? t('financeSummary.profit') : t('financeSummary.loss')}
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
