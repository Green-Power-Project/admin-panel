'use client';

import { useEffect, useState, useCallback } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import { useLanguage } from '@/contexts/LanguageContext';
import { generateOfferPdf } from '@/lib/offerPdf';
import OfferCatalog from '@/components/OfferCatalog';

interface OfferItem {
  imageId: string;
  imageUrl: string;
  itemName: string;
  color: string;
  quantityMeters?: string;
  quantityPieces?: string;
  dimension?: string;
  /** @deprecated Legacy fields; show dimension when present, else these for old requests */
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
  projectNote?: string;
  projectPhotoUrls?: string[];
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
  const [activeTab, setActiveTab] = useState<'catalog' | 'requests'>('requests');
  const [list, setList] = useState<OfferRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewPdfUrl, setViewPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/offers')
      .then((r) => r.json())
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, []);

  const handleDownloadPdf = useCallback((offer: OfferRequest) => {
    const blob = generateOfferPdf({
      firstName: offer.firstName,
      lastName: offer.lastName,
      email: offer.email,
      address: offer.address,
      projectNote: offer.projectNote,
      projectPhotoUrls: offer.projectPhotoUrls,
      items: offer.items.map((it) => ({
        itemName: it.itemName,
        color: it.color,
        dimension: it.dimension,
        quantityMeters: it.quantityMeters,
        quantityPieces: it.quantityPieces,
        note: it.note,
        imageUrl: it.imageUrl,
        photoUrls: it.photoUrls,
      })),
      createdAt: offer.createdAt,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `offer-request-${offer.id}-${offer.createdAt ? new Date(offer.createdAt).toISOString().slice(0, 10) : 'export'}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleViewPdf = useCallback((offer: OfferRequest) => {
    const blob = generateOfferPdf({
      firstName: offer.firstName,
      lastName: offer.lastName,
      email: offer.email,
      address: offer.address,
      projectNote: offer.projectNote,
      projectPhotoUrls: offer.projectPhotoUrls,
      items: offer.items.map((it) => ({
        itemName: it.itemName,
        color: it.color,
        dimension: it.dimension,
        quantityMeters: it.quantityMeters,
        quantityPieces: it.quantityPieces,
        note: it.note,
        imageUrl: it.imageUrl,
        photoUrls: it.photoUrls,
      })),
      createdAt: offer.createdAt,
    });
    const url = URL.createObjectURL(blob);
    setViewPdfUrl(url);
  }, []);

  const closePdfViewer = useCallback(() => {
    if (viewPdfUrl) {
      URL.revokeObjectURL(viewPdfUrl);
      setViewPdfUrl(null);
    }
  }, [viewPdfUrl]);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-4 sm:space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-green-power-50 to-green-power-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg md:text-xl font-semibold text-gray-900">{t('offers.title')}</h2>
              <p className="text-xs md:text-sm text-gray-600 mt-1">{t('offers.subtitle')}</p>
            </div>
            <div className="flex rounded-lg border border-gray-200 p-0.5 bg-white">
              <button
                type="button"
                onClick={() => setActiveTab('requests')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'requests'
                    ? 'bg-green-power-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t('offers.tabRequests')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('catalog')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'catalog'
                    ? 'bg-green-power-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t('offers.tabCatalog')}
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 py-4">
          {activeTab === 'catalog' ? (
            <OfferCatalog />
          ) : loading ? (
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
                        {t('offers.address')}
                      </th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                        {t('offers.orders')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {list.map((offer) => (
                      <tr key={offer.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-600">
                          {offer.createdAt ? new Date(offer.createdAt).toLocaleString() : '—'}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs font-medium text-gray-900">
                          {offer.firstName} {offer.lastName}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-600">
                          <a
                            href={`mailto:${offer.email}`}
                            className="text-green-power-600 hover:underline truncate block max-w-[180px]"
                          >
                            {offer.email}
                          </a>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-600 max-w-[200px] truncate" title={offer.address}>
                          {offer.address || '—'}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                          <span className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleDownloadPdf(offer)}
                              className="p-1.5 rounded-md text-green-power-600 hover:bg-green-power-50 hover:text-green-power-700 transition-colors"
                              title={t('offers.download')}
                              aria-label={t('offers.download')}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleViewPdf(offer)}
                              className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                              title={t('offers.viewPdf')}
                              aria-label={t('offers.viewPdf')}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                          </span>
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

      {viewPdfUrl && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-white"
          role="dialog"
          aria-modal="true"
          aria-label={t('offers.viewPdf')}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
            <h3 className="text-sm font-semibold text-gray-900">{t('offers.viewPdf')}</h3>
            <button
              type="button"
              className="p-2 rounded-lg text-gray-600 hover:bg-gray-200 transition-colors"
              onClick={closePdfViewer}
              aria-label={t('offers.close')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 min-h-0 w-full">
            <iframe
              src={viewPdfUrl}
              title={t('offers.viewPdf')}
              className="w-full h-full border-0"
            />
          </div>
        </div>
      )}
    </div>
  );
}

