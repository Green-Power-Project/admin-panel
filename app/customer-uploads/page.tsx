'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import { db } from '@/lib/firebase';
import { useLanguage } from '@/contexts/LanguageContext';
import { translateFolderPath } from '@/lib/translations';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  getDocs,
  setDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import Pagination from '@/components/Pagination';

interface Project {
  id: string;
  name: string;
  customerId: string;
}

interface CustomerUpload {
  fileName: string;
  filePath: string;
  folderPath: string;
  projectId: string;
  projectName: string;
  customerId: string;
  customerNumber?: string;
  customerEmail?: string;
  uploadDate: Date;
  fileSize: number;
  fileType: string;
  downloadUrl: string;
  adminReadStatus?: 'read' | 'unread';
}

export default function CustomerUploadsPage() {
  const { t } = useLanguage();
  return (
    <ProtectedRoute>
      <AdminLayout title={t('navigation.customerUploads')}>
        <CustomerUploadsContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function CustomerUploadsContent() {
  const router = useRouter();
  const { t } = useLanguage();
  const [allUploads, setAllUploads] = useState<CustomerUpload[]>([]);
  const [uploads, setUploads] = useState<CustomerUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProject, setFilterProject] = useState<string>('all');
  const [filterCustomer, setFilterCustomer] = useState<string>(''); // customer/project/file search
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  // In-portal file viewer (no new tab)
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerFileName, setViewerFileName] = useState<string | null>(null);

  useEffect(() => {
    if (!db) return;
    const dbInstance = db; // Store for TypeScript narrowing

    // Real-time listener for projects
    const projectsUnsubscribe = onSnapshot(
      query(collection(dbInstance, 'projects'), orderBy('name', 'asc')),
      (snapshot) => {
        const projectsList: Array<{ id: string; name: string }> = [];
        snapshot.forEach((doc) => {
          projectsList.push({ id: doc.id, name: doc.data().name });
        });
        setProjects(projectsList);
      },
      (error) => {
        console.error('Error listening to projects:', error);
      }
    );

    // Cleanup listener on unmount
    return () => {
      projectsUnsubscribe();
    };
  }, []);

  // Real-time listeners for projects and customers
  useEffect(() => {
    if (!db) return;
    const dbInstance = db; // Store for TypeScript narrowing

    let projectsMap = new Map<string, { name: string; customerId: string }>();
    let customersMap = new Map<string, { customerNumber: string; email: string }>();

    // Real-time listener for projects
    const projectsUnsubscribe = onSnapshot(
      collection(dbInstance, 'projects'),
      (snapshot) => {
        projectsMap = new Map<string, { name: string; customerId: string }>();
        snapshot.forEach((doc) => {
          const data = doc.data();
          projectsMap.set(doc.id, {
            name: data.name,
            customerId: data.customerId,
          });
        });
        // Always process (even with empty maps) so loading is cleared when there is no data
        processCustomerUploads(projectsMap, customersMap);
      },
      (error) => {
        console.error('Error listening to projects:', error);
      }
    );

    // Real-time listener for customers
    const customersUnsubscribe = onSnapshot(
      collection(dbInstance, 'customers'),
      (snapshot) => {
        customersMap = new Map<string, { customerNumber: string; email: string }>();
        snapshot.forEach((doc) => {
          const data = doc.data();
          customersMap.set(data.uid, {
            customerNumber: data.customerNumber || 'N/A',
            email: data.email || 'N/A',
          });
        });
        // Always process (even with empty maps) so loading is cleared when there is no data
        processCustomerUploads(projectsMap, customersMap);
      },
      (error) => {
        console.error('Error listening to customers:', error);
      }
    );

    // Cleanup listeners on unmount
    return () => {
      projectsUnsubscribe();
      customersUnsubscribe();
    };
  }, []);


  async function processCustomerUploads(
    projectsMap: Map<string, { name: string; customerId: string }>,
    customersMap: Map<string, { customerNumber: string; email: string }>
  ) {
    if (!db) return;
    const dbInstance = db; // Store for TypeScript narrowing
    
    // Show loading when processing data from Firestore
    setLoading(true);
    
    try {
      // Helpers to build Firestore folder references
      const getFolderSegments = (folderPath: string): string[] =>
        folderPath.split('/').filter(Boolean);

      const getProjectFolderRef = (projectId: string, folderSegments: string[]) => {
        if (folderSegments.length === 0) {
          throw new Error('Folder segments must not be empty');
        }
        // Firestore requires odd number of segments for collections
        // Since folder paths can be nested, use the full path as a single document ID
        // Structure: files(collection) -> projects(doc) -> projectId(collection) -> folderPath(doc) -> files(collection)
        const folderPathId = folderSegments.join('__');
        return collection(dbInstance, 'files', 'projects', projectId, folderPathId, 'files');
      };

      // Get all files from 01_Customer_Uploads folder in all projects via Firestore metadata
      const allUploadsData: CustomerUpload[] = [];
      const customerUploadFolders = [
        '01_Customer_Uploads',
        '01_Customer_Uploads/Photos',
        '01_Customer_Uploads/Documents',
        '01_Customer_Uploads/Other',
      ];

      // Build all folder refs first so we can fetch in parallel (much faster than sequential awaits)
      const folderTasks: {
        projectId: string;
        projectName: string;
        customerId: string;
        folderPath: string;
        ref: ReturnType<typeof collection>;
      }[] = [];

      for (const [projectId, projectData] of projectsMap.entries()) {
        for (const folderPath of customerUploadFolders) {
          const segments = getFolderSegments(folderPath);
          if (segments.length === 0) continue;
          try {
            const ref = getProjectFolderRef(projectId, segments);
            folderTasks.push({
              projectId,
              projectName: projectData.name,
              customerId: projectData.customerId,
              folderPath,
              ref,
            });
          } catch (error) {
            console.error('Error building folder reference for customer uploads:', folderPath, error);
          }
        }
      }

      // Get admin read status for all files
      const adminReadStatusMap = new Map<string, boolean>();
      try {
        const adminReadStatusSnapshot = await getDocs(collection(dbInstance, 'adminFileReadStatus'));
        adminReadStatusSnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.adminRead) {
            adminReadStatusMap.set(data.filePath, true);
          }
        });
      } catch (error) {
        console.error('Error loading admin read status:', error);
      }

      const snapshots = await Promise.all(
        folderTasks.map((task) =>
          getDocs(task.ref).catch((error) => {
            console.error('Error loading folder from Firestore:', task.folderPath, error);
            return null;
          })
        )
      );

      snapshots.forEach((filesSnapshot, index) => {
        if (!filesSnapshot || filesSnapshot.empty) return;
        const task = folderTasks[index];
        const { projectId, projectName, customerId, folderPath } = task;
        const customerInfo = customersMap.get(customerId);

        filesSnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const uploadDate = data.uploadedAt?.toDate ? data.uploadedAt.toDate() : new Date();
          const fileName = (data.fileName as string) || 'file';
          
          // Derive file type from filename
          const fileNameLower = fileName.toLowerCase();
          let fileType = 'file';
          if (fileNameLower.endsWith('.pdf')) fileType = 'pdf';
          else if (fileNameLower.match(/\.(jpg|jpeg|png|gif|webp)$/)) fileType = 'image';

          allUploadsData.push({
            fileName,
            filePath: data.cloudinaryPublicId as string,
            folderPath,
            projectId,
            projectName,
            customerId,
            customerNumber: customerInfo?.customerNumber,
            customerEmail: customerInfo?.email,
            uploadDate,
            fileSize: 0, // Not stored in Firestore
            fileType,
            downloadUrl: data.cloudinaryUrl as string,
            adminReadStatus: adminReadStatusMap.has(data.cloudinaryPublicId as string) ? 'read' : 'unread',
          });
        });
      });

      // Sort by upload date (newest first)
      allUploadsData.sort((a, b) => b.uploadDate.getTime() - a.uploadDate.getTime());

      setAllUploads(allUploadsData);
    } catch (error) {
      console.error('Error processing customer uploads:', error);
    } finally {
      setLoading(false);
    }
  }

  // Fast in-memory filtering for instant UI response
  useEffect(() => {
    let filtered = [...allUploads];

    if (filterProject !== 'all') {
      filtered = filtered.filter((upload) => upload.projectId === filterProject);
    }

    const term = filterCustomer.trim().toLowerCase();
    if (term) {
      filtered = filtered.filter((upload) => {
        const num = upload.customerNumber?.toLowerCase() || '';
        const email = upload.customerEmail?.toLowerCase() || '';
        const projectName = upload.projectName.toLowerCase();
        const fileName = upload.fileName.toLowerCase();
        return (
          num.includes(term) ||
          email.includes(term) ||
          projectName.includes(term) ||
          fileName.includes(term)
        );
      });
    }

    setUploads(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  }, [allUploads, filterProject, filterCustomer]);

  function formatDate(date: Date): string {
    return date.toLocaleString();
  }

  function formatFileSize(bytes: number): string {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function getFileIcon(type: string): string {
    if (type.includes('pdf')) return '📄';
    if (type.includes('image')) return '🖼️';
    return '📎';
  }

  function getFolderDisplayName(folderPath: string): string {
    return translateFolderPath(folderPath, t);
  }

  // Firestore document IDs cannot contain '/'. Encode filePath (Cloudinary public_id) for use as doc ID.
  function adminReadStatusDocId(filePath: string): string {
    return filePath.replace(/\//g, '__');
  }

  async function handleMarkAsRead(upload: CustomerUpload) {
    if (!db) return;

    try {
      const docId = adminReadStatusDocId(upload.filePath);
      await setDoc(doc(db, 'adminFileReadStatus', docId), {
        adminRead: true,
        readAt: serverTimestamp(),
        filePath: upload.filePath,
        projectId: upload.projectId,
        customerId: upload.customerId,
      });
      // Update local state
      setAllUploads((prev) =>
        prev.map((u) => (u.filePath === upload.filePath ? { ...u, adminReadStatus: 'read' as const } : u))
      );
      setUploads((prev) =>
        prev.map((u) => (u.filePath === upload.filePath ? { ...u, adminReadStatus: 'read' as const } : u))
      );
    } catch (error) {
      console.error('Error marking file as read:', error);
    }
  }

  const totalUploads = uploads.length;

  return (
    <div className="px-8 py-8 space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-green-power-50 to-green-power-100">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-lg md:text-xl font-semibold text-gray-900">{t('customerUploads.title')}</h2>
              <p className="text-xs md:text-sm text-gray-600 mt-1">
                {t('customerUploads.viewDescription')}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                ⚠️ {t('customerUploads.note')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-3 py-2 rounded-lg bg-white/90 border border-gray-200">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">{t('common.total')}</p>
                <p className="text-sm font-semibold text-gray-900">{totalUploads}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/60">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                {t('customerUploads.filterProject')}
              </label>
              <select
                value={filterProject}
                onChange={(e) => setFilterProject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
              >
                <option value="all">{t('customerUploads.allProjects')}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                {t('customerUploads.filterCustomer')}
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z"
                    />
                  </svg>
                </span>
                <input
                  type="text"
                  value={filterCustomer}
                  onChange={(e) => setFilterCustomer(e.target.value)}
                  placeholder={t('customerUploads.searchPlaceholder')}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500 placeholder:text-gray-400"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 animate-pulse"
                >
                  <div className="h-5 w-32 rounded-full bg-gray-200" />
                  <div className="h-3 w-40 rounded bg-gray-200" />
                  <div className="h-3 w-32 rounded bg-gray-200" />
                  <div className="h-3 w-28 rounded bg-gray-200" />
                  <div className="h-3 w-40 rounded bg-gray-200" />
                  <div className="h-3 w-20 rounded bg-gray-200" />
                </div>
              ))}
            </div>
          ) : uploads.length === 0 ? (
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-8 text-center">
              <p className="text-sm font-medium text-gray-700">
                {t('customerUploads.noUploadsFound')}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {t('customerUploads.tryAdjustingFilters')}
              </p>
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-lg overflow-hidden">
              <div className="overflow-x-auto overflow-y-visible">
                <table className="min-w-full w-full table-fixed divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[20%]">
                      {t('customerUploads.fileName')}
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[14%]">
                      {t('customerUploads.project')}
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[12%]">
                      {t('customerUploads.customer')}
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[14%]">
                      {t('customerUploads.folder')}
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[18%]">
                      {t('common.status')}
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[22%]">
                      {t('customerUploads.uploadDateTime')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {uploads
                    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                    .map((upload, index) => (
                    <tr
                      key={`${upload.filePath}-${index}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setViewerUrl(upload.downloadUrl);
                        setViewerFileName(upload.fileName || 'file');
                        handleMarkAsRead(upload);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setViewerUrl(upload.downloadUrl);
                          setViewerFileName(upload.fileName || 'file');
                          handleMarkAsRead(upload);
                        }
                      }}
                      className="hover:bg-gray-50/80 cursor-pointer"
                    >
                      <td className="px-3 py-2.5 overflow-hidden">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm flex-shrink-0">{getFileIcon(upload.fileType)}</span>
                          <span
                            className="text-xs font-medium text-gray-900 hover:text-green-power-600 truncate block min-w-0"
                            title={upload.fileName}
                          >
                            {upload.fileName}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 overflow-hidden">
                        <div className="text-xs text-gray-900 truncate">{upload.projectName}</div>
                      </td>
                      <td className="px-3 py-2.5 overflow-hidden">
                        <div className="text-xs text-gray-900 truncate">
                          {upload.customerNumber 
                            ? upload.customerNumber.charAt(0).toUpperCase() + upload.customerNumber.slice(1)
                            : 'N/A'}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 overflow-hidden">
                        <div className="text-xs text-gray-900 truncate">{getFolderDisplayName(upload.folderPath)}</div>
                      </td>
                      <td className="px-3 py-2.5 overflow-hidden">
                        <div className="flex items-center gap-1 whitespace-nowrap">
                          {upload.adminReadStatus === 'unread' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200">
                              <span aria-hidden>✅</span>
                              {t('customerUploads.new')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-green-100 text-green-800 border border-green-200">
                              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                              {t('customerUploads.read')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 overflow-hidden">
                        <div className="text-xs text-gray-900 whitespace-nowrap">{formatDate(upload.uploadDate)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <Pagination
                currentPage={currentPage}
                totalPages={Math.ceil(uploads.length / itemsPerPage)}
                totalItems={uploads.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={(newItemsPerPage) => {
                  setItemsPerPage(newItemsPerPage);
                  setCurrentPage(1);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* File viewer modal (in-portal, no new tab) */}
      {viewerUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => { setViewerUrl(null); setViewerFileName(null); }}
        >
          <button
            type="button"
            onClick={() => { setViewerUrl(null); setViewerFileName(null); }}
            className="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-lg transition-colors z-10"
            aria-label={t('common.close')}
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="relative max-w-[95vw] max-h-[90vh] w-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {viewerFileName && /\.(jpg|jpeg|png|gif|webp)$/i.test(viewerFileName) ? (
              <img
                src={viewerUrl}
                alt={viewerFileName}
                className="max-h-[90vh] w-auto object-contain rounded-lg"
              />
            ) : (
              <iframe
                src={viewerUrl}
                title={viewerFileName || ''}
                className="w-full max-w-4xl h-[90vh] rounded-lg bg-white"
              />
            )}
            <p className="absolute bottom-0 left-0 right-0 py-2 text-center text-white text-sm bg-black/50 rounded-b-lg">
              {viewerFileName}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

