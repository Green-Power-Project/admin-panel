'use client';

import { useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  EMPLOYEE_DOCUMENT_CATEGORIES,
  type EmployeeDocumentCategory,
  type EmployeeDocumentRecord,
} from '@/lib/employees/types';

interface DocumentsSectionProps {
  documents: EmployeeDocumentRecord[];
  onUpload: (input: {
    name: string;
    category: string;
    fileName: string;
    year: number;
    visibleToEmployee: boolean;
  }) => Promise<void>;
  onDelete: (documentId: string) => Promise<void>;
  onToggleVisibility?: (
    documentId: string,
    visibleToEmployee: boolean,
  ) => Promise<void>;
}

const CATEGORY_LABEL_KEY: Record<string, string> = {
  payroll: 'employees.docCategoryPayroll',
  employmentContract: 'employees.docCategoryEmploymentContract',
  vacation: 'employees.docCategoryVacation',
  sickLeave: 'employees.docCategorySickLeave',
  certificates: 'employees.docCategoryCertificates',
  other: 'employees.docCategoryOther',
};

/**
 * Personal employee folder (requirement 65): documents grouped into year
 * folders, each explicitly released to the employee app or kept office-only.
 */
export default function DocumentsSection({
  documents,
  onUpload,
  onDelete,
  onToggleVisibility,
}: DocumentsSectionProps) {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] =
    useState<EmployeeDocumentCategory>('employmentContract');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [releaseOnUpload, setReleaseOnUpload] = useState(false);
  const [busy, setBusy] = useState(false);

  const categoryLabel = (cat: string) => {
    const key = CATEGORY_LABEL_KEY[cat];
    if (!key) return cat;
    const translated = t(key);
    return translated === key ? cat : translated;
  };

  // Newest year first, each year's documents newest first.
  const byYear = useMemo(() => {
    const groups = new Map<number, EmployeeDocumentRecord[]>();
    for (const doc of documents) {
      const list = groups.get(doc.year) ?? [];
      list.push(doc);
      groups.set(doc.year, list);
    }
    return Array.from(groups.entries())
      .map(([groupYear, docs]) => ({
        year: groupYear,
        docs: [...docs].sort(
          (a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime(),
        ),
      }))
      .sort((a, b) => b.year - a.year);
  }, [documents]);

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const years = new Set<number>([current, current + 1, current - 1]);
    documents.forEach((doc) => years.add(doc.year));
    return Array.from(years).sort((a, b) => b - a);
  }, [documents]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await onUpload({
        name: file.name.replace(/\.[^/.]+$/, ''),
        category,
        fileName: file.name,
        year,
        visibleToEmployee: releaseOnUpload,
      });
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (documentId: string) => {
    setBusy(true);
    try {
      await onDelete(documentId);
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (doc: EmployeeDocumentRecord) => {
    if (!onToggleVisibility) return;
    setBusy(true);
    try {
      await onToggleVisibility(doc.id, !doc.visibleToEmployee);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-gray-900">
          {t('employees.documentsTitle')}
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          {t('employees.documentsDesc')}
        </p>
      </div>

      {/* Upload bar */}
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
        <div className="flex-1 w-full">
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            {t('employees.docYear')}
          </label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 w-full">
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            {t('employees.docCategory')}
          </label>
          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as EmployeeDocumentCategory)
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500"
          >
            {EMPLOYEE_DOCUMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 pb-2 cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={releaseOnUpload}
            onChange={(e) => setReleaseOnUpload(e.target.checked)}
            className="rounded border-gray-300 text-green-power-600 focus:ring-green-power-500"
          />
          <span className="text-xs text-gray-700">
            {t('employees.docVisibleToEmployee')}
          </span>
        </label>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
            disabled={busy}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="px-4 py-2 bg-green-power-600 text-white text-sm font-medium rounded-lg hover:bg-green-power-700 disabled:opacity-50 transition-colors"
          >
            {t('employees.uploadDocument')}
          </button>
        </div>
      </div>

      {documents.length === 0 ? (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-8 text-center">
          <p className="text-sm font-medium text-gray-700">
            {t('employees.noDocuments')}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {t('employees.noDocumentsHint')}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {byYear.map(({ year: folderYear, docs }) => (
            <div
              key={folderYear}
              className="border border-gray-200 rounded-lg overflow-hidden"
            >
              <div className="flex items-center gap-2 bg-gray-50 px-4 py-2 border-b border-gray-200">
                <svg
                  className="w-4 h-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
                  />
                </svg>
                <span className="text-sm font-semibold text-gray-900">
                  {folderYear}
                </span>
                <span className="text-xs text-gray-500">({docs.length})</span>
              </div>

              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-white">
                  <tr>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">
                      {t('employees.documentName')}
                    </th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">
                      {t('employees.docCategory')}
                    </th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">
                      {t('employees.uploadedAt')}
                    </th>
                    <th className="px-4 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">
                      {t('common.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {docs.map((doc) => (
                    <tr key={doc.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <p className="text-sm text-gray-900">
                          {doc.name || doc.fileName}
                        </p>
                        <span
                          className={`mt-1 inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            doc.visibleToEmployee
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {doc.visibleToEmployee
                            ? t('employees.docVisibleToEmployee')
                            : t('employees.docHiddenFromEmployee')}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-gray-600">
                        {categoryLabel(doc.category)}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-gray-600">
                        {doc.uploadedAt.toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2.5 text-right space-x-3 whitespace-nowrap">
                        {onToggleVisibility && (
                          <button
                            type="button"
                            onClick={() => handleToggle(doc)}
                            disabled={busy}
                            className="text-xs text-green-power-700 hover:text-green-power-800 font-medium disabled:opacity-50"
                          >
                            {doc.visibleToEmployee
                              ? t('employees.docHideAction')
                              : t('employees.docReleaseAction')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(doc.id)}
                          disabled={busy}
                          className="text-xs text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
                        >
                          {t('common.delete')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
