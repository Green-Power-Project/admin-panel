'use client';

import { useState, useEffect, useRef } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import ConfirmationModal from '@/components/ConfirmationModal';
import { useLanguage } from '@/contexts/LanguageContext';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, collection, getDocs } from 'firebase/firestore';
import {
  DEFAULT_CATEGORY_KEYS,
  OFFERS_CATEGORY_KEY,
  getGalleryCategoryLabels,
  setGalleryCategoryLabels,
  getGalleryCategoryKeys,
  setGalleryCategoryKeys,
  getCategoryDisplayName,
  type CategoryLabelsMap,
} from '@/lib/galleryCategoryLabels';

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

interface GalleryImage {
  id: string;
  url: string;
  category: string;
  title?: string;
  uploadedAt: Date;
  uploadedBy: string;
  isActive: boolean;
  offerEligible?: boolean;
  offerItemName?: string;
  offerColorOptions?: string[];
  offerDimensionOptions?: string[];
}

const GALLERY_IMAGES_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const galleryImagesCache: { key: string; data: GalleryImage[]; ts: number }[] = [];

function getCachedGalleryImages(): GalleryImage[] | null {
  const entry = galleryImagesCache.find((e) => e.key === 'gallery');
  if (!entry || Date.now() - entry.ts > GALLERY_IMAGES_CACHE_TTL_MS) return null;
  return entry.data;
}

function setCachedGalleryImages(data: GalleryImage[]) {
  const idx = galleryImagesCache.findIndex((e) => e.key === 'gallery');
  if (idx >= 0) galleryImagesCache.splice(idx, 1);
  galleryImagesCache.push({ key: 'gallery', data: [...data], ts: Date.now() });
  if (galleryImagesCache.length > 5) galleryImagesCache.shift();
}

function clearCachedGalleryImages() {
  const idx = galleryImagesCache.findIndex((e) => e.key === 'gallery');
  if (idx >= 0) galleryImagesCache.splice(idx, 1);
}

export default function GalleryManagementPage() {
  const { t } = useLanguage();
  return (
    <ProtectedRoute>
      <AdminLayout title={t('gallery.title')}>
        <GalleryManagementContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function GalleryManagementContent() {
  const { t } = useLanguage();
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [categoryKeys, setCategoryKeys] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadCategory, setUploadCategory] = useState<string>(DEFAULT_CATEGORY_KEYS[0]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [deletingCategoryKey, setDeletingCategoryKey] = useState<string | null>(null);
  const [uploadTitle, setUploadTitle] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [uploadPreviewIndex, setUploadPreviewIndex] = useState<number | null>(null);
  const [uploadPreviewObjectUrl, setUploadPreviewObjectUrl] = useState<string | null>(null);
  const uploadPreviewUrlRef = useRef<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const galleryFileInputRef = useRef<HTMLInputElement>(null);
  const [offerEditImageId, setOfferEditImageId] = useState<string | null>(null);
  const [offerForm, setOfferForm] = useState({
    offerItemName: '',
    offerColorOptionsStr: '',
    offerDimensionOptions: [] as string[],
  });
  const [savingOffer, setSavingOffer] = useState(false);
  const [removingFromOffers, setRemovingFromOffers] = useState(false);
  const [offerFormError, setOfferFormError] = useState<string | null>(null);
  const [editImageId, setEditImageId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editFormError, setEditFormError] = useState<string | null>(null);

  // Create/revoke object URL for upload-modal lightbox; close if file at index was removed
  useEffect(() => {
    if (uploadPreviewIndex === null) {
      if (uploadPreviewUrlRef.current) {
        URL.revokeObjectURL(uploadPreviewUrlRef.current);
        uploadPreviewUrlRef.current = null;
      }
      setUploadPreviewObjectUrl(null);
      return;
    }
    const file = selectedFiles[uploadPreviewIndex];
    if (!file) {
      setUploadPreviewIndex(null);
      if (uploadPreviewUrlRef.current) {
        URL.revokeObjectURL(uploadPreviewUrlRef.current);
        uploadPreviewUrlRef.current = null;
      }
      setUploadPreviewObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    uploadPreviewUrlRef.current = url;
    setUploadPreviewObjectUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      uploadPreviewUrlRef.current = null;
      setUploadPreviewObjectUrl(null);
    };
  }, [uploadPreviewIndex, selectedFiles]);

  // Category labels from Firestore (edit in admin → reflected in customer)
  const [categoryLabels, setCategoryLabels] = useState<CategoryLabelsMap>({});
  const [editingCategoryKey, setEditingCategoryKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [savingCategoryName, setSavingCategoryName] = useState(false);

  // Subscribe to gallery config for category keys and labels (live update)
  useEffect(() => {
    if (!db) return;
    const ref = doc(db, 'config', 'gallery');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const labels: CategoryLabelsMap = {};
        let keys: string[] = [];
        if (snap.exists()) {
          const data = snap.data();
          const raw = data?.categoryLabels;
          if (typeof raw === 'object' && raw !== null) Object.assign(labels, raw);
          if (Array.isArray(data?.categoryKeys) && data.categoryKeys.length > 0) {
            keys = data.categoryKeys.filter((k: unknown) => typeof k === 'string');
          }
        }
        if (keys.length === 0) keys = [...DEFAULT_CATEGORY_KEYS];
        if (!keys.includes(OFFERS_CATEGORY_KEY)) keys = [...keys, OFFERS_CATEGORY_KEY];
        setCategoryKeys(keys);
        setCategoryLabels(labels);
      },
      () => {
        setCategoryLabels({});
        setCategoryKeys([...DEFAULT_CATEGORY_KEYS]);
      }
    );
    return unsub;
  }, []);

  async function onSaveCategoryName(key: string, value: string) {
    if (!db) return;
    setSavingCategoryName(true);
    try {
      const next = { ...categoryLabels, [key]: value.trim() || key };
      await setGalleryCategoryLabels(db, next);
      setCategoryLabels(next);
      setEditingCategoryKey(null);
      setEditingValue('');
    } catch (e) {
      console.error('Error saving category name:', e);
    } finally {
      setSavingCategoryName(false);
    }
  }

  async function onAddCategory() {
    const name = newCategoryName.trim();
    if (!db || !name || categoryKeys.includes(name)) return;
    setAddingCategory(true);
    try {
      const nextKeys = [...categoryKeys, name];
      const nextLabels = { ...categoryLabels, [name]: name };
      await setGalleryCategoryKeys(db, nextKeys, nextLabels);
      setCategoryKeys(nextKeys);
      setCategoryLabels(nextLabels);
      setNewCategoryName('');
      setShowAddCategoryModal(false);
    } catch (e) {
      console.error('Error adding category:', e);
    } finally {
      setAddingCategory(false);
    }
  }

  async function onDeleteCategory(key: string) {
    if (!db) return;
    const count = images.filter((img) => img.category === key).length;
    if (count > 0 && !window.confirm(t('gallery.deleteCategoryConfirm', { count }))) return;
    if (count === 0 && !window.confirm(t('gallery.deleteCategoryConfirmEmpty'))) return;
    setDeletingCategoryKey(key);
    try {
      const nextKeys = categoryKeys.filter((k) => k !== key);
      const nextLabels = { ...categoryLabels };
      delete nextLabels[key];
      await setGalleryCategoryKeys(db, nextKeys, nextLabels);
      setCategoryKeys(nextKeys);
      setCategoryLabels(nextLabels);
      if (selectedCategory === key) setSelectedCategory('all');
      if (uploadCategory === key) setUploadCategory(nextKeys[0] || 'all');
    } catch (e) {
      console.error('Error deleting category:', e);
    } finally {
      setDeletingCategoryKey(null);
    }
  }

  function openUploadModal() {
    setUploadError(null);
    setUploadProgress(0);
    if (selectedCategory !== 'all') setUploadCategory(selectedCategory);
    setShowUploadModal(true);
  }

  // Load gallery images from Firestore (client SDK – same as customer panel, avoids server quota)
  async function loadGalleryImages() {
    if (!db) return [];
    const cached = getCachedGalleryImages();
    if (cached) return cached;
    const snapshot = await getDocs(collection(db, 'gallery'));
    const list = snapshot.docs
      .filter((d) => d.data().isActive !== false)
      .map((d) => {
        const data = d.data();
        const uploadedAt = data.uploadedAt?.toDate?.() ?? data.uploadedAt ?? new Date();
        const colorOpts = data.offerColorOptions;
        const dimensionOpts = data.offerDimensionOptions;

        const normalizeStringArray = (value: unknown): string[] =>
          Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0) : [];

        return {
          id: d.id,
          url: data.url ?? '',
          category: data.category ?? '',
          title: data.title ?? '',
          uploadedAt: uploadedAt instanceof Date ? uploadedAt : new Date(uploadedAt),
          uploadedBy: data.uploadedBy ?? '',
          isActive: data.isActive !== false,
          offerEligible: data.offerEligible === true,
          offerItemName: data.offerItemName ?? '',
          offerColorOptions: normalizeStringArray(colorOpts),
          offerDimensionOptions: normalizeStringArray(dimensionOpts),
        };
      })
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
    setCachedGalleryImages(list);
    return list;
  }

  useEffect(() => {
    let cancelled = false;
    loadGalleryImages()
      .then((list) => {
        if (!cancelled) setImages(list);
      })
      .catch((err) => console.error('Error loading gallery images:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filteredImages =
    selectedCategory === 'all'
      ? images
      : selectedCategory === OFFERS_CATEGORY_KEY
        ? images.filter((img) => img.offerEligible === true || img.category === OFFERS_CATEGORY_KEY)
        : images.filter((img) => img.category === selectedCategory);

  async function handleUpload() {
    if (selectedFiles.length === 0) return;
    const tooBig = selectedFiles.find((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (tooBig) {
      setUploadError(t('files.fileSizeTooLarge'));
      return;
    }
    setUploadError(null);
    setUploading(true);
    setUploadProgress(0);
    const progressInterval = setInterval(() => {
      setUploadProgress((p) => (p >= 90 ? p : p + 10));
    }, 400);

    try {
      setUploadError(null);
      const formData = new FormData();
      selectedFiles.forEach(file => formData.append('files', file));
      formData.append('category', uploadCategory);
      formData.append('title', uploadTitle);
      formData.append('uploadedBy', 'admin'); // TODO: Get actual admin ID

      const response = await fetch('/api/gallery', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        await response.json();
        clearCachedGalleryImages();
        loadGalleryImages().then(setImages);
        setUploadProgress(100);
        setSelectedFiles([]);
        setUploadTitle('');
        setTimeout(() => {
          setShowUploadModal(false);
          setUploadProgress(0);
        }, 400);
      } else {
        const errBody = await response.json().catch(() => ({ error: response.statusText }));
        const message = (errBody && typeof errBody.error === 'string') ? errBody.error : t('gallery.uploadFailed');
        setUploadError(message);
      }
    } catch (error) {
      console.error('Error uploading images:', error);
      setUploadError(error instanceof Error ? error.message : t('gallery.uploadFailed'));
    } finally {
      clearInterval(progressInterval);
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    const valid = files.filter((f) => f.size <= MAX_FILE_SIZE_BYTES);
    const rejected = files.length - valid.length;
    if (rejected > 0) setUploadError(t('files.fileSizeTooLarge'));
    if (valid.length) setSelectedFiles((prev) => [...prev, ...valid]);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleDeleteClick(imageId: string) {
    setImageToDelete(imageId);
  }

  async function handleDeleteConfirm() {
    if (!imageToDelete) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/gallery/${imageToDelete}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        clearCachedGalleryImages();
        setImages((prev) => prev.filter((img) => img.id !== imageToDelete));
        setImageToDelete(null);
      } else {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || t('gallery.deleteFailed'));
      }
    } catch (error) {
      console.error('Error deleting image:', error);
      alert(error instanceof Error ? error.message : t('gallery.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggleActive(imageId: string) {
    try {
      const image = images.find((img) => img.id === imageId);
      if (!image) return;

      const response = await fetch(`/api/gallery/${imageId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          isActive: !image.isActive,
        }),
      });

      if (response.ok) {
        clearCachedGalleryImages();
        setImages((prev) =>
          prev.map((img) =>
            img.id === imageId ? { ...img, isActive: !img.isActive } : img
          )
        );
      } else {
        throw new Error(t('gallery.toggleFailed'));
      }
    } catch (error) {
      console.error('Error toggling image status:', error);
    }
  }

  async function openOfferEdit(img: GalleryImage) {
    setOfferEditImageId(img.id);
    setOfferFormError(null);
    const joinOptions = (values?: string[]) =>
      (values && values.length > 0 ? values.join(', ') : '');

    try {
      const res = await fetch(`/api/gallery/${img.id}`);
      if (res.ok) {
        const data = await res.json();
        const dimOpts = Array.isArray(data.offerDimensionOptions)
          ? data.offerDimensionOptions.filter((v: unknown) => typeof v === 'string' && String(v).trim())
          : [];
        setOfferForm({
          offerItemName: data.offerItemName ?? '',
          offerColorOptionsStr: joinOptions(data.offerColorOptions),
          offerDimensionOptions: dimOpts.length ? dimOpts : [''],
        });
        return;
      }
    } catch (_e) {
      // fall back to in-memory image
    }

    const dimOpts = (img.offerDimensionOptions?.length ?? 0) > 0 ? img.offerDimensionOptions! : [''];
    setOfferForm({
      offerItemName: img.offerItemName ?? '',
      offerColorOptionsStr: joinOptions(img.offerColorOptions),
      offerDimensionOptions: [...dimOpts],
    });
  }

  async function handleSaveOffer() {
    if (!offerEditImageId) return;
    if (!offerForm.offerItemName.trim()) {
      setOfferFormError(t('gallery.offerItemNameRequired'));
      return;
    }
    setOfferFormError(null);
    setSavingOffer(true);
    try {
      const toOptionsArray = (value: string): string[] =>
        value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

      const colorOptions = toOptionsArray(offerForm.offerColorOptionsStr);
      const dimensionOptions = offerForm.offerDimensionOptions
        .map((s) => s.trim())
        .filter(Boolean);

      const response = await fetch(`/api/gallery/${offerEditImageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerEligible: true,
          offerItemName: offerForm.offerItemName,
          offerColorOptions: colorOptions,
          offerDimensionOptions: dimensionOptions,
        }),
      });
      if (response.ok) {
        clearCachedGalleryImages();
        setImages((prev) =>
          prev.map((img) =>
            img.id === offerEditImageId
              ? {
                  ...img,
                  offerEligible: true,
                  offerItemName: offerForm.offerItemName,
                  offerColorOptions: colorOptions,
                  offerDimensionOptions: dimensionOptions,
                }
              : img
          )
        );
        setOfferEditImageId(null);
      }
    } catch (e) {
      console.error('Error saving offer details:', e);
    } finally {
      setSavingOffer(false);
    }
  }

  async function handleRemoveFromOffers() {
    if (!offerEditImageId) return;
    if (!window.confirm(t('gallery.removeFromOffersConfirm'))) return;
    setOfferFormError(null);
    setRemovingFromOffers(true);
    try {
      const response = await fetch(`/api/gallery/${offerEditImageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerEligible: false }),
      });
      if (response.ok) {
        clearCachedGalleryImages();
        setImages((prev) =>
          prev.map((img) =>
            img.id === offerEditImageId ? { ...img, offerEligible: false } : img
          )
        );
        setOfferEditImageId(null);
      } else {
        setOfferFormError(t('gallery.toggleFailed'));
      }
    } catch (e) {
      console.error('Error removing from offers:', e);
      setOfferFormError(t('gallery.toggleFailed'));
    } finally {
      setRemovingFromOffers(false);
    }
  }

  function openEditImage(img: GalleryImage) {
    setEditImageId(img.id);
    setEditTitle(img.title ?? '');
    setEditCategory(img.category ?? '');
    setEditFormError(null);
  }

  async function handleSaveEdit() {
    if (!editImageId) return;
    setEditFormError(null);
    setSavingEdit(true);
    try {
      const response = await fetch(`/api/gallery/${editImageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          category: editCategory.trim() || (categoryKeys.length > 0 ? categoryKeys[0] : ''),
        }),
      });
      if (response.ok) {
        clearCachedGalleryImages();
        setImages((prev) =>
          prev.map((img) =>
            img.id === editImageId
              ? { ...img, title: editTitle.trim(), category: editCategory.trim() || img.category }
              : img
          )
        );
        setEditImageId(null);
      } else {
        setEditFormError(t('gallery.editImageSaveFailed'));
      }
    } catch (e) {
      console.error('Error saving image edit:', e);
      setEditFormError(t('gallery.editImageSaveFailed'));
    } finally {
      setSavingEdit(false);
    }
  }

  const totalCount = images.length;
  const activeCount = images.filter((img) => img.isActive).length;
  const inactiveCount = totalCount - activeCount;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 h-[calc(100vh-2rem)] flex flex-col min-h-0">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
        {/* Top bar: title + stats + Upload */}
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-green-power-50 to-green-power-100 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
          <h2 className="text-lg md:text-xl font-semibold text-gray-900">{t('gallery.title')}</h2>
          <div className="flex items-center gap-3">
            <div className="px-3 py-2 rounded-lg bg-white/90 border border-gray-200">
              <p className="text-[11px] text-gray-500 uppercase tracking-wide">{t('gallery.total')}</p>
              <p className="text-sm font-semibold text-gray-900">{totalCount}</p>
            </div>
            <div className="px-3 py-2 rounded-lg bg-white/90 border border-green-200">
              <p className="text-[11px] text-green-700 uppercase tracking-wide">{t('gallery.active')}</p>
              <p className="text-sm font-semibold text-green-800">{activeCount}</p>
            </div>
            <div className="px-3 py-2 rounded-lg bg-white/90 border border-yellow-200">
              <p className="text-[11px] text-yellow-700 uppercase tracking-wide">{t('gallery.inactive')}</p>
              <p className="text-sm font-semibold text-yellow-800">{inactiveCount}</p>
            </div>
            <button
              onClick={openUploadModal}
              disabled={loading}
              className="px-4 py-2 bg-green-power-500 text-white text-sm font-medium rounded-md hover:bg-green-power-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('gallery.uploadImages')}
            </button>
          </div>
        </div>

        {/* Two columns: left = categories, right = images (both scroll inside their area) */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left sidebar – Categories (scrollable, fixed height) */}
          <aside className="w-64 sm:w-72 flex-shrink-0 min-h-0 border-r border-gray-200 bg-gray-50/50 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900">{t('gallery.categories')}</h3>
              <button
                type="button"
                onClick={() => setShowAddCategoryModal(true)}
                className="flex-shrink-0 p-1.5 rounded-lg text-green-power-600 hover:bg-green-power-50 transition-colors"
                title={t('gallery.addCategory')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 min-h-0 overflow-y-auto py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {/* All */}
              <button
                onClick={() => setSelectedCategory('all')}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors ${
                  selectedCategory === 'all'
                    ? 'bg-green-power-600 text-white font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className="truncate">{t('gallery.allCategories', { count: images.length })}</span>
              </button>
              {/* Category list */}
              {(categoryKeys.length > 0 ? categoryKeys : DEFAULT_CATEGORY_KEYS).map((category) => {
                const count =
                  category === OFFERS_CATEGORY_KEY
                    ? images.filter((img) => img.offerEligible === true || img.category === OFFERS_CATEGORY_KEY).length
                    : images.filter((img) => img.category === category).length;
                const displayName = getCategoryDisplayName(categoryLabels, category);
                const isEditing = editingCategoryKey === category;
                const isSelected = selectedCategory === category;
                return (
                  <div
                    key={category}
                    className={`border-b border-gray-100 last:border-0 ${
                      isSelected && !isEditing ? 'bg-green-power-50' : ''
                    }`}
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-2 px-4 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onSaveCategoryName(category, editingValue);
                            if (e.key === 'Escape') { setEditingCategoryKey(null); setEditingValue(''); }
                          }}
                          className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => onSaveCategoryName(category, editingValue)}
                          disabled={savingCategoryName}
                          className="p-1.5 rounded text-green-power-600 hover:bg-green-power-100 disabled:opacity-50"
                          title={t('common.save')}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingCategoryKey(null); setEditingValue(''); }}
                          className="p-1.5 rounded text-gray-500 hover:bg-gray-100"
                          title={t('common.cancel')}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 w-full">
                        <button
                          onClick={() => setSelectedCategory(category)}
                          className={`flex-1 min-w-0 flex items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors ${
                            isSelected
                              ? 'bg-green-power-600 text-white font-medium'
                              : 'text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          <span className="truncate">{displayName}</span>
                          <span className={`text-xs flex-shrink-0 ${isSelected ? 'text-white/90' : 'text-gray-500'}`}>({count})</span>
                        </button>
                        {isSelected && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCategoryKey(category);
                                setEditingValue(displayName);
                              }}
                              className="flex-shrink-0 p-2 rounded-lg text-gray-900 hover:bg-black/10 transition-colors"
                              title={t('gallery.editName')}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onDeleteCategory(category); }}
                              disabled={deletingCategoryKey === category}
                              className="flex-shrink-0 p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                              title={t('gallery.deleteCategory')}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </aside>

          {/* Right – Images (scrollable container only) */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
            <div className="px-6 py-3 border-b border-gray-100 bg-white flex items-center justify-between gap-2 flex-shrink-0">
              <p className="text-sm text-gray-600">
                {selectedCategory === 'all'
                  ? t('gallery.allCategories', { count: filteredImages.length })
                  : getCategoryDisplayName(categoryLabels, selectedCategory) + ` (${filteredImages.length})`}
              </p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 py-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="aspect-square bg-gray-200 rounded-xl animate-pulse shadow-sm" />
              ))}
            </div>
          ) : filteredImages.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-gray-300 text-8xl mb-6">📷</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {selectedCategory === 'all' ? t('gallery.noImagesInGallery') : t('gallery.noImagesInCategory', { category: getCategoryDisplayName(categoryLabels, selectedCategory) })}
              </h3>
              <p className="text-gray-500 text-lg mb-8 max-w-md mx-auto">
                {t('gallery.uploadFirstDescription')}
              </p>
              <button
                onClick={openUploadModal}
                className="px-8 py-3 bg-gradient-to-r from-green-power-600 to-green-power-700 text-white rounded-lg hover:from-green-power-700 hover:to-green-power-800 transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                {t('gallery.uploadFirstButton')}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredImages.map((image) => (
                <div key={image.id} className="group bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                  <button
                    type="button"
                    onClick={() => setPreviewImageUrl(image.url)}
                    className="aspect-[4/3] relative overflow-hidden bg-gray-50 w-full block cursor-pointer text-left"
                  >
                    <img
                      src={image.url}
                      alt={image.title || `${image.category} - ${image.id}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"
                    />
                    {!image.isActive && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <span className="px-3 py-1.5 bg-gray-800/90 text-white text-xs font-semibold rounded-full">{t('gallery.inactive')}</span>
                      </div>
                    )}
                    <div className="absolute top-2 left-2 pointer-events-none flex flex-wrap gap-1">
                      <span className="px-2 py-1 bg-white/95 text-gray-700 text-xs font-medium rounded-md shadow-sm">
                        {(getCategoryDisplayName(categoryLabels, image.category)).length > 20
                          ? getCategoryDisplayName(categoryLabels, image.category).slice(0, 18) + '…'
                          : getCategoryDisplayName(categoryLabels, image.category)}
                      </span>
                      {image.offerEligible && (
                        <span className="px-2 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded-md shadow-sm">
                          {t('gallery.offer')}
                        </span>
                      )}
                    </div>
                  </button>
                  <div className="p-3 flex items-center justify-between gap-2 border-t border-gray-100">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{image.title || t('gallery.untitled')}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(image.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      image.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {image.isActive ? t('gallery.active') : t('gallery.inactive')}
                    </span>
                  </div>
                  <div className="px-3 pb-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewImageUrl(image.url)}
                      className="p-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                      title={t('gallery.view')}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(image.id)}
                      className={`p-2 rounded-lg transition-colors ${
                        image.isActive
                          ? 'text-amber-700 bg-amber-100 hover:bg-amber-200'
                          : 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200'
                      }`}
                      title={image.isActive ? t('gallery.hide') : t('gallery.show')}
                    >
                      {image.isActive ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878a4.5 4.5 0 106.262 6.262M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => openOfferEdit(image)}
                      className={`p-2 rounded-lg transition-colors ${
                        image.offerEligible
                          ? 'text-teal-700 bg-teal-100 hover:bg-teal-200'
                          : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                      }`}
                      title={t('gallery.offerDetails')}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditImage(image)}
                      className="p-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                      title={t('gallery.editImage')}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9a2 2 0 112.828 2.828L11.828 15H9v-2.828L18.172 5.172z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteClick(image.id)}
                      className="p-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                      title={t('gallery.delete')}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Category Modal */}
      {showAddCategoryModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setShowAddCategoryModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{t('gallery.addCategory')}</h3>
              <button
                type="button"
                onClick={() => setShowAddCategoryModal(false)}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onAddCategory();
                  if (e.key === 'Escape') setShowAddCategoryModal(false);
                }}
                placeholder={t('gallery.newCategoryPlaceholder')}
                className="flex-1 min-w-0 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500"
                autoFocus
              />
              <button
                type="button"
                onClick={onAddCategory}
                disabled={addingCategory || !newCategoryName.trim() || categoryKeys.includes(newCategoryName.trim())}
                className="px-4 py-2.5 bg-green-power-600 text-white text-sm font-medium rounded-lg hover:bg-green-power-700 disabled:opacity-50"
              >
                {addingCategory ? '...' : t('common.add')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">{t('gallery.uploadModalTitle')}</h3>
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setSelectedFiles([]);
                    setUploadTitle('');
                    setUploadProgress(0);
                    setUploadError(null);
                    setUploadPreviewIndex(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      {t('gallery.category')}
                    </label>
                    {selectedCategory === 'all' ? (
                      <select
                        value={uploadCategory}
                        onChange={(e) => setUploadCategory(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:border-transparent text-sm"
                      >
                        {(categoryKeys.length > 0 ? categoryKeys : DEFAULT_CATEGORY_KEYS).map((category) => (
                          <option key={category} value={category}>{getCategoryDisplayName(categoryLabels, category)}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 text-sm font-medium">
                        {getCategoryDisplayName(categoryLabels, uploadCategory)}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      {t('gallery.titleOptional')}
                    </label>
                    <input
                      type="text"
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                      placeholder={t('gallery.titlePlaceholder')}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:border-transparent text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {t('gallery.selectImages')}
                  </label>
                  <input
                    ref={galleryFileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => {
                      const list = Array.from(e.target.files || []);
                      const valid = list.filter((f) => f.size <= MAX_FILE_SIZE_BYTES);
                      if (valid.length < list.length) setUploadError(t('files.fileSizeTooLarge'));
                      if (valid.length) setSelectedFiles((prev) => [...prev, ...valid]);
                      e.target.value = '';
                    }}
                    className="hidden"
                    id="gallery-upload"
                  />
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className={`border-2 border-dashed rounded-lg p-5 transition-colors bg-gray-50 cursor-pointer ${
                      dragOver ? 'border-green-power-500 bg-green-power-50' : 'border-gray-300 hover:border-green-power-400'
                    }`}
                    onClick={() => galleryFileInputRef.current?.click()}
                  >
                    <div className="text-center pointer-events-none">
                      <svg className="mx-auto h-10 w-10 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                        <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <p className="mt-2 text-sm text-gray-600">
                        {selectedFiles.length > 0
                          ? t('gallery.filesSelected', { count: selectedFiles.length })
                          : dragOver
                            ? t('gallery.dropImagesHere')
                            : t('gallery.clickToUploadOrDrop')
                        }
                      </p>
                      <p className="text-xs text-gray-400 mt-1">{t('gallery.fileTypesAndSize')}</p>
                    </div>
                  </div>
                </div>
                {uploadError && (
                  <p className="mt-2 text-sm text-red-600" role="alert">{uploadError}</p>
                )}

                {/* Image Preview */}
                {selectedFiles.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-semibold text-gray-700">{t('gallery.preview', { count: selectedFiles.length })}</h4>
                      <button
                        onClick={() => setSelectedFiles([])}
                        className="text-sm text-red-600 hover:text-red-700 font-medium"
                      >
                        {t('gallery.clearAll')}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {selectedFiles.map((file, index) => (
                        <div key={index} className="relative group">
                          <button
                            type="button"
                            onClick={() => setUploadPreviewIndex(index)}
                            className="w-full aspect-square overflow-hidden rounded-lg border border-gray-200 shadow-sm block cursor-pointer text-left hover:ring-2 hover:ring-green-power-500 focus:ring-2 focus:ring-green-power-500 focus:outline-none"
                          >
                            <img
                              src={URL.createObjectURL(file)}
                              alt={`Preview ${index + 1}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"
                            />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFiles(prev => prev.filter((_, i) => i !== index));
                            }}
                            className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-lg hover:bg-red-600 z-10"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                          <div className="mt-2">
                            <p className="text-xs text-gray-600 truncate font-medium">{file.name}</p>
                            <p className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {uploading && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-blue-900">{t('gallery.uploadingImages')}</span>
                      <span className="text-sm font-bold text-blue-900">{Math.round(uploadProgress)}%</span>
                    </div>
                    <div className="w-full bg-blue-100 rounded-full h-3">
                      <div 
                        className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-blue-700 mt-2">{t('gallery.dontCloseWindow')}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-5 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setSelectedFiles([]);
                    setUploadTitle('');
                    setUploadProgress(0);
                    setUploadError(null);
                    setUploadPreviewIndex(null);
                  }}
                  disabled={uploading}
                  className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleUpload}
                  disabled={selectedFiles.length === 0 || uploading}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-green-power-600 to-green-power-700 text-white rounded-lg hover:from-green-power-700 hover:to-green-power-800 transition-all duration-200 disabled:opacity-50 font-medium shadow-lg hover:shadow-xl"
                >
                  {uploading ? t('gallery.uploadingButton') : t('gallery.uploadButtonText', { count: selectedFiles.length })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload modal: full-size preview with Previous/Next when clicking a selected image */}
      {showUploadModal && uploadPreviewIndex !== null && uploadPreviewObjectUrl && selectedFiles.length > 0 && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setUploadPreviewIndex(null)}
        >
          <button
            type="button"
            onClick={() => setUploadPreviewIndex(null)}
            className="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-lg transition-colors z-10"
            aria-label={t('common.close')}
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {uploadPreviewIndex > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setUploadPreviewIndex(uploadPreviewIndex - 1); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 text-white hover:bg-white/10 rounded-full transition-colors z-10"
              aria-label={t('common.previous')}
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {uploadPreviewIndex < selectedFiles.length - 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setUploadPreviewIndex(uploadPreviewIndex + 1); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 text-white hover:bg-white/10 rounded-full transition-colors z-10"
              aria-label={t('common.next')}
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
          <div className="relative max-w-[95vw] max-h-[90vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={uploadPreviewObjectUrl}
              alt={selectedFiles[uploadPreviewIndex]?.name ?? ''}
              className="max-h-[90vh] w-auto object-contain rounded-lg"
            />
          </div>
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/90 text-sm">
            {uploadPreviewIndex + 1} / {selectedFiles.length}
          </p>
        </div>
      )}

      {/* Image preview modal (in-portal, no new tab) */}
      {previewImageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setPreviewImageUrl(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewImageUrl(null)}
            className="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-lg transition-colors z-10"
            aria-label={t('common.close')}
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="relative max-w-[95vw] max-h-[90vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={previewImageUrl}
              alt=""
              className="max-h-[90vh] w-auto object-contain rounded-lg"
            />
          </div>
        </div>
      )}

      {/* Offer details modal */}
      {offerEditImageId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => !savingOffer && setOfferEditImageId(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">{t('gallery.offerDetailsTitle')}</h3>
            <p className="text-sm text-gray-500 mb-4">{t('gallery.offerDetailsIntro')}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('gallery.offerItemName')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={offerForm.offerItemName}
                  onChange={(e) => { setOfferFormError(null); setOfferForm((f) => ({ ...f, offerItemName: e.target.value })); }}
                  placeholder={t('gallery.offerItemNamePlaceholder')}
                  className={`w-full px-3 py-2 border rounded-lg text-sm ${offerFormError ? 'border-red-500' : 'border-gray-300'}`}
                  aria-required="true"
                  aria-invalid={!!offerFormError}
                />
                {offerFormError && <p className="text-xs text-red-600 mt-1">{offerFormError}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('gallery.offerDimensions')}
                </label>
                <div className="space-y-2">
                  {offerForm.offerDimensionOptions.map((line, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        value={line}
                        onChange={(e) =>
                          setOfferForm((f) => ({
                            ...f,
                            offerDimensionOptions: f.offerDimensionOptions.map((v, i) =>
                              i === idx ? e.target.value : v
                            ),
                          }))
                        }
                        placeholder={t('gallery.offerDimensionLinePlaceholder')}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setOfferForm((f) => ({
                            ...f,
                            offerDimensionOptions: f.offerDimensionOptions.filter((_, i) => i !== idx).length
                              ? f.offerDimensionOptions.filter((_, i) => i !== idx)
                              : [''],
                          }))
                        }
                        className="px-2 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm font-medium"
                        aria-label={t('offer.remove')}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setOfferForm((f) => ({
                        ...f,
                        offerDimensionOptions: [...f.offerDimensionOptions, ''],
                      }))
                    }
                    className="text-sm font-medium text-green-power-600 hover:text-green-power-700"
                  >
                    + {t('gallery.offerAddDimension')}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('gallery.offerColorOptions')}</label>
                <input
                  type="text"
                  value={offerForm.offerColorOptionsStr}
                  onChange={(e) => setOfferForm((f) => ({ ...f, offerColorOptionsStr: e.target.value }))}
                  placeholder={t('gallery.offerColorOptionsPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">{t('gallery.offerColorOptionsHint')}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => !savingOffer && !removingFromOffers && setOfferEditImageId(null)}
                disabled={savingOffer || removingFromOffers}
                className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveOffer}
                disabled={savingOffer || removingFromOffers}
                className="flex-1 py-2 bg-green-power-600 text-white rounded-lg text-sm font-medium hover:bg-green-power-700 disabled:opacity-50"
              >
                {savingOffer ? t('common.saving') : t('common.save')}
              </button>
            </div>
            {offerEditImageId && images.find((i) => i.id === offerEditImageId)?.offerEligible && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleRemoveFromOffers}
                  disabled={savingOffer || removingFromOffers}
                  className="text-sm text-red-500 hover:text-red-600 disabled:opacity-50"
                >
                  {removingFromOffers ? t('common.loading') : t('gallery.removeFromOffers')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit image modal */}
      {editImageId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => !savingEdit && setEditImageId(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('gallery.editImageTitle')}</h3>
            {(() => {
              const img = images.find((i) => i.id === editImageId);
              return img ? (
                <div className="mb-4 rounded-lg overflow-hidden bg-gray-100 aspect-video">
                  <img src={img.url} alt="" className="w-full h-full object-contain" />
                </div>
              ) : null;
            })()}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('gallery.editImageTitleLabel')}</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder={t('gallery.titlePlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('gallery.editImageCategoryLabel')}</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {(categoryKeys.length > 0 ? categoryKeys : DEFAULT_CATEGORY_KEYS).map((key) => (
                    <option key={key} value={key}>
                      {getCategoryDisplayName(categoryLabels, key)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {editFormError && (
              <p className="mt-3 text-sm text-red-600">{editFormError}</p>
            )}
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => !savingEdit && setEditImageId(null)}
                disabled={savingEdit}
                className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="flex-1 py-2 bg-green-power-600 text-white rounded-lg text-sm font-medium hover:bg-green-power-700 disabled:opacity-50"
              >
                {savingEdit ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={imageToDelete !== null}
        title={t('gallery.deleteImageTitle')}
        message={t('gallery.deleteImageMessage')}
        confirmText={deleting ? t('gallery.deleting') : t('gallery.delete')}
        cancelText={t('common.cancel')}
        type="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => !deleting && setImageToDelete(null)}
      />
    </div>
  );
}
