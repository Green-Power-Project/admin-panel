'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import ConfirmationModal from '@/components/ConfirmationModal';
import { useLanguage } from '@/contexts/LanguageContext';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  DEFAULT_CATEGORY_KEYS,
  getGalleryCategoryLabels,
  setGalleryCategoryLabels,
  getCategoryDisplayName,
  type CategoryLabelsMap,
} from '@/lib/galleryCategoryLabels';

const GALLERY_HEADER_TITLE = 'Grün Power – Galerie';

interface GalleryImage {
  id: string;
  url: string;
  category: string;
  title?: string;
  uploadedAt: Date;
  uploadedBy: string;
  isActive: boolean;
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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadCategory, setUploadCategory] = useState<string>(DEFAULT_CATEGORY_KEYS[0]);
  const [uploadTitle, setUploadTitle] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Category labels from Firestore (edit in admin → reflected in customer)
  const [categoryLabels, setCategoryLabels] = useState<CategoryLabelsMap>({});
  const [editingCategoryKey, setEditingCategoryKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [savingCategoryName, setSavingCategoryName] = useState(false);

  // Subscribe to gallery config for category labels (live update)
  useEffect(() => {
    if (!db) return;
    const ref = doc(db, 'config', 'gallery');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const labels: CategoryLabelsMap = {};
        if (snap.exists()) {
          const data = snap.data();
          const raw = data?.categoryLabels;
          if (typeof raw === 'object' && raw !== null) Object.assign(labels, raw);
        }
        setCategoryLabels(labels);
      },
      () => setCategoryLabels({})
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

  function openUploadModal() {
    if (selectedCategory !== 'all') setUploadCategory(selectedCategory);
    setShowUploadModal(true);
  }

  // Load images from Firestore
  useEffect(() => {
    async function loadImages() {
      try {
        const response = await fetch('/api/gallery');
        if (response.ok) {
          const galleryImages = await response.json();
          setImages(galleryImages);
        }
      } catch (error) {
        console.error('Error loading gallery images:', error);
      } finally {
        setLoading(false);
      }
    }

    loadImages();
  }, []);

  const filteredImages = selectedCategory === 'all' 
    ? images 
    : images.filter(img => img.category === selectedCategory);

  async function handleUpload() {
    if (selectedFiles.length === 0) return;

    setUploading(true);
    setUploadProgress(0);
    const progressInterval = setInterval(() => {
      setUploadProgress((p) => (p >= 90 ? p : p + 10));
    }, 400);

    try {
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
        const result = await response.json();
        // Reload images
        const imagesResponse = await fetch('/api/gallery');
        if (imagesResponse.ok) {
          const galleryImages = await imagesResponse.json();
          setImages(galleryImages);
        }

        setUploadProgress(100);
        setSelectedFiles([]);
        setUploadTitle('');
        setTimeout(() => {
          setShowUploadModal(false);
          setUploadProgress(0);
        }, 400);
      } else {
        throw new Error(t('gallery.uploadFailed'));
      }
    } catch (error) {
      console.error('Error uploading images:', error);
    } finally {
      clearInterval(progressInterval);
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length) setSelectedFiles((prev) => [...prev, ...files]);
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
            <div className="px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
              <h3 className="text-sm font-semibold text-gray-900">{t('gallery.categories')}</h3>
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
              {DEFAULT_CATEGORY_KEYS.map((category) => {
                const count = images.filter((img) => img.category === category).length;
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
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingCategoryKey(category);
                              setEditingValue(displayName);
                            }}
                            className="flex-shrink-0 p-2 rounded-lg text-gray-900 hover:bg-black/10 transition-colors mr-1"
                            title={t('gallery.editName')}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
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
                    <div className="absolute top-2 left-2 pointer-events-none">
                      <span className="px-2 py-1 bg-white/95 text-gray-700 text-xs font-medium rounded-md shadow-sm">
                        {(getCategoryDisplayName(categoryLabels, image.category)).length > 20
                          ? getCategoryDisplayName(categoryLabels, image.category).slice(0, 18) + '…'
                          : getCategoryDisplayName(categoryLabels, image.category)}
                      </span>
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
                  <div className="px-3 pb-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewImageUrl(image.url)}
                      className="flex-1 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      {t('gallery.view')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(image.id)}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        image.isActive
                          ? 'text-amber-700 bg-amber-100 hover:bg-amber-200'
                          : 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200'
                      }`}
                    >
                      {image.isActive ? t('gallery.hide') : t('gallery.show')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteClick(image.id)}
                      className="py-1.5 px-2 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                    >
                      {t('gallery.delete')}
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

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">{t('gallery.uploadModalTitle')}</h3>
                  <p className="text-gray-600 mt-1">{t('gallery.uploadModalDescription')}</p>
                </div>
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setSelectedFiles([]);
                    setUploadTitle('');
                    setUploadProgress(0);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                        {DEFAULT_CATEGORY_KEYS.map((category) => (
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
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className={`border-2 border-dashed rounded-xl p-8 transition-colors bg-gray-50 cursor-pointer ${
                      dragOver ? 'border-green-power-500 bg-green-power-50' : 'border-gray-300 hover:border-green-power-400'
                    }`}
                    onClick={() => document.getElementById('gallery-upload')?.click()}
                  >
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(e) => setSelectedFiles((prev) => [...prev, ...Array.from(e.target.files || [])])}
                      className="hidden"
                      id="gallery-upload"
                    />
                    <div className="text-center pointer-events-none">
                      <svg className="mx-auto h-16 w-16 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                        <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <p className="mt-4 text-lg text-gray-600">
                        {selectedFiles.length > 0
                          ? t('gallery.filesSelected', { count: selectedFiles.length })
                          : dragOver
                            ? t('gallery.dropImagesHere')
                            : t('gallery.clickToUploadOrDrop')
                        }
                      </p>
                      <p className="text-sm text-gray-500 mt-2">{t('gallery.fileTypesAndSize')}</p>
                    </div>
                  </div>
                </div>

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
                          <div className="aspect-square overflow-hidden rounded-lg border border-gray-200 shadow-sm">
                            <img
                              src={URL.createObjectURL(file)}
                              alt={`Preview ${index + 1}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          </div>
                          <button
                            onClick={() => {
                              setSelectedFiles(prev => prev.filter((_, i) => i !== index));
                            }}
                            className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-lg hover:bg-red-600"
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

              <div className="flex gap-4 mt-8 pt-6 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setSelectedFiles([]);
                    setUploadTitle('');
                    setUploadProgress(0);
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
