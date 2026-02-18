'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import { useLanguage } from '@/contexts/LanguageContext';
import { db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  getDocs,
  Timestamp,
} from 'firebase/firestore';

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
  projectCount: number;
  projectIds: string[];
}

interface ReportApprovalItem {
  id: string;
  filePath: string;
  fileName: string;
  projectId: string;
  projectName: string;
  status: 'pending' | 'approved' | 'auto-approved';
  approvedAt?: Timestamp;
  uploadedAt?: Timestamp;
}

interface DashboardStats {
  totalProjects: number;
  totalCustomers: number;
  totalCustomerUploads: number;
  approvedReports: number;
}

const CUSTOMER_UPLOADS_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const customerUploadsCountCache: { key: string; total: number; ts: number }[] = [];

function getCachedCustomerUploadsCount(projectIdsKey: string): number | null {
  const entry = customerUploadsCountCache.find((e) => e.key === projectIdsKey);
  if (!entry || Date.now() - entry.ts > CUSTOMER_UPLOADS_CACHE_TTL_MS) return null;
  return entry.total;
}

function setCachedCustomerUploadsCount(projectIdsKey: string, total: number) {
  const idx = customerUploadsCountCache.findIndex((e) => e.key === projectIdsKey);
  if (idx >= 0) customerUploadsCountCache.splice(idx, 1);
  customerUploadsCountCache.push({ key: projectIdsKey, total, ts: Date.now() });
  if (customerUploadsCountCache.length > 20) customerUploadsCountCache.shift();
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
    totalCustomerUploads: 0,
    approvedReports: 0,
  });
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [rawReportApprovals, setRawReportApprovals] = useState<Array<{ id: string; filePath: string; projectId: string; customerId: string; status: 'pending' | 'approved' | 'auto-approved'; approvedAt?: Timestamp; uploadedAt?: Timestamp }>>([]);
  const [loading, setLoading] = useState(true);

  const reportApprovalsList = useMemo((): ReportApprovalItem[] => {
    return rawReportApprovals.map((a) => ({
      id: a.id,
      filePath: a.filePath,
      fileName: a.filePath.split('/').pop() || a.filePath,
      projectId: a.projectId,
      projectName: projects.find((p) => p.id === a.projectId)?.name ?? t('dashboard.unknownProject'),
      status: a.status,
      approvedAt: a.approvedAt,
      uploadedAt: a.uploadedAt,
    }));
  }, [rawReportApprovals, projects, t]);

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

  const loadCustomerUploadsCount = useCallback(async (projectsList: Project[]) => {
    if (!db || projectsList.length === 0) return;
    const projectIdsKey = projectsList.map((p) => p.id).sort().join(',');
    const cached = getCachedCustomerUploadsCount(projectIdsKey);
    if (cached !== null) {
      setStats((prev) => ({ ...prev, totalCustomerUploads: cached }));
      return;
    }
    const customerUploadFolders = [
      '01_Customer_Uploads',
      '01_Customer_Uploads/Photos',
      '01_Customer_Uploads/Documents',
      '01_Customer_Uploads/Other',
    ];
    let total = 0;
    try {
      for (const project of projectsList) {
        for (const folderPath of customerUploadFolders) {
          const segments = getFolderSegments(folderPath);
          if (segments.length === 0) continue;
          try {
            const filesCollection = getProjectFolderRef(project.id, segments);
            const filesSnapshot = await getDocs(filesCollection);
            total += filesSnapshot.size;
          } catch (error) {
            console.error('Error loading customer uploads folder:', folderPath, error);
          }
        }
      }
      setCachedCustomerUploadsCount(projectIdsKey, total);
      setStats((prev) => ({
        ...prev,
        totalCustomerUploads: total,
      }));
    } catch (error) {
      console.error('Error loading customer uploads count:', error);
    }
  }, []);

  useEffect(() => {
    if (!db) return;

    // Check if this page has been visited before in this session
    const hasVisited = typeof window !== 'undefined' && sessionStorage.getItem('dashboard-visited') === 'true';

    if (!hasVisited) {
      setLoading(true);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('dashboard-visited', 'true');
      }
    } else {
      setLoading(false);
    }

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

    let cancelled = false;
    const loadDashboardData = async () => {
      try {
        const [customersSnapshot, projectsSnapshot] = await Promise.all([
          getDocs(query(collection(db, 'customers'), orderBy('customerNumber', 'asc'))),
          getDocs(query(collection(db, 'projects'), orderBy('name', 'asc'))),
        ]);

        if (cancelled) return;

        const projectsList: Project[] = [];
        projectsSnapshot.forEach((docSnap) => {
          const projectData = { id: docSnap.id, ...docSnap.data() } as Project;
          projectsList.push(projectData);
        });

        const customerMap = new Map<string, Customer>();
        customersSnapshot.forEach((docSnap) => {
          const data = docSnap.data() as any;
          if (!data?.uid) return;
          customerMap.set(data.uid, {
            uid: data.uid,
            customerNumber: data.customerNumber || 'N/A',
            email: data.email || 'N/A',
            projectCount: 0,
            projectIds: [],
          });
        });

        updateCustomerProjectCounts(customerMap, projectsList);

        setProjects(projectsList);
        setCustomers(Array.from(customerMap.values()));
        setStats((prev) => ({
          ...prev,
          totalProjects: projectsList.length,
          totalCustomers: customerMap.size,
        }));

        // Load customer uploads count based on the loaded projects
        await loadCustomerUploadsCount(projectsList);
      } catch (error) {
        console.error('Error loading dashboard data:', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadDashboardData();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadCustomerUploadsCount]);

  // Report approvals listener: store raw list for dashboard approvals card
  useEffect(() => {
    if (!db) return;
    const approvalsUnsubscribe = onSnapshot(
      collection(db, 'reportApprovals'),
      (approvalsSnapshot) => {
        setStats((prev) => ({
          ...prev,
          approvedReports: approvalsSnapshot.size,
        }));
        const list: Array<{ id: string; filePath: string; projectId: string; customerId: string; status: 'pending' | 'approved' | 'auto-approved'; approvedAt?: Timestamp; uploadedAt?: Timestamp }> = [];
        approvalsSnapshot.forEach((docSnap) => {
          const d = docSnap.data();
          list.push({
            id: docSnap.id,
            filePath: d.filePath ?? '',
            projectId: d.projectId ?? '',
            customerId: d.customerId ?? '',
            status: d.status ?? 'pending',
            approvedAt: d.approvedAt,
            uploadedAt: d.uploadedAt,
          });
        });
        list.sort((a, b) => {
          const aTime = a.approvedAt?.toMillis?.() ?? a.uploadedAt?.toMillis?.() ?? 0;
          const bTime = b.approvedAt?.toMillis?.() ?? b.uploadedAt?.toMillis?.() ?? 0;
          return bTime - aTime;
        });
        setRawReportApprovals(list);
      },
      (error) => {
        console.error('Error listening to report approvals:', error);
      }
    );
    return () => approvalsUnsubscribe();
  }, []);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">{t('dashboard.title')}</h2>
          <p className="text-sm text-gray-600">{t('dashboard.overview')}</p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
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
                title={t('dashboard.customerUploads')}
                value={stats.totalCustomerUploads}
                icon="📥"
                link="/customer-uploads"
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
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
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {customer.customerNumber.charAt(0).toUpperCase() + customer.customerNumber.slice(1)}
                            </p>
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

              {/* Approvals Overview */}
              <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                <div className="px-5 py-4 bg-gradient-to-r from-emerald-50 to-green-50 border-b-2 border-emerald-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{t('dashboard.approvals')}</h3>
                    <p className="text-xs text-gray-600 mt-0.5">{t('common.total')}: {reportApprovalsList.length}</p>
                  </div>
                  <Link
                    href="/approvals"
                    className="text-xs text-green-power-600 hover:text-green-power-700 font-semibold"
                  >
                    {t('dashboard.viewAll')} →
                  </Link>
                </div>
                <div className="divide-y divide-gray-200">
                  {reportApprovalsList.length === 0 ? (
                    <div className="px-5 py-8 text-center">
                      <p className="text-sm text-gray-500">{t('common.noResults')}</p>
                      <Link
                        href="/approvals"
                        className="mt-2 inline-block text-xs text-green-power-600 hover:text-green-power-700"
                      >
                        {t('navigation.approvals')} →
                      </Link>
                    </div>
                  ) : (
                    reportApprovalsList.slice(0, 2).map((approval) => (
                      <Link
                        key={approval.id}
                        href="/approvals"
                        className="block px-5 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {approval.fileName}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5 truncate">
                              {approval.projectName}
                            </p>
                          </div>
                          <span className="text-gray-400 flex-shrink-0">→</span>
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
            <h3 className="text-base font-semibold text-gray-900">{t('dashboard.quickActions')}</h3>
          </div>
          <div className="p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
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
                <span>{t('common.create')} {t('common.new')} {t('navigation.customers')}</span>
              </Link>
              <Link
                href="/projects"
                className="flex items-center px-5 py-3 text-sm font-medium text-white bg-gradient-to-r from-green-power-600 to-green-power-700 hover:from-green-power-700 hover:to-green-power-800 rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
              >
                <span className="mr-3 text-lg">📁</span>
                <span>{t('navigation.projects')}</span>
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
