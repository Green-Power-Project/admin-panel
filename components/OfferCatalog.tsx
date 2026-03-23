'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface OfferFolder {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
}

interface OfferCatalogItem {
  id: string;
  folderId: string;
  name: string;
  description: string;
  unit: string;
  price: string;
  quantityUnit: string;
  imageUrl: string | null;
  order: number;
}

function sortedChildrenOf(folders: OfferFolder[], parentId: string | null): OfferFolder[] {
  const list = folders.filter((f) =>
    parentId === null ? !f.parentId : f.parentId === parentId
  );
  return [...list].sort((a, b) => a.order - b.order);
}

function getFirstChildId(folders: OfferFolder[], folderId: string): string | null {
  const children = sortedChildrenOf(folders, folderId);
  return children.length > 0 ? children[0].id : null;
}

function hasDescendantSelected(
  folders: OfferFolder[],
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

export default function OfferCatalog() {
  const { t } = useLanguage();
  const [folders, setFolders] = useState<OfferFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [items, setItems] = useState<OfferCatalogItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderParentId, setFolderParentId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);

  const [showItemModal, setShowItemModal] = useState(false);
  const [itemFolderId, setItemFolderId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState({
    name: '',
    description: '',
    unit: '',
    price: '',
    quantityUnit: '',
  });
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deletingFolder, setDeletingFolder] = useState(false);

  const sortedRootFolders = useMemo(
    () => [...folders.filter((f) => !f.parentId)].sort((a, b) => a.order - b.order),
    [folders]
  );

  const loadFolders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/offer-folders');
      const data = await res.json();
      setFolders(Array.isArray(data) ? data : []);
    } catch {
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadItems = useCallback(async (folderId: string) => {
    setItemsLoading(true);
    try {
      const res = await fetch(`/api/offer-items?folderId=${encodeURIComponent(folderId)}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setItemsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    if (selectedFolderId) {
      loadItems(selectedFolderId);
    } else {
      setItems([]);
    }
  }, [selectedFolderId, loadItems]);

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
    (folder: OfferFolder) => {
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

  const openEditFolder = (folder: OfferFolder) => {
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
        await fetch(`/api/offer-folders/${editingFolderId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
      } else {
        await fetch('/api/offer-folders', {
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

  const openDeleteFolderConfirm = (folder: OfferFolder) => {
    setFolderToDelete({ id: folder.id, name: folder.name || '' });
  };

  const handleDeleteFolderConfirm = async () => {
    if (!folderToDelete) return;
    setDeletingFolder(true);
    try {
      await fetch(`/api/offer-folders/${folderToDelete.id}`, { method: 'DELETE' });
      if (selectedFolderId === folderToDelete.id) setSelectedFolderId(null);
      setFolderToDelete(null);
      loadFolders();
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingFolder(false);
    }
  };

  const openAddItem = (folderId: string) => {
    setItemFolderId(folderId);
    setEditingItemId(null);
    setItemForm({ name: '', description: '', unit: '', price: '', quantityUnit: '' });
    setShowItemModal(true);
  };

  const openEditItem = (item: OfferCatalogItem) => {
    setItemFolderId(item.folderId);
    setEditingItemId(item.id);
    setItemForm({
      name: item.name,
      description: item.description,
      unit: item.unit,
      price: item.price,
      quantityUnit: item.quantityUnit,
    });
    setShowItemModal(true);
  };

  const handleSaveItem = async () => {
    const name = itemForm.name.trim();
    if (!name || !itemFolderId) return;
    setSaving(true);
    try {
      if (editingItemId) {
        await fetch(`/api/offer-items/${editingItemId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            description: itemForm.description.trim(),
            unit: itemForm.unit.trim(),
            price: itemForm.price.trim(),
            quantityUnit: itemForm.quantityUnit.trim(),
          }),
        });
      } else {
        await fetch('/api/offer-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            folderId: itemFolderId,
            name,
            description: itemForm.description.trim(),
            unit: itemForm.unit.trim(),
            price: itemForm.price.trim(),
            quantityUnit: itemForm.quantityUnit.trim(),
            imageUrl: null,
          }),
        });
      }
      setShowItemModal(false);
      if (selectedFolderId === itemFolderId) loadItems(itemFolderId);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!window.confirm(t('common.confirm'))) return;
    try {
      await fetch(`/api/offer-items/${id}`, { method: 'DELETE' });
      if (selectedFolderId) loadItems(selectedFolderId);
    } catch (e) {
      console.error(e);
    }
  };

  const selectedFolder = selectedFolderId ? folders.find((f) => f.id === selectedFolderId) : null;
  const selectedHasChildren =
    selectedFolderId !== null && sortedChildrenOf(folders, selectedFolderId).length > 0;

  const renderFolderRow = (folder: OfferFolder, depth: number) => {
    const children = sortedChildrenOf(folders, folder.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedFolderIds.has(folder.id);
    const isSelected = selectedFolderId === folder.id;
    const descendantSelected = hasDescendantSelected(folders, folder.id, selectedFolderId);
    const isPrimaryActive = isSelected;
    const isPathAncestor = descendantSelected && !isSelected;

    const isRootStyle = depth === 0;

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
          {t('offers.tabCatalog')}: {t('offers.subtitle')}
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
                        <h3 className="text-base font-bold text-gray-900 mb-1">{t('offers.addItem')}</h3>
                        <p className="text-xs text-gray-600">{selectedFolder?.name ?? ''}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openAddItem(selectedFolderId!)}
                      className="px-4 py-2 rounded-lg bg-green-power-600 text-white text-sm font-semibold hover:bg-green-power-700"
                    >
                      + {t('offers.addItem')}
                    </button>
                  </div>
                  <div className="p-6">
                    {itemsLoading ? (
                      <p className="text-sm text-gray-500 py-4">{t('common.loading')}</p>
                    ) : items.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 py-10 px-6 text-center">
                        <div className="w-14 h-14 mx-auto rounded-full bg-green-power-100 flex items-center justify-center text-2xl mb-3" aria-hidden>
                          📦
                        </div>
                        <p className="text-sm font-medium text-gray-700 mb-1">{t('offers.noItems')}</p>
                        <p className="text-xs text-gray-500 mb-4">{t('offers.noItemsHint')}</p>
                        <button
                          type="button"
                          onClick={() => openAddItem(selectedFolderId!)}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-power-600 text-white text-sm font-semibold hover:bg-green-power-700"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          + {t('offers.addItem')}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt=""
                                  className="w-12 h-12 rounded object-cover flex-shrink-0"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded bg-gray-200 flex items-center justify-center flex-shrink-0">
                                  <span className="text-gray-400 text-xs">—</span>
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 truncate">{item.name}</p>
                                <p className="text-xs text-gray-500">
                                  {[item.unit, item.price, item.quantityUnit].filter(Boolean).join(' · ') || '—'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditItem(item)}
                                className="p-1.5 rounded text-gray-500 hover:bg-gray-200"
                              >
                                {t('common.edit')}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(item.id)}
                                className="p-1.5 rounded text-red-500 hover:bg-red-50"
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

      {folderToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('offers.deleteFolder')}</h3>
            <p className="text-sm text-gray-600 mb-4">
              {t('offers.deleteFolderConfirm')}
              {folderToDelete.name && (
                <span className="mt-2 block font-medium text-gray-900">
                  &ldquo;{folderToDelete.name}&rdquo;
                </span>
              )}
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              {t('offers.deleteFolderCascadeHint')}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setFolderToDelete(null)}
                disabled={deletingFolder}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleDeleteFolderConfirm}
                disabled={deletingFolder}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deletingFolder ? t('common.loading') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">
              {editingFolderId ? t('offers.renameFolder') : t('offers.addFolder')}
            </h3>
            <input
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder={t('offers.folderNamePlaceholder')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowFolderModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveFolder}
                disabled={saving || !folderName.trim()}
                className="px-4 py-2 rounded-lg bg-green-power-600 text-white disabled:opacity-50"
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showItemModal && itemFolderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 my-8">
            <h3 className="text-lg font-semibold mb-4">
              {editingItemId ? t('common.edit') : t('offers.addItem')}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('offers.itemName')} *</label>
                <input
                  type="text"
                  value={itemForm.name}
                  onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t('offers.itemNamePlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('offers.itemDescription')}</label>
                <input
                  type="text"
                  value={itemForm.description}
                  onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder={t('offers.itemDescriptionPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('offers.itemUnit')}</label>
                  <input
                    type="text"
                    value={itemForm.unit}
                    onChange={(e) => setItemForm((f) => ({ ...f, unit: e.target.value }))}
                    placeholder={t('offers.itemUnitPlaceholder')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('offers.itemPrice')}</label>
                  <input
                    type="text"
                    value={itemForm.price}
                    onChange={(e) => setItemForm((f) => ({ ...f, price: e.target.value }))}
                    placeholder={t('offers.itemPricePlaceholder')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('offers.itemQuantityUnit')}</label>
                <input
                  type="text"
                  value={itemForm.quantityUnit}
                  onChange={(e) => setItemForm((f) => ({ ...f, quantityUnit: e.target.value }))}
                  placeholder={t('offers.itemQuantityUnitPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                type="button"
                onClick={() => setShowItemModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveItem}
                disabled={saving || !itemForm.name.trim()}
                className="px-4 py-2 rounded-lg bg-green-power-600 text-white disabled:opacity-50"
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
