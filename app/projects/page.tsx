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
          <div className="bg-white border border-gray-200 rounded-sm overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Project Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Year
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {projects.map((project) => (
                  <tr key={project.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        href={`/projects/${project.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-green-power-600"
                      >
                        {project.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {project.year || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {project.customerNumber || 'N/A'}
                      </div>
                      {project.customerEmail && (
                        <div className="text-xs text-gray-500">{project.customerEmail}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <Link
                          href={`/projects/${project.id}`}
                          className="text-green-power-600 hover:text-green-power-700"
                        >
                          View
                        </Link>
                        <Link
                          href={`/projects/${project.id}/edit`}
                          className="text-gray-600 hover:text-gray-900"
                        >
                          Edit
                        </Link>
                        <button
                          onClick={() => handleDeleteClick(project.id)}
                          disabled={deleting === project.id}
                          className="text-red-600 hover:text-red-700 disabled:opacity-50"
                        >
                          {deleting === project.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

