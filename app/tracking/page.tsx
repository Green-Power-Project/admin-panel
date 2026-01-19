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
  where,
  Timestamp,
  doc,
  getDoc,
} from 'firebase/firestore';
import { ref, listAll, getMetadata } from 'firebase/storage';
import { PROJECT_FOLDER_STRUCTURE, getAllFolderPathsArray } from '@/lib/folderStructure';

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
      <TrackingContent />
    </ProtectedRoute>
  );
}

function TrackingContent() {
  const [files, setFiles] = useState<FileTrackingInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProject, setFilterProject] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all'); // 'all', 'read', 'unread'
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    loadProjects();
    loadFileTracking();
  }, []);

  useEffect(() => {
    loadFileTracking();
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

  async function loadFileTracking() {
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
      const allFiles: FileTrackingInfo[] = [];
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
              const readStatus = readStatuses.length > 0 ? readStatuses[0] : null; // Get first read status
              
              // Filter by read status if needed
              const isRead = readStatus !== null;
              if (filterStatus === 'read' && !isRead) continue;
              if (filterStatus === 'unread' && isRead) continue;

              const customerId = projectData.customerId;
              const customerInfo = customersMap.get(customerId);

              allFiles.push({
                filePath: storagePath,
                fileName,
                folderPath,
                projectId,
                projectName: projectData.name,
                customerId,
                customerNumber: customerInfo?.customerNumber,
                customerEmail: customerInfo?.email,
                readStatus,
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
      allFiles.sort((a, b) => {
        if (a.isRead !== b.isRead) {
          return a.isRead ? 1 : -1; // Unread first
        }
        if (a.readStatus && b.readStatus) {
          return b.readStatus.readAt.toMillis() - a.readStatus.readAt.toMillis();
        }
        return 0;
      });

      setFiles(allFiles);
    } catch (error) {
      console.error('Error loading file tracking:', error);
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

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900">File Read Tracking</h2>
          <p className="text-sm text-gray-500 mt-1">Monitor which files customers have viewed</p>
          <p className="text-xs text-gray-400 mt-1">⚠️ Read status is automatically updated when customers open files. Admin cannot manually change read status.</p>
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
            <p className="mt-4 text-sm text-gray-500">Loading tracking data...</p>
          </div>
        ) : files.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-sm p-12 text-center">
            <p className="text-sm text-gray-500">No files found matching the selected filters.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-sm overflow-hidden">
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
                    Read At
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {files.map((file, index) => (
                  <tr key={`${file.filePath}-${index}`} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          file.isRead
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {file.isRead ? '✓ Read' : '● Unread'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{file.fileName}</div>
                      <div className="text-xs text-gray-500 font-mono mt-0.5 truncate max-w-xs">
                        {file.filePath}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{file.projectName}</div>
                      <div className="text-xs text-gray-500 font-mono">{file.projectId.slice(0, 8)}...</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{getFolderDisplayName(file.folderPath)}</div>
                      <div className="text-xs text-gray-500">{file.folderPath}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{file.customerNumber || 'N/A'}</div>
                      <div className="text-xs text-gray-500">{file.customerEmail || 'N/A'}</div>
                      <div className="text-xs text-gray-400 font-mono mt-0.5">{file.customerId.slice(0, 8)}...</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {file.readStatus ? (
                        <div className="text-sm text-gray-900">
                          {formatDate(file.readStatus.readAt)}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Not read yet</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-sm p-4">
          <p className="text-xs text-blue-800 font-medium mb-1">📋 How It Works</p>
          <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
            <li>All newly uploaded admin files are automatically marked as <strong>Unread</strong></li>
            <li>Unread files appear in the <code>00_New_Not_Viewed_Yet_</code> folder for customers</li>
            <li>When a customer opens a file, it's automatically marked as <strong>Read</strong></li>
            <li>Read files are removed from <code>00_New_Not_Viewed_Yet_</code> but remain in their original folder</li>
            <li>Admin can view read status but cannot manually change it</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
