'use client';

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLanguage } from '@/contexts/LanguageContext';

interface SummaryProps {
  projectId: string;
}

const VAT_RATE = 0.19;

function fmt(value: number): string {
  return value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

function withVat(net: number) {
  return {
    net,
    vat: net * VAT_RATE,
    gross: net * (1 + VAT_RATE),
  };
}

function StatBreakdownCard({
  title,
  netValue,
  borderClass,
  bgClass,
  titleClass,
  valueClass,
  netLabel,
  vatLabel,
  grossLabel,
  showPlusWhenPositive,
  footer,
}: {
  title: string;
  netValue: number;
  borderClass: string;
  bgClass: string;
  titleClass: string;
  valueClass: string;
  netLabel: string;
  vatLabel: string;
  grossLabel: string;
  showPlusWhenPositive?: boolean;
  footer?: ReactNode;
}) {
  const data = withVat(netValue);
  const prefix = showPlusWhenPositive && netValue > 0 ? '+' : '';

  return (
    <div className={`rounded-xl border px-4 py-3 ${borderClass} ${bgClass}`}>
      <p className={`text-xs font-medium mb-2 ${titleClass}`}>{title}</p>
      <p className={`text-xl font-bold ${valueClass}`}>
        {prefix}{fmt(data.gross)}
      </p>
      <p className="text-[11px] text-gray-400 mb-2">{grossLabel}</p>
      <div className="space-y-0.5 text-xs text-gray-500">
        <div className="flex justify-between gap-2">
          <span>{netLabel}</span>
          <span className="font-medium text-gray-700">{prefix}{fmt(data.net)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>{vatLabel}</span>
          <span className="font-medium text-gray-700">{prefix}{fmt(data.vat)}</span>
        </div>
      </div>
      {footer}
    </div>
  );
}

export default function ProjectFinanceSummary({ projectId }: SummaryProps) {
  const { t } = useLanguage();
  const [totalIncome, setTotalIncome] = useState<number>(0);
  const [totalExpenses, setTotalExpenses] = useState<number>(0);

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

  const profitLoss = useMemo(
    () => totalIncome - totalExpenses,
    [totalIncome, totalExpenses]
  );

  const outstanding = useMemo(
    () => Math.max(0, totalExpenses - totalIncome),
    [totalIncome, totalExpenses]
  );

  const isProfit = profitLoss >= 0;
  const netLabel = t('income.summary.net');
  const vatLabel = t('income.summary.vat');
  const grossLabel = t('income.summary.gross');

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
      </div>

      {/* Summary grid */}
      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

          <StatBreakdownCard
            title={t('financeSummary.totalReceived')}
            netValue={totalIncome}
            borderClass="border-green-100"
            bgClass="bg-green-50"
            titleClass="text-green-600"
            valueClass="text-green-700"
            netLabel={netLabel}
            vatLabel={vatLabel}
            grossLabel={grossLabel}
          />

          <StatBreakdownCard
            title={t('financeSummary.totalSpent')}
            netValue={totalExpenses}
            borderClass="border-red-100"
            bgClass="bg-red-50"
            titleClass="text-red-600"
            valueClass="text-red-700"
            netLabel={netLabel}
            vatLabel={vatLabel}
            grossLabel={grossLabel}
          />

          <StatBreakdownCard
            title={t('financeSummary.outstanding')}
            netValue={outstanding}
            borderClass="border-orange-100"
            bgClass="bg-orange-50"
            titleClass="text-orange-600"
            valueClass="text-orange-700"
            netLabel={netLabel}
            vatLabel={vatLabel}
            grossLabel={grossLabel}
          />

          <StatBreakdownCard
            title={t('financeSummary.profitLoss')}
            netValue={profitLoss}
            borderClass={isProfit ? 'border-emerald-200' : 'border-red-200'}
            bgClass={isProfit ? 'bg-emerald-50' : 'bg-red-50'}
            titleClass={isProfit ? 'text-emerald-600' : 'text-red-600'}
            valueClass={isProfit ? 'text-emerald-700' : 'text-red-700'}
            netLabel={netLabel}
            vatLabel={vatLabel}
            grossLabel={grossLabel}
            showPlusWhenPositive
            footer={
              <p className={`text-xs font-semibold mt-2 ${isProfit ? 'text-emerald-500' : 'text-red-500'}`}>
                {isProfit ? t('financeSummary.profit') : t('financeSummary.loss')}
              </p>
            }
          />

        </div>
      </div>
    </div>
  );
}
