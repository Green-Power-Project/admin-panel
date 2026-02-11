'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import { useLanguage } from '@/contexts/LanguageContext';

interface OfferItem {
  imageId: string;
  imageUrl: string;
  itemName: string;
  color: string;
  quantityMeters?: string;
  quantityPieces?: string;
}

interface OfferRequest {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string;
  address: string;
  items: OfferItem[];
  createdAt: string | null;
}

export default function OffersPage() {
  const { t } = useLanguage();
  return (
    <ProtectedRoute>
      <AdminLayout title={t('offers.title')}>
        <OffersContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function OffersContent() {
  const { t } = useLanguage();
  const [list, setList] = useState<OfferRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OfferRequest | null>(null);

  useEffect(() => {
    fetch('/api/offers')
      .then((r) => r.json())
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="px-4 sm:px-6 py-8">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">{t('offers.title')}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{t('offers.subtitle')}</p>
        </div>

        <div className="overflow-x-auto">
          {list.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">{t('offers.noOffers')}</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('offers.date')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('offers.customer')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('offers.email')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('offers.address')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('offers.items')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {list.map((offer) => (
                  <tr
                    key={offer.id}
                    onClick={() => setSelected(offer)}
                    className="cursor-pointer hover:bg-green-power-50/50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {offer.createdAt ? new Date(offer.createdAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {offer.firstName} {offer.lastName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      <a
                        href={`mailto:${offer.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-green-power-600 hover:underline"
                      >
                        {offer.email}
                      </a>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate" title={offer.address}>
                      {offer.address || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <ul className="list-disc list-inside space-y-1">
                        {offer.items.slice(0, 3).map((item, i) => (
                          <li key={i}>
                            {item.itemName}
                            {item.color ? ` · ${item.color}` : ''}
                            {item.quantityMeters ? ` · ${item.quantityMeters} m` : ''}
                            {item.quantityPieces ? ` · ${item.quantityPieces} pcs` : ''}
                          </li>
                        ))}
                        {offer.items.length > 3 && <li>…</li>}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{t('offers.detailTitle')}</h3>
              <button type="button" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100" onClick={() => setSelected(null)} aria-label={t('offers.close')}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4 overflow-y-auto">
              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">{t('offers.customerInfo')}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-5">
                <div>
                  <p className="text-gray-500">{t('offers.customer')}</p>
                  <p className="font-medium text-gray-900">{selected.firstName} {selected.lastName}</p>
                </div>
                <div>
                  <p className="text-gray-500">{t('offers.email')}</p>
                  <p className="font-medium text-gray-900">{selected.email}</p>
                </div>
                {selected.mobile ? (
                  <div>
                    <p className="text-gray-500">{t('offers.mobile')}</p>
                    <p className="font-medium text-gray-900">{selected.mobile}</p>
                  </div>
                ) : null}
                <div className="sm:col-span-2">
                  <p className="text-gray-500">{t('offers.address')}</p>
                  <p className="font-medium text-gray-900">{selected.address || '—'}</p>
                </div>
              </div>

              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">{t('offers.requestedItems')}</h4>
              <div className="space-y-3">
                {selected.items.map((it, idx) => (
                  <div key={idx} className="flex gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                    {it.imageUrl ? <img src={it.imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" /> : null}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900">{it.itemName}</p>
                      <p className="text-sm text-gray-600 mt-0.5">{t('offers.color')}: {it.color || '—'}</p>
                      <div className="flex flex-wrap gap-x-3 text-sm text-gray-600 mt-1">
                        {it.quantityMeters ? <span>{it.quantityMeters} m</span> : null}
                        {it.quantityPieces ? <span>{it.quantityPieces} pcs</span> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100">
              <button type="button" className="w-full py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50" onClick={() => setSelected(null)}>
                {t('offers.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

