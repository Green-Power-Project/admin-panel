'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { useLanguage } from '@/contexts/LanguageContext';
import { translateFolderPath, getProjectFolderDisplayName } from '@/lib/translations';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  PROJECT_FOLDER_STRUCTURE,
  isValidFolderPath,
  getScopeFolder,
  getDefaultFilesFolderPath,
  type Folder,
} from '@/lib/folderStructure';
import { useAuth } from '@/contexts/AuthContext';
import { uploadFile, deleteFile } from '@/lib/cloudinary';
import ConfirmationModal from '@/components/ConfirmationModal';
import AlertModal from '@/components/AlertModal';
import FileUploadPreviewModal from '@/components/FileUploadPreviewModal';
import Pagination from '@/components/Pagination';
import { isReportFile, addWorkingDays } from '@/lib/reportApproval';
import { deleteFileRelatedData } from '@/lib/cascadeDelete';
interface Project {
  id: string;
  name: string;
  year?: number;
  customerId?: string;
  folderDisplayNames?: Record<string, string>;
  customFolders?: string[];
}

interface FileMetadata {
  fileName: string;
  cloudinaryUrl: string;
  cloudinaryPublicId: string;
  fileType: 'pdf' | 'image' | 'file';
  folderPath: string;
  uploadedAt: Date | null;
}

interface CustomerMessageItem {
  id: string;
  message: string;
  customerId: string;
  createdAt: Date | null;
  status: string;
  resolvedAt?: Date | null;
  readAt?: Date | null;
  subject?: string;
  fileName?: string;
  filePath?: string;
}

function getFolderSegments(folderPath: string): string[] {
  return folderPath.split('/').filter(Boolean);
}

function getProjectFolderRef(projectId: string, folderSegments: string[]) {
  if (folderSegments.length === 0) {
    throw new Error('Folder segments must not be empty');
  }
  if (!db) {
    throw new Error('Firestore database is not initialized');
  }
  const folderPathId = folderSegments.join('__');
  return collection(db, 'files', 'projects', projectId, folderPathId, 'files');
}

function deriveFileType(fileName: string): 'pdf' | 'image' | 'file' {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png')) return 'image';
  return 'file';
}

function getFolderConfig(path: string, t: (key: string) => string) {
  const configs: Record<string, { gradient: string; icon: string }> = {
    '02_Photos': { gradient: 'from-purple-500 to-pink-500', icon: '📷' },
    '03_Reports': { gradient: 'from-green-500 to-emerald-500', icon: '📄' },
    '04_Emails': { gradient: 'from-blue-500 to-cyan-500', icon: '✉️' },
    '05_Quotations': { gradient: 'from-yellow-500 to-orange-500', icon: '💰' },
    '06_Invoices': { gradient: 'from-red-500 to-rose-500', icon: '🧾' },
    '07_Delivery_Notes': { gradient: 'from-teal-500 to-cyan-500', icon: '📦' },
    '08_General': { gradient: 'from-gray-500 to-slate-500', icon: '📋' },
    '09_Admin_Only': { gradient: 'from-amber-600 to-orange-600', icon: '🔒' },
  };
  const base = configs[path] || { gradient: 'from-gray-400 to-gray-500', icon: '📁' };
  const descKey = `folders.${path}.description`;
  const translated = t(descKey);
  const description = translated !== descKey ? translated : t('files.projectFolderFallback');
  return { ...base, description };
}

function getFolderIcon(path: string): string {
  if (path === '00_New_Not_Viewed_Yet_') return '🔔';
  if (path.startsWith('01_')) return '📤';
  if (path.startsWith('02_')) return '📷';
  if (path.startsWith('03_')) return '📄';
  if (path.startsWith('04_')) return '✉️';
  if (path.startsWith('05_')) return '💰';
  if (path.startsWith('06_')) return '🧾';
  if (path.startsWith('07_')) return '📦';
  if (path.startsWith('08_')) return '📋';
  if (path.startsWith('09_')) return '🔒';
  if (path.startsWith('10_')) return '📂';
  return '📁';
}

function isCustomFolderPath(path: string): boolean {
  return path.startsWith('10_Custom/');
}

function getCustomFolderDisplayName(path: string): string {
  const segment = path.split('/').pop() || path;
  return segment.replace(/_/g, ' ');
}

function isCustomerUploadsFolder(folderPath: string): boolean {
  return folderPath.startsWith('01_Customer_Uploads');
}

function formatFolderName(nameOrPath: string, t: (key: string) => string, folderDisplayNames?: Record<string, string> | null): string {
  return getProjectFolderDisplayName(nameOrPath, folderDisplayNames, t);
}

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export default function ProjectFilesPage() {
  return (
    <ProtectedRoute>
      <AdminLayout>
        <ProjectFilesContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function ProjectFilesContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const { t } = useLanguage();
  const { currentUser } = useAuth();
  const fromProject = searchParams.get('from') === 'project';
  const folderFromUrl = searchParams.get('folder') || '';

  const [project, setProject] = useState<Project | null>(null);
  const [customersMap, setCustomersMap] = useState<Map<string, string>>(new Map());
  const [customerMessagesList, setCustomerMessagesList] = useState<CustomerMessageItem[]>([]);
  const [resolvingMessageId, setResolvingMessageId] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>(() => {
    if (folderFromUrl) {
      if (isValidFolderPath(folderFromUrl)) return folderFromUrl;
      if (isCustomFolderPath(folderFromUrl)) return folderFromUrl; // project not loaded yet; will sync from URL when project has customFolders
    }
    return getDefaultFilesFolderPath();
  });
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [uploadingFileName, setUploadingFileName] = useState<string>('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [successFolder, setSuccessFolder] = useState('');
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteFileData, setDeleteFileData] = useState<{ folderPath: string; publicId: string; fileName: string } | null>(null);
  const [showAlert, setShowAlert] = useState(false);
  const [alertData, setAlertData] = useState<{ title: string; message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const [showUploadPreview, setShowUploadPreview] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [viewerFile, setViewerFile] = useState<FileMetadata | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [contentReady, setContentReady] = useState(false);
  // Avoid flash of folder UI (sidebar with "Emails" etc.) during navigation – show content only after a short delay once project is loaded
  useEffect(() => {
    if (!loading && project) {
      const id = setTimeout(() => setContentReady(true), 150);
      return () => clearTimeout(id);
    } else {
      setContentReady(false);
    }
  }, [loading, project]);

  // Sync selectedFolder from URL when navigating (e.g. from project page with ?folder=)
  // Accept fixed-structure paths and project custom folders (10_Custom/...)
  useEffect(() => {
    const folder = searchParams.get('folder') || '';
    if (!folder) return;
    const isCustom = isCustomFolderPath(folder);
    if (isValidFolderPath(folder)) {
      setSelectedFolder(folder);
    } else if (isCustom && project?.customFolders?.includes(folder)) {
      setSelectedFolder(folder);
    }
  }, [searchParams, project?.customFolders]);

  useEffect(() => {
    if (!projectId || !db) return;
    const unsub = onSnapshot(doc(db, 'projects', projectId), (snap) => {
      if (snap.exists()) {
        setProject({ id: snap.id, ...snap.data() } as Project);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !selectedFolder) {
      setFiles([]);
      return;
    }
    const segments = getFolderSegments(selectedFolder);
    if (segments.length === 0) {
      setFiles([]);
      return;
    }
    const filesRef = getProjectFolderRef(projectId, segments);
    const q = query(filesRef, orderBy('uploadedAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: FileMetadata[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            fileName: data.fileName as string,
            cloudinaryUrl: data.cloudinaryUrl as string,
            cloudinaryPublicId: data.cloudinaryPublicId as string,
            fileType: deriveFileType((data.fileName as string) || ''),
            folderPath: selectedFolder,
            uploadedAt: data.uploadedAt?.toDate ? data.uploadedAt.toDate() : null,
          };
        });
        setFiles(list);
      },
      (err) => {
        console.error('Files snapshot error:', err);
        setFiles([]);
      }
    );
    return () => unsub();
  }, [projectId, selectedFolder]);

  // Load customers map for resolving customerId to display name
  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(collection(db, 'customers'), (snap) => {
      const map = new Map<string, string>();
      snap.forEach((d) => {
        const data = d.data();
        const name = data.customerNumber || data.email || d.id;
        map.set(data.uid, typeof name === 'string' ? name : d.id);
      });
      setCustomersMap(map);
    });
    return () => unsub();
  }, []);

  // Listen to customer messages for this folder
  useEffect(() => {
    if (!db || !projectId || !selectedFolder) {
      setCustomerMessagesList([]);
      return;
    }
    const q = query(
      collection(db, 'customerMessages'),
      where('projectId', '==', projectId),
      where('folderPath', '==', selectedFolder)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: CustomerMessageItem[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          message: (data.message as string) || '',
          customerId: (data.customerId as string) || '',
          createdAt: data.createdAt?.toDate?.() ?? null,
          status: (data.status as string) || 'unread',
          resolvedAt: data.resolvedAt?.toDate?.() ?? null,
          readAt: data.readAt?.toDate?.() ?? null,
          subject: (data.subject as string) || undefined,
          fileName: (data.fileName as string) || undefined,
          filePath: (data.filePath as string) || undefined,
        };
      });
      list.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
      setCustomerMessagesList(list);
    }, (err) => {
      console.error('Customer messages listener error:', err);
      setCustomerMessagesList([]);
    });
    return () => unsub();
  }, [projectId, selectedFolder]);

  async function handleMarkMessageAsRead(msgId: string) {
    if (!db || !currentUser?.uid) return;
    try {
      await updateDoc(doc(db, 'customerMessages', msgId), {
        status: 'read',
        readAt: serverTimestamp(),
        readBy: currentUser.uid,
      });
    } catch (err) {
      console.error('Error marking message as read:', err);
    }
  }

  async function handleResolveMessage(msgId: string) {
    if (!db || !currentUser?.uid) return;
    setResolvingMessageId(msgId);
    try {
      await updateDoc(doc(db, 'customerMessages', msgId), {
        status: 'resolved',
        resolvedAt: serverTimestamp(),
        resolvedBy: currentUser.uid,
      });
      setAlertData({ title: t('files.customerMessages.resolvedTitle'), message: t('files.customerMessages.resolvedMessage'), type: 'success' });
      setShowAlert(true);
    } catch (err) {
      console.error('Error resolving message:', err);
      setAlertData({ title: t('common.status'), message: t('files.customerMessages.resolveFailed'), type: 'error' });
      setShowAlert(true);
    } finally {
      setResolvingMessageId(null);
    }
  }

  const clearSuccessMessage = () => {
    setUploadSuccess('');
    setSuccessFolder('');
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }
  };

  const scheduleSuccessMessage = (message: string) => {
    clearSuccessMessage();
    setUploadSuccess(message);
    setSuccessFolder(selectedFolder);
    successTimeoutRef.current = setTimeout(() => {
      setUploadSuccess('');
      setSuccessFolder('');
      successTimeoutRef.current = null;
    }, 3000);
  };

  function clearSelectedFiles() {
    setSelectedFiles([]);
    setSelectedFile(null);
    setShowUploadPreview(false);
    setUploadError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleUploadConfirm() {
    if (!selectedFiles.length || !selectedFiles[0] || !selectedFolder || !projectId || !db) return;
    const validPath = isValidFolderPath(selectedFolder) || (isCustomFolderPath(selectedFolder) && project?.customFolders?.includes(selectedFolder));
    if (!validPath) {
      setUploadError(t('files.invalidFolderPath'));
      return;
    }
    const tooBig = selectedFiles.find((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (tooBig) {
      setUploadError(t('files.fileSizeTooLarge'));
      return;
    }
    setShowUploadPreview(false);
    setUploading(true);
    setUploadError('');
    const folderPathFull = `projects/${projectId}/${selectedFolder}`;
    const uploadedFiles: string[] = [];
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const sanitizedBaseName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
        const publicId = `${folderPathFull}/${sanitizedBaseName}`;
        setUploadingFileName(`${i + 1}/${selectedFiles.length}: ${file.name}`);
        setUploadProgress(Math.round(((i + 1) / selectedFiles.length) * 100));
        const result = await uploadFile(file, folderPathFull, undefined, (p) => setUploadProgress(p));
        const segments = getFolderSegments(selectedFolder);
        const filesRef = getProjectFolderRef(projectId, segments);
        const docData: Record<string, unknown> = {
          fileName: file.name,
          cloudinaryUrl: result.secure_url,
          cloudinaryPublicId: result.public_id,
          uploadedAt: serverTimestamp(),
        };
        if (isReportFile(selectedFolder) && file.name.toLowerCase().endsWith('.pdf')) {
          docData.autoApproveDate = Timestamp.fromDate(addWorkingDays(new Date(), 5));
        }
        await addDoc(filesRef, docData);
        uploadedFiles.push(file.name);
        try {
          await fetch('/api/notifications/file-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              filePath: result.public_id,
              folderPath: selectedFolder,
              fileName: file.name,
              isReport: isReportFile(selectedFolder) && file.name.toLowerCase().endsWith('.pdf'),
            }),
          });
        } catch (_) {}
      }
      clearSelectedFiles();
      scheduleSuccessMessage(t('files.filesUploadedSuccess', { count: uploadedFiles.length }));
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : t('files.uploadFailed'));
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadingFileName('');
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteFileData || !projectId || !db) return;
    const dbInstance = db;
    const { folderPath, publicId } = deleteFileData;
    setDeleting(publicId);
    try {
      const segments = getFolderSegments(folderPath);
      const folderPathId = segments.join('__');
      const filesRef = getProjectFolderRef(projectId, segments);
      const snapshot = await getDocs(query(filesRef, where('cloudinaryPublicId', '==', publicId)));
      await Promise.all(
        snapshot.docs.map((d) => deleteDoc(doc(dbInstance, 'files', 'projects', projectId, folderPathId, 'files', d.id)))
      );
      // Remove related data first so audit logs, tracking, etc. stay in sync
      await deleteFileRelatedData(dbInstance, projectId, publicId);
      const deleted = await deleteFile(publicId);
      if (!deleted) {
        setAlertData({ title: t('files.deleteFailedTitle'), message: t('files.deleteFailedMessage'), type: 'error' });
        setShowAlert(true);
      }
    } catch (err) {
      setAlertData({ title: t('messages.error.generic'), message: err instanceof Error ? err.message : t('files.fileDeleteFailed'), type: 'error' });
      setShowAlert(true);
    } finally {
      setDeleting(null);
      setShowDeleteConfirm(false);
      setDeleteFileData(null);
    }
  }

  const paginatedFiles = files.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.max(1, Math.ceil(files.length / itemsPerPage));
  const scopeFolder = getScopeFolder(selectedFolder);

  // During loading: no AdminLayout so we don’t show a second header/sidebar (avoids duplicate admin bar during transition)
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-green-power-500 border-t-transparent" />
        <p className="text-sm text-gray-500">{t('common.loading')}</p>
      </div>
    );
  }

  if (!project) {
    return (
      <AdminLayout>
        <div className="p-6">
          <p className="text-red-600">{t('files.projectNotFound')}</p>
          <Link href="/projects" className="text-green-power-600 hover:underline mt-2 inline-block">{t('files.backToProjects')}</Link>
        </div>
      </AdminLayout>
    );
  }

  if (!contentReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-green-power-500 border-t-transparent" />
        <p className="text-sm text-gray-500">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <Link
          href={fromProject ? `/projects/${projectId}` : '/projects'}
          className="text-sm font-medium text-green-power-600 hover:text-green-power-700"
        >
          ← {fromProject ? t('files.backToProjectFolders') : t('files.backToProjects')}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">{project.name}</h1>
        {project.year && (
          <p className="text-sm text-gray-600 mt-1">{t('projects.year')}: {project.year}</p>
        )}
      </div>

      {selectedFolder && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sidebar – only this folder and its subfolders */}
          <div className="lg:col-span-3">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm sticky top-6">
              <div className="px-5 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                {/* <Link
                  href={`/projects/${projectId}`}
                  className="flex items-center gap-2 text-sm font-medium text-green-power-600 hover:text-green-power-700 mb-2"
                >
                  <span>←</span> Back to project folders
                </Link> */}
                <h3 className="text-sm font-bold text-gray-900">{t('files.thisFolder')}</h3>
                <p className="text-xs text-gray-600 mt-1">{t('files.switchWithinFolderOnly')}</p>
              </div>
              <div className="p-4 max-h-[calc(100vh-200px)] overflow-y-auto space-y-4">
                {scopeFolder && (() => {
                  const hasSelectedChild = scopeFolder.children?.some((c) => selectedFolder === c.path);
                  const isParentSelected = selectedFolder === scopeFolder.path && !hasSelectedChild;
                  const config = getFolderConfig(scopeFolder.path, t);
                  return (
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (scopeFolder.children?.length) {
                            setSelectedFolder(scopeFolder.children[0].path);
                          } else {
                            setSelectedFolder(scopeFolder.path);
                          }
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm rounded-lg transition-all duration-200 flex items-center space-x-3 ${
                          isParentSelected || hasSelectedChild ? 'bg-green-power-500 text-white shadow-md' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <span className="text-lg">{getFolderIcon(scopeFolder.path)}</span>
                        <span className="flex-1 font-medium">{formatFolderName(scopeFolder.path, t, project?.folderDisplayNames)}</span>
                      </button>
                      {scopeFolder.children && (hasSelectedChild || isParentSelected) && (
                        <div className="ml-6 mt-1.5 space-y-1 border-l-2 border-gray-200 pl-4">
                          {scopeFolder.children.map((child) => (
                            <button
                              key={child.path}
                              type="button"
                              onClick={() => setSelectedFolder(child.path)}
                              className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-all duration-200 flex items-center gap-2 ${
                                selectedFolder === child.path
                                  ? 'bg-green-power-100 text-green-power-700 font-semibold'
                                  : 'text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              <span>{formatFolderName(child.path, t, project?.folderDisplayNames)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {project?.customFolders && project.customFolders.length > 0 && (
                  <div className="border-t border-gray-200 pt-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{t('files.customerFolders')}</p>
                    <div className="space-y-1">
                      {project.customFolders.map((path) => (
                        <button
                          key={path}
                          type="button"
                          onClick={() => setSelectedFolder(path)}
                          className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-all duration-200 flex items-center gap-2 ${
                            selectedFolder === path
                              ? 'bg-amber-100 text-amber-800 font-semibold'
                              : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <span className="text-sm">{getFolderIcon(path)}</span>
                          <span className="flex-1 truncate">{project?.folderDisplayNames?.[path] ?? getCustomFolderDisplayName(path)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-9 space-y-6">
            {/* Upload */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-green-power-50 to-green-power-100 px-6 py-4 border-b border-green-power-200 flex items-center gap-3">
                <img src="/logo.png" alt="" className="w-10 h-10 object-contain flex-shrink-0" aria-hidden />
                <div>
                  <h3 className="text-base font-bold text-gray-900 mb-1">{t('files.uploadFiles')}</h3>
                  <p className="text-xs text-gray-600">{formatFolderName(selectedFolder, t, project?.folderDisplayNames)}</p>
                </div>
              </div>
              <div className="p-6">
                {uploadError && (
                  <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 text-sm mb-4 rounded-r-lg">
                    {uploadError}
                  </div>
                )}
                {uploadSuccess && successFolder === selectedFolder && (
                  <div className="bg-green-50 border-l-4 border-green-400 text-green-700 px-4 py-3 text-sm mb-4 rounded-r-lg">
                    {uploadSuccess}
                  </div>
                )}
                {isCustomerUploadsFolder(selectedFolder) ? (
                  <div className="border-2 border-dashed border-amber-300 rounded-lg p-8 text-center bg-amber-50">
                    <p className="text-sm text-amber-800 font-medium">{t('files.customerUploadsNoAdminUpload')}</p>
                  </div>
                ) : (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const fl = Array.from(e.target.files || []);
                        if (fl.length === 0) return;
                        const tooBig = fl.find((f) => f.size > MAX_FILE_SIZE_BYTES);
                        if (tooBig) {
                          setUploadError(t('files.fileSizeTooLarge'));
                          if (fileInputRef.current) fileInputRef.current.value = '';
                          return;
                        }
                        setSelectedFiles(fl);
                        setSelectedFile(fl[0]);
                        setShowUploadPreview(true);
                        setUploadError('');
                      }}
                    />
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
                      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDragOver(false);
                        const fl = Array.from(e.dataTransfer.files || []);
                        if (fl.length === 0) return;
                        const tooBig = fl.find((f) => f.size > MAX_FILE_SIZE_BYTES);
                        if (tooBig) {
                          setUploadError(t('files.fileSizeTooLarge'));
                          return;
                        }
                        setSelectedFiles(fl);
                        setSelectedFile(fl[0]);
                        setShowUploadPreview(true);
                        setUploadError('');
                      }}
                      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                        dragOver ? 'border-green-power-500 bg-green-power-50' : 'border-gray-300 hover:border-green-power-400 hover:bg-green-power-50/30'
                      }`}
                    >
                      <p className="text-sm text-gray-600">{t('files.clickToSelectFiles')}</p>
                      <p className="text-xs text-gray-500 mt-1">{t('files.fileTypesHint')}</p>
                    </div>
                    {uploading && (
                      <div className="mt-4">
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-green-power-500 transition-all" style={{ width: `${uploadProgress}%` }} />
                        </div>
                        <p className="text-xs text-gray-600 mt-2">{uploadingFileName}</p>
                      </div>
                    )}
                    {selectedFiles.length > 0 && !uploading && (
                      <div className="mt-4 flex flex-wrap gap-2 items-center">
                        <span className="text-sm font-medium text-gray-700">{t('files.selectedFilesCount', { count: selectedFiles.length })}</span>
                        <button
                          type="button"
                          onClick={() => setShowUploadPreview(true)}
                          className="px-3 py-1.5 bg-green-power-600 text-white text-sm rounded-lg hover:bg-green-power-700"
                        >
                          {t('common.upload')}
                        </button>
                        <button type="button" onClick={clearSelectedFiles} className="text-sm text-gray-600 hover:text-red-600">
                          {t('files.clear')}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Files list */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-base font-bold text-gray-900">{t('files.filesListTitle')}</h3>
              </div>
              <div className="p-4">
                {files.length === 0 ? (
                  <p className="text-sm text-gray-500 py-8 text-center">{t('files.noFilesYetList')}</p>
                ) : (
                  <>
                    <ul className="divide-y divide-gray-200">
                      {paginatedFiles.map((file) => (
                        <li key={file.cloudinaryPublicId} className="py-3 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xl">
                              {file.fileType === 'pdf' ? '📄' : file.fileType === 'image' ? '🖼️' : '📎'}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{file.fileName}</p>
                              {file.uploadedAt && (
                                <p className="text-xs text-gray-500">
                                  {file.uploadedAt.toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => setViewerFile(file)}
                              className="text-sm text-green-power-600 hover:underline"
                            >
                              {t('files.open')}
                            </button>
                            {!isCustomerUploadsFolder(selectedFolder) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteFileData({
                                    folderPath: selectedFolder,
                                    publicId: file.cloudinaryPublicId,
                                    fileName: file.fileName,
                                  });
                                  setShowDeleteConfirm(true);
                                }}
                                disabled={deleting === file.cloudinaryPublicId}
                                className="text-sm text-red-600 hover:underline disabled:opacity-50"
                              >
                                {deleting === file.cloudinaryPublicId ? t('files.deleting') : t('files.delete')}
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      totalItems={files.length}
                      itemsPerPage={itemsPerPage}
                      onPageChange={setCurrentPage}
                      onItemsPerPageChange={(n) => {
                        setItemsPerPage(n);
                        setCurrentPage(1);
                      }}
                    />
                  </>
                )}
              </div>
            </div>

            {/* Customer messages in this folder */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                <h3 className="text-base font-bold text-gray-900">{t('files.customerMessages.title')}</h3>
                <p className="text-xs text-gray-600">{t('files.customerMessages.subtitle', { count: customerMessagesList.length })}</p>
              </div>
              <div className="p-4">
                {customerMessagesList.length === 0 ? (
                  <p className="text-sm text-gray-500 py-6 text-center">{t('files.customerMessages.noMessages')}</p>
                ) : (
                  <ul className="divide-y divide-gray-200 space-y-0">
                    {customerMessagesList.map((msg) => (
                      <li key={msg.id} className="py-3 first:pt-0">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            {msg.fileName && (
                              <p className="text-xs font-semibold text-blue-800 mb-1">
                                ✅ {t('files.customerMessages.commentedOnFile')}: {msg.fileName}
                              </p>
                            )}
                            {msg.subject && (
                              <p className="text-xs text-gray-700 mb-1">{t('files.customerMessages.subject')}: {msg.subject}</p>
                            )}
                            <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">{msg.message}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {customersMap.get(msg.customerId) || msg.customerId}
                              {msg.createdAt && ` · ${msg.createdAt.toLocaleString()}`}
                            </p>
                            {msg.status === 'resolved' ? (
                              <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                ✅ {t('files.customerMessages.resolved')}
                              </span>
                            ) : msg.status === 'read' ? (
                              <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                ✅ {t('files.customerMessages.read')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                ✅ {t('files.customerMessages.new')}
                              </span>
                            )}
                            {msg.status !== 'resolved' && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {msg.status === 'unread' && (
                                  <button
                                    type="button"
                                    onClick={() => handleMarkMessageAsRead(msg.id)}
                                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                                  >
                                    {t('files.customerMessages.markAsRead')}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleResolveMessage(msg.id)}
                                  disabled={resolvingMessageId === msg.id}
                                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-power-600 text-white hover:bg-green-power-700 disabled:opacity-50"
                                >
                                  {resolvingMessageId === msg.id ? t('common.loading') : t('files.customerMessages.resolve')}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <FileUploadPreviewModal
        isOpen={showUploadPreview}
        file={selectedFile}
        folderPath={selectedFolder}
        onConfirm={handleUploadConfirm}
        onCancel={clearSelectedFiles}
      />
      {/* File viewer modal (in-portal, no new tab) */}
      {viewerFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setViewerFile(null)}
        >
          <button
            type="button"
            onClick={() => setViewerFile(null)}
            className="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-lg transition-colors z-10"
            aria-label={t('common.close')}
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="relative max-w-[95vw] max-h-[90vh] w-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {viewerFile.fileType === 'image' ? (
              <img
                src={viewerFile.cloudinaryUrl}
                alt={viewerFile.fileName}
                className="max-h-[90vh] w-auto object-contain rounded-lg"
              />
            ) : (
              <iframe
                src={viewerFile.cloudinaryUrl}
                title={viewerFile.fileName}
                className="w-full max-w-4xl h-[90vh] rounded-lg bg-white"
              />
            )}
            <p className="absolute bottom-0 left-0 right-0 py-2 text-center text-white text-sm bg-black/50 rounded-b-lg">
              {viewerFile.fileName}
            </p>
          </div>
        </div>
      )}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title={t('files.deleteFile')}
        message={deleteFileData ? t('files.deleteFileModalMessage', { fileName: deleteFileData.fileName }) : ''}
        confirmText={t('common.delete')}
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setDeleteFileData(null);
        }}
        type="danger"
      />
      {alertData && (
        <AlertModal
          isOpen={showAlert}
          title={alertData.title}
          message={alertData.message}
          type={alertData.type}
          onClose={() => {
            setShowAlert(false);
            setAlertData(null);
          }}
        />
      )}
    </div>
  );
}
