'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface CatalogFolder {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
}

interface CatalogEntry {
  id: string;
  folderId: string;
  name: string;
  description: string;
  fileUrl: string;
  fileName: string;
  order: number;
}

function sortedChildrenOf(folders: CatalogFolder[], parentId: string | null): CatalogFolder[] {
  const list = folders.filter((f) =>
    parentId === null ? !f.parentId : f.parentId === parentId
  );
  return [...list].sort((a, b) => a.order - b.order);
}

/** First direct child (by order), if any — used when a branch folder is clicked. */
function getFirstChildId(folders: CatalogFolder[], folderId: string): string | null {
  const children = sortedChildrenOf(folders, folderId);
  return children.length > 0 ? children[0].id : null;
}

/** UI upload hints; keep aligned with server env defaults. */
const DEFAULT_CLOUDINARY_MAX_MB = 9;
const DEFAULT_VPS_MAX_MB = 150;

type CatalogUploadErrorBody = {
  code?: string;
  maxMb?: number;
  error?: string;
};

type UploadProgressInfo = {
  percent: number;
  speedBps: number;
  etaSeconds: number;
};

function formatSpeed(speedBps: number): string {
  if (!Number.isFinite(speedBps) || speedBps <= 0) return '0 KB/s';
  const kb = speedBps / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB/s`;
  return `${(kb / 1024).toFixed(2)} MB/s`;
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return `${mins}m ${secs}s`;
}

function uploadCatalogEntryWithProgress(
  formData: FormData,
  onProgress: (info: UploadProgressInfo) => void
): Promise<{ ok: boolean; status: number; body: CatalogUploadErrorBody }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/catalog-entries/upload');
    xhr.responseType = 'json';
    const startedAt = Date.now();

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
      const elapsedSec = Math.max((Date.now() - startedAt) / 1000, 0.001);
      const speedBps = event.loaded / elapsedSec;
      const remaining = Math.max(event.total - event.loaded, 0);
      const etaSeconds = speedBps > 0 ? remaining / speedBps : 0;
      onProgress({ percent, speedBps, etaSeconds });
    };

    xhr.onload = () => {
      const body =
        typeof xhr.response === 'object' && xhr.response !== null
          ? (xhr.response as CatalogUploadErrorBody)
          : {};
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body });
    };

    xhr.onerror = () => reject(new Error('Network error'));
    xhr.onabort = () => reject(new Error('Upload aborted'));
    xhr.send(formData);
  });
}

function messageForCatalogUploadError(
  t: (key: string, opts?: Record<string, string | number>) => string,
  body: CatalogUploadErrorBody
): string {
  const maxMb =
    typeof body.maxMb === 'number' && body.maxMb > 0 ? body.maxMb : DEFAULT_VPS_MAX_MB;
  switch (body.code) {
    case 'FILE_TOO_LARGE':
      return t('catalog.uploadErrorFileTooLarge', { maxMb });
    case 'MISSING_FILE_OR_FOLDER':
      return t('catalog.uploadErrorMissing');
    case 'CLOUDINARY_REJECTED':
      return t('catalog.uploadErrorCloudinary');
    case 'INVALID_FILE_TYPE':
      return t('catalog.uploadErrorInvalidType');
    case 'VPS_STORAGE_ERROR':
      return t('catalog.uploadErrorVpsStorage');
    case 'SERVER_CONFIG':
    case 'DATABASE_UNAVAILABLE':
      return t('catalog.uploadErrorServer');
    case 'UPLOAD_FAILED':
      return t('catalog.uploadErrorGeneric');
    default:
      return t('catalog.uploadErrorGeneric');
  }
}

function hasDescendantSelected(
  folders: CatalogFolder[],
  folderId: string,
  selectedId: string | null
): boolean {
  if (!selectedId) return false;
  let cur: string | null = selectedId;
  while (cur) {
    const f = folders.find((x) => x.id === cur);
    if (!f) return false;
    if (f.parentId === folderId) return true;
    cur = f.parentId;
  }
  return false;
}

export default function CatalogManager() {
  const { t } = useLanguage();
  const [folders, setFolders] = useState<CatalogFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);

  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderParentId, setFolderParentId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);

  const [showEntryModal, setShowEntryModal] = useState(false);
  const [entryFolderId, setEntryFolderId] = useState<string | null>(null);
  const [entryForm, setEntryForm] = useState({
    name: '',
    description: '',
  });
  const [entryFile, setEntryFile] = useState<File | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deletingFolder, setDeletingFolder] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deletingEntry, setDeletingEntry] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<'success' | 'error'>('success');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadSpeedBps, setUploadSpeedBps] = useState<number>(0);
  const [uploadEtaSeconds, setUploadEtaSeconds] = useState<number>(0);

  const sortedRootFolders = useMemo(
    () => [...folders.filter((f) => !f.parentId)].sort((a, b) => a.order - b.order),
    [folders]
  );

  const loadFolders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/catalog-folders');
      const data = await res.json();
      setFolders(Array.isArray(data) ? data : []);
    } catch {
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEntries = useCallback(async (folderId: string) => {
    setEntriesLoading(true);
    try {
      const res = await fetch(`/api/catalog-entries?folderId=${encodeURIComponent(folderId)}`);
      const data = await res.json();
      setEntries(Array.isArray(data) ? data : []);
    } catch {
      setEntries([]);
    } finally {
      setEntriesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    if (selectedFolderId) {
      loadEntries(selectedFolderId);
    } else {
      setEntries([]);
    }
  }, [selectedFolderId, loadEntries]);

  useEffect(() => {
    if (!toastMessage) return;
    const ms = toastVariant === 'error' ? 5500 : 3500;
    const timer = setTimeout(() => setToastMessage(null), ms);
    return () => clearTimeout(timer);
  }, [toastMessage, toastVariant]);

  const expandAncestorsOfFolder = useCallback((folderId: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      let id: string | null = folderId;
      while (id) {
        const f = folders.find((x) => x.id === id);
        if (!f?.parentId) break;
        next.add(f.parentId);
        id = f.parentId;
      }
      return next;
    });
  }, [folders]);

  const handleFolderRowClick = useCallback(
    (folder: CatalogFolder) => {
      const children = sortedChildrenOf(folders, folder.id);
      if (children.length === 0) {
        setSelectedFolderId(folder.id);
        expandAncestorsOfFolder(folder.id);
      } else {
        const firstChildId = children[0].id;
        setExpandedFolderIds((prev) => new Set(prev).add(folder.id));
        setSelectedFolderId(firstChildId);
        expandAncestorsOfFolder(firstChildId);
      }
    },
    [folders, expandAncestorsOfFolder]
  );

  // Auto-select when folders load: first root, or its first subfolder if any
  useEffect(() => {
    if (!loading && selectedFolderId === null && sortedRootFolders.length > 0) {
      const firstRoot = sortedRootFolders[0];
      const firstChildId = getFirstChildId(folders, firstRoot.id);
      const targetId = firstChildId ?? firstRoot.id;
      setSelectedFolderId(targetId);
      setExpandedFolderIds((prev) => {
        const next = new Set(prev);
        if (firstChildId) next.add(firstRoot.id);
        let id: string | null = targetId;
        while (id) {
          const f = folders.find((x) => x.id === id);
          if (!f?.parentId) break;
          next.add(f.parentId);
          id = f.parentId;
        }
        return next;
      });
    }
  }, [loading, sortedRootFolders, selectedFolderId, folders]);

  const openAddFolder = (parentId: string | null) => {
    setFolderParentId(parentId);
    setEditingFolderId(null);
    setFolderName('');
    setShowFolderModal(true);
  };

  const openEditFolder = (folder: CatalogFolder) => {
    setFolderParentId(folder.parentId);
    setEditingFolderId(folder.id);
    setFolderName(folder.name);
    setShowFolderModal(true);
  };

  const handleSaveFolder = async () => {
    const name = folderName.trim();
    if (!name) return;
    setSaving(true);
    try {
      if (editingFolderId) {
        await fetch(`/api/catalog-folders/${editingFolderId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
      } else {
        await fetch('/api/catalog-folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, parentId: folderParentId }),
        });
      }
      setShowFolderModal(false);
      loadFolders();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const openDeleteFolderConfirm = (folder: CatalogFolder) => {
    setFolderToDelete({ id: folder.id, name: folder.name || '' });
  };

  const handleDeleteFolderConfirm = async () => {
    if (!folderToDelete) return;
    setDeletingFolder(true);
    try {
      await fetch(`/api/catalog-folders/${folderToDelete.id}`, { method: 'DELETE' });
      if (selectedFolderId === folderToDelete.id) setSelectedFolderId(null);
      setFolderToDelete(null);
      loadFolders();
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingFolder(false);
    }
  };

  const openAddEntry = (folderId: string) => {
    setEntryFolderId(folderId);
    setEditingEntryId(null);
    setEntryForm({ name: '', description: '' });
    setEntryFile(null);
    setUploadProgress(null);
    setUploadSpeedBps(0);
    setUploadEtaSeconds(0);
    setShowEntryModal(true);
  };

  const openEditEntry = (entry: CatalogEntry) => {
    setEntryFolderId(entry.folderId);
    setEditingEntryId(entry.id);
    setEntryForm({
      name: entry.name,
      description: entry.description,
    });
    setEntryFile(null);
    setUploadProgress(null);
    setUploadSpeedBps(0);
    setUploadEtaSeconds(0);
    setShowEntryModal(true);
  };

  const handleSaveEntry = async () => {
    const name = entryForm.name.trim();
    if (!entryFolderId) return;
    setSaving(true);
    try {
      if (editingEntryId) {
        const res = await fetch(`/api/catalog-entries/${editingEntryId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            description: entryForm.description.trim(),
          }),
        });
        if (!res.ok) {
          await res.json().catch(() => ({}));
          setToastVariant('error');
          setToastMessage(t('catalog.saveEntryFailed'));
          setShowEntryModal(false);
          return;
        }
      } else {
        if (!entryFile) {
          setSaving(false);
          return;
        }
        setUploadProgress(0);
        setUploadSpeedBps(0);
        setUploadEtaSeconds(0);
        const formData = new FormData();
        formData.append('file', entryFile);
        formData.append('folderId', entryFolderId);
        formData.append('name', name);
        formData.append('description', entryForm.description.trim());
        const { ok, body } = await uploadCatalogEntryWithProgress(formData, (info) => {
          setUploadProgress(info.percent);
          setUploadSpeedBps(info.speedBps);
          setUploadEtaSeconds(info.etaSeconds);
        });
        setUploadProgress(100);
        setUploadEtaSeconds(0);
        if (!ok) {
          setToastVariant('error');
          setToastMessage(messageForCatalogUploadError(t, body));
          setShowEntryModal(false);
          return;
        }
        setToastVariant('success');
        setToastMessage(t('files.uploadSuccess'));
      }
      setShowEntryModal(false);
      if (entryFolderId) loadEntries(entryFolderId);
    } catch (e) {
      console.error(e);
      setToastVariant('error');
      setToastMessage(t('catalog.uploadErrorNetwork'));
      setShowEntryModal(false);
    } finally {
      setSaving(false);
      setUploadProgress(null);
      setUploadSpeedBps(0);
      setUploadEtaSeconds(0);
    }
  };

  const openDeleteEntryConfirm = (entry: CatalogEntry) => {
    setEntryToDelete({ id: entry.id, name: entry.name || '' });
  };

  const handleDeleteEntryConfirm = async () => {
    if (!entryToDelete) return;
    setDeletingEntry(true);
    try {
      await fetch(`/api/catalog-entries/${entryToDelete.id}`, { method: 'DELETE' });
      setEntryToDelete(null);
      if (selectedFolderId) loadEntries(selectedFolderId);
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingEntry(false);
    }
  };

  const selectedFolder = selectedFolderId ? folders.find((f) => f.id === selectedFolderId) : null;
  const selectedHasChildren =
    selectedFolderId !== null && sortedChildrenOf(folders, selectedFolderId).length > 0;

  const renderFolderRow = (folder: CatalogFolder, depth: number) => {
    const children = sortedChildrenOf(folders, folder.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedFolderIds.has(folder.id);
    const isSelected = selectedFolderId === folder.id;
    const descendantSelected = hasDescendantSelected(folders, folder.id, selectedFolderId);
    const isPrimaryActive = isSelected;
    const isPathAncestor = descendantSelected && !isSelected;

    const isRootStyle = depth === 0;
    const canCreateChildFolder = depth === 0;

    return (
      <div key={folder.id} className={depth === 0 ? 'space-y-1' : 'mt-1.5'}>
        <div
          className={
            isRootStyle
              ? `rounded-lg transition-all duration-200 flex items-stretch gap-1 group ${
                  isPrimaryActive
                    ? 'bg-green-power-600 text-white shadow-md ring-1 ring-green-power-600/40'
                    : isPathAncestor
                      ? 'bg-green-power-100 text-green-power-800 border border-green-power-200/90'
                      : 'text-gray-700 hover:bg-gray-50'
                }`
              : `flex items-center group/row rounded-lg ${
                  isPrimaryActive
                    ? 'bg-green-power-600 text-white shadow-sm ring-1 ring-green-power-600/30'
                    : isPathAncestor
                      ? 'bg-green-power-50 text-green-power-700 border border-green-power-100'
                      : 'text-gray-600 hover:bg-gray-50'
                }`
          }
        >
          {isRootStyle ? (
            <button
              type="button"
              onClick={() => handleFolderRowClick(folder)}
              className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 flex-1 min-w-0"
              aria-expanded={hasChildren ? isExpanded : undefined}
            >
              <span className="text-lg flex-shrink-0">📁</span>
              {hasChildren && (
                <span
                  className={`inline-flex w-4 flex-shrink-0 items-center justify-center text-[10px] tabular-nums ${
                    isPrimaryActive ? 'text-white/90' : isPathAncestor ? 'text-green-power-600' : 'text-gray-400'
                  }`}
                  aria-hidden
                >
                  {isExpanded ? '▾' : '▸'}
                </span>
              )}
              <span className="flex-1 font-medium truncate">{folder.name || t('common.untitledFile')}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleFolderRowClick(folder)}
              className={`flex-1 text-left px-3 py-2 text-xs rounded-lg transition-all duration-200 flex items-center gap-2 min-w-0 ${
                isSelected ? 'font-semibold' : ''
              }`}
              aria-expanded={hasChildren ? isExpanded : undefined}
            >
              {hasChildren && (
                <span
                  className={`inline-flex w-3.5 flex-shrink-0 items-center justify-center text-[9px] ${
                    isPrimaryActive ? 'text-white/90' : isPathAncestor ? 'text-green-power-500' : 'text-gray-400'
                  }`}
                  aria-hidden
                >
                  {isExpanded ? '▾' : '▸'}
                </span>
              )}
              <span className="flex-1 truncate">{folder.name || t('common.untitledFile')}</span>
            </button>
          )}

          <div
            className={`flex items-center gap-0.5 flex-shrink-0 pr-1 ${
              isRootStyle
                ? 'opacity-0 group-hover:opacity-100 transition-opacity py-1'
                : 'opacity-0 group-hover/row:opacity-100'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {canCreateChildFolder && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openAddFolder(folder.id);
                }}
                className={
                  isRootStyle
                    ? `p-1 rounded ${
                        isPrimaryActive
                          ? 'hover:bg-white/20'
                          : isPathAncestor
                            ? 'hover:bg-green-power-200/70 text-green-power-700'
                            : 'hover:bg-gray-200'
                      }`
                    : `p-1 rounded ${
                        isPrimaryActive
                          ? 'text-white/90 hover:bg-white/15'
                          : isPathAncestor
                            ? 'text-green-power-600 hover:bg-green-power-100'
                            : 'text-gray-500 hover:bg-gray-200'
                      }`
                }
                title={t('offers.addSubfolder')}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openEditFolder(folder);
              }}
              className={
                isRootStyle
                  ? `p-1 rounded ${
                      isPrimaryActive
                        ? 'hover:bg-white/20'
                        : isPathAncestor
                          ? 'hover:bg-green-power-200/70 text-green-power-700'
                          : 'hover:bg-gray-200'
                    }`
                  : `p-1 rounded ${
                      isPrimaryActive
                        ? 'text-white/90 hover:bg-white/15'
                        : isPathAncestor
                          ? 'text-green-power-600 hover:bg-green-power-100'
                          : 'text-gray-500 hover:bg-gray-200'
                    }`
              }
              title={t('common.edit')}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openDeleteFolderConfirm(folder);
              }}
              className={
                isRootStyle
                  ? `p-1 rounded ${
                      isPrimaryActive
                        ? 'hover:bg-white/20 hover:text-red-200'
                        : isPathAncestor
                          ? 'hover:bg-green-power-200/70 text-red-600'
                          : 'text-red-500 hover:bg-red-50'
                    }`
                  : `p-1 rounded ${
                      isPrimaryActive
                        ? 'text-white/90 hover:bg-white/15 hover:text-red-200'
                        : isPathAncestor
                          ? 'text-red-600 hover:bg-green-power-100'
                          : 'text-red-500 hover:bg-red-50'
                    }`
              }
              title={t('offers.deleteFolder')}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div
            className={depth === 0 ? 'ml-6 mt-1.5 space-y-1 border-l-2 border-gray-200 pl-4' : 'ml-4 mt-1 space-y-1 border-l border-gray-200 pl-3'}
          >
            {children.map((child) => renderFolderRow(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-gray-600">
          {t('offers.tabCatalogues')}: {t('offers.subtitle')}
        </p>
        <button
          type="button"
          onClick={() => openAddFolder(null)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-green-power-600 text-white text-sm font-medium hover:bg-green-power-700"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('offers.addFolder')}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 py-8">{t('common.loading')}</p>
      ) : sortedRootFolders.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-gradient-to-b from-gray-50 to-white p-8 sm:p-12 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-green-power-100 flex items-center justify-center text-3xl mb-4" aria-hidden>
            📁
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('offers.noFoldersTitle')}</h3>
          <p className="text-sm text-gray-600 max-w-sm mx-auto mb-6">{t('offers.noFolders')}</p>
          <button
            type="button"
            onClick={() => openAddFolder(null)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-power-600 text-white text-sm font-semibold hover:bg-green-power-700 shadow-sm transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('offers.addFolder')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-3">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm sticky top-6">
              <div className="px-5 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                <h3 className="text-sm font-bold text-gray-900">{t('offers.thisFolder')}</h3>
                <p className="text-xs text-gray-600 mt-1">{t('offers.switchWithinFolderOnly')}</p>
              </div>
              <div className="p-4 max-h-[calc(100vh-220px)] overflow-y-auto space-y-1">
                {sortedRootFolders.map((root) => renderFolderRow(root, 0))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-9 space-y-6">
            {!selectedFolderId ? (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 text-center">
                <p className="text-sm text-gray-500">
                  {sortedRootFolders.length > 0 ? t('offers.selectSubfolder') : t('offers.noFolders')}
                </p>
                {sortedRootFolders.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">{t('offers.switchWithinFolderOnly')}</p>
                )}
              </div>
            ) : selectedFolder && selectedHasChildren ? (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden p-8">
                <div className="rounded-xl border border-dashed border-gray-200 bg-gradient-to-b from-gray-50 to-white py-10 px-6 text-center max-w-md mx-auto">
                  <div className="w-16 h-16 mx-auto rounded-full bg-green-power-100 flex items-center justify-center text-3xl mb-4" aria-hidden>
                    📁
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('offers.addSubfolderFirstTitle')}</h3>
                  <p className="text-sm text-gray-600 mb-6">{t('offers.addSubfolderFirstHint')}</p>
                  <button
                    type="button"
                    onClick={() => openAddFolder(selectedFolderId)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-power-600 text-white text-sm font-semibold hover:bg-green-power-700"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    + {t('offers.addSubfolder')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-green-power-50 to-green-power-100 px-6 py-4 border-b border-green-power-200 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img src="/logo.png" alt="" className="w-10 h-10 object-contain flex-shrink-0" aria-hidden />
                      <div>
                        <h3 className="text-base font-bold text-gray-900 mb-1">{t('catalog.addEntry')}</h3>
                        <p className="text-xs text-gray-600">{selectedFolder?.name ?? ''}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openAddEntry(selectedFolderId!)}
                      className="px-4 py-2 rounded-lg bg-green-power-600 text-white text-sm font-semibold hover:bg-green-power-700"
                    >
                      + {t('catalog.addEntry')}
                    </button>
                  </div>
                  <div className="p-6">
                    {entriesLoading ? (
                      <p className="text-sm text-gray-500 py-4">{t('common.loading')}</p>
                    ) : entries.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 py-10 px-6 text-center">
                        <div className="w-14 h-14 mx-auto rounded-full bg-green-power-100 flex items-center justify-center text-2xl mb-3" aria-hidden>
                          📄
                        </div>
                        <p className="text-sm font-medium text-gray-700 mb-1">{t('catalog.noEntries')}</p>
                        <p className="text-xs text-gray-500 mb-4">{t('catalog.entriesSubtitle')}</p>
                        <button
                          type="button"
                          onClick={() => openAddEntry(selectedFolderId!)}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-power-600 text-white text-sm font-semibold hover:bg-green-power-700"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          + {t('catalog.addEntry')}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {entries.map((entry) => (
                          <div
                            key={entry.id}
                            className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-12 h-12 rounded bg-gray-200 flex items-center justify-center flex-shrink-0">
                                <span className="text-gray-500 text-xs">PDF</span>
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 truncate">{entry.name}</p>
                                <p className="text-xs text-gray-500">
                                  {entry.fileName || 'PDF'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <a
                                href={entry.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2 py-1.5 rounded-lg text-[11px] font-semibold text-green-power-700 bg-green-power-50 hover:bg-green-power-100"
                              >
                                {t('catalog.openPdf')}
                              </a>
                              <button
                                type="button"
                                onClick={() => openEditEntry(entry)}
                                className="px-2 py-1.5 rounded-lg text-[11px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200"
                              >
                                {t('common.edit')}
                              </button>
                              <button
                                type="button"
                                onClick={() => openDeleteEntryConfirm(entry)}
                                className="px-2 py-1.5 rounded-lg text-[11px] font-semibold text-red-600 bg-red-50 hover:bg-red-100"
                              >
                                {t('common.delete')}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">
              {editingFolderId ? t('catalog.editFolderTitle') : t('catalog.addFolderTitle')}
            </h3>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {t('catalog.folderName')}
              </label>
              <input
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50"
                onClick={() => setShowFolderModal(false)}
                disabled={saving}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-sm text-white"
                style={{ background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)' }}
                onClick={handleSaveFolder}
                disabled={saving}
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {folderToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">{t('catalog.deleteFolderTitle')}</h3>
            <p className="text-xs text-gray-600">
              {t('catalog.deleteFolderConfirm', { name: folderToDelete.name || t('catalog.untitledFolder') })}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50"
                onClick={() => setFolderToDelete(null)}
                disabled={deletingFolder}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-sm text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                onClick={handleDeleteFolderConfirm}
                disabled={deletingFolder}
              >
                {deletingFolder ? t('common.loading') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEntryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">
              {editingEntryId ? t('catalog.editEntryTitle') : t('catalog.addEntryTitle')}
            </h3>
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {t('catalog.entryName')}
                </label>
                <input
                  type="text"
                  value={entryForm.name}
                  onChange={(e) => setEntryForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {t('catalog.entryDescription')}
                </label>
                <textarea
                  value={entryForm.description}
                  onChange={(e) => setEntryForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-y"
                />
              </div>
              {!editingEntryId && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('catalog.entryUploadPdf')}
                  </label>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={(e) => setEntryFile(e.target.files?.[0] ?? null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-power-50 file:text-green-power-700 hover:file:bg-green-power-100"
                  />
                  {entryFile && (
                    <p className="text-[11px] text-gray-500 mt-1">
                      {t('catalog.entryFileSelected', { name: entryFile.name })}
                    </p>
                  )}
                  <p className="text-[11px] text-gray-500 mt-1">
                    {t('catalog.uploadPdfMaxHintHybrid', {
                      cloudinaryMaxMb: DEFAULT_CLOUDINARY_MAX_MB,
                      vpsMaxMb: DEFAULT_VPS_MAX_MB,
                    })}
                  </p>
                  {saving && uploadProgress !== null && (
                    <div className="mt-2 space-y-1">
                      <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                        <div
                          className="h-full bg-green-power-600 transition-all duration-200"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-gray-600">
                        {t('files.uploading')} {uploadProgress}%
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {formatSpeed(uploadSpeedBps)} · {formatEta(uploadEtaSeconds)} left
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50"
                onClick={() => setShowEntryModal(false)}
                disabled={saving}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-sm text-white"
                style={{ background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)' }}
                onClick={handleSaveEntry}
                disabled={saving}
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {entryToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">{t('catalog.deleteEntryTitle')}</h3>
            <p className="text-xs text-gray-600">
              {t('catalog.deleteEntryConfirm', { name: entryToDelete.name || t('catalog.entryName') })}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50"
                onClick={() => setEntryToDelete(null)}
                disabled={deletingEntry}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-sm text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                onClick={handleDeleteEntryConfirm}
                disabled={deletingEntry}
              >
                {deletingEntry ? t('common.loading') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div
          role={toastVariant === 'error' ? 'alert' : 'status'}
          aria-live={toastVariant === 'error' ? 'assertive' : 'polite'}
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-3 rounded-lg text-white text-sm shadow-lg max-w-md text-center ${
            toastVariant === 'error' ? 'bg-red-600' : 'bg-green-power-600'
          }`}
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
