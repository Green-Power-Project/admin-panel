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
} from 'firebase/firestore';
import { ref, listAll, getMetadata, getDownloadURL } from 'firebase/storage';

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
}

export default function CustomerUploadsPage() {
  return (
    <ProtectedRoute>
      <CustomerUploadsContent />
    </ProtectedRoute>
  );
}

function CustomerUploadsContent() {
  const [uploads, setUploads] = useState<CustomerUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProject, setFilterProject] = useState<string>('all');
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    loadProjects();
    loadCustomerUploads();
  }, []);

  useEffect(() => {
    loadCustomerUploads();
  }, [filterProject]);

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

  async function loadCustomerUploads() {
    setLoading(true);
    try {
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

      // Get all files from 01_Customer_Uploads folder in all projects
      const allUploads: CustomerUpload[] = [];
      const customerUploadFolders = [
        '01_Customer_Uploads',
        '01_Customer_Uploads/Photos',
        '01_Customer_Uploads/Documents',
        '01_Customer_Uploads/Other',
      ];

      for (const projectDoc of projectsSnapshot.docs) {
        const projectId = projectDoc.id;
        const projectData = projectDoc.data();
        
        // Filter by project if needed
        if (filterProject !== 'all' && projectId !== filterProject) {
          continue;
        }

        for (const folderPath of customerUploadFolders) {
          try {
            const folderRef = ref(storage, `projects/${projectId}/${folderPath}`);
            const fileList = await listAll(folderRef);

            for (const itemRef of fileList.items) {
              // Skip .keep placeholder files
              if (itemRef.name === '.keep') {
                continue;
              }

              try {
                const [metadata, downloadUrl] = await Promise.all([
                  getMetadata(itemRef),
                  getDownloadURL(itemRef)
                ]);

                const customerId = projectData.customerId;
                const customerInfo = customersMap.get(customerId);

                // Get upload date from metadata
                const uploadDate = metadata.timeCreated ? new Date(metadata.timeCreated) : new Date();

                allUploads.push({
                  fileName: itemRef.name,
                  filePath: itemRef.fullPath,
                  folderPath,
                  projectId,
                  projectName: projectData.name,
                  customerId,
                  customerNumber: customerInfo?.customerNumber,
                  customerEmail: customerInfo?.email,
                  uploadDate,
                  fileSize: metadata.size,
                  fileType: metadata.contentType || 'unknown',
                  downloadUrl,
                });
              } catch (error) {
                console.error('Error loading file metadata:', itemRef.name, error);
              }
            }
          } catch (error: any) {
            if (error.code !== 'storage/object-not-found') {
              console.error('Error loading folder:', folderPath, error);
            }
          }
        }
      }

      // Sort by upload date (newest first)
      allUploads.sort((a, b) => b.uploadDate.getTime() - a.uploadDate.getTime());

      setUploads(allUploads);
    } catch (error) {
      console.error('Error loading customer uploads:', error);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(date: Date): string {
    return date.toLocaleString();
  }

  function formatFileSize(bytes: number): string {
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
    if (folderPath === '01_Customer_Uploads') return 'Customer Uploads';
    return folderPath.split('/').pop() || folderPath;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900">Customer Uploads Review</h2>
          <p className="text-sm text-gray-500 mt-1">View files uploaded by customers</p>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Filter by Project
          </label>
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
          >
            <option value="all">All Projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="bg-white border border-gray-200 rounded-sm p-12 text-center">
            <div className="inline-block h-6 w-6 border-2 border-gray-300 border-t-green-power-500 rounded-full animate-spin"></div>
            <p className="mt-4 text-sm text-gray-500">Loading customer uploads...</p>
          </div>
        ) : uploads.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-sm p-12 text-center">
            <p className="text-sm text-gray-500">No customer uploads found.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <p className="text-sm font-medium text-gray-900">
                Total Files: {uploads.length}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      File Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Project
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Folder
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Upload Date & Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Size
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {uploads.map((upload, index) => (
                    <tr key={`${upload.filePath}-${index}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <span className="mr-2 text-lg">{getFileIcon(upload.fileType)}</span>
                          <div>
                            <a
                              href={upload.downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-gray-900 hover:text-green-power-600"
                            >
                              {upload.fileName}
                            </a>
                            <div className="text-xs text-gray-500 font-mono mt-0.5 truncate max-w-xs">
                              {upload.filePath}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{upload.projectName}</div>
                        <div className="text-xs text-gray-500 font-mono">{upload.projectId.slice(0, 8)}...</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{upload.customerNumber || 'N/A'}</div>
                        <div className="text-xs text-gray-500">{upload.customerEmail || 'N/A'}</div>
                        <div className="text-xs text-gray-400 font-mono mt-0.5">{upload.customerId.slice(0, 8)}...</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{getFolderDisplayName(upload.folderPath)}</div>
                        <div className="text-xs text-gray-500">{upload.folderPath}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{formatDate(upload.uploadDate)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">{formatFileSize(upload.fileSize)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-sm p-4">
          <p className="text-xs text-blue-800 font-medium mb-1">📋 Customer Uploads</p>
          <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
            <li>Files uploaded by customers appear only in <code>01_Customer_Uploads</code> folder</li>
            <li>Admin can view file name, upload date & time, project, and customer information</li>
            <li>Click on file name to download the file</li>
            <li>Files are organized by subfolder: Photos, Documents, Other</li>
          </ul>
        </div>
      </main>
    </div>
  );
}

