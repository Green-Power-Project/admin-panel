'use client';

import { useState, useEffect, useCallback } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import { db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
  Timestamp,
  doc,
  getDoc,
  getDocs,
} from 'firebase/firestore';
import { PROJECT_FOLDER_STRUCTURE, getAllFolderPathsArray } from '@/lib/folderStructure';
import Pagination from '@/components/Pagination';

interface FileReadStatus {
  id: string;
  projectId: string;
  customerId: string;
  filePath: string;
  readAt: Timestamp;
}

interface FileTrackingInfo {
  filePath: string;
  fileName: string;
  folderPath: string;
  projectId: string;
  projectName: string;
  customerId: string;
  customerNumber?: string;
  customerEmail?: string;
  readStatus: FileReadStatus | null;
  isRead: boolean;
}

export default function TrackingPage() {
  return (
    <ProtectedRoute>
      <AdminLayout title="File Tracking">
        <TrackingContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function TrackingContent() {
  const [allFiles, setAllFiles] = useState<FileTrackingInfo[]>([]);
  const [files, setFiles] = useState<FileTrackingInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProject, setFilterProject] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all'); // 'all', 'read', 'unread'
  const [filterCustomer, setFilterCustomer] = useState<string>(''); // customer name/number/email search
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  useEffect(() => {
    if (!db) return;

    // Real-time listener for projects
    const projectsUnsubscribe = onSnapshot(
      query(collection(db, 'projects'), orderBy('name', 'asc')),
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

  // Real-time listeners for fileReadStatus, projects, and customers
  useEffect(() => {
    if (!db) return;

    let readStatusesMap = new Map<string, FileReadStatus[]>();
    let projectsMap = new Map<string, { name: string; customerId: string }>();
    let customersMap = new Map<string, { customerNumber: string; email: string }>();

    // Real-time listener for file read status
    const fileReadStatusUnsubscribe = onSnapshot(
      collection(db, 'fileReadStatus'),
      (snapshot) => {
        readStatusesMap = new Map<string, FileReadStatus[]>();
        snapshot.forEach((doc) => {
          const data = doc.data();
          const status: FileReadStatus = {
            id: doc.id,
            ...data,
          } as FileReadStatus;
          
          if (!readStatusesMap.has(status.filePath)) {
            readStatusesMap.set(status.filePath, []);
          }
          readStatusesMap.get(status.filePath)!.push(status);
        });
        // Trigger file tracking reload when read status changes
        if (projectsMap.size > 0 && customersMap.size > 0) {
          processFileTracking(readStatusesMap, projectsMap, customersMap);
        }
      },
      (error) => {
        console.error('Error listening to file read status:', error);
      }
    );

    // Real-time listener for projects
    const projectsUnsubscribe = onSnapshot(
      collection(db, 'projects'),
      (snapshot) => {
        projectsMap = new Map<string, { name: string; customerId: string }>();
        snapshot.forEach((doc) => {
          const data = doc.data();
          projectsMap.set(doc.id, {
            name: data.name,
            customerId: data.customerId,
          });
        });
        // Trigger file tracking reload when projects change
        if (readStatusesMap.size >= 0 && customersMap.size > 0) {
          processFileTracking(readStatusesMap, projectsMap, customersMap);
        }
      },
      (error) => {
        console.error('Error listening to projects:', error);
      }
    );

    // Real-time listener for customers
    const customersUnsubscribe = onSnapshot(
      collection(db, 'customers'),
      (snapshot) => {
        customersMap = new Map<string, { customerNumber: string; email: string }>();
        snapshot.forEach((doc) => {
          const data = doc.data();
          customersMap.set(data.uid, {
            customerNumber: data.customerNumber || 'N/A',
            email: data.email || 'N/A',
          });
        });
        // Trigger file tracking reload when customers change
        if (readStatusesMap.size >= 0 && projectsMap.size > 0) {
          processFileTracking(readStatusesMap, projectsMap, customersMap);
        }
      },
      (error) => {
        console.error('Error listening to customers:', error);
      }
    );

    // Cleanup listeners on unmount
    return () => {
      fileReadStatusUnsubscribe();
      projectsUnsubscribe();
      customersUnsubscribe();
    };
  }, []);

  const loadFileTracking = useCallback(async () => {
    // Always show loading when fetching data
    setLoading(true);
    
    try {
      // Get current data from listeners (one-time read for initial load)
      const [readStatusesSnapshot, projectsSnapshot, customersSnapshot] = await Promise.all([
        getDocs(collection(db, 'fileReadStatus')),
        getDocs(collection(db, 'projects')),
        getDocs(collection(db, 'customers')),
      ]);

      const readStatusesMap = new Map<string, FileReadStatus[]>();
      readStatusesSnapshot.forEach((doc) => {
        const data = doc.data();
        const status: FileReadStatus = {
          id: doc.id,
          ...data,
        } as FileReadStatus;
        
        if (!readStatusesMap.has(status.filePath)) {
          readStatusesMap.set(status.filePath, []);
        }
        readStatusesMap.get(status.filePath)!.push(status);
      });

      const projectsMap = new Map<string, { name: string; customerId: string }>();
      projectsSnapshot.forEach((doc) => {
        const data = doc.data();
        projectsMap.set(doc.id, {
          name: data.name,
          customerId: data.customerId,
        });
      });

      const customersMap = new Map<string, { customerNumber: string; email: string }>();
      customersSnapshot.forEach((doc) => {
        const data = doc.data();
        customersMap.set(data.uid, {
          customerNumber: data.customerNumber || 'N/A',
          email: data.email || 'N/A',
        });
      });

      await processFileTracking(readStatusesMap, projectsMap, customersMap);
    } catch (error) {
      console.error('Error loading file tracking:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load (real-time listeners keep it fresh)
  useEffect(() => {
    loadFileTracking();
  }, [loadFileTracking]);

  async function processFileTracking(
    readStatusesMap: Map<string, FileReadStatus[]>,
    projectsMap: Map<string, { name: string; customerId: string }>,
    customersMap: Map<string, { customerNumber: string; email: string }>
  ) {
    if (!db) return;
    
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
        return collection(db, 'files', 'projects', projectId, folderPathId, 'files');
      };

      // Get all files from all projects via Firestore metadata
      const allFiles: FileTrackingInfo[] = [];
      const folderPaths = getAllFolderPathsArray();

      // Build all folder refs first so we can fetch in parallel (much faster than sequential awaits)
      const folderTasks: {
        projectId: string;
        projectName: string;
        customerId: string;
        folderPath: string;
        ref: ReturnType<typeof collection>;
      }[] = [];

      for (const [projectId, projectData] of projectsMap.entries()) {
        for (const folderPath of folderPaths) {
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
            console.error('Error building folder reference for tracking:', folderPath, error);
          }
        }
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
          const storagePath = data.cloudinaryPublicId as string;
          const fileName = (data.fileName as string) || '';
          const readStatuses = readStatusesMap.get(storagePath) || [];
          const readStatus = readStatuses.length > 0 ? readStatuses[0] : null;
          const isRead = readStatus !== null;

          allFiles.push({
            filePath: storagePath,
            fileName,
            folderPath,
            projectId,
            projectName,
            customerId,
            customerNumber: customerInfo?.customerNumber,
            customerEmail: customerInfo?.email,
            readStatus,
            isRead,
          });
        });
      });

      // Sort: unread first, then by read date (newest first)
      allFiles.sort((a, b) => {
        if (a.isRead !== b.isRead) {
          return a.isRead ? 1 : -1; // Unread first
        }
        if (a.readStatus && b.readStatus) {
          return b.readStatus.readAt.toMillis() - a.readStatus.readAt.toMillis();
        }
        return 0;
      });

      setAllFiles(allFiles);
    } catch (error) {
      console.error('Error processing file tracking:', error);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(timestamp: Timestamp): string {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate();
    return date.toLocaleString();
  }

  function getFolderDisplayName(folderPath: string): string {
    return folderPath.split('/').pop() || folderPath;
  }

  // Fast in-memory filtering for instant UI response
  useEffect(() => {
    let filtered = [...allFiles];

    if (filterProject !== 'all') {
      filtered = filtered.filter((f) => f.projectId === filterProject);
    }

    if (filterStatus === 'read') {
      filtered = filtered.filter((f) => f.isRead);
    } else if (filterStatus === 'unread') {
      filtered = filtered.filter((f) => !f.isRead);
    }

    const term = filterCustomer.trim().toLowerCase();
    if (term) {
      filtered = filtered.filter((f) => {
        const num = f.customerNumber?.toLowerCase() || '';
        const email = f.customerEmail?.toLowerCase() || '';
        const projectName = f.projectName.toLowerCase();
        const fileName = f.fileName.toLowerCase();
        return (
          num.includes(term) ||
          email.includes(term) ||
          projectName.includes(term) ||
          fileName.includes(term)
        );
      });
    }

    setFiles(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  }, [allFiles, filterProject, filterStatus, filterCustomer]);

  const totalFiles = files.length;
  const unreadCount = files.filter((f) => !f.isRead).length;
  const readCount = totalFiles - unreadCount;

  return (
    <div className="px-8 py-8 space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-green-power-50 to-green-power-100">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-lg md:text-xl font-semibold text-gray-900">File Read Tracking</h2>
              <p className="text-xs md:text-sm text-gray-600 mt-1">
                Monitor which customer files have been opened and when.
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                ⚠️ Read status is updated automatically when customers open files. Admin cannot manually change it.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-3 py-2 rounded-lg bg-white/90 border border-gray-200">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">Total</p>
                <p className="text-sm font-semibold text-gray-900">{totalFiles}</p>
              </div>
              <div className="px-3 py-2 rounded-lg bg-white/90 border border-green-200">
                <p className="text-[11px] text-green-700 uppercase tracking-wide">Read</p>
                <p className="text-sm font-semibold text-green-800">{readCount}</p>
              </div>
              <div className="px-3 py-2 rounded-lg bg-white/90 border border-yellow-200">
                <p className="text-[11px] text-yellow-700 uppercase tracking-wide">Unread</p>
                <p className="text-sm font-semibold text-yellow-800">{unreadCount}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/60">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Filter by Project
              </label>
              <select
                value={filterProject}
                onChange={(e) => setFilterProject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
              >
                <option value="all">All Projects</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Filter by Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
              >
                <option value="all">All Files</option>
                <option value="unread">Unread Only</option>
                <option value="read">Read Only</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Filter by Customer / Email / Project / File
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
                  placeholder="Search by customer number, email, project, or file name"
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
                  <div className="h-5 w-20 rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-40 rounded bg-gray-200" />
                    <div className="h-2 w-64 rounded bg-gray-100" />
                  </div>
                  <div className="h-3 w-32 rounded bg-gray-200" />
                  <div className="h-3 w-40 rounded bg-gray-200" />
                  <div className="h-3 w-32 rounded bg-gray-200" />
                </div>
              ))}
            </div>
          ) : files.length === 0 ? (
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-8 text-center">
              <p className="text-sm font-medium text-gray-700">
                No files found for the selected filters.
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Try adjusting the project, status, or customer filters to widen your search.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[10%]">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[25%]">
                      File
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[18%]">
                      Project
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[15%]">
                      Folder
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[17%]">
                      Customer
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[15%]">
                      Read At
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {files
                    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                    .map((file, index) => (
                    <tr key={`${file.filePath}-${index}`} className="hover:bg-gray-50/80">
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            file.isRead
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {file.isRead ? '✓ Read' : '● Unread'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-xs font-medium text-gray-900 truncate">
                          {file.fileName || 'Untitled file'}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-xs text-gray-900 truncate">{file.projectName}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-xs text-gray-900 truncate">
                          {getFolderDisplayName(file.folderPath)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-xs text-gray-900 truncate">
                          {file.customerNumber || 'N/A'}
                        </div>
                        <div className="text-[10px] text-gray-500 truncate">{file.customerEmail || 'N/A'}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        {file.readStatus ? (
                          <div className="text-xs text-gray-900 truncate">
                            {formatDate(file.readStatus.readAt)}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">Not read yet</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
            </div>
          )}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-xs text-blue-800 font-semibold mb-1">📋 How It Works</p>
        <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
          <li>
            All newly uploaded admin files are automatically marked as <strong>Unread</strong>
          </li>
          <li>
            Unread files appear in the <code>00_New_Not_Viewed_Yet_</code> folder for customers
          </li>
          <li>
            When a customer opens a file, it&apos;s automatically marked as <strong>Read</strong>
          </li>
          <li>
            Read files are removed from <code>00_New_Not_Viewed_Yet_</code> but remain in their
            original folder
          </li>
          <li>Admin can view read status but cannot manually change it</li>
        </ul>
      </div>
    </div>
  );
}
