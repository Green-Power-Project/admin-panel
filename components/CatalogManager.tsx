'use client';

import { useState, useEffect, useCallback } from 'react';
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

  const rootFolders = folders.filter((f) => !f.parentId);
  const getChildren = (parentId: string) => folders.filter((f) => f.parentId === parentId);

  // Auto-select first folder when folders load: first subfolder if any, else first root
  useEffect(() => {
    if (!loading && selectedFolderId === null && rootFolders.length > 0) {
      const firstSubfolder = rootFolders.flatMap((r) => getChildren(r.id))[0];
      if (firstSubfolder) {
        setSelectedFolderId(firstSubfolder.id);
        setExpandedFolderIds((prev) => new Set(prev).add(firstSubfolder.parentId!));
      } else {
        setSelectedFolderId(rootFolders[0].id);
        setExpandedFolderIds((prev) => new Set(prev).add(rootFolders[0].id));
      }
    }
  }, [loading, rootFolders, selectedFolderId, folders]);

  const toggleExpandFolder = (rootId: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  };

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
    setShowEntryModal(true);
  };

  const handleSaveEntry = async () => {
    const name = entryForm.name.trim();
    if (!entryFolderId) return;
    setSaving(true);
    try {
      if (editingEntryId) {
        await fetch(`/api/catalog-entries/${editingEntryId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            description: entryForm.description.trim(),
          }),
        });
      } else {
        if (!entryFile) {
          setSaving(false);
          return;
        }
        const formData = new FormData();
        formData.append('file', entryFile);
        formData.append('folderId', entryFolderId);
        formData.append('name', name);
        formData.append('description', entryForm.description.trim());
        await fetch('/api/catalog-entries/upload', {
          method: 'POST',
          body: formData,
        });
      }
      setShowEntryModal(false);
      if (entryFolderId) loadEntries(entryFolderId);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
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

  const renderFolderTree = (parentId: string | null, level = 0) => {
    const children = parentId === null ? rootFolders : getChildren(parentId);
    if (!children.length) return null;
    return (
      <ul className={level === 0 ? 'space-y-1' : 'space-y-0.5 pl-3 border-l border-gray-100'}>
        {children.map((folder) => {
          const isRoot = folder.parentId === null;
          const isExpanded = expandedFolderIds.has(folder.id);
          const isSelected = selectedFolderId === folder.id;
          const hasChildren = getChildren(folder.id).length > 0;
          return (
            <li key={folder.id}>
              <div
                className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 cursor-pointer ${
                  isSelected ? 'bg-green-power-50 text-green-power-700' : 'hover:bg-gray-50 text-gray-700'
                }`}
              >
                <button
                  type="button"
                  className="flex items-center gap-1.5 flex-1 text-left"
                  onClick={() => {
                    setSelectedFolderId(folder.id);
                    if (isRoot) {
                      toggleExpandFolder(folder.id);
                    } else if (hasChildren) {
                      toggleExpandFolder(folder.id);
                    }
                  }}
                >
                  {hasChildren && (
                    <span className="inline-flex w-4 h-4 items-center justify-center text-[10px] text-gray-500">
                      {isExpanded ? '−' : '+'}
                    </span>
                  )}
                  <span className="text-xs font-medium truncate">{folder.name || t('catalog.untitledFolder')}</span>
                </button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                    onClick={() => openAddFolder(folder.id)}
                    title={t('catalog.addSubfolder')}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                    onClick={() => openEditFolder(folder)}
                    title={t('catalog.renameFolder')}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => openDeleteFolderConfirm(folder)}
                    title={t('catalog.deleteFolder')}
                  >
                    🗑
                  </button>
                </div>
              </div>
              {isExpanded && renderFolderTree(folder.id, level + 1)}
            </li>
          );
        })}
      </ul>
    );
  };

  const selectedFolder = selectedFolderId ? folders.find((f) => f.id === selectedFolderId) : null;

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
      ) : rootFolders.length === 0 ? (
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
          {/* Left sidebar – same \"This folder\" card as Material Items */}
          <div className="lg:col-span-3">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm sticky top-6">
              <div className="px-5 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                <h3 className="text-sm font-bold text-gray-900">{t('offers.thisFolder')}</h3>
                <p className="text-xs text-gray-600 mt-1">{t('offers.switchWithinFolderOnly')}</p>
              </div>
              <div className="p-4 max-h-[calc(100vh-220px)] overflow-y-auto space-y-1">
                {rootFolders.map((root) => {
                  const children = getChildren(root.id);
                  const isExpanded = expandedFolderIds.has(root.id);
                  const isRootSelected = selectedFolderId === root.id;
                  const hasChildSelected = children.some((c) => c.id === selectedFolderId);

                  return (
                    <div key={root.id} className="space-y-1">
                      <button
                        type="button"
                        onClick={() => toggleExpandFolder(root.id)}
                        className={`w-full text-left px-4 py-2.5 text-sm rounded-lg transition-all duration-200 flex items-center gap-3 group ${
                          isRootSelected || hasChildSelected ? 'bg-green-power-500 text-white shadow-md' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <span className="text-lg">📁</span>
                        <span className="flex-1 font-medium truncate">{root.name || t('common.untitledFile')}</span>
                        <div
                          className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openAddFolder(root.id); }}
                            className={`p-1 rounded ${isRootSelected || hasChildSelected ? 'hover:bg-white/20' : 'hover:bg-gray-200'}`}
                            title={t('offers.addSubfolder')}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openEditFolder(root); }}
                            className={`p-1 rounded ${isRootSelected || hasChildSelected ? 'hover:bg-white/20' : 'hover:bg-gray-200'}`}
                            title={t('common.edit')}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openDeleteFolderConfirm(root); }}
                            className={`p-1 rounded ${isRootSelected || hasChildSelected ? 'hover:bg-white/20 hover:text-red-200' : 'text-red-500 hover:bg-red-50'}`}
                            title={t('offers.deleteFolder')}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </button>
                      {children.length > 0 && (isExpanded || hasChildSelected) && (
                        <div className="ml-6 mt-1.5 space-y-1 border-l-2 border-gray-200 pl-4">
                          {children.map((child) => (
                            <div key={child.id} className="flex items-center group/row">
                              <button
                                type="button"
                                onClick={() => setSelectedFolderId(child.id)}
                                className={`flex-1 text-left px-3 py-2 text-xs rounded-lg transition-all duration-200 flex items-center gap-2 ${
                                  selectedFolderId === child.id
                                    ? 'bg-green-power-100 text-green-power-700 font-semibold'
                                    : 'text-gray-600 hover:bg-gray-50'
                                }`}
                              >
                                <span className="flex-1 truncate">{child.name || t('common.untitledFile')}</span>
                              </button>
                              <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100">
                                <button
                                  type="button"
                                  onClick={() => openEditFolder(child)}
                                  className="p-1 rounded text-gray-500 hover:bg-gray-200"
                                  title={t('common.edit')}
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openDeleteFolderConfirm(child)}
                                  className="p-1 rounded text-red-500 hover:bg-red-50"
                                  title={t('offers.deleteFolder')}
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right content – mirror Material Items layout, but for PDFs */}
          <div className="lg:col-span-9 space-y-6">
            {!selectedFolderId ? (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 text-center">
                <p className="text-sm text-gray-500">
                  {rootFolders.length > 0 ? t('offers.selectSubfolder') : t('offers.noFolders')}
                </p>
                {rootFolders.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">{t('offers.switchWithinFolderOnly')}</p>
                )}
              </div>
            ) : selectedFolder && !selectedFolder.parentId ? (
              /* Selected folder is a root – only allow creating subfolders, no PDFs directly */
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
                {/* Add PDFs section – only for subfolders */}
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
                      onClick={() => openAddEntry(selectedFolderId)}
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
                          onClick={() => openAddEntry(selectedFolderId)}
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

      {/* Folder modal */}
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

      {/* Delete folder confirm */}
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

      {/* Entry modal */}
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

      {/* Delete entry confirm */}
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
    </div>
  );
}

