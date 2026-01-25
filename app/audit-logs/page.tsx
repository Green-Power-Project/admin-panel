'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import { db } from '@/lib/firebase';
import { useLanguage } from '@/contexts/LanguageContext';
import { translateFolderPath, translateStatus } from '@/lib/translations';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  Timestamp,
  getDocs,
} from 'firebase/firestore';
import { getAllFolderPathsArray } from '@/lib/folderStructure';
import { exportFilteredLogsToPDF, AuditLogEntry } from '@/lib/pdfExport';
import Pagination from '@/components/Pagination';

interface FileReadStatus {
  id: string;
  projectId: string;
  customerId: string;
  filePath: string;
  readAt: Timestamp;
}

interface AuditLogData {
  fileName: string;
  filePath: string;
  projectName: string;
  projectId: string;
  folderPath: string;
  customerNumber: string;
  customerEmail: string;
  customerId: string;
  readAt: string;
  isRead: boolean;
}

export default function AuditLogsPage() {
  return (
    <ProtectedRoute>
      <AdminLayout title="Audit Logs">
        <AuditLogsContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function AuditLogsContent() {
  const { t } = useLanguage();
  const [allLogs, setAllLogs] = useState<AuditLogData[]>([]);
  const [logs, setLogs] = useState<AuditLogData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProject, setFilterProject] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCustomer, setFilterCustomer] = useState<string>(''); // customer/project/file search
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

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

  // Real-time listeners for fileReadStatus, projects, and customers
  useEffect(() => {
    if (!db) return;
    const dbInstance = db; // Store for TypeScript narrowing

    let readStatusesMap = new Map<string, FileReadStatus[]>();
    let projectsMap = new Map<string, { name: string; customerId: string }>();
    let customersMap = new Map<string, { customerNumber: string; email: string }>();

    // Real-time listener for file read status
    const fileReadStatusUnsubscribe = onSnapshot(
      collection(dbInstance, 'fileReadStatus'),
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
        // Trigger audit logs reload when read status changes
        if (projectsMap.size > 0 && customersMap.size > 0) {
          processAuditLogs(readStatusesMap, projectsMap, customersMap);
        }
      },
      (error) => {
        console.error('Error listening to file read status:', error);
      }
    );

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
        // Trigger audit logs reload when projects change
        if (readStatusesMap.size >= 0 && customersMap.size > 0) {
          processAuditLogs(readStatusesMap, projectsMap, customersMap);
        }
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
        // Trigger audit logs reload when customers change
        if (readStatusesMap.size >= 0 && projectsMap.size > 0) {
          processAuditLogs(readStatusesMap, projectsMap, customersMap);
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


  async function processAuditLogs(
    readStatusesMap: Map<string, FileReadStatus[]>,
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

      // Get all files from all projects via Firestore metadata
      const allLogsData: AuditLogData[] = [];
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
        // Use all defined folders (including customer uploads for audit logs)
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
            console.error('Error building folder reference for audit logs:', folderPath, error);
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
          const fileName = (data.fileName as string) || 'file';
          const readStatuses = readStatusesMap.get(storagePath) || [];
          const readStatus = readStatuses.length > 0 ? readStatuses[0] : null;
          const isRead = readStatus !== null;

          let readAtFormatted = 'Not read yet';
          if (readStatus && readStatus.readAt) {
            const date = readStatus.readAt.toDate();
            readAtFormatted = date.toLocaleString();
          }

          allLogsData.push({
            fileName,
            filePath: storagePath,
            projectName,
            projectId,
            folderPath,
            customerNumber: customerInfo?.customerNumber || 'N/A',
            customerEmail: customerInfo?.email || 'N/A',
            customerId,
            readAt: readAtFormatted,
            isRead,
          });
        });
      });

      // Sort: unread first, then by read date (newest first)
      allLogsData.sort((a, b) => {
        if (a.isRead !== b.isRead) {
          return a.isRead ? 1 : -1; // Unread first
        }
        // For read files, sort by read date (newest first)
        if (a.isRead && b.isRead) {
          return b.readAt.localeCompare(a.readAt);
        }
        return 0;
      });

      setAllLogs(allLogsData);
    } catch (error) {
      console.error('Error processing audit logs:', error);
    } finally {
      setLoading(false);
    }
  }

  // Fast in-memory filtering for instant UI response
  useEffect(() => {
    let filtered = [...allLogs];

    if (filterProject !== 'all') {
      filtered = filtered.filter((log) => log.projectId === filterProject);
    }

    if (filterStatus === 'read') {
      filtered = filtered.filter((log) => log.isRead);
    } else if (filterStatus === 'unread') {
      filtered = filtered.filter((log) => !log.isRead);
    }

    const term = filterCustomer.trim().toLowerCase();
    if (term) {
      filtered = filtered.filter((log) => {
        const num = log.customerNumber?.toLowerCase() || '';
        const email = log.customerEmail?.toLowerCase() || '';
        const projectName = log.projectName.toLowerCase();
        const fileName = log.fileName.toLowerCase();
        return (
          num.includes(term) ||
          email.includes(term) ||
          projectName.includes(term) ||
          fileName.includes(term)
        );
      });
    }

    setLogs(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  }, [allLogs, filterProject, filterStatus, filterCustomer]);

  function handleExportPDF() {
    const exportData: AuditLogEntry[] = logs.map(log => ({
      fileName: log.fileName,
      filePath: log.filePath,
      projectName: log.projectName,
      projectId: log.projectId,
      folderPath: log.folderPath,
      customerNumber: log.customerNumber,
      customerEmail: log.customerEmail,
      customerId: log.customerId,
      readAt: log.readAt,
      isRead: log.isRead,
    }));

    exportFilteredLogsToPDF(exportData, filterProject, filterStatus, projects);
  }

  const totalLogs = logs.length;
  const readCount = logs.filter((log) => log.isRead).length;
  const unreadCount = totalLogs - readCount;

  return (
    <div className="px-8 py-8 space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-green-power-50 to-green-power-100">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-lg md:text-xl font-semibold text-gray-900">Read Documentation / Audit Logs</h2>
              <p className="text-xs md:text-sm text-gray-600 mt-1">
                Complete audit trail of file read activities.
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                ⚠️ Audit logs are automatically generated when customers open files. Admin can view but cannot manually change records.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-3 py-2 rounded-lg bg-white/90 border border-gray-200">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">Total</p>
                <p className="text-sm font-semibold text-gray-900">{totalLogs}</p>
              </div>
              <div className="px-3 py-2 rounded-lg bg-white/90 border border-green-200">
                <p className="text-[11px] text-green-700 uppercase tracking-wide">Read</p>
                <p className="text-sm font-semibold text-green-800">{readCount}</p>
              </div>
              <div className="px-3 py-2 rounded-lg bg-white/90 border border-yellow-200">
                <p className="text-[11px] text-yellow-700 uppercase tracking-wide">Unread</p>
                <p className="text-sm font-semibold text-yellow-800">{unreadCount}</p>
              </div>
              <button
                onClick={handleExportPDF}
                disabled={loading || logs.length === 0}
                className="px-4 py-2 bg-green-power-500 text-white text-sm font-medium rounded-md hover:bg-green-power-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 transition-colors"
              >
                <span>📄</span>
                <span>Export PDF</span>
              </button>
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
                  <div className="h-6 w-24 rounded-full bg-gray-200" />
                  <div className="h-3 w-40 rounded bg-gray-200" />
                  <div className="h-3 w-32 rounded bg-gray-200" />
                  <div className="h-3 w-28 rounded bg-gray-200" />
                  <div className="h-3 w-32 rounded bg-gray-200" />
                  <div className="h-3 w-40 rounded bg-gray-200" />
                </div>
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-8 text-center">
              <p className="text-sm font-medium text-gray-700">
                No audit logs found for the selected filters.
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
                      File Name
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
                      Date & Time Opened
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {logs
                    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                    .map((log, index) => (
                    <tr key={`${log.filePath}-${index}`} className="hover:bg-gray-50/80">
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            log.isRead
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {log.isRead ? `✓ ${translateStatus('read', t)}` : `● ${translateStatus('unread', t)}`}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-xs font-medium text-gray-900 truncate">
                          {log.fileName || 'Untitled file'}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-xs text-gray-900 truncate">{log.projectName}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-xs text-gray-900 truncate">
                          {translateFolderPath(log.folderPath, t)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-xs text-gray-900 truncate">
                          {log.customerNumber 
                            ? log.customerNumber.charAt(0).toUpperCase() + log.customerNumber.slice(1)
                            : 'N/A'}
                        </div>
                        <div className="text-[10px] text-gray-500 truncate">{log.customerEmail}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-xs text-gray-900 truncate">
                          {log.isRead ? log.readAt : <span className="text-gray-400">Not read yet</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                currentPage={currentPage}
                totalPages={Math.ceil(logs.length / itemsPerPage)}
                totalItems={logs.length}
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
        <p className="text-xs text-blue-800 font-semibold mb-1">📋 Audit Log Information</p>
        <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
          <li>Each record shows: File name, Customer, Project, Folder, Date & Time opened</li>
          <li>Unread files show &quot;Not read yet&quot; in the Date & Time column</li>
          <li>Export PDF includes all visible records with current filters applied</li>
          <li>PDF export includes summary statistics and formatted table</li>
        </ul>
      </div>
    </div>
  );
}

