'use client';

import { useLanguage } from '@/contexts/LanguageContext';

export interface CatalogColumn<T> {
  key: string;
  label: string;
  value: (item: T) => string;
  /** Rendered as a wide first column. */
  primary?: boolean;
}

interface CatalogTableProps<T extends { id: string; isActive: boolean }> {
  items: T[];
  columns: CatalogColumn<T>[];
  emptyMessage: string;
  onToggleActive: (item: T) => void;
  onDelete: (item: T) => void;
}

/**
 * Shared table for the material and machine catalogues (requirements 55, 56).
 *
 * Inactive rows stay on file but are dimmed — the employee app only offers
 * active entries.
 */
export default function CatalogTable<T extends { id: string; isActive: boolean }>({
  items,
  columns,
  emptyMessage,
  onToggleActive,
  onDelete,
}: CatalogTableProps<T>) {
  const { t } = useLanguage();

  if (items.length === 0) {
    return (
      <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-8 text-center">
        <p className="text-sm font-medium text-gray-700">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase whitespace-nowrap"
              >
                {column.label}
              </th>
            ))}
            <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">
              {t('catalog.status')}
            </th>
            <th className="px-4 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">
              {t('common.actions')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item) => (
            <tr
              key={item.id}
              className={item.isActive ? 'hover:bg-gray-50' : 'bg-gray-50/60'}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-4 py-2.5 text-sm ${
                    column.primary
                      ? 'font-medium text-gray-900'
                      : 'text-gray-600'
                  } ${item.isActive ? '' : 'text-gray-400'}`}
                >
                  {column.value(item) || '—'}
                </td>
              ))}
              <td className="px-4 py-2.5">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    item.isActive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {item.isActive ? t('catalog.active') : t('catalog.inactive')}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right space-x-3 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => onToggleActive(item)}
                  className="text-xs font-medium text-green-power-700 hover:text-green-power-800"
                >
                  {item.isActive
                    ? t('catalog.deactivate')
                    : t('catalog.activate')}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(item)}
                  className="text-xs font-medium text-red-600 hover:text-red-700"
                >
                  {t('catalog.delete')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
