'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { useLanguage } from '@/contexts/LanguageContext';
import { translateFolderPath } from '@/lib/translations';
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
  where,
} from 'firebase/firestore';
import { PROJECT_FOLDER_STRUCTURE, isValidFolderPath } from '@/lib/folderStructure';
import { uploadFile, deleteFile } from '@/lib/cloudinary';
import ConfirmationModal from '@/components/ConfirmationModal';
import AlertModal from '@/components/AlertModal';
import FileUploadPreviewModal from '@/components/FileUploadPreviewModal';
import Pagination from '@/components/Pagination';
import { isReportFile, addWorkingDays } from '@/lib/reportApproval';

interface Project {
  id: string;
  name: string;
  year?: number;
  customerId?: string;
}

interface FileMetadata {
  fileName: string;
  cloudinaryUrl: string;
  cloudinaryPublicId: string;
  fileType: 'pdf' | 'image' | 'file';
  folderPath: string;
  uploadedAt: Date | null;
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
  // Firestore requires odd number of segments for collections
  // Since folder paths can be nested (e.g., "01_Customer_Uploads/Photos"), we need to treat
  // the full path as a single document ID to maintain valid collection references
  // Structure: files(collection) -> projects(doc) -> projectId(collection) -> folderPath(doc) -> files(collection)
  // Use the full folder path as a single document ID (replace / with __ to avoid path separator issues)
  const folderPathId = folderSegments.join('__');
  
  // This creates: files(collection) -> projects(doc) -> projectId(collection) -> folderPathId(doc) -> files(collection)
  // = 5 segments (odd) ✓
  return collection(db, 'files', 'projects', projectId, folderPathId, 'files');
}

function deriveFileType(fileName: string): 'pdf' | 'image' | 'file' {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png')) return 'image';
  return 'file';
}

export default function ProjectFilesPage() {
  return (
    <ProtectedRoute>
      <AdminLayout>
        <ProjectFilesContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function getDefaultFolderPath(): string {
  const visibleFolders = PROJECT_FOLDER_STRUCTURE.filter(
    (folder) => folder.path !== '00_New_Not_Viewed_Yet_' && folder.path !== '01_Customer_Uploads'
  );
  
  for (const folder of visibleFolders) {
    if (folder.children && folder.children.length > 0) {
      return folder.children[0].path;
    }
    return folder.path;
  }
  return visibleFolders[0]?.path ?? '';
}

function getFolderConfig(path: string) {
  const configs: Record<string, { gradient: string; icon: string; description: string }> = {
    '02_Photos': { gradient: 'from-purple-500 to-pink-500', icon: '📷', description: 'Progress photos and visual documentation' },
    '03_Reports': { gradient: 'from-green-500 to-emerald-500', icon: '📄', description: 'Daily and weekly reports from the team' },
    '04_Emails': { gradient: 'from-blue-500 to-cyan-500', icon: '✉️', description: 'Email communications and correspondence' },
    '05_Quotations': { gradient: 'from-yellow-500 to-orange-500', icon: '💰', description: 'Quotes, estimates and pricing documents' },
    '06_Invoices': { gradient: 'from-red-500 to-rose-500', icon: '🧾', description: 'Invoices and billing documents' },
    '07_Delivery_Notes': { gradient: 'from-teal-500 to-cyan-500', icon: '📦', description: 'Delivery notes and material tracking' },
    '08_General': { gradient: 'from-gray-500 to-slate-500', icon: '📋', description: 'General documents and miscellaneous files' },
  };
  return configs[path] || { gradient: 'from-gray-400 to-gray-500', icon: '📁', description: 'Project folder' };
}

function ProjectFilesContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const { t } = useLanguage();
  const fromSource = searchParams.get('from');
  const fromProject = fromSource === 'project';
  const fromDashboard = fromSource === 'dashboard';
  const fromFiles = fromSource === 'files';
  const [project, setProject] = useState<Project | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [uploadingFileName, setUploadingFileName] = useState<string>('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [successFolder, setSuccessFolder] = useState('');
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Modal states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteFileData, setDeleteFileData] = useState<{ folderPath: string; publicId: string; fileName: string } | null>(null);
  const [showAlert, setShowAlert] = useState(false);
  const [alertData, setAlertData] = useState<{ title: string; message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const [showUploadPreview, setShowUploadPreview] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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

  // Check if Cloudinary is configured
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
      if (!cloudName) {
        console.error('❌ Cloudinary is not configured. Please check your environment variables.');
        setUploadError('Cloudinary is not configured. Please check your .env.local file.');
      } else {
        console.log('✅ Cloudinary initialized:', cloudName);
      }
    }
  }, []);

  useEffect(() => {
    if (!projectId || !db) return;
    const dbInstance = db; // Store for TypeScript narrowing

    // Check if this project files page has been visited before in this session
    const storageKey = `files-${projectId}-visited`;
    const hasVisited = typeof window !== 'undefined' && sessionStorage.getItem(storageKey) === 'true';
    
    // Only show loading on first visit
    if (!hasVisited) {
      setLoading(true);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(storageKey, 'true');
      }
    } else {
      // On subsequent visits (navigating back), don't show loading
      // Real-time listener will populate data quickly from cache
      setLoading(false);
    }

    // Real-time listener for project document
    const unsubscribe = onSnapshot(
      doc(dbInstance, 'projects', projectId),
      (projectDoc) => {
        if (projectDoc.exists()) {
          setProject({ id: projectDoc.id, ...projectDoc.data() } as Project);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to project:', error);
        setLoading(false);
      }
    );

    // Cleanup listener on unmount
    return () => {
      unsubscribe();
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !selectedFolder || !db) {
      setFiles([]);
      setLoading(false);
      return;
    }

    // Special handling for excluded folders: "New Not Viewed Yet" and "Customer Uploads"
    // These folders are not accessible from the files screen
    if (selectedFolder === '00_New_Not_Viewed_Yet_' || selectedFolder.startsWith('01_Customer_Uploads')) {
      setFiles([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const segments = getFolderSegments(selectedFolder);
    if (segments.length === 0) {
      setFiles([]);
      setLoading(false);
      return;
    }
    const filesCollection = getProjectFolderRef(projectId, segments);
    const filesQuery = query(filesCollection, orderBy('uploadedAt', 'desc'));
    const unsubscribe = onSnapshot(
      filesQuery,
      (snapshot) => {
        const list: FileMetadata[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const fileName = data.fileName as string;
          return {
            fileName,
            cloudinaryUrl: data.cloudinaryUrl,
            cloudinaryPublicId: data.cloudinaryPublicId,
            fileType: deriveFileType(fileName),
            folderPath: selectedFolder,
            uploadedAt: data.uploadedAt?.toDate ? data.uploadedAt.toDate() : null,
          };
        });
        setFiles(list);
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to files:', error);
        setFiles([]);
        setLoading(false);
      }
    );
    return () => {
      unsubscribe();
    };
  }, [projectId, selectedFolder]);

  useEffect(() => {
    clearSuccessMessage();
  }, [selectedFolder]);

  useEffect(() => {
    return () => {
      clearSuccessMessage();
    };
  }, []);

  useEffect(() => {
    if (!projectId) return;
    if (typeof window === 'undefined') return;
    const storageKey = `files-${projectId}-selected-folder`;
    const storedFolder = sessionStorage.getItem(storageKey);
    // Exclude hidden folders: Customer Uploads and New Not Viewed Yet
    const excludedFolders = ['00_New_Not_Viewed_Yet_', '01_Customer_Uploads'];
    if (storedFolder && isValidFolderPath(storedFolder) && !excludedFolders.includes(storedFolder) && !storedFolder.startsWith('01_Customer_Uploads/')) {
      setSelectedFolder(storedFolder);
      return;
    }
    const defaultFolder = getDefaultFolderPath();
    setSelectedFolder(defaultFolder);
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !selectedFolder) return;
    if (typeof window === 'undefined') return;
    const storageKey = `files-${projectId}-selected-folder`;
    sessionStorage.setItem(storageKey, selectedFolder);
  }, [projectId, selectedFolder]);

  function validateFile(file: File): string | null {
    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    const fileType = file.type.toLowerCase();
    const fileName = file.name.toLowerCase();
    
    // Check MIME type and file extension
    const isValidType = allowedTypes.includes(fileType) || 
                       fileName.endsWith('.pdf') || 
                       fileName.endsWith('.jpg') || 
                       fileName.endsWith('.jpeg') || 
                       fileName.endsWith('.png');
    
    if (!isValidType) {
      return 'Only PDF, JPG, and PNG files are allowed.';
    }

    // Validate file size: Max 5 MB
    const maxSize = 5 * 1024 * 1024; // 5 MB
    if (file.size > maxSize) {
      return 'File size must be less than 5 MB.';
    }

    return null;
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedFolder) {
      if (!file) {
        setUploadError('Please select a file to upload.');
      }
      if (e.target) {
        e.target.value = '';
      }
      return;
    }

    setUploadError('');
    clearSuccessMessage();
    
    if (!isValidFolderPath(selectedFolder)) {
      setUploadError('Invalid folder path. Files can only be uploaded to predefined folders.');
      if (e.target) {
        e.target.value = '';
      }
      return;
    }

    // Prevent admin uploads to Customer Uploads folders
    if (isCustomerUploadsFolder(selectedFolder)) {
      setUploadError('Admin cannot upload files to Customer Uploads folders. These folders are reserved for customer uploads only.');
      if (e.target) {
        e.target.value = '';
      }
      return;
    }

    const validationError = validateFile(file);
    if (validationError) {
      setUploadError(validationError);
      if (e.target) {
        e.target.value = '';
      }
      return;
    }

    // Store file and show preview modal
    setSelectedFile(file);
    setShowUploadPreview(true);
    // Reset input so same file can be selected again
    if (e.target) {
      e.target.value = '';
    }
  }

  async function confirmUpload() {
    if (!selectedFile || !selectedFolder) {
      setShowUploadPreview(false);
      setSelectedFile(null);
      return;
    }

    setShowUploadPreview(false);
    setUploading(true);
    setUploadProgress(0);
    setUploadingFileName(selectedFile.name);
    setUploadError('');
    clearSuccessMessage();
    
    try {
      const fileExtension = selectedFile.name.split('.').pop();
      const fileNameWithoutExt = selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.')) || selectedFile.name;
      const sanitizedBaseName = fileNameWithoutExt
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '');
      const sanitizedFileName = `${sanitizedBaseName}.${fileExtension}`;

      const activeProjectId = project?.id || projectId;
      if (!activeProjectId) {
        setUploadError('Project information is not ready yet. Please wait a moment and try again.');
        setUploading(false);
        setUploadProgress(0);
        setUploadingFileName('');
        setSelectedFile(null);
        return;
      }

      const folderPathFull = `projects/${activeProjectId}/${selectedFolder}`;

      // Upload with progress tracking
      const result = await uploadFile(
        selectedFile,
        folderPathFull,
        sanitizedFileName,
        (progress) => {
          setUploadProgress(progress);
        }
      );

      setUploadError('');

      // Save to Firestore (this happens after upload completes)
      const segments = getFolderSegments(selectedFolder);
      const filesCollection = getProjectFolderRef(activeProjectId, segments);
      const docId = result.public_id.split('/').pop() || result.public_id;
      await setDoc(doc(filesCollection, docId), {
        fileName: sanitizedFileName,
        cloudinaryPublicId: result.public_id,
        cloudinaryUrl: result.secure_url,
        uploadedAt: serverTimestamp(),
        uploadedBy: 'admin',
      });

      // If this is a report file (PDF in 03_Reports folder), create reportApprovals document
      const isReport = isReportFile(selectedFolder) && sanitizedFileName.toLowerCase().endsWith('.pdf');
      if (isReport && project?.customerId && db) {
        const dbInstance = db; // Store for TypeScript narrowing
        try {
          const uploadedAt = Timestamp.now();
          const autoApproveDate = Timestamp.fromDate(addWorkingDays(uploadedAt.toDate(), 5));
          
          await addDoc(collection(dbInstance, 'reportApprovals'), {
            projectId: activeProjectId,
            customerId: project.customerId,
            filePath: result.public_id, // Use cloudinaryPublicId as filePath
            status: 'pending',
            uploadedAt: uploadedAt,
            autoApproveDate: autoApproveDate,
          });
        } catch (error) {
          console.error('Error creating reportApprovals document:', error);
          // Don't fail the upload if approval document creation fails
        }
      }

      // Best-effort email notification (server-side, secure)
      try {
        await fetch('/api/notifications/file-upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            projectId: activeProjectId,
            filePath: result.public_id,
            folderPath: selectedFolder,
            fileName: sanitizedFileName,
            isReport,
          }),
        });
      } catch (notifyError) {
        // Intentionally ignore email errors and do not surface details to the user
        console.error('Error triggering file upload email notification:', notifyError);
      }

      // Reset upload state
      setUploading(false);
      setUploadProgress(0);
      setUploadingFileName('');
      setSelectedFile(null);
      
      scheduleSuccessMessage(`${sanitizedFileName} uploaded successfully.`);
    } catch (error: any) {
      console.error('Error uploading file:', error);
      setUploadError(`Failed to upload file: ${error.message || 'Please try again.'}`);
      setUploading(false);
      setUploadProgress(0);
      setUploadingFileName('');
      setSelectedFile(null);
    }
  }

  function cancelUpload() {
    setShowUploadPreview(false);
    setSelectedFile(null);
  }

  function handleDeleteClick(folderPath: string, publicId: string, fileName: string) {
    // Prevent multiple simultaneous delete operations
    if (deleting === publicId) {
      return; // Already deleting this file
    }
    setDeleteFileData({ folderPath, publicId, fileName });
    setShowDeleteConfirm(true);
  }

  async function confirmDelete() {
    if (!deleteFileData) return;
    
    const { folderPath, publicId, fileName } = deleteFileData;
    setShowDeleteConfirm(false);
    setDeleting(publicId);
    
    try {
      const success = await deleteFile(publicId);
      if (!success) {
        setAlertData({
          title: 'Delete Failed',
          message: 'Failed to delete file from Cloudinary. Please try again.',
          type: 'error',
        });
        setShowAlert(true);
        return;
      }

      const segments = getFolderSegments(folderPath);
      const filesCollection = getProjectFolderRef(projectId, segments);
      const filesQuery = query(
        filesCollection,
        where('cloudinaryPublicId', '==', publicId)
      );
      const snapshot = await getDocs(filesQuery);
      const deletePromises = snapshot.docs.map((docSnap) => deleteDoc(docSnap.ref));
      await Promise.all(deletePromises);
      
      // Optimistically update UI
      setFiles((prev) => prev.filter((file) => file.cloudinaryPublicId !== publicId));
    } catch (error) {
      console.error('Error deleting file:', error);
      setAlertData({
        title: 'Delete Failed',
        message: 'Failed to delete file. Please try again.',
        type: 'error',
      });
      setShowAlert(true);
    } finally {
      setDeleting(null);
      setDeleteFileData(null);
    }
  }

  async function handleDownload(file: FileMetadata) {
    try {
      const isPDF = file.fileName.toLowerCase().endsWith('.pdf');
      
      // Determine MIME type based on file extension
      const getMimeType = (fileName: string): string => {
        const lower = fileName.toLowerCase();
        if (lower.endsWith('.pdf')) return 'application/pdf';
        if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
        if (lower.endsWith('.png')) return 'image/png';
        return 'application/octet-stream';
      };

      const mimeType = getMimeType(file.fileName);
      
      // Fix PDF URLs: Convert /image/upload/ to /raw/upload/ if PDF is stored as image
      let downloadUrl = file.cloudinaryUrl;
      if (isPDF) {
        // Replace /image/upload/ with /raw/upload/ for PDFs stored incorrectly
        downloadUrl = downloadUrl.replace('/image/upload/', '/raw/upload/');
        
        // Add fl_attachment flag to force download
        if (!downloadUrl.includes('fl_attachment')) {
          const separator = downloadUrl.includes('?') ? '&' : '?';
          downloadUrl = `${downloadUrl}${separator}fl_attachment`;
        }
      }
      
      // Fetch the file with proper headers
      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'Accept': mimeType,
        },
        redirect: 'follow',
      });

      if (!response.ok) {
        // If raw endpoint fails, try the original URL
        if (isPDF && downloadUrl.includes('/raw/upload/')) {
          const originalUrl = file.cloudinaryUrl + (file.cloudinaryUrl.includes('?') ? '&' : '?') + 'fl_attachment';
          const retryResponse = await fetch(originalUrl, {
            method: 'GET',
            headers: { 'Accept': mimeType },
            redirect: 'follow',
          });
          
          if (retryResponse.ok) {
            const blob = await retryResponse.blob();
            const typedBlob = new Blob([blob], { type: mimeType });
            const url = URL.createObjectURL(typedBlob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = file.fileName;
            anchor.style.display = 'none';
            document.body.appendChild(anchor);
            anchor.click();
            setTimeout(() => {
              document.body.removeChild(anchor);
              URL.revokeObjectURL(url);
            }, 100);
            return;
          }
        }
        
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
      }

      // Get the blob with explicit MIME type
      const blob = await response.blob();
      
      // Ensure correct MIME type for PDFs
      const typedBlob = blob.type && blob.type !== 'application/octet-stream'
        ? blob 
        : new Blob([blob], { type: mimeType });

      // Create download link
      const url = URL.createObjectURL(typedBlob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.fileName;
      anchor.style.display = 'none';
      
      // Append to body, click, and remove
      document.body.appendChild(anchor);
      anchor.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (error: any) {
      console.error('Download failed:', error);
      
      // For PDFs, try fallback: direct link with download attribute
      if (file.fileName.toLowerCase().endsWith('.pdf')) {
        try {
          // Try converting URL to raw endpoint
          let fallbackUrl = file.cloudinaryUrl.replace('/image/upload/', '/raw/upload/');
          if (!fallbackUrl.includes('fl_attachment')) {
            fallbackUrl += (fallbackUrl.includes('?') ? '&' : '?') + 'fl_attachment';
          }
          
          const anchor = document.createElement('a');
          anchor.href = fallbackUrl;
          anchor.download = file.fileName;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          document.body.appendChild(anchor);
          anchor.click();
          setTimeout(() => {
            document.body.removeChild(anchor);
          }, 100);
          return; // Success with fallback
        } catch (fallbackError) {
          console.error('Fallback download also failed:', fallbackError);
        }
      }
      
      setAlertData({
        title: 'Download Failed',
        message: error.message || 'Failed to download file. Please try again.',
        type: 'error',
      });
      setShowAlert(true);
    }
  }

  function formatUploadedDate(date: Date | null) {
    if (!date) return 'Pending';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  function getFileIcon(type: string): string {
    if (type.includes('pdf')) return '📄';
    if (type.includes('image')) return '🖼️';
    return '📎';
  }

  // Get folder icon
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
    return '📁';
  }

  // Format folder name using translations
  function formatFolderName(nameOrPath: string): string {
    return translateFolderPath(nameOrPath, t);
  }

  /**
   * Check if a folder path is part of Customer Uploads (admin cannot upload here)
   */
  function isCustomerUploadsFolder(folderPath: string): boolean {
    return folderPath.startsWith('01_Customer_Uploads');
  }

  if (loading && !project) {
    return (
      <div className="px-8 py-8">
        <div className="bg-white border border-gray-200 rounded-sm p-12 text-center">
          <div className="inline-block h-6 w-6 border-2 border-gray-300 border-t-green-power-500 rounded-full animate-spin"></div>
          <p className="mt-4 text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-6 py-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={
              fromProject 
                ? `/projects/${projectId}` 
                : fromDashboard 
                  ? '/dashboard' 
                  : fromFiles 
                    ? '/files' 
                    : '/files'
            }
            className="inline-flex items-center text-sm text-gray-600 hover:text-green-power-600 mb-6 transition-colors group"
          >
            <svg className="w-4 h-4 mr-1 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {fromProject 
              ? 'Back to Project' 
              : fromDashboard 
                ? 'Back to Dashboard' 
                : fromFiles 
                  ? 'Back to Files' 
                  : 'Back to Projects'}
          </Link>
          
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{project?.name}</h1>
                {project?.year && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="font-medium">Year: {project.year}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Project Folders Grid - Modern Card Design */}
          {!selectedFolder && (
            <div>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-2">Project Folders</h2>
                <p className="text-sm text-gray-600">Select a folder to view and manage files</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {PROJECT_FOLDER_STRUCTURE.filter((folder) => 
                  folder.path !== '00_New_Not_Viewed_Yet_' && 
                  folder.path !== '01_Customer_Uploads'
                ).map((folder) => {
                  const config = getFolderConfig(folder.path);
                  const hasChildren = folder.children && folder.children.length > 0;
                  
                  return (
                    <div
                      key={folder.path}
                      onClick={() => {
                        if (hasChildren) {
                          setSelectedFolder(folder.children![0].path);
                        } else {
                          setSelectedFolder(folder.path);
                        }
                      }}
                      className="group relative bg-white rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-200 hover:border-gray-300 cursor-pointer overflow-hidden"
                    >
                      {/* Gradient accent bar */}
                      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${config.gradient}`}></div>
                      
                      <div className="p-6">
                        {/* Icon and Arrow */}
                        <div className="flex items-start justify-between mb-4">
                          <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center shadow-md group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                            <span className="text-2xl">{config.icon}</span>
                          </div>
                          {hasChildren && (
                            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${config.gradient} flex items-center justify-center opacity-70 group-hover:opacity-100 transition-opacity`}>
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          )}
                        </div>
                        
                        {/* Folder Name */}
                        <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-green-power-700 transition-colors">
                          {formatFolderName(folder.path)}
                        </h3>
                        
                        {/* Description */}
                        <p className="text-xs text-gray-600 mb-4 leading-relaxed">{config.description}</p>
                        
                        {/* Subfolders Preview */}
                        {hasChildren && (
                          <div className="pt-4 border-t border-gray-100">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                {folder.children!.length} {folder.children!.length === 1 ? 'subfolder' : 'subfolders'}
                              </span>
                            </div>
                            <div className="space-y-2">
                              {folder.children!.slice(0, 3).map((child) => (
                                <div key={child.path} className="flex items-center gap-2 text-xs text-gray-700 group-hover:text-gray-900 transition-colors">
                                  <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${config.gradient}`}></div>
                                  <span className="font-medium">{formatFolderName(child.path)}</span>
                                </div>
                              ))}
                              {folder.children!.length > 3 && (
                                <div className="text-xs text-gray-500 font-medium pt-1">
                                  +{folder.children!.length - 3} more
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Folder Selection and File Management */}
        {selectedFolder && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Sidebar - Folder Navigation */}
            <div className="lg:col-span-3">
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm sticky top-6">
                <div className="px-5 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                  <h3 className="text-sm font-bold text-gray-900">Folders</h3>
                  <p className="text-xs text-gray-600 mt-1">Switch folders</p>
                </div>
                <div className="p-4 max-h-[calc(100vh-200px)] overflow-y-auto">
                  <div className="space-y-1">
                    {PROJECT_FOLDER_STRUCTURE.filter((folder) => 
                      folder.path !== '00_New_Not_Viewed_Yet_' && 
                      folder.path !== '01_Customer_Uploads'
                    ).map((folder) => {
                      const hasSelectedChild = folder.children?.some(child => selectedFolder === child.path);
                      const isParentSelected = selectedFolder === folder.path && !hasSelectedChild;
                      const config = getFolderConfig(folder.path);
                      
                      return (
                        <div key={folder.path}>
                          <button
                            onClick={() => {
                              if (folder.children && folder.children.length > 0) {
                                setSelectedFolder(folder.children[0].path);
                              } else {
                                setSelectedFolder(folder.path);
                              }
                            }}
                            className={`w-full text-left px-4 py-2.5 text-sm rounded-lg transition-all duration-200 flex items-center space-x-3 ${
                              isParentSelected || hasSelectedChild
                                ? 'bg-green-power-500 text-white shadow-md'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <span className="text-lg">{getFolderIcon(folder.path)}</span>
                            <span className="flex-1 font-medium">{formatFolderName(folder.path)}</span>
                            {folder.children && folder.children.length > 0 && (
                              <svg 
                                className={`w-4 h-4 transition-transform ${hasSelectedChild ? 'rotate-90' : ''}`}
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            )}
                          </button>
                          {folder.children && (hasSelectedChild || isParentSelected) && (
                            <div className="ml-6 mt-1.5 space-y-1 border-l-2 border-gray-200 pl-4">
                              {folder.children.map((child) => (
                                <button
                                  key={child.path}
                                  onClick={() => setSelectedFolder(child.path)}
                                  className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-all duration-200 flex items-center gap-2 ${
                                    selectedFolder === child.path
                                      ? 'bg-green-power-100 text-green-power-700 font-semibold'
                                      : 'text-gray-600 hover:bg-gray-50'
                                  }`}
                                >
                                  <div className={`w-1.5 h-1.5 rounded-full ${selectedFolder === child.path ? `bg-gradient-to-r ${config.gradient}` : 'bg-gray-400'}`}></div>
                                  <span>{formatFolderName(child.path)}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Content Area */}
            <div className="lg:col-span-9">
              <div className="space-y-6">
              {/* Upload Section */}
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-green-power-50 to-green-power-100 px-6 py-4 border-b border-green-power-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-gray-900 mb-1">Upload Files</h3>
                      <p className="text-xs text-gray-600">
                        <span className="font-medium">{formatFolderName(selectedFolder)}</span>
                      </p>
                    </div>
                    <div className="bg-white/60 rounded-lg px-3 py-1.5">
                      <span className="text-xs font-medium text-gray-700">📤 Upload</span>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  {uploadError && (
                    <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 text-sm mb-4 rounded-r-lg">
                      {uploadError}
                    </div>
                  )}
                  {uploadSuccess && !uploadError && successFolder === selectedFolder && (
                    <div className="bg-green-50 border-l-4 border-green-400 text-green-700 px-4 py-3 text-sm mb-4 rounded-r-lg">
                      {uploadSuccess}
                    </div>
                  )}
                  {isCustomerUploadsFolder(selectedFolder) ? (
                    <div className="border-2 border-dashed border-amber-300 rounded-lg p-8 text-center bg-amber-50">
                      <div className="mb-4">
                        <svg className="mx-auto h-12 w-12 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div className="space-y-2">
                        <span className="text-sm font-medium text-amber-800 block">
                          Customer Uploads Folder (Read-Only)
                        </span>
                        <p className="text-xs text-amber-700">
                          Admins cannot upload files to Customer Uploads folders. These folders are reserved for customer uploads only. You can view customer-uploaded files here.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-green-power-400 transition-colors bg-gray-50">
                      <div className="mb-4">
                        <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          onChange={handleFileUpload}
                          disabled={uploading}
                          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                          className="hidden"
                        />
                        <div className="space-y-2">
                          {uploading ? (
                            <>
                              <div className="flex items-center justify-center space-x-2">
                                <svg className="animate-spin h-5 w-5 text-green-power-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span className="text-sm font-medium text-gray-700">Uploading...</span>
                              </div>
                              {uploadingFileName && (
                                <p className="text-xs text-gray-600 font-medium truncate max-w-xs mx-auto">
                                  {uploadingFileName}
                                </p>
                              )}
                            </>
                          ) : (
                            <>
                              <span className="text-sm font-medium text-gray-700">
                                Click to upload or drag and drop
                              </span>
                              <p className="text-xs text-gray-500">
                                PDF, JPG, PNG (Max 5 MB)
                              </p>
                            </>
                          )}
                        </div>
                      </label>
                      {uploading && (
                        <div className="mt-6 space-y-2">
                          <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-green-power-500 to-green-power-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                              style={{ width: `${uploadProgress}%` }}
                            ></div>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-600">Uploading...</span>
                            <span className="text-gray-700 font-semibold">{uploadProgress}%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Files List */}
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-gray-900 mb-1">Files</h3>
                      <p className="text-xs text-gray-600">
                        {files.length} {files.length === 1 ? 'file' : 'files'} in this folder
                      </p>
                    </div>
                  </div>
                </div>
                {loading ? (
                  <div className="p-12 text-center">
                    <div className="inline-block h-8 w-8 border-3 border-gray-300 border-t-green-power-500 rounded-full animate-spin"></div>
                    <p className="mt-4 text-sm text-gray-500">Loading files...</p>
                  </div>
                ) : files.length === 0 ? (
                  <div className="p-16 text-center">
                    <div className="mb-4">
                      <span className="text-5xl">📄</span>
                    </div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-1">No files yet</h4>
                    <p className="text-xs text-gray-500">Upload files using the form above</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {files
                      .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                      .map((file) => (
                      <div
                        key={file.cloudinaryPublicId}
                        className="px-6 py-4 hover:bg-gray-50 transition-colors group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center flex-1 min-w-0 space-x-4">
                              <div className="flex-shrink-0">
                                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-xl group-hover:bg-green-power-50 transition-colors">
                                  {getFileIcon(file.fileType)}
                                </div>
                              </div>
                            <div className="flex-1 min-w-0">
                              <a
                                href={file.cloudinaryUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-medium text-gray-900 hover:text-green-power-600 break-words block transition-colors"
                              >
                                {file.fileName}
                              </a>
                              <p className="text-xs text-gray-500 mt-1">
                                {file.fileType.toUpperCase()} · {formatUploadedDate(file.uploadedAt)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 ml-4">
                            <button
                              onClick={() => handleDownload(file)}
                              className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all flex items-center space-x-1"
                              type="button"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              <span>Download</span>
                            </button>
                            <button
                              onClick={() => handleDeleteClick(file.folderPath, file.cloudinaryPublicId, file.fileName)}
                              disabled={deleting === file.cloudinaryPublicId}
                              className="px-4 py-2 text-xs font-medium text-red-600 bg-white border border-red-300 rounded-lg hover:bg-red-50 hover:border-red-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
                            >
                              {deleting === file.cloudinaryPublicId ? (
                                <>
                                  <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
                                  <span>Deleting...</span>
                                </>
                              ) : (
                                <>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  <span>Delete</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {files.length > itemsPerPage && !loading && files.length > 0 && (
                  <Pagination
                    currentPage={currentPage}
                    totalPages={Math.ceil(files.length / itemsPerPage)}
                    totalItems={files.length}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                    onItemsPerPageChange={(newItemsPerPage) => {
                      setItemsPerPage(newItemsPerPage);
                      setCurrentPage(1);
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title="Delete File"
        message={deleteFileData ? `Are you sure you want to delete "${deleteFileData.fileName}"? This action cannot be undone.` : ''}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        onConfirm={confirmDelete}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setDeleteFileData(null);
        }}
      />

      {/* Alert Modal */}
      <AlertModal
        isOpen={showAlert}
        title={alertData?.title || 'Alert'}
        message={alertData?.message || ''}
        type={alertData?.type || 'info'}
        onClose={() => {
          setShowAlert(false);
          setAlertData(null);
        }}
      />

      {/* File Upload Preview Modal */}
      <FileUploadPreviewModal
        isOpen={showUploadPreview}
        file={selectedFile}
        folderPath={selectedFolder}
        onConfirm={confirmUpload}
        onCancel={cancelUpload}
      />
    </div>
  );
}
