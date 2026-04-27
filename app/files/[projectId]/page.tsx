'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import JSZip from 'jszip';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
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
  isSignableDocumentsFolderPath,
  isValidFolderPath,
  isValidFolderPathForProject,
  getScopeFolderForProject,
  getDefaultFilesFolderPath,
  type Folder,
} from '@/lib/folderStructure';
import { useAuth } from '@/contexts/AuthContext';
import { uploadFile, deleteFile } from '@/lib/fileStorage';
import ConfirmationModal from '@/components/ConfirmationModal';
import AlertModal from '@/components/AlertModal';
import FileUploadPreviewModal from '@/components/FileUploadPreviewModal';
import PdfCanvasViewer from '@/components/PdfCanvasViewer';
import Pagination from '@/components/Pagination';
import { isReportFile, addWorkingDays } from '@/lib/reportApproval';
import { deleteFileRelatedData } from '@/lib/cascadeDelete';
import { groupMessagesByThread, sortThreadsNewestFirst } from '@/lib/customerMessageThreads';
import { fileUrlFromFirestoreDoc, fileKeyFromFirestoreDoc } from '@/lib/fileDocFields';
interface Project {
  id: string;
  name: string;
  year?: number;
  customerId?: string;
  folderDisplayNames?: Record<string, string>;
  customFolders?: string[];
  dynamicSubfolders?: Record<string, string[]>;
}

interface FileMetadata {
  fileName: string;
  fileUrl: string;
  fileKey: string;
  fileType: 'pdf' | 'image' | 'file';
  folderPath: string;
  uploadedAt: Date | null;
  customerDownloadCount?: number;
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
  authorType?: string;
  parentMessageId?: string;
  threadRootId?: string;
  messageType?: string;
}

interface ProjectEmailItem {
  id: string;
  direction: 'incoming' | 'outgoing';
  to: string[];
  from: string;
  subject: string;
  snippet: string;
  createdAt: Date | null;
  bodyText?: string;
  bodyHtml?: string;
}

interface ReportSignatureItem {
  id: string;
  filePath: string;
  fileName: string;
  customerId: string | null;
  signatoryName: string;
  signRole: 'client' | 'representative' | null;
  placeText: string;
  addressText: string;
  gps?: { lat: number; lng: number; accuracy?: number | null } | null;
  createdAt: Date | null;
  signatureDataUrl?: string;
}

/** Same fileKey can be reused after delete/re-upload; ignore signatures older than the file row. */
function signatureAppliesToFile(sig: ReportSignatureItem | undefined, file: FileMetadata): boolean {
  if (!sig) return false;
  if (!file.uploadedAt || !sig.createdAt) return true;
  return sig.createdAt.getTime() >= file.uploadedAt.getTime() - 5000;
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
    Signature: { gradient: 'from-amber-500 to-orange-500', icon: '✍️' },
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
  if (path === 'Signature' || path.startsWith('Signature/')) return '✍️';
  if (path.startsWith('11_')) return '✍️';
  if (path.startsWith('12_')) return '✍️';
  if (path.startsWith('13_')) return '✍️';
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
  const [adminReplyDrafts, setAdminReplyDrafts] = useState<Record<string, string>>({});
  const [submittingAdminReplyThreadId, setSubmittingAdminReplyThreadId] = useState<string | null>(null);
  /** Which customer-message threads are expanded (accordion). */
  const [expandedCustomerThreads, setExpandedCustomerThreads] = useState<Set<string>>(new Set());
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
  const [downloading, setDownloading] = useState<string | null>(null);
  const [selectedDownloadKeys, setSelectedDownloadKeys] = useState<Set<string>>(new Set());
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
  const [projectEmails, setProjectEmails] = useState<ProjectEmailItem[]>([]);
  const [projectEmailsLoading, setProjectEmailsLoading] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<ProjectEmailItem | null>(null);
  const [reportSignatures, setReportSignatures] = useState<Record<string, ReportSignatureItem>>({});
  const [selectedSignature, setSelectedSignature] = useState<ReportSignatureItem | null>(null);

  const stepViewerFile = useCallback(
    (delta: -1 | 1) => {
      setViewerFile((current) => {
        if (!current) return current;
        const idx = files.findIndex((f) => f.fileKey === current.fileKey);
        if (idx < 0) return current;
        const nextIdx = idx + delta;
        if (nextIdx < 0 || nextIdx >= files.length) return current;
        return files[nextIdx];
      });
    },
    [files]
  );

  useEffect(() => {
    if (!viewerFile) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepViewerFile(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepViewerFile(1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setViewerFile(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewerFile, stepViewerFile]);

  /** Mark file as viewed by admin so project unread counts drop. */
  useEffect(() => {
    if (!viewerFile || !db || !projectId || !project?.customerId) return;
    const docId = viewerFile.fileKey.replace(/\//g, '__');
    setDoc(
      doc(db, 'adminFileReadStatus', docId),
      {
        adminRead: true,
        filePath: viewerFile.fileKey,
        projectId,
        customerId: project.customerId,
        readAt: serverTimestamp(),
      },
      { merge: true }
    ).catch((e) => console.error('adminFileReadStatus', e));
  }, [viewerFile, projectId, project?.customerId]);

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
    if (isValidFolderPathForProject(folder, project)) {
      setSelectedFolder(folder);
    }
  }, [searchParams, project]);

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
            fileUrl: fileUrlFromFirestoreDoc(data as Record<string, unknown>),
            fileKey: fileKeyFromFirestoreDoc(data as Record<string, unknown>),
            fileType: deriveFileType((data.fileName as string) || ''),
            folderPath: selectedFolder,
            uploadedAt: data.uploadedAt?.toDate ? data.uploadedAt.toDate() : null,
            customerDownloadCount:
              typeof data.customerDownloadCount === 'number' && Number.isFinite(data.customerDownloadCount)
                ? Math.max(0, Math.floor(data.customerDownloadCount))
                : 0,
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
          authorType: (data.authorType as string) || 'customer',
          parentMessageId: (data.parentMessageId as string) || undefined,
          threadRootId: (data.threadRootId as string) || undefined,
          messageType: (data.messageType as string) || undefined,
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

  // Listen to logged emails for this project when in E-Mails folder (any subfolder)
  useEffect(() => {
    if (!db || !projectId) return;
    const scope = getScopeFolderForProject(selectedFolder, project?.dynamicSubfolders);
    if (!scope || scope.path !== '04_Emails') {
      setProjectEmails([]);
      return;
    }
    setProjectEmailsLoading(true);
    const q = query(
      collection(db, 'projectEmails'),
      where('projectId', '==', projectId),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ProjectEmailItem[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            direction: (data.direction as 'incoming' | 'outgoing') || 'outgoing',
            to: Array.isArray(data.to)
              ? data.to.filter((v: unknown): v is string => typeof v === 'string')
              : [],
            from: typeof data.from === 'string' ? data.from : '',
            subject: typeof data.subject === 'string' ? data.subject : '',
            snippet: typeof data.snippet === 'string' ? data.snippet : '',
            createdAt: data.createdAt?.toDate?.() ?? null,
            bodyText: typeof (data.bodyText as unknown) === 'string' ? (data.bodyText as string) : undefined,
            bodyHtml: typeof (data.bodyHtml as unknown) === 'string' ? (data.bodyHtml as string) : undefined,
          };
        });
        setProjectEmails(list);
        setProjectEmailsLoading(false);
      },
      (err) => {
        console.error('Error loading project emails:', err);
        setProjectEmails([]);
        setProjectEmailsLoading(false);
      }
    );
    return () => unsub();
  }, [db, projectId, selectedFolder, project?.dynamicSubfolders]);

  /** Load via Admin API so Firestore client rules do not need reportSignatures read access. */
  useEffect(() => {
    if (!projectId) return;
    if (!isSignableDocumentsFolderPath(selectedFolder)) {
      setReportSignatures({});
      return;
    }
    let cancelled = false;
    const load = async () => {
      if (!auth?.currentUser) {
        setReportSignatures({});
        return;
      }
      try {
        const token = await auth.currentUser.getIdToken();
        const qs = new URLSearchParams({ projectId, folderPath: selectedFolder });
        const res = await fetch(`/api/report-signatures/list?${qs.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          console.error('Error loading report signatures:', res.status);
          if (!cancelled) setReportSignatures({});
          return;
        }
        const data = (await res.json()) as { items?: unknown[] };
        const rows = Array.isArray(data.items) ? data.items : [];
        if (cancelled) return;
        const map: Record<string, ReportSignatureItem> = {};
        for (const row of rows) {
          const r = row as Record<string, unknown>;
          const sr = r.signRole;
          const signRoleParsed =
            sr === 'client' || sr === 'representative' ? sr : null;
          const item: ReportSignatureItem = {
            id: typeof r.id === 'string' ? r.id : '',
            filePath: typeof r.filePath === 'string' ? r.filePath : '',
            fileName: typeof r.fileName === 'string' ? r.fileName : '',
            customerId: typeof r.customerId === 'string' ? r.customerId : null,
            signatoryName: typeof r.signatoryName === 'string' ? r.signatoryName : '',
            signRole: signRoleParsed,
            placeText: typeof r.placeText === 'string' ? r.placeText : '',
            addressText: typeof r.addressText === 'string' ? r.addressText : '',
            gps:
              r.gps && typeof r.gps === 'object'
                ? {
                    lat: typeof (r.gps as { lat?: number }).lat === 'number' ? (r.gps as { lat: number }).lat : 0,
                    lng: typeof (r.gps as { lng?: number }).lng === 'number' ? (r.gps as { lng: number }).lng : 0,
                    accuracy:
                      typeof (r.gps as { accuracy?: number }).accuracy === 'number'
                        ? (r.gps as { accuracy: number }).accuracy
                        : null,
                  }
                : null,
            createdAt:
              typeof r.createdAt === 'string' && r.createdAt
                ? new Date(r.createdAt)
                : null,
            signatureDataUrl:
              typeof r.signatureDataUrl === 'string' && r.signatureDataUrl.startsWith('data:image/')
                ? r.signatureDataUrl
                : undefined,
          };
          if (item.filePath) {
            const prev = map[item.filePath];
            const prevT = prev?.createdAt?.getTime() ?? 0;
            const nextT = item.createdAt?.getTime() ?? 0;
            if (!prev || nextT >= prevT) {
              map[item.filePath] = item;
            }
          }
        }
        setReportSignatures(map);
      } catch (err) {
        console.error('Error loading report signatures:', err);
        if (!cancelled) setReportSignatures({});
      }
    };
    void load();
    const interval = window.setInterval(load, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [projectId, selectedFolder, currentUser?.uid]);

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

  async function handleAdminReply(thread: CustomerMessageItem[]) {
    if (!db || !currentUser?.uid || thread.length === 0) return;
    const root = thread[0];
    const last = thread[thread.length - 1];
    const rootId = root.id;
    const text = (adminReplyDrafts[rootId] || '').trim();
    if (!text) return;
    setSubmittingAdminReplyThreadId(rootId);
    try {
      await addDoc(collection(db, 'customerMessages'), {
        projectId,
        folderPath: selectedFolder,
        customerId: root.customerId,
        message: text,
        authorType: 'admin',
        parentMessageId: last.id,
        threadRootId: root.threadRootId || root.id,
        fileName: root.fileName,
        filePath: root.filePath,
        messageType: 'admin_reply',
        status: 'read',
        readAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      setAdminReplyDrafts((prev) => ({ ...prev, [rootId]: '' }));
      setAlertData({
        title: t('files.customerMessages.replySentTitle'),
        message: t('files.customerMessages.replySentMessage'),
        type: 'success',
      });
      setShowAlert(true);
    } catch (err) {
      console.error('Error sending admin reply:', err);
      setAlertData({
        title: t('common.status'),
        message: t('files.customerMessages.replyFailed'),
        type: 'error',
      });
      setShowAlert(true);
    } finally {
      setSubmittingAdminReplyThreadId(null);
    }
  }

  const customerMessageThreads = useMemo(
    () => sortThreadsNewestFirst(groupMessagesByThread(customerMessagesList)),
    [customerMessagesList]
  );

  function toggleCustomerThread(rootId: string) {
    setExpandedCustomerThreads((prev) => {
      const next = new Set(prev);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
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
    const validPath = isValidFolderPathForProject(selectedFolder, project);
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
          fileUrl: result.secure_url,
          fileKey: result.public_id,
          storageProvider: 'vps' as const,
          uploadedAt: serverTimestamp(),
        };
        if (result.storagePath) docData.storagePath = result.storagePath;
        if (isReportFile(selectedFolder) && file.name.toLowerCase().endsWith('.pdf')) {
          docData.autoApproveDate = Timestamp.fromDate(addWorkingDays(new Date(), 5));
        }
        await addDoc(filesRef, docData);
        // Admin uploaded this file, so it should not appear as "unread" for admin.
        // Keep customer unread flow unchanged (customer read state is tracked separately in `fileReadStatus`).
        if (project?.customerId) {
          const adminReadDocId = result.public_id.replace(/\//g, '__');
          await setDoc(
            doc(db, 'adminFileReadStatus', adminReadDocId),
            {
              adminRead: true,
              filePath: result.public_id,
              projectId,
              customerId: project.customerId,
              readAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
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
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code?: string }).code === 'DUPLICATE_FILE_NAME'
      ) {
        const fn =
          'fileName' in err && typeof (err as { fileName?: string }).fileName === 'string'
            ? (err as { fileName: string }).fileName
            : '';
        setUploadError(t('files.duplicateFileName', { name: fn }));
      } else {
        setUploadError(err instanceof Error ? err.message : t('files.uploadFailed'));
      }
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
      const snapshot = await getDocs(
        query(filesRef, where('fileKey', '==', publicId))
      );
      const hintName = snapshot.docs[0]?.data()?.fileName as string | undefined;
      const deleted = await deleteFile(publicId, hintName);
      if (!deleted) {
        setAlertData({ title: t('files.deleteFailedTitle'), message: t('files.deleteFailedMessage'), type: 'error' });
        setShowAlert(true);
        return;
      }

      // Storage is already deleted successfully; now delete Firebase metadata.
      await Promise.all(
        snapshot.docs.map((d) => deleteDoc(doc(dbInstance, 'files', 'projects', projectId, folderPathId, 'files', d.id)))
      );

      // Remove related data so audit logs, tracking, etc. stay in sync.
      await deleteFileRelatedData(dbInstance, projectId, publicId);
    } catch (err) {
      setAlertData({ title: t('messages.error.generic'), message: err instanceof Error ? err.message : t('files.fileDeleteFailed'), type: 'error' });
      setShowAlert(true);
    } finally {
      setDeleting(null);
      setShowDeleteConfirm(false);
      setDeleteFileData(null);
    }
  }

  function getDownloadUrlForFile(file: FileMetadata): string {
    const lower = file.fileName.toLowerCase();
    let url = file.fileUrl;
    if (lower.endsWith('.pdf') && url.includes('/image/upload/')) {
      url = url.replace('/image/upload/', '/raw/upload/');
    }
    if (lower.endsWith('.pdf') && !url.includes('fl_attachment')) {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}fl_attachment`;
    }
    return url;
  }

  async function fetchFileBlobForZip(file: FileMetadata): Promise<Blob> {
    const lower = file.fileName.toLowerCase();
    const mimeType = lower.endsWith('.pdf')
      ? 'application/pdf'
      : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
      ? 'image/jpeg'
      : lower.endsWith('.png')
      ? 'image/png'
      : 'application/octet-stream';

    const primaryUrl = getDownloadUrlForFile(file);
    const tryFetch = async (url: string): Promise<Blob | null> => {
      try {
        const proxyUrl = `/api/storage/proxy-download?url=${encodeURIComponent(url)}&fileName=${encodeURIComponent(file.fileName || 'download')}`;
        const response = await fetch(proxyUrl, {
          method: 'GET',
          headers: { Accept: mimeType },
          redirect: 'follow',
        });
        if (!response.ok) return null;
        const blob = await response.blob();
        return blob.type && blob.type !== 'application/octet-stream'
          ? blob
          : new Blob([blob], { type: mimeType });
      } catch {
        return null;
      }
    };

    const primaryBlob = await tryFetch(primaryUrl);
    if (primaryBlob) return primaryBlob;

    // PDF fallback: when `/raw/upload/` fails, retry original URL with attachment flag.
    if (lower.endsWith('.pdf') && primaryUrl.includes('/raw/upload/')) {
      const originalBase = file.fileUrl;
      const fallbackUrl = `${originalBase}${originalBase.includes('?') ? '&' : '?'}fl_attachment`;
      const fallbackBlob = await tryFetch(fallbackUrl);
      if (fallbackBlob) return fallbackBlob;
    }

    throw new Error(`zip_fetch_failed_${file.fileName}`);
  }

  async function triggerBrowserDownload(file: FileMetadata): Promise<void> {
    const lower = file.fileName.toLowerCase();
    const mimeType = lower.endsWith('.pdf')
      ? 'application/pdf'
      : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
      ? 'image/jpeg'
      : lower.endsWith('.png')
      ? 'image/png'
      : 'application/octet-stream';
    const downloadUrl = getDownloadUrlForFile(file);
    try {
      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: { Accept: mimeType },
        redirect: 'follow',
      });
      if (!response.ok) throw new Error(`download_failed_${response.status}`);
      const blob = await response.blob();
      const typedBlob =
        blob.type && blob.type !== 'application/octet-stream' ? blob : new Blob([blob], { type: mimeType });
      const url = URL.createObjectURL(typedBlob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.fileName || 'download';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => {
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      }, 100);
    } catch {
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = file.fileName || 'download';
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => document.body.removeChild(anchor), 100);
    }
  }

  async function handleDownloadFile(file: FileMetadata) {
    if (downloading === file.fileKey) return;
    setDownloading(file.fileKey);
    try {
      await triggerBrowserDownload(file);
    } catch (e) {
      setAlertData({
        title: t('messages.error.generic'),
        message: e instanceof Error ? e.message : t('messages.error.generic'),
        type: 'error',
      });
      setShowAlert(true);
    } finally {
      setDownloading(null);
    }
  }

  async function handleDownloadSelected() {
    if (selectedDownloadKeys.size === 0) return;
    const targets = files.filter((f) => selectedDownloadKeys.has(f.fileKey));
    if (targets.length === 0) return;
    if (downloading !== null) return;

    const bulkDownloadKey = '__bulk_zip__';
    setDownloading(bulkDownloadKey);
    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();
      const failedFiles: string[] = [];

      for (const file of targets) {
        try {
          const blob = await fetchFileBlobForZip(file);

          const originalName = (file.fileName || 'file').trim();
          const cleanedBase = originalName.replace(/[\\/:*?"<>|]+/g, '_') || 'file';
          let entryName = cleanedBase;
          let n = 2;
          while (usedNames.has(entryName)) {
            const dotIdx = cleanedBase.lastIndexOf('.');
            if (dotIdx > 0) {
              entryName = `${cleanedBase.slice(0, dotIdx)} (${n})${cleanedBase.slice(dotIdx)}`;
            } else {
              entryName = `${cleanedBase} (${n})`;
            }
            n += 1;
          }
          usedNames.add(entryName);
          zip.file(entryName, blob);
        } catch {
          failedFiles.push(file.fileName);
        }
      }

      if (Object.keys(zip.files).length === 0) {
        throw new Error(t('messages.error.generic'));
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const folderLabel = (selectedFolder.split('/').pop() || 'files').replace(/[^a-zA-Z0-9_-]+/g, '_');
      const projectLabel = (project?.name || 'project').replace(/[^a-zA-Z0-9_-]+/g, '_');
      const zipName = `${projectLabel}-${folderLabel}.zip`;

      const url = URL.createObjectURL(zipBlob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = zipName;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => {
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      }, 100);

      if (failedFiles.length > 0) {
        setAlertData({
          title: t('messages.error.generic'),
          message:
            failedFiles.length <= 3
              ? `Could not add to ZIP: ${failedFiles.join(', ')}`
              : `${failedFiles.length} file(s) could not be added to ZIP.`,
          type: 'warning',
        });
        setShowAlert(true);
      }
    } catch (e) {
      setAlertData({
        title: t('messages.error.generic'),
        message: e instanceof Error ? e.message : t('messages.error.generic'),
        type: 'error',
      });
      setShowAlert(true);
    } finally {
      setDownloading(null);
    }
  }

  const paginatedFiles = files.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.max(1, Math.ceil(files.length / itemsPerPage));
  const scopeFolder = getScopeFolderForProject(selectedFolder, project?.dynamicSubfolders);
  const isEmailsFolder = scopeFolder?.path === '04_Emails';
  const emailFilterDirection: 'incoming' | 'outgoing' | null =
    selectedFolder === '04_Emails/Incoming'
      ? 'incoming'
      : selectedFolder === '04_Emails/Outgoing'
      ? 'outgoing'
      : null;

  // During loading: no AdminLayout so we don’t show a second header/sidebar (avoids duplicate admin bar during transition)
  if (loading) {
    return (
      <div className="min-h-[100dvh] min-w-0 flex flex-col items-center justify-center gap-4 bg-gray-50">
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
      <div className="min-h-[100dvh] min-w-0 flex flex-col items-center justify-center gap-4 bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-green-power-500 border-t-transparent" />
        <p className="text-sm text-gray-500">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 min-w-0 max-w-full">
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
              <div className="p-4 max-h-[calc(100dvh-200px)] overflow-y-auto space-y-4">
                {scopeFolder && (() => {
                  const isEmailsRoot = scopeFolder.path === '04_Emails';
                  const emailsChildren = isEmailsRoot
                    ? [
                        { name: 'Received', path: '04_Emails/Incoming' },
                        { name: 'Sent', path: '04_Emails/Outgoing' },
                      ]
                    : scopeFolder.children;
                  const hasSelectedChild = emailsChildren?.some((c) => selectedFolder === c.path);
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
                      {emailsChildren && (hasSelectedChild || isParentSelected) && (
                        <div className="ml-6 mt-1.5 space-y-1 border-l-2 border-gray-200 pl-4">
                          {emailsChildren.map((child) => (
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
                              <span>
                                {isEmailsRoot
                                  ? child.name === 'Received'
                                    ? 'Received'
                                    : 'Sent'
                                  : formatFolderName(child.path, t, project?.folderDisplayNames)}
                              </span>
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
            {!isEmailsFolder && (
              <>
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
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDragOver(true);
                          }}
                          onDragLeave={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDragOver(false);
                          }}
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
                            dragOver
                              ? 'border-green-power-500 bg-green-power-50'
                              : 'border-gray-300 hover:border-green-power-400 hover:bg-green-power-50/30'
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
                            <span className="text-sm font-medium text-gray-700">
                              {t('files.selectedFilesCount', { count: selectedFiles.length })}
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowUploadPreview(true)}
                              className="px-3 py-1.5 bg-green-power-600 text-white text-sm rounded-lg hover:bg-green-power-700"
                            >
                              {t('common.upload')}
                            </button>
                            <button
                              type="button"
                              onClick={clearSelectedFiles}
                              className="text-sm text-gray-600 hover:text-red-600"
                            >
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
                  <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
                    <h3 className="text-base font-bold text-gray-900">{t('files.filesListTitle')}</h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const next = new Set(selectedDownloadKeys);
                          if (next.size === paginatedFiles.length && paginatedFiles.length > 0) {
                            setSelectedDownloadKeys(new Set());
                          } else {
                            for (const f of paginatedFiles) next.add(f.fileKey);
                            setSelectedDownloadKeys(next);
                          }
                        }}
                        className="text-xs text-gray-600 hover:text-gray-900"
                      >
                        {selectedDownloadKeys.size === paginatedFiles.length && paginatedFiles.length > 0
                          ? t('common.clear')
                          : 'Select all'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDownloadSelected()}
                        disabled={selectedDownloadKeys.size === 0 || downloading !== null}
                        className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {t('common.download')} ({selectedDownloadKeys.size})
                      </button>
                    </div>
                  </div>
                  <div className="p-4">
                    {files.length === 0 ? (
                      <p className="text-sm text-gray-500 py-8 text-center">{t('files.noFilesYetList')}</p>
                    ) : (
                      <>
                        <ul className="divide-y divide-gray-200">
                          {paginatedFiles.map((file) => {
                            const sigCandidate = reportSignatures[file.fileKey];
                            const sig = signatureAppliesToFile(sigCandidate, file) ? sigCandidate : undefined;
                            return (
                              <li
                                key={file.fileKey}
                                className="py-3 flex items-center justify-between gap-4"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={selectedDownloadKeys.has(file.fileKey)}
                                    onChange={(e) => {
                                      const next = new Set(selectedDownloadKeys);
                                      if (e.target.checked) next.add(file.fileKey);
                                      else next.delete(file.fileKey);
                                      setSelectedDownloadKeys(next);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-4 w-4 rounded border-gray-300 text-green-power-600"
                                  />
                                  <span className="text-xl">
                                    {file.fileType === 'pdf'
                                      ? '📄'
                                      : file.fileType === 'image'
                                      ? '🖼️'
                                      : '📎'}
                                  </span>
                                  <div className="min-w-0">
                                    <button
                                      type="button"
                                      onClick={() => setViewerFile(file)}
                                      className="text-sm font-medium text-gray-900 truncate hover:underline text-left"
                                      title={file.fileName}
                                    >
                                      {file.fileName}
                                    </button>
                                    {file.uploadedAt && (
                                      <p className="text-xs text-gray-500">
                                        {file.uploadedAt.toLocaleDateString()}
                                      </p>
                                    )}
                                    <div className="mt-1">
                                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                        {file.customerDownloadCount ?? 0} {t('common.downloads')}
                                      </span>
                                    </div>
                                    {isSignableDocumentsFolderPath(selectedFolder) && (
                                      <div className="mt-1 flex items-center gap-2">
                                        {sig ? (
                                          <button
                                            type="button"
                                            onClick={() => setSelectedSignature(sig)}
                                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-800 hover:bg-green-200"
                                          >
                                            ✅ {t('files.signatures.signed')}
                                          </button>
                                        ) : (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
                                            {t('files.signatures.notSigned')}
                                          </span>
                                        )}
                                      </div>
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
                                  <button
                                    type="button"
                                    onClick={() => void handleDownloadFile(file)}
                                    disabled={downloading === file.fileKey}
                                    className="text-sm text-blue-600 hover:underline disabled:opacity-50"
                                  >
                                    {downloading === file.fileKey ? t('common.loading') : t('common.download')}
                                  </button>
                                  {!isCustomerUploadsFolder(selectedFolder) && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDeleteFileData({
                                          folderPath: selectedFolder,
                                          publicId: file.fileKey,
                                          fileName: file.fileName,
                                        });
                                        setShowDeleteConfirm(true);
                                      }}
                                      disabled={deleting === file.fileKey}
                                      className="text-sm text-red-600 hover:underline disabled:opacity-50"
                                    >
                                      {deleting === file.fileKey
                                        ? t('files.deleting')
                                        : t('files.delete')}
                                    </button>
                                  )}
                                </div>
                              </li>
                            );
                          })}
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

                {/* Customer messages in this folder — scrollable list + accordion per thread */}
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-6 py-3 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                    <h3 className="text-base font-bold text-gray-900">{t('files.customerMessages.title')}</h3>
                    <p className="text-xs text-gray-600">
                      {t('files.customerMessages.subtitleConversations', { count: customerMessageThreads.length })}
                    </p>
                  </div>
                  <div className="p-3 max-h-[min(70vh,560px)] overflow-y-auto overscroll-contain">
                    {customerMessagesList.length === 0 ? (
                      <p className="text-sm text-gray-500 py-6 text-center">
                        {t('files.customerMessages.noMessages')}
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {customerMessageThreads.map((thread) => {
                          const root = thread[0];
                          const replies = thread.slice(1);
                          const rootId = root.id;
                          const draft = adminReplyDrafts[rootId] || '';
                          const isOpen = expandedCustomerThreads.has(rootId);
                          return (
                            <li
                              key={rootId}
                              className="rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm"
                            >
                              <button
                                type="button"
                                onClick={() => toggleCustomerThread(rootId)}
                                className="w-full flex items-start gap-2 sm:gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                                aria-expanded={isOpen}
                              >
                                <span className="text-gray-500 shrink-0 mt-0.5" aria-hidden>
                                  {isOpen ? (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 9l-7 7-7-7"
                                      />
                                    </svg>
                                  ) : (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 5l7 7-7 7"
                                      />
                                    </svg>
                                  )}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                    {t('files.customerMessages.mainComment')}
                                  </p>
                                  {root.fileName && (
                                    <p className="text-xs font-semibold text-blue-800 truncate mt-0.5">
                                      {t('files.customerMessages.commentedOnFile')}: {root.fileName}
                                    </p>
                                  )}
                                  {root.subject && (
                                    <p className="text-xs text-gray-600 truncate">
                                      {t('files.customerMessages.subject')}: {root.subject}
                                    </p>
                                  )}
                                  <p className="text-sm text-gray-900 line-clamp-2 mt-1">{root.message}</p>
                                  <p className="text-xs text-gray-500 mt-1">
                                    {customersMap.get(root.customerId) || root.customerId}
                                    {root.createdAt && ` · ${root.createdAt.toLocaleString()}`}
                                  </p>
                                  {replies.length > 0 && (
                                    <p className="text-xs text-green-power-700 font-medium mt-1">
                                      {replies.length === 1
                                        ? t('files.customerMessages.replyCountOne')
                                        : t('files.customerMessages.replyCountMany', { count: replies.length })}
                                    </p>
                                  )}
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                  {root.status === 'resolved' ? (
                                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-800">
                                      {t('files.customerMessages.resolved')}
                                    </span>
                                  ) : root.status === 'read' ? (
                                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800">
                                      {t('files.customerMessages.read')}
                                    </span>
                                  ) : (
                                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800">
                                      {t('files.customerMessages.new')}
                                    </span>
                                  )}
                                </div>
                              </button>

                              {isOpen && (
                                <div className="border-t border-gray-200 bg-gray-50/90 px-3 py-3 space-y-3">
                                  <div className="rounded-lg border border-gray-100 bg-white p-3">
                                    <p className="text-xs font-semibold text-gray-700 mb-2">
                                      {t('files.customerMessages.fromCustomer')}
                                    </p>
                                    <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                                      {root.message}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-2">
                                      {customersMap.get(root.customerId) || root.customerId}
                                      {root.createdAt && ` · ${root.createdAt.toLocaleString()}`}
                                    </p>
                                    {root.status !== 'resolved' && (
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        {root.status === 'unread' && (
                                          <button
                                            type="button"
                                            onClick={() => handleMarkMessageAsRead(root.id)}
                                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                                          >
                                            {t('files.customerMessages.markAsRead')}
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => handleResolveMessage(root.id)}
                                          disabled={resolvingMessageId === root.id}
                                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-power-600 text-white hover:bg-green-power-700 disabled:opacity-50"
                                        >
                                          {resolvingMessageId === root.id
                                            ? t('common.loading')
                                            : t('files.customerMessages.resolve')}
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {replies.map((msg) => (
                                    <div
                                      key={msg.id}
                                      className={`rounded-lg border px-3 py-2.5 ${
                                        msg.authorType === 'admin'
                                          ? 'bg-green-power-50/50 border-green-power-200 border-l-4 border-l-green-power-500'
                                          : 'bg-white border-gray-200 border-l-4 border-l-gray-300'
                                      }`}
                                    >
                                      <p className="text-xs font-semibold text-gray-700 mb-1">
                                        {msg.authorType === 'admin'
                                          ? t('files.customerMessages.fromTeam')
                                          : t('files.customerMessages.fromCustomer')}
                                      </p>
                                      <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                                        {msg.message}
                                      </p>
                                      <p className="text-xs text-gray-500 mt-1">
                                        {msg.authorType === 'admin'
                                          ? t('files.customerMessages.adminTeam')
                                          : customersMap.get(msg.customerId) || msg.customerId}
                                        {msg.createdAt && ` · ${msg.createdAt.toLocaleString()}`}
                                      </p>
                                    </div>
                                  ))}

                                  <div className="rounded-lg border border-gray-200 bg-white p-3">
                                    <label
                                      className="block text-xs font-medium text-gray-700 mb-1"
                                      htmlFor={`admin-reply-${rootId}`}
                                    >
                                      {t('files.customerMessages.replyLabel')}
                                    </label>
                                    <textarea
                                      id={`admin-reply-${rootId}`}
                                      value={draft}
                                      onChange={(e) =>
                                        setAdminReplyDrafts((prev) => ({ ...prev, [rootId]: e.target.value }))
                                      }
                                      rows={3}
                                      maxLength={2000}
                                      disabled={submittingAdminReplyThreadId === rootId}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-power-500 resize-y min-h-[4.5rem] max-h-40 bg-white disabled:opacity-50"
                                      placeholder={t('files.customerMessages.replyPlaceholder')}
                                    />
                                    <div className="mt-2 flex items-center justify-between gap-2">
                                      <span className="text-xs text-gray-400">{draft.length}/2000</span>
                                      <button
                                        type="button"
                                        onClick={() => handleAdminReply(thread)}
                                        disabled={!draft.trim() || submittingAdminReplyThreadId === rootId}
                                        className="px-4 py-2 text-xs font-medium rounded-lg bg-green-power-600 text-white hover:bg-green-power-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        {submittingAdminReplyThreadId === rootId
                                          ? t('common.loading')
                                          : t('files.customerMessages.sendReply')}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            )}

            {isEmailsFolder && (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-cyan-50 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">E-Mails</h3>
                    <p className="text-xs text-gray-600">
                      Alle E-Mails zu diesem Projekt (eingehend &amp; ausgehend)
                    </p>
                  </div>
                </div>
                <div className="p-4">
                  {projectEmailsLoading ? (
                    <div className="py-8 flex flex-col items-center justify-center gap-2">
                      <div className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs text-gray-500">E-Mails werden geladen…</p>
                    </div>
                  ) : projectEmails.length === 0 ? (
                    <p className="text-sm text-gray-500 py-8 text-center">
                      Für dieses Projekt wurden noch keine E-Mails protokolliert.
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-200">
                      {projectEmails
                        .filter((email) =>
                          emailFilterDirection ? email.direction === emailFilterDirection : true
                        )
                        .map((email) => (
                        <li key={email.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedEmail(email)}
                            className="w-full text-left px-3 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors"
                          >
                            <span className="mt-1 text-lg" aria-hidden>
                              {email.direction === 'incoming' ? '⬅️' : '➡️'}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-gray-900 truncate">
                                  {email.subject || '(Kein Betreff)'}
                                </p>
                                {email.createdAt && (
                                  <p className="text-xs text-gray-500 whitespace-nowrap">
                                    {email.createdAt.toLocaleString()}
                                  </p>
                                )}
                              </div>
                              <p className="text-xs text-gray-600 truncate">
                                {email.direction === 'incoming' ? 'Von' : 'An'}{' '}
                                {email.direction === 'incoming'
                                  ? email.from || 'Unbekannt'
                                  : email.to.join(', ') || 'Unbekannt'}
                              </p>
                              {email.snippet && (
                                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{email.snippet}</p>
                              )}
                            </div>
                            <span className="ml-2 mt-1 text-gray-400 text-xs" aria-hidden>
                              Vollansicht →
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
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
      {viewerFile && (() => {
        const viewerIndex = files.findIndex((f) => f.fileKey === viewerFile.fileKey);
        const hasPrev = viewerIndex > 0;
        const hasNext = viewerIndex >= 0 && viewerIndex < files.length - 1;
        return (
          <div
            className="fixed inset-0 z-50 admin-modal-host bg-black/90"
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
            {hasPrev && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); stepViewerFile(-1); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-2 text-white hover:bg-white/10 rounded-lg transition-colors z-10"
                aria-label={t('common.previous')}
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            {hasNext && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); stepViewerFile(1); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-white hover:bg-white/10 rounded-lg transition-colors z-10"
                aria-label={t('common.next')}
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
            <div className="relative max-w-[95vw] max-h-[min(90dvh,90svh)] w-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
              {viewerFile.fileType === 'image' ? (
                <img
                  src={viewerFile.fileUrl}
                  alt={viewerFile.fileName}
                  className="max-h-[min(90dvh,90svh)] w-auto object-contain rounded-lg"
                />
              ) : (
                <PdfCanvasViewer
                  pdfUrl={viewerFile.fileUrl}
                  variant="flush"
                  rootClassName="h-[min(90dvh,90svh)] min-h-[320px] w-full max-w-4xl rounded-lg"
                />
              )}
              <p className="absolute bottom-0 left-0 right-0 py-2 text-center text-white text-sm bg-black/50 rounded-b-lg">
                {viewerFile.fileName}
              </p>
            </div>
          </div>
        );
      })()}
      {selectedEmail && (
        <div
          className="fixed inset-0 z-50 admin-modal-host bg-black/80"
          onClick={() => setSelectedEmail(null)}
        >
          <button
            type="button"
            onClick={() => setSelectedEmail(null)}
            className="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-lg transition-colors z-10"
            aria-label={t('common.close')}
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div
            className="relative max-w-4xl w-full max-h-[min(90dvh,90svh)] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <p className="text-xs font-semibold text-gray-500 mb-1">
                {selectedEmail.direction === 'incoming' ? 'Eingehend' : 'Ausgehend'}
              </p>
              <h2 className="text-lg font-bold text-gray-900">
                {selectedEmail.subject || '(Kein Betreff)'}
              </h2>
              <div className="mt-2 text-xs text-gray-600 space-y-0.5">
                <p>
                  <span className="font-semibold">
                    {selectedEmail.direction === 'incoming' ? 'Von: ' : 'An: '}
                  </span>
                  {selectedEmail.direction === 'incoming'
                    ? selectedEmail.from || 'Unbekannt'
                    : selectedEmail.to.join(', ') || 'Unbekannt'}
                </p>
                {selectedEmail.direction === 'incoming' && selectedEmail.to.length > 0 && (
                  <p>
                    <span className="font-semibold">An: </span>
                    {selectedEmail.to.join(', ')}
                  </p>
                )}
                {selectedEmail.direction === 'outgoing' && selectedEmail.from && (
                  <p>
                    <span className="font-semibold">Von: </span>
                    {selectedEmail.from}
                  </p>
                )}
                {selectedEmail.createdAt && (
                  <p>
                    <span className="font-semibold">Datum: </span>
                    {selectedEmail.createdAt.toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 bg-white">
              <pre className="whitespace-pre-wrap break-words text-sm text-gray-900">
                {selectedEmail.bodyText || selectedEmail.snippet || ''}
              </pre>
            </div>
          </div>
        </div>
      )}
      {selectedSignature && (
        <div
          className="fixed inset-0 z-50 admin-modal-host bg-black/80"
          onClick={() => setSelectedSignature(null)}
        >
          <div
            className="relative max-w-xl w-full max-h-[min(90dvh,90svh)] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{t('files.signatures.title')}</h2>
                <p className="text-xs text-gray-600 mt-0.5 break-all">{selectedSignature.fileName}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSignature(null)}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                aria-label={t('common.close')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4 space-y-3 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-700">
                <div>
                  <p className="font-semibold">{t('files.signatures.signRole')}</p>
                  <p>
                    {selectedSignature.signRole === 'representative'
                      ? t('files.signatures.roleRepresentative')
                      : selectedSignature.signRole === 'client'
                        ? t('files.signatures.roleClient')
                        : '—'}
                  </p>
                </div>
                <div>
                  <p className="font-semibold">{t('files.signatures.signatory')}</p>
                  <p>{selectedSignature.signatoryName || '—'}</p>
                </div>
                <div>
                  <p className="font-semibold">{t('files.signatures.customerId')}</p>
                  <p>{selectedSignature.customerId || '—'}</p>
                </div>
                <div>
                  <p className="font-semibold">{t('files.signatures.date')}</p>
                  <p>
                    {selectedSignature.createdAt ? selectedSignature.createdAt.toLocaleString() : '—'}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="font-semibold">{t('files.signatures.place')}</p>
                  <p>{selectedSignature.placeText || '—'}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="font-semibold">{t('files.signatures.location')}</p>
                  {selectedSignature.gps ? (
                    <p>
                      {selectedSignature.gps.lat.toFixed(5)}, {selectedSignature.gps.lng.toFixed(5)}
                      {typeof selectedSignature.gps.accuracy === 'number'
                        ? ` ±${Math.round(selectedSignature.gps.accuracy)}m`
                        : ''}
                    </p>
                  ) : (
                    <p>{selectedSignature.addressText || '—'}</p>
                  )}
                </div>
              </div>
              <p className="text-xs font-semibold text-gray-700 mt-2">{t('files.signatures.signaturePreview')}</p>
              <div className="border border-gray-200 rounded-lg bg-gray-50 flex items-center justify-center min-h-[120px] overflow-hidden">
                {selectedSignature.signatureDataUrl?.startsWith('data:image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedSignature.signatureDataUrl}
                    alt=""
                    className="max-h-[200px] max-w-full object-contain"
                  />
                ) : (
                  <p className="text-xs text-gray-500 px-3 py-4">{t('files.signatures.signatureStoredExternal')}</p>
                )}
              </div>
            </div>
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
