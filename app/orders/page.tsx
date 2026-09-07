'use client';

import { useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import { useLanguage } from '@/contexts/LanguageContext';
import { getOrders, setOrderStatus, subscribeOperations } from '@/lib/operations/operationsStore';
import {
  MATERIAL_ORDER_STATUSES,
  type MaterialOrderRecord,
  type MaterialOrderStatus,
} from '@/lib/operations/types';

export default function OrdersPage() {
  const { t } = useLanguage();
  return (
    <ProtectedRoute>
      <AdminLayout title={t('operations.ordersTitle')}>
        <OrdersContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function OrdersContent() {
  const { t } = useLanguage();
  const [orders, setOrders] = useState<MaterialOrderRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | MaterialOrderStatus>('all');

  useEffect(() => subscribeOperations(() => setOrders(getOrders())), []);

  const visible = useMemo(
    () => (statusFilter === 'all' ? orders : orders.filter((o) => o.status === statusFilter)),
    [orders, statusFilter],
  );

  const statusLabel = (status: string) =>
    t(`operations.status${status.charAt(0).toUpperCase()}${status.slice(1)}`);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{t('operations.ordersTitle')}</h2>
        <p className="text-sm text-gray-600 mt-1">{t('operations.ordersDesc')}</p>
      </div>

      <div className="flex items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">{t('operations.filterStatus')}</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | MaterialOrderStatus)} className={INPUT}>
            <option value="all">{t('operations.allStatuses')}</option>
            {MATERIAL_ORDER_STATUSES.map((s) => (<option key={s} value={s}>{statusLabel(s)}</option>))}
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-8 text-center">
          <p className="text-sm font-medium text-gray-700">{t('operations.ordersEmpty')}</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['requestedDate', 'project', 'employee', 'material', 'quantity', 'comment', 'status'].map((k) => (
                  <th key={k} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase whitespace-nowrap">
                    {t(`operations.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap">{order.requestedDate}</td>
                  <td className="px-3 py-2 text-sm text-gray-600">{order.projectName}</td>
                  <td className="px-3 py-2 text-sm text-gray-600">{order.employeeName}</td>
                  <td className="px-3 py-2 text-sm font-medium text-gray-900">{order.material}</td>
                  <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">{order.quantity} {order.unit}</td>
                  <td className="px-3 py-2 text-sm text-gray-600">{order.comment || '—'}</td>
                  <td className="px-3 py-2">
                    <select
                      value={order.status}
                      onChange={(e) => setOrderStatus(order.id, e.target.value as MaterialOrderStatus)}
                      className="px-2 py-1 border border-gray-300 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500"
                    >
                      {MATERIAL_ORDER_STATUSES.map((s) => (<option key={s} value={s}>{statusLabel(s)}</option>))}
                    </select>
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
  'px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500';
