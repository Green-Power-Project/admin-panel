'use client';

import React, { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import ConfirmationModal from '@/components/ConfirmationModal';
import AlertModal from '@/components/AlertModal';
import Pagination from '@/components/Pagination';

interface Project {
  id: string;
  name: string;
  year?: number;
  customerId: string;
  customerNumber?: string;
  customerEmail?: string;
  enabled?: boolean;
}

export default function ProjectsPage() {
  const { t } = useLanguage();
  return (
    <ProtectedRoute>
      <AdminLayout title={t('navigation.projects')}>
        <ProjectsContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function ProjectsContent() {
  const { t } = useLanguage();
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState<string>('');
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Modal states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [showAlert, setShowAlert] = useState(false);
  const [alertData, setAlertData] = useState<{ title: string; message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);

  useEffect(() => {
    if (!db) return;
    const dbInstance = db; // Store for TypeScript narrowing

    // Show loader whenever data is being fetched
    setLoading(true);
    let customersMap = new Map<string, { customerNumber: string; email: string }>();

    // Real-time listener for customers
    const customersUnsubscribe = onSnapshot(
      collection(dbInstance, 'customers'),
      (customersSnapshot) => {
        customersMap = new Map<string, { customerNumber: string; email: string }>();
        
        customersSnapshot.forEach((doc) => {
          const data = doc.data();
          customersMap.set(data.uid, {
            customerNumber: data.customerNumber || 'N/A',
            email: data.email || 'N/A',
          });
        });

        // Update projects with customer info when customers change
        setProjects((prevProjects) => {
          return prevProjects.map((project) => {
            const customerInfo = customersMap.get(project.customerId);
            return {
              ...project,
              customerNumber: customerInfo?.customerNumber,
              customerEmail: customerInfo?.email,
            };
          });
        });
      },
      (error) => {
        console.error('Error listening to customers:', error);
      }
    );

    // Real-time listener for projects
    const projectsUnsubscribe = onSnapshot(
      query(collection(dbInstance, 'projects'), orderBy('name', 'asc')),
      (projectsSnapshot) => {
        const projectsList: Project[] = [];
        
        projectsSnapshot.forEach((doc) => {
          projectsList.push({ id: doc.id, ...doc.data() } as Project);
        });

        // Enrich projects with customer information
        const enrichedProjects = projectsList.map((project) => {
          const customerInfo = customersMap.get(project.customerId);
          return {
            ...project,
            customerNumber: customerInfo?.customerNumber,
            customerEmail: customerInfo?.email,
          };
        });

        setProjects(enrichedProjects);
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to projects:', error);
        setLoading(false);
      }
    );

    // Cleanup listeners on unmount
    return () => {
      customersUnsubscribe();
      projectsUnsubscribe();
    };
  }, []);

  // Filter projects based on search query
  useEffect(() => {
    let filtered = [...projects];

    const term = filterSearch.trim().toLowerCase();
    if (term) {
      filtered = filtered.filter((project) => {
        const name = project.name.toLowerCase();
        const customerNumber = project.customerNumber?.toLowerCase() || '';
        const customerEmail = project.customerEmail?.toLowerCase() || '';
        const year = project.year?.toString() || '';
        return (
          name.includes(term) ||
          customerNumber.includes(term) ||
          customerEmail.includes(term) ||
          year.includes(term)
        );
      });
    }

    setFilteredProjects(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  }, [projects, filterSearch]);

  function handleDeleteClick(projectId: string) {
    setDeleteProjectId(projectId);
    setShowDeleteConfirm(true);
  }

  async function confirmDelete() {
    if (!deleteProjectId) return;
    if (!db) {
      setAlertData({
        title: 'Delete Failed',
        message: 'Database not initialized',
        type: 'error',
      });
      setShowAlert(true);
      return;
    }
    const dbInstance = db; // Store for TypeScript narrowing
    
    const projectId = deleteProjectId;
    setShowDeleteConfirm(false);
    setDeleting(projectId);
    
    try {
      await deleteDoc(doc(dbInstance, 'projects', projectId));
      // No need to reload - real-time listener will update automatically
    } catch (error) {
      console.error('Error deleting project:', error);
      setAlertData({
        title: 'Delete Failed',
        message: 'Failed to delete project. Please try again.',
        type: 'error',
      });
      setShowAlert(true);
    } finally {
      setDeleting(null);
      setDeleteProjectId(null);
    }
  }

  const totalProjects = (filteredProjects && filteredProjects.length) || 0;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-4 sm:space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-green-power-50 to-green-power-100">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-lg md:text-xl font-semibold text-gray-900">{t('projects.title')}</h2>
              <p className="text-xs md:text-sm text-gray-600 mt-1">
                {t('projects.description')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-3 py-2 rounded-lg bg-white/90 border border-gray-200">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">{t('common.total')}</p>
                <p className="text-sm font-semibold text-gray-900">{totalProjects}</p>
              </div>
              <Link
                href="/projects/new"
                className="px-4 py-2 bg-green-power-600 text-white text-sm font-medium rounded-lg hover:bg-green-power-700 transition-colors"
              >
                + {t('projects.newProject')}
              </Link>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/60">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              {t('projects.filterLabel')}
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
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder={t('projects.searchPlaceholder')}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500 placeholder:text-gray-400"
              />
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
                  <div className="h-3 w-20 rounded bg-gray-200" />
                </div>
              ))}
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-8 text-center">
              <p className="text-sm font-medium text-gray-700">
                No projects found for the selected filters.
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {filterSearch ? 'Try adjusting your search query.' : 'Create your first project to get started.'}
              </p>
              {!filterSearch && (
                <Link
                  href="/projects/new"
                  className="mt-4 inline-block text-sm text-green-power-600 hover:text-green-power-700 font-medium"
                >
                  Create your first project →
                </Link>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[30%]">
                      Project Name
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[10%]">
                      Year
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[25%]">
                      Customer
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[12%]">
                      Status
                    </th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[15%]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {filteredProjects
                    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                    .map((project) => (
                  <tr 
                    key={project.id} 
                    className="hover:bg-green-power-50/30 transition-colors group"
                  >
                    <td className="px-3 py-2.5">
                      <Link href={`/projects/${project.id}`} className="flex items-center gap-2 group/link">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-power-500 to-green-power-600 flex items-center justify-center flex-shrink-0 shadow-sm group-hover/link:shadow-md transition-shadow">
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-gray-900 group-hover/link:text-green-power-700 transition-colors truncate">
                            {project.name}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        {project.year ? (
                          <>
                            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span>{project.year}</span>
                          </>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs font-medium text-gray-900 truncate">
                        {project.customerNumber 
                          ? project.customerNumber.charAt(0).toUpperCase() + project.customerNumber.slice(1)
                          : 'N/A'}
                      </div>
                      {project.customerEmail && (
                        <div className="text-[10px] text-gray-500 mt-0.5 truncate">{project.customerEmail}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${project.enabled !== false ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        {project.enabled !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-right">
                      <div 
                        className="flex items-center justify-end gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link
                          href={`/projects/${project.id}`}
                          className="w-7 h-7 rounded-md bg-green-power-50 hover:bg-green-power-100 flex items-center justify-center text-green-power-600 hover:text-green-power-700 transition-colors group/icon"
                          title="View"
                        >
                          <svg className="w-4 h-4 group-hover/icon:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.522 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.478 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </Link>
                        <Link
                          href={`/projects/${project.id}/edit`}
                          className="w-7 h-7 rounded-md bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 hover:text-gray-700 transition-colors group/icon"
                          title="Edit"
                        >
                          <svg className="w-4 h-4 group-hover/icon:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </Link>
                        <button
                          onClick={() => handleDeleteClick(project.id)}
                          disabled={deleting === project.id}
                          className="w-7 h-7 rounded-md bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors group/icon"
                          title="Delete"
                        >
                          {deleting === project.id ? (
                            <div className="w-3 h-3 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <svg className="w-4 h-4 group-hover/icon:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
              </div>
              <Pagination
                currentPage={currentPage}
                totalPages={Math.ceil(filteredProjects.length / itemsPerPage)}
                totalItems={filteredProjects.length}
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

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title="Delete Project"
        message="Are you sure you want to delete this project? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        onConfirm={confirmDelete}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setDeleteProjectId(null);
        }}
      />

      {/* Alert Modal */}
      <AlertModal
        isOpen={showAlert}
        title={alertData?.title || 'Alert'}
        message={alertData?.message || ''}
        type={alertData?.type || 'info'}
        onClose={() => {
          setShowAlert(false);
          setAlertData(null);
        }}
      />
    </div>
  );
}

