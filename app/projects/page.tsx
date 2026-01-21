'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import Link from 'next/link';
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
}

export default function ProjectsPage() {
  return (
    <ProtectedRoute>
      <AdminLayout title="Projects">
        <ProjectsContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function ProjectsContent() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  
  // Modal states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [showAlert, setShowAlert] = useState(false);
  const [alertData, setAlertData] = useState<{ title: string; message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);

  useEffect(() => {
    if (!db) return;

    // Show loader whenever data is being fetched
    setLoading(true);
    let customersMap = new Map<string, { customerNumber: string; email: string }>();

    // Real-time listener for customers
    const customersUnsubscribe = onSnapshot(
      collection(db, 'customers'),
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
      query(collection(db, 'projects'), orderBy('name', 'asc')),
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

  function handleDeleteClick(projectId: string) {
    setDeleteProjectId(projectId);
    setShowDeleteConfirm(true);
  }

  async function confirmDelete() {
    if (!deleteProjectId) return;
    
    const projectId = deleteProjectId;
    setShowDeleteConfirm(false);
    setDeleting(projectId);
    
    try {
      await deleteDoc(doc(db, 'projects', projectId));
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

  return (
    <div className="px-8 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Projects</h2>
            <p className="text-sm text-gray-500 mt-1">Manage all projects</p>
          </div>
          <Link
            href="/projects/new"
            className="px-4 py-2 bg-green-power-500 text-white text-sm font-medium rounded-sm hover:bg-green-power-600"
          >
            + New Project
          </Link>
        </div>

        {loading ? (
          <div className="bg-white border border-gray-200 rounded-sm overflow-hidden animate-pulse">
            <div className="px-6 py-3 bg-gray-50">
              <div className="h-4 bg-gray-200 rounded w-32"></div>
            </div>
            <div className="divide-y divide-gray-200">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="px-6 py-4">
                  <div className="h-4 bg-gray-200 rounded w-48 mb-2"></div>
                  <div className="h-3 bg-gray-100 rounded w-32"></div>
                </div>
              ))}
            </div>
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-sm p-12 text-center">
            <p className="text-sm text-gray-500">No projects found.</p>
            <Link
              href="/projects/new"
              className="mt-4 inline-block text-sm text-green-power-600 hover:text-green-power-700 font-medium"
            >
              Create your first project →
            </Link>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                <tr>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider w-[30%]">
                    Project Name
                  </th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider w-[10%]">
                    Year
                  </th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider w-[25%]">
                    Customer
                  </th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-700 uppercase tracking-wider w-[15%]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {projects
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
                        {project.customerNumber || 'N/A'}
                      </div>
                      {project.customerEmail && (
                        <div className="text-[10px] text-gray-500 mt-0.5 truncate">{project.customerEmail}</div>
                      )}
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
            <Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(projects.length / itemsPerPage)}
              totalItems={projects.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(newItemsPerPage) => {
                setItemsPerPage(newItemsPerPage);
                setCurrentPage(1); // Reset to first page when changing items per page
              }}
            />
          </div>
        )}

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

