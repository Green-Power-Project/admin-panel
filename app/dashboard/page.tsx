'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import { useLanguage } from '@/contexts/LanguageContext';
import { translateFolderPath } from '@/lib/translations';
import { db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
  Timestamp,
  getDocs,
} from 'firebase/firestore';
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
      <AdminLayout>
        <DashboardContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const { t } = useLanguage();
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

  function getFolderSegments(folderPath: string): string[] {
    return folderPath.split('/').filter(Boolean);
  }

  function getProjectFolderRef(projectId: string, folderSegments: string[]) {
    if (folderSegments.length === 0) {
      throw new Error('Folder segments must not be empty');
    }
    // Firestore requires odd number of segments for collections
    // Since folder paths can be nested, use the full path as a single document ID
    // Structure: files(collection) -> projects(doc) -> projectId(collection) -> folderPath(doc) -> files(collection)
    const folderPathId = folderSegments.join('__');
    if (!db) {
      throw new Error('Firestore database is not initialized');
    }
    return collection(db, 'files', 'projects', projectId, folderPathId, 'files');
  }

  const loadUnreadFiles = useCallback(async (projectsList: Project[]) => {
    if (!db || projectsList.length === 0) return;
    
    try {
      // Get all read file paths (one-time read for this calculation)
      const readFilesQuery = query(collection(db, 'fileReadStatus'));
      const readFilesSnapshot = await getDocs(readFilesQuery);
      const readFilePaths = new Set<string>();
      readFilesSnapshot.forEach((docSnap) => {
        readFilePaths.add(docSnap.data().filePath);
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

      // Use Firestore file metadata instead of Cloudinary list API
      for (const project of projectsList) {
        for (const folderPath of folderPaths) {
          try {
            const segments = getFolderSegments(folderPath);
            if (segments.length === 0) continue;

            const filesCollection = getProjectFolderRef(project.id, segments);
            const filesSnapshot = await getDocs(filesCollection);

            filesSnapshot.forEach((docSnap) => {
              const data = docSnap.data();
              const storagePath = data.cloudinaryPublicId as string;

              // Skip files that are already read (present in fileReadStatus)
              if (readFilePaths.has(storagePath)) return;

              const fileName = (data.fileName as string) || 'filename';
              unreadFilesList.push({
                projectId: project.id,
                projectName: project.name,
                filePath: storagePath,
                fileName,
                folderPath,
                customerId: project.customerId,
              });
            });
          } catch (error) {
            console.error('Error loading folder from Firestore:', folderPath, error);
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
  }, []); // db is an outer scope value, doesn't need to be in dependencies

  useEffect(() => {
    if (!db) return;

    // Check if this page has been visited before in this session
    const hasVisited = typeof window !== 'undefined' && sessionStorage.getItem('dashboard-visited') === 'true';
    
    // Only show loading on first visit
    if (!hasVisited) {
      setLoading(true);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('dashboard-visited', 'true');
      }
    } else {
      // On subsequent visits (navigating back), don't show loading
      // Real-time listener will populate data quickly from cache
      setLoading(false);
    }

    // Helper function to update customer project counts
    const updateCustomerProjectCounts = (customersMap: Map<string, Customer>, projectsList: Project[]) => {
      customersMap.forEach((customer) => {
        customer.projectCount = 0;
        customer.projectIds = [];
      });

      projectsList.forEach((project) => {
        if (project.customerId && customersMap.has(project.customerId)) {
          const customer = customersMap.get(project.customerId)!;
          customer.projectCount++;
          customer.projectIds.push(project.id);
        }
      });
    };

    // Real-time listener for customers
    const customersUnsubscribe = onSnapshot(
      query(collection(db, 'customers'), orderBy('customerNumber', 'asc')),
      (customersSnapshot) => {
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

        // Update customer project counts with current projects from state
        // Note: projects state is used here, but we rely on the projects listener to update it
        updateCustomerProjectCounts(customerMap, projects);

        setCustomers(Array.from(customerMap.values()));
        setStats((prev) => ({
          ...prev,
          totalCustomers: customerMap.size,
        }));
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to customers:', error);
        setLoading(false);
      }
    );

    // Real-time listener for projects
    const projectsUnsubscribe = onSnapshot(
      query(collection(db, 'projects'), orderBy('name', 'asc')),
      (projectsSnapshot) => {
        const projectsList: Project[] = [];

        projectsSnapshot.forEach((doc) => {
          const projectData = { id: doc.id, ...doc.data() } as Project;
          projectsList.push(projectData);
        });

        setProjects(projectsList);
        setStats((prev) => ({
          ...prev,
          totalProjects: projectsList.length,
        }));

        // Update customer project counts when projects change
        setCustomers((prevCustomers) => {
          const customerMap = new Map<string, Customer>();
          prevCustomers.forEach((customer) => {
            customerMap.set(customer.uid, { ...customer, projectCount: 0, projectIds: [] });
          });
          updateCustomerProjectCounts(customerMap, projectsList);
          return Array.from(customerMap.values());
        });

        // Load unread files when projects change
        loadUnreadFiles(projectsList);
      },
      (error) => {
        console.error('Error listening to projects:', error);
      }
    );

    // Real-time listener for report approvals
    const approvalsUnsubscribe = onSnapshot(
      collection(db, 'reportApprovals'),
      (approvalsSnapshot) => {
        setStats((prev) => ({
          ...prev,
          approvedReports: approvalsSnapshot.size,
        }));
      },
      (error) => {
        console.error('Error listening to report approvals:', error);
      }
    );

    // Cleanup listeners on unmount
    return () => {
      customersUnsubscribe();
      projectsUnsubscribe();
      approvalsUnsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadUnreadFiles]); // projects is used in callback but adding it would cause re-subscriptions

  // Separate effect to handle file read status listener when projects are loaded
  useEffect(() => {
    if (!db || projects.length === 0) return;

    const fileReadStatusUnsubscribe = onSnapshot(
      collection(db, 'fileReadStatus'),
      () => {
        // When read status changes, recalculate unread files
        loadUnreadFiles(projects);
      },
      (error) => {
        console.error('Error listening to file read status:', error);
      }
    );

    return () => {
      fileReadStatusUnsubscribe();
    };
  }, [projects, loadUnreadFiles]);

  return (
    <div className="px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">{t('dashboard.title')}</h2>
          <p className="text-sm text-gray-600">{t('dashboard.overview')}</p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {loading ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-green-power-500 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-24 mb-4"></div>
                  <div className="h-8 bg-gray-300 rounded w-16"></div>
                </div>
              ))}
            </>
          ) : (
            <>
              <StatCard
                title={t('dashboard.totalProjects')}
                value={stats.totalProjects}
                icon="📁"
                link="/projects"
              />
              <StatCard
                title={t('dashboard.totalCustomers')}
                value={stats.totalCustomers}
                icon="👥"
                link="/customers"
              />
              <StatCard
                title={t('dashboard.unreadFiles')}
                value={stats.totalUnreadFiles}
                icon="🔔"
                link="/tracking"
              />
              <StatCard
                title={t('dashboard.approvedReports')}
                value={stats.approvedReports}
                icon="✅"
                link="/approvals"
              />
            </>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Customers List */}
          {loading ? (
            <>
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-xl shadow-lg overflow-hidden animate-pulse">
                  <div className="px-5 py-4 border-b border-gray-200">
                    <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                    <div className="h-3 bg-gray-100 rounded w-16"></div>
                  </div>
                  <div className="divide-y divide-gray-200">
                    {[1, 2].map((j) => (
                      <div key={j} className="px-5 py-3">
                        <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
                        <div className="h-3 bg-gray-100 rounded w-20"></div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                <div className="px-5 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b-2 border-blue-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{t('dashboard.recentCustomers')}</h3>
                    <p className="text-xs text-gray-600 mt-0.5">{t('common.total')}: {stats.totalCustomers}</p>
                  </div>
                  <Link
                    href="/customers"
                    className="text-xs text-green-power-600 hover:text-green-power-700 font-semibold"
                  >
                    {t('dashboard.viewAll')} →
                  </Link>
                </div>
                <div className="divide-y divide-gray-200">
                  {customers.length === 0 ? (
                    <div className="px-5 py-8 text-center">
                      <p className="text-sm text-gray-500">{t('common.noResults')}</p>
                      <Link
                        href="/customers/new"
                        className="mt-2 inline-block text-xs text-green-power-600 hover:text-green-power-700"
                      >
                        {t('common.create')} {t('navigation.customers').toLowerCase()} →
                      </Link>
                    </div>
                  ) : (
                    customers.slice(0, 2).map((customer) => (
                      <Link
                        key={customer.uid}
                        href={`/customers/${customer.uid}`}
                        className="block px-5 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {customer.customerNumber.charAt(0).toUpperCase() + customer.customerNumber.slice(1)}
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
                              {customer.projectCount} {customer.projectCount === 1 ? t('dashboard.totalProjects').toLowerCase().replace('total ', '') : t('dashboard.totalProjects').toLowerCase().replace('total ', '')}
                            </p>
                          </div>
                          <span className="text-gray-400">→</span>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>

              {/* Projects List */}
              <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                <div className="px-5 py-4 bg-gradient-to-r from-purple-50 to-pink-50 border-b-2 border-purple-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{t('dashboard.recentProjects')}</h3>
                    <p className="text-xs text-gray-600 mt-0.5">{t('common.total')}: {stats.totalProjects}</p>
                  </div>
                  <Link
                    href="/projects"
                    className="text-xs text-green-power-600 hover:text-green-power-700 font-semibold"
                  >
                    {t('dashboard.viewAll')} →
                  </Link>
                </div>
                <div className="divide-y divide-gray-200">
                  {projects.length === 0 ? (
                    <div className="px-5 py-8 text-center">
                      <p className="text-sm text-gray-500">{t('common.noResults')}</p>
                      <Link
                        href="/projects/new"
                        className="mt-2 inline-block text-xs text-green-power-600 hover:text-green-power-700"
                      >
                        {t('common.create')} {t('navigation.projects').toLowerCase()} →
                      </Link>
                    </div>
                  ) : (
                    projects.slice(0, 2).map((project) => (
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
              </div>

              {/* Unread Files Overview */}
              <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                <div className="px-5 py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b-2 border-amber-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Unread Files</h3>
                    <p className="text-xs text-gray-600 mt-0.5">Total: {stats.totalUnreadFiles}</p>
                  </div>
                  <Link
                    href="/tracking"
                    className="text-xs text-green-power-600 hover:text-green-power-700 font-semibold"
                  >
                    View all →
                  </Link>
                </div>
                <div className="divide-y divide-gray-200">
                  {unreadFiles.length === 0 ? (
                    <div className="px-5 py-8 text-center">
                      <p className="text-sm text-gray-500">{t('common.noResults')}</p>
                      <Link
                        href="/files"
                        className="mt-2 inline-block text-xs text-green-power-600 hover:text-green-power-700"
                      >
                        {t('common.upload')} {t('navigation.files').toLowerCase()} →
                      </Link>
                    </div>
                  ) : (
                    unreadFiles.slice(0, 2).map((file, index) => (
                      <Link
                        key={`${file.projectId}-${file.filePath}-${index}`}
                        href={`/files/${file.projectId}?from=dashboard`}
                        className="block px-5 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {file.fileName}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5 truncate">
                              {file.projectName} • {translateFolderPath(file.folderPath, t)}
                            </p>
                          </div>
                          <span className="text-gray-400 ml-2">→</span>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Quick Actions */}
        <div className="mt-6 bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-green-power-50 to-green-power-100 border-b border-green-power-200">
            <h3 className="text-base font-semibold text-gray-900">Quick Actions</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link
                href="/projects/new"
                className="flex items-center px-5 py-3 text-sm font-medium text-white bg-gradient-to-r from-green-power-600 to-green-power-700 hover:from-green-power-700 hover:to-green-power-800 rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
              >
                <span className="mr-3 text-lg">➕</span>
                <span>{t('common.create')} {t('common.new')} {t('navigation.projects')}</span>
              </Link>
              <Link
                href="/customers/new"
                className="flex items-center px-5 py-3 text-sm font-medium text-white bg-gradient-to-r from-green-power-600 to-green-power-700 hover:from-green-power-700 hover:to-green-power-800 rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
              >
                <span className="mr-3 text-lg">👤</span>
                <span>{t('common.create')} {t('navigation.customers')} {t('common.name').toLowerCase()}</span>
              </Link>
              <Link
                href="/files"
                className="flex items-center px-5 py-3 text-sm font-medium text-white bg-gradient-to-r from-green-power-600 to-green-power-700 hover:from-green-power-700 hover:to-green-power-800 rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
              >
                <span className="mr-3 text-lg">📤</span>
                <span>{t('common.upload')} {t('navigation.files')}</span>
              </Link>
            </div>
          </div>
        </div>
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
    <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-200 border-l-4 border-green-power-500">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-xs text-gray-600 font-medium uppercase tracking-wide mb-2">{title}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
        </div>
        <div className="text-4xl opacity-80">{icon}</div>
      </div>
    </div>
  );

  if (link) {
    return <Link href={link} className="block hover:scale-105 transition-transform duration-200">{content}</Link>;
  }

  return content;
}
