'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AppHeader from '@/components/AppHeader';
import { db, storage } from '@/lib/firebase';
import {
  collection,
  getDocs,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { ref, listAll } from 'firebase/storage';
import { getAllFolderPathsArray } from '@/lib/folderStructure';
import { exportFilteredLogsToPDF, AuditLogEntry } from '@/lib/pdfExport';

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
      <AuditLogsContent />
    </ProtectedRoute>
  );
}

function AuditLogsContent() {
  const [logs, setLogs] = useState<AuditLogData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProject, setFilterProject] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    loadProjects();
    loadAuditLogs();
  }, []);

  useEffect(() => {
    loadAuditLogs();
  }, [filterProject, filterStatus]);

  async function loadProjects() {
    try {
      const q = query(collection(db, 'projects'), orderBy('name', 'asc'));
      const snapshot = await getDocs(q);
      const projectsList: Array<{ id: string; name: string }> = [];
      snapshot.forEach((doc) => {
        projectsList.push({ id: doc.id, name: doc.data().name });
      });
      setProjects(projectsList);
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  }

  async function loadAuditLogs() {
    setLoading(true);
    try {
      // Get all read statuses
      const readStatusesSnapshot = await getDocs(collection(db, 'fileReadStatus'));
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

      // Get all projects
      const projectsSnapshot = await getDocs(collection(db, 'projects'));
      const projectsMap = new Map<string, { name: string; customerId: string }>();
      
      projectsSnapshot.forEach((doc) => {
        const data = doc.data();
        projectsMap.set(doc.id, {
          name: data.name,
          customerId: data.customerId,
        });
      });

      // Get customer information
      const customersSnapshot = await getDocs(collection(db, 'customers'));
      const customersMap = new Map<string, { customerNumber: string; email: string }>();
      
      customersSnapshot.forEach((doc) => {
        const data = doc.data();
        customersMap.set(data.uid, {
          customerNumber: data.customerNumber || 'N/A',
          email: data.email || 'N/A',
        });
      });

      // Get all files from all projects
      const allLogs: AuditLogData[] = [];
      const folderPaths = getAllFolderPathsArray();

      for (const projectDoc of projectsSnapshot.docs) {
        const projectId = projectDoc.id;
        const projectData = projectDoc.data();
        
        // Filter by project if needed
        if (filterProject !== 'all' && projectId !== filterProject) {
          continue;
        }

        // Skip customer uploads folder (not tracked)
        const relevantFolders = folderPaths.filter(
          (path) => !path.startsWith('01_Customer_Uploads')
        );

        for (const folderPath of relevantFolders) {
          try {
            const folderRef = ref(storage, `projects/${projectId}/${folderPath}`);
            const fileList = await listAll(folderRef);

            for (const itemRef of fileList.items) {
              // Skip .keep placeholder files
              if (itemRef.name === '.keep') {
                continue;
              }

              const storagePath = itemRef.fullPath;
              const fileName = itemRef.name;
              
              // Get read status for this file
              const readStatuses = readStatusesMap.get(storagePath) || [];
              const readStatus = readStatuses.length > 0 ? readStatuses[0] : null;
              
              // Filter by read status if needed
              const isRead = readStatus !== null;
              if (filterStatus === 'read' && !isRead) continue;
              if (filterStatus === 'unread' && isRead) continue;

              const customerId = projectData.customerId;
              const customerInfo = customersMap.get(customerId);

              // Format read date
              let readAtFormatted = 'Not read yet';
              if (readStatus && readStatus.readAt) {
                const date = readStatus.readAt.toDate();
                readAtFormatted = date.toLocaleString();
              }

              allLogs.push({
                fileName,
                filePath: storagePath,
                projectName: projectData.name,
                projectId,
                folderPath,
                customerNumber: customerInfo?.customerNumber || 'N/A',
                customerEmail: customerInfo?.email || 'N/A',
                customerId,
                readAt: readAtFormatted,
                isRead,
              });
            }
          } catch (error: any) {
            if (error.code !== 'storage/object-not-found') {
              console.error('Error loading folder:', folderPath, error);
            }
          }
        }
      }

      // Sort: unread first, then by read date (newest first)
      allLogs.sort((a, b) => {
        if (a.isRead !== b.isRead) {
          return a.isRead ? 1 : -1; // Unread first
        }
        // For read files, sort by read date (newest first)
        if (a.isRead && b.isRead) {
          return b.readAt.localeCompare(a.readAt);
        }
        return 0;
      });

      setLogs(allLogs);
    } catch (error) {
      console.error('Error loading audit logs:', error);
    } finally {
      setLoading(false);
    }
  }

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

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Read Documentation / Audit Logs</h2>
            <p className="text-sm text-gray-500 mt-1">Complete audit trail of file read activities</p>
          </div>
          <button
            onClick={handleExportPDF}
            disabled={loading || logs.length === 0}
            className="px-4 py-2 bg-green-power-500 text-white text-sm font-medium rounded-sm hover:bg-green-power-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            📄 Export PDF
          </button>
        </div>

        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Project
            </label>
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
            >
              <option value="all">All Files</option>
              <option value="unread">Unread Only</option>
              <option value="read">Read Only</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="bg-white border border-gray-200 rounded-sm p-12 text-center">
            <div className="inline-block h-6 w-6 border-2 border-gray-300 border-t-green-power-500 rounded-full animate-spin"></div>
            <p className="mt-4 text-sm text-gray-500">Loading audit logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-sm p-12 text-center">
            <p className="text-sm text-gray-500">No audit logs found matching the selected filters.</p>
          </div>
        ) : (
          <>
            <div className="bg-white border border-gray-200 rounded-sm overflow-hidden mb-4">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900">
                    Total Records: {logs.length}
                  </p>
                  <p className="text-xs text-gray-500">
                    {logs.filter(log => log.isRead).length} Read | {logs.filter(log => !log.isRead).length} Unread
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        File Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Project
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Folder
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date & Time Opened
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {logs.map((log, index) => (
                      <tr key={`${log.filePath}-${index}`} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              log.isRead
                                ? 'bg-green-100 text-green-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {log.isRead ? '✓ Read' : '● Unread'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{log.fileName}</div>
                          <div className="text-xs text-gray-500 font-mono mt-0.5 truncate max-w-xs">
                            {log.filePath}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{log.projectName}</div>
                          <div className="text-xs text-gray-500 font-mono">{log.projectId.slice(0, 8)}...</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {log.folderPath.split('/').pop() || log.folderPath}
                          </div>
                          <div className="text-xs text-gray-500">{log.folderPath}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{log.customerNumber}</div>
                          <div className="text-xs text-gray-500">{log.customerEmail}</div>
                          <div className="text-xs text-gray-400 font-mono mt-0.5">{log.customerId.slice(0, 8)}...</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {log.isRead ? log.readAt : <span className="text-gray-400">Not read yet</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-sm p-4">
          <p className="text-xs text-blue-800 font-medium mb-1">📋 Audit Log Information</p>
          <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
            <li>Each record shows: File name, Customer, Project, Folder, Date & Time opened</li>
            <li>Unread files show "Not read yet" in the Date & Time column</li>
            <li>Export PDF includes all visible records with current filters applied</li>
            <li>PDF export includes summary statistics and formatted table</li>
          </ul>
        </div>
      </main>
    </div>
  );
}

