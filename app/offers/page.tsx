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
  thickness?: string;
  length?: string;
  width?: string;
  height?: string;
  note?: string;
  photoUrls?: string[];
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
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/offers')
      .then((r) => r.json())
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-4 sm:space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-green-power-50 to-green-power-100">
          <div>
            <h2 className="text-lg md:text-xl font-semibold text-gray-900">{t('offers.title')}</h2>
            <p className="text-xs md:text-sm text-gray-600 mt-1">{t('offers.subtitle')}</p>
          </div>
        </div>

        <div className="px-6 py-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 animate-pulse"
                >
                  <div className="h-5 w-28 rounded-full bg-gray-200" />
                  <div className="h-3 w-36 rounded bg-gray-200" />
                  <div className="h-3 w-40 rounded bg-gray-200" />
                  <div className="h-3 w-24 rounded bg-gray-200" />
                  <div className="h-3 w-32 rounded bg-gray-200" />
                </div>
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-8 text-center">
              <p className="text-sm text-gray-500">{t('offers.noOffers')}</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                        {t('offers.date')}
                      </th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                        {t('offers.customer')}
                      </th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                        {t('offers.email')}
                      </th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                        {t('offers.mobile')}
                      </th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                        {t('offers.address')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {list.map((offer) => (
                      <tr
                        key={offer.id}
                        onClick={() => setSelected(offer)}
                        className="hover:bg-green-power-50/30 transition-colors cursor-pointer"
                      >
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-600">
                          {offer.createdAt ? new Date(offer.createdAt).toLocaleString() : '—'}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs font-medium text-gray-900">
                          {offer.firstName} {offer.lastName}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-600">
                          <a
                            href={`mailto:${offer.email}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-green-power-600 hover:underline truncate block max-w-[180px]"
                          >
                            {offer.email}
                          </a>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-600">
                          {offer.mobile || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-600 max-w-[200px] truncate" title={offer.address}>
                          {offer.address || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900">
                  {t('offers.detailTitle')}
                </h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  {selected.createdAt
                    ? new Date(selected.createdAt).toLocaleString()
                    : null}
                </p>
              </div>
              <button
                type="button"
                className="p-2 rounded-full text-gray-500 hover:bg-gray-100"
                onClick={() => setSelected(null)}
                aria-label={t('offers.close')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4 overflow-y-auto bg-gray-50">
              <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5 shadow-sm">
                <h4 className="text-xs font-semibold text-gray-500 tracking-wide mb-3">
                  {t('offers.customerInfo')}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wide">
                      {t('offers.customer')}
                    </p>
                    <p className="font-medium text-gray-900">
                      {selected.firstName} {selected.lastName}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wide">
                      {t('offers.email')}
                    </p>
                    <p className="font-medium text-gray-900 break-all">
                      {selected.email}
                    </p>
                  </div>
                  {selected.mobile ? (
                    <div>
                      <p className="text-gray-500 text-xs uppercase tracking-wide">
                        {t('offers.mobile')}
                      </p>
                      <p className="font-medium text-gray-900">
                        {selected.mobile}
                      </p>
                    </div>
                  ) : null}
                  <div className="sm:col-span-2">
                    <p className="text-gray-500 text-xs uppercase tracking-wide">
                      {t('offers.address')}
                    </p>
                    <p className="font-medium text-gray-900">
                      {selected.address || '—'}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-gray-500 tracking-wide mb-3">
                  {t('offers.requestedItems')}
                </h4>
                <div className="space-y-3">
                  {selected.items.map((it, idx) => (
                    <div
                      key={idx}
                      className="bg-white rounded-xl border border-gray-100 p-3 sm:p-4 shadow-sm flex gap-3 sm:gap-4"
                    >
                      {it.imageUrl ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLightboxUrl(it.imageUrl);
                          }}
                          className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200 bg-gray-100 cursor-zoom-in hover:opacity-90 transition-opacity"
                        >
                          <img
                            src={it.imageUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">
                              {it.itemName}
                            </p>
                            {it.color ? (
                              <p className="text-xs text-gray-600 mt-0.5">
                                {t('offers.color')}:{' '}
                                <span className="font-medium">{it.color}</span>
                              </p>
                            ) : null}
                          </div>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-medium text-gray-600 flex-shrink-0">
                            #{idx + 1}
                          </span>
                        </div>

                        {(it.thickness || it.length || it.width || it.height) && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {it.thickness ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-[11px] text-gray-700">
                                {t('offers.thickness')}: {it.thickness}
                              </span>
                            ) : null}
                            {it.length ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-[11px] text-gray-700">
                                {t('offers.length')}: {it.length}
                              </span>
                            ) : null}
                            {it.width ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-[11px] text-gray-700">
                                {t('offers.width')}: {it.width}
                              </span>
                            ) : null}
                            {it.height ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-[11px] text-gray-700">
                                {t('offers.height')}: {it.height}
                              </span>
                            ) : null}
                          </div>
                        )}

                        {(it.quantityMeters || it.quantityPieces) && (
                          <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-gray-700">
                            {it.quantityMeters ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-power-50 text-[11px] text-green-power-700">
                                {it.quantityMeters} m
                              </span>
                            ) : null}
                            {it.quantityPieces ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-power-50 text-[11px] text-green-power-700">
                                {it.quantityPieces} pcs
                              </span>
                            ) : null}
                          </div>
                        )}

                        {it.note ? (
                          <p className="mt-2 text-xs text-gray-700 whitespace-pre-line">
                            <span className="font-semibold">{t('offers.note')}:</span>{' '}
                            {it.note}
                          </p>
                        ) : null}

                        {it.photoUrls && it.photoUrls.length ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {it.photoUrls.map((url, photoIdx) => (
                              <button
                                key={photoIdx}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLightboxUrl(url);
                                }}
                                className="block w-12 h-12 rounded-md overflow-hidden border border-gray-200 bg-gray-100 cursor-zoom-in hover:opacity-90 transition-opacity"
                              >
                                <img
                                  src={url}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 py-3 border-t border-gray-100 bg-white">
              <button
                type="button"
                className="w-full py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
                onClick={() => setSelected(null)}
              >
                {t('offers.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-modal="true"
          aria-label="View image full size"
        >
          <button
            type="button"
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10"
            onClick={() => setLightboxUrl(null)}
            aria-label={t('offers.close')}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={lightboxUrl}
            alt=""
            className="max-w-full max-h-[90vh] w-auto h-auto object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

