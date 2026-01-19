'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
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
} from 'firebase/firestore';
import { ref, listAll } from 'firebase/storage';
import { PROJECT_FOLDER_STRUCTURE } from '@/lib/folderStructure';

interface Project {
  id: string;
  name: string;
  year?: number;
  customerId: string;
}

interface Customer {
  uid: string;
  customerNumber: string;
  email: string;
  enabled: boolean;
  projectCount: number;
  projectIds: string[];
}

interface UnreadFile {
  projectId: string;
  projectName: string;
  filePath: string;
  fileName: string;
  folderPath: string;
  customerId: string;
}

interface DashboardStats {
  totalProjects: number;
  totalCustomers: number;
  totalUnreadFiles: number;
  approvedReports: number;
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const [stats, setStats] = useState<DashboardStats>({
    totalProjects: 0,
    totalCustomers: 0,
    totalUnreadFiles: 0,
    approvedReports: 0,
  });
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [unreadFiles, setUnreadFiles] = useState<UnreadFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    setLoading(true);
    try {
      // Load customers from customers collection
      const customersSnapshot = await getDocs(
        query(collection(db, 'customers'), orderBy('customerNumber', 'asc'))
      );
      const customerMap = new Map<string, Customer>();

      customersSnapshot.forEach((doc) => {
        const data = doc.data();
        customerMap.set(data.uid, {
          uid: data.uid,
          customerNumber: data.customerNumber || 'N/A',
          email: data.email || 'N/A',
          enabled: data.enabled !== false,
          projectCount: 0,
          projectIds: [],
        });
      });

      // Load projects
      const projectsSnapshot = await getDocs(
        query(collection(db, 'projects'), orderBy('name', 'asc'))
      );
      const projectsList: Project[] = [];

      projectsSnapshot.forEach((doc) => {
        const projectData = { id: doc.id, ...doc.data() } as Project;
        projectsList.push(projectData);

        // Update customer project counts
        if (projectData.customerId && customerMap.has(projectData.customerId)) {
          const customer = customerMap.get(projectData.customerId)!;
          customer.projectCount++;
          customer.projectIds.push(projectData.id);
        }
      });

      setProjects(projectsList);
      setCustomers(Array.from(customerMap.values()));
      setStats({
        totalProjects: projectsList.length,
        totalCustomers: customerMap.size,
        totalUnreadFiles: 0, // Will be calculated below
        approvedReports: 0, // Will be calculated below
      });

      // Load unread files
      await loadUnreadFiles(projectsList);

      // Load report approvals count
      const approvalsSnapshot = await getDocs(collection(db, 'reportApprovals'));
      setStats((prev) => ({
        ...prev,
        approvedReports: approvalsSnapshot.size,
      }));
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadUnreadFiles(projectsList: Project[]) {
    try {
      // Get all read file paths
      const readFilesSnapshot = await getDocs(collection(db, 'fileReadStatus'));
      const readFilePaths = new Set<string>();
      readFilesSnapshot.forEach((doc) => {
        readFilePaths.add(doc.data().filePath);
      });

      // Get all folder paths
      const getAllFolderPaths = (folders: typeof PROJECT_FOLDER_STRUCTURE): string[] => {
        const paths: string[] = [];
        folders.forEach((folder) => {
          if (folder.path !== '00_New_Not_Viewed_Yet_') {
            paths.push(folder.path);
            if (folder.children) {
              folder.children.forEach((child) => {
                paths.push(child.path);
              });
            }
          }
        });
        return paths;
      };

      const folderPaths = getAllFolderPaths(PROJECT_FOLDER_STRUCTURE);
      const unreadFilesList: UnreadFile[] = [];

      // Check each project
      for (const project of projectsList) {
        for (const folderPath of folderPaths) {
          try {
            const folderRef = ref(storage, `projects/${project.id}/${folderPath}`);
            const fileList = await listAll(folderRef);

            for (const itemRef of fileList.items) {
              const storagePath = itemRef.fullPath;
              if (!readFilePaths.has(storagePath)) {
                const fileName = itemRef.name;
                unreadFilesList.push({
                  projectId: project.id,
                  projectName: project.name,
                  filePath: storagePath,
                  fileName,
                  folderPath,
                  customerId: project.customerId,
                });
              }
            }
          } catch (error: any) {
            if (error.code !== 'storage/object-not-found') {
              console.error('Error loading folder:', folderPath, error);
            }
          }
        }
      }

      setUnreadFiles(unreadFilesList);
      setStats((prev) => ({
        ...prev,
        totalUnreadFiles: unreadFilesList.length,
      }));
    } catch (error) {
      console.error('Error loading unread files:', error);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900">Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Overview of customers, projects, and files</p>
        </div>

        {/* Statistics Cards */}
        {loading ? (
          <div className="bg-white border border-gray-200 rounded-sm p-12 text-center">
            <div className="inline-block h-6 w-6 border-2 border-gray-300 border-t-green-power-500 rounded-full animate-spin"></div>
            <p className="mt-4 text-sm text-gray-500">Loading dashboard...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard
                title="Total Projects"
                value={stats.totalProjects}
                icon="📁"
                link="/projects"
              />
              <StatCard
                title="Total Customers"
                value={stats.totalCustomers}
                icon="👥"
                link="/customers"
              />
              <StatCard
                title="Unread Files"
                value={stats.totalUnreadFiles}
                icon="🔔"
                link="/tracking"
              />
              <StatCard
                title="Approved Reports"
                value={stats.approvedReports}
                icon="✅"
                link="/approvals"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Customers List */}
              <div className="bg-white border border-gray-200 rounded-sm">
                <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Customers</h3>
                  <Link
                    href="/customers"
                    className="text-xs text-green-power-600 hover:text-green-power-700 font-medium"
                  >
                    View all →
                  </Link>
                </div>
                <div className="divide-y divide-gray-200">
                  {customers.length === 0 ? (
                    <div className="px-5 py-8 text-center">
                      <p className="text-sm text-gray-500">No customers found</p>
                      <Link
                        href="/customers/new"
                        className="mt-2 inline-block text-xs text-green-power-600 hover:text-green-power-700"
                      >
                        Create customer →
                      </Link>
                    </div>
                  ) : (
                    customers.slice(0, 5).map((customer) => (
                      <Link
                        key={customer.uid}
                        href={`/customers/${customer.uid}`}
                        className="block px-5 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {customer.customerNumber}
                              </p>
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                                  customer.enabled
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {customer.enabled ? '✓' : '✗'}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {customer.projectCount} {customer.projectCount === 1 ? 'project' : 'projects'}
                            </p>
                          </div>
                          <span className="text-gray-400">→</span>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
                {customers.length > 5 && (
                  <div className="px-5 py-3 border-t border-gray-200">
                    <Link
                      href="/customers"
                      className="text-xs text-gray-600 hover:text-gray-900 font-medium"
                    >
                      View all {customers.length} customers →
                    </Link>
                  </div>
                )}
              </div>

              {/* Projects List */}
              <div className="bg-white border border-gray-200 rounded-sm">
                <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Projects</h3>
                  <Link
                    href="/projects"
                    className="text-xs text-green-power-600 hover:text-green-power-700 font-medium"
                  >
                    View all →
                  </Link>
                </div>
                <div className="divide-y divide-gray-200">
                  {projects.length === 0 ? (
                    <div className="px-5 py-8 text-center">
                      <p className="text-sm text-gray-500">No projects found</p>
                      <Link
                        href="/projects/new"
                        className="mt-2 inline-block text-xs text-green-power-600 hover:text-green-power-700"
                      >
                        Create project →
                      </Link>
                    </div>
                  ) : (
                    projects.slice(0, 5).map((project) => (
                      <Link
                        key={project.id}
                        href={`/projects/${project.id}`}
                        className="block px-5 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {project.name}
                            </p>
                            {project.year && (
                              <p className="text-xs text-gray-500 mt-0.5">{project.year}</p>
                            )}
                          </div>
                          <span className="text-gray-400">→</span>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
                {projects.length > 5 && (
                  <div className="px-5 py-3 border-t border-gray-200">
                    <Link
                      href="/projects"
                      className="text-xs text-gray-600 hover:text-gray-900 font-medium"
                    >
                      View all {projects.length} projects →
                    </Link>
                  </div>
                )}
              </div>

              {/* Unread Files Overview */}
              <div className="bg-white border border-gray-200 rounded-sm">
                <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Unread Files</h3>
                  <Link
                    href="/tracking"
                    className="text-xs text-green-power-600 hover:text-green-power-700 font-medium"
                  >
                    View all →
                  </Link>
                </div>
                <div className="divide-y divide-gray-200">
                  {unreadFiles.length === 0 ? (
                    <div className="px-5 py-8 text-center">
                      <p className="text-sm text-gray-500">No unread files</p>
                      <Link
                        href="/files"
                        className="mt-2 inline-block text-xs text-green-power-600 hover:text-green-power-700"
                      >
                        Upload files →
                      </Link>
                    </div>
                  ) : (
                    unreadFiles.slice(0, 5).map((file, index) => (
                      <Link
                        key={`${file.projectId}-${file.filePath}-${index}`}
                        href={`/files/${file.projectId}`}
                        className="block px-5 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {file.fileName}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5 truncate">
                              {file.projectName} • {file.folderPath}
                            </p>
                          </div>
                          <span className="text-gray-400 ml-2">→</span>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
                {unreadFiles.length > 5 && (
                  <div className="px-5 py-3 border-t border-gray-200">
                    <Link
                      href="/tracking"
                      className="text-xs text-gray-600 hover:text-gray-900 font-medium"
                    >
                      View all {unreadFiles.length} unread files →
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="mt-6 bg-white border border-gray-200 rounded-sm">
              <div className="px-5 py-4 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900">Quick Actions</h3>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Link
                    href="/projects/new"
                    className="flex items-center px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 rounded-sm border border-gray-200 transition-colors"
                  >
                    <span className="mr-2">➕</span>
                    <span>Create New Project</span>
                  </Link>
                  <Link
                    href="/customers/new"
                    className="flex items-center px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 rounded-sm border border-gray-200 transition-colors"
                  >
                    <span className="mr-2">👤</span>
                    <span>Create Customer Account</span>
                  </Link>
                  <Link
                    href="/files"
                    className="flex items-center px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 rounded-sm border border-gray-200 transition-colors"
                  >
                    <span className="mr-2">📤</span>
                    <span>Upload Files</span>
                  </Link>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  link,
}: {
  title: string;
  value: number;
  icon: string;
  link?: string;
}) {
  const content = (
    <div className="bg-white border border-gray-200 rounded-sm p-5 hover:border-green-power-500 transition-colors">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 font-medium">{title}</p>
          <p className="text-2xl font-semibold text-gray-900 mt-2">{value}</p>
        </div>
        <div className="text-3xl">{icon}</div>
      </div>
    </div>
  );

  if (link) {
    return <Link href={link}>{content}</Link>;
  }

  return content;
}
