'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import { db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  getDocs,
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
}

export default function CustomerUploadsPage() {
  return (
    <ProtectedRoute>
      <AdminLayout title="Customer Uploads">
        <CustomerUploadsContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function CustomerUploadsContent() {
  const [allUploads, setAllUploads] = useState<CustomerUpload[]>([]);
  const [uploads, setUploads] = useState<CustomerUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProject, setFilterProject] = useState<string>('all');
  const [filterCustomer, setFilterCustomer] = useState<string>(''); // customer/project/file search
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

  // Real-time listeners for projects and customers
  useEffect(() => {
    if (!db) return;

    let projectsMap = new Map<string, { name: string; customerId: string }>();
    let customersMap = new Map<string, { customerNumber: string; email: string }>();

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
        // Trigger customer uploads reload when projects change
        if (customersMap.size > 0) {
          processCustomerUploads(projectsMap, customersMap);
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
        // Trigger customer uploads reload when customers change
        if (projectsMap.size > 0) {
          processCustomerUploads(projectsMap, customersMap);
        }
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
    if (folderPath === '01_Customer_Uploads') return 'Customer Uploads';
    return folderPath.split('/').pop() || folderPath;
  }

  const totalUploads = uploads.length;

  return (
    <div className="px-8 py-8 space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-green-power-50 to-green-power-100">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-lg md:text-xl font-semibold text-gray-900">Customer Uploads Review</h2>
              <p className="text-xs md:text-sm text-gray-600 mt-1">
                View files uploaded by customers.
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                ⚠️ Customer uploads appear only in the Customer Uploads folder. Admin can view but cannot edit or delete customer files.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-3 py-2 rounded-lg bg-white/90 border border-gray-200">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">Total</p>
                <p className="text-sm font-semibold text-gray-900">{totalUploads}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/60">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                No customer uploads found for the selected filters.
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Try adjusting the project or customer filters to widen your search.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[30%]">
                      File Name
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[20%]">
                      Project
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[20%]">
                      Customer
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[15%]">
                      Folder
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[15%]">
                      Upload Date & Time
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {uploads
                    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                    .map((upload, index) => (
                    <tr key={`${upload.filePath}-${index}`} className="hover:bg-gray-50/80">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm flex-shrink-0">{getFileIcon(upload.fileType)}</span>
                          <a
                            href={upload.downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-gray-900 hover:text-green-power-600 truncate"
                          >
                            {upload.fileName}
                          </a>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-xs text-gray-900 truncate">{upload.projectName}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-xs text-gray-900 truncate">{upload.customerNumber || 'N/A'}</div>
                        <div className="text-[10px] text-gray-500 truncate">{upload.customerEmail || 'N/A'}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-xs text-gray-900 truncate">{getFolderDisplayName(upload.folderPath)}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-xs text-gray-900 truncate">{formatDate(upload.uploadDate)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-xs text-blue-800 font-semibold mb-1">📋 Customer Uploads</p>
        <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
          <li>Files uploaded by customers appear only in <code>01_Customer_Uploads</code> folder</li>
          <li>Admin can view file name, upload date & time, project, and customer information</li>
          <li>Click on file name to download the file</li>
          <li>Files are organized by subfolder: Photos, Documents, Other</li>
        </ul>
      </div>
    </div>
  );
}

