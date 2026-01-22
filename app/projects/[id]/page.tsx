'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
import { PROJECT_FOLDER_STRUCTURE } from '@/lib/folderStructure';
import { deleteFolder } from '@/lib/cloudinary';
import ConfirmationModal from '@/components/ConfirmationModal';
import AlertModal from '@/components/AlertModal';

interface Project {
  id: string;
  name: string;
  year?: number;
  customerId: string;
}

export default function ProjectDetailPage() {
  return (
    <ProtectedRoute>
      <AdminLayout>
        <ProjectDetailContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function ProjectDetailContent() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [year, setYear] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  // Modal states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [alertData, setAlertData] = useState<{ title: string; message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);

  useEffect(() => {
    if (!projectId || !db) return;

    // Check if this project page has been visited before in this session
    const storageKey = `project-${projectId}-visited`;
    const hasVisited = typeof window !== 'undefined' && sessionStorage.getItem(storageKey) === 'true';
    
    // Only show loading on first visit
    if (!hasVisited) {
      setLoading(true);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(storageKey, 'true');
      }
    } else {
      // On subsequent visits (navigating back), don't show loading
      // Real-time listener will populate data quickly from cache
      setLoading(false);
    }

    // Real-time listener for project document
    const dbInstance = db; // Store for TypeScript narrowing
    const unsubscribe = onSnapshot(
      doc(dbInstance, 'projects', projectId),
      (projectDoc) => {
        if (projectDoc.exists()) {
          const projectData = { id: projectDoc.id, ...projectDoc.data() } as Project;
          setProject(projectData);
          setName(projectData.name);
          setYear(projectData.year?.toString() || '');
          setCustomerId(projectData.customerId);
          setError('');
        } else {
          setError('Project not found');
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to project:', error);
        setError('Failed to load project');
        setLoading(false);
      }
    );

    // Cleanup listener on unmount
    return () => {
      unsubscribe();
    };
  }, [projectId]);

  async function handleSave() {
    if (!db) {
      setError('Database not initialized');
      return;
    }
    const dbInstance = db; // Store for TypeScript narrowing
    
    setSaving(true);
    setError('');
    try {
      const updateData: any = {
        name: name.trim(),
        // Customer ID is not updated - it cannot be changed
      };

      if (year) {
        const yearNum = parseInt(year, 10);
        if (!isNaN(yearNum)) {
          updateData.year = yearNum;
        }
      } else {
        updateData.year = null;
      }

      await updateDoc(doc(dbInstance, 'projects', projectId), updateData);
      setProject({ ...project!, ...updateData });
      setEditing(false);
    } catch (err: any) {
      console.error('Error updating project:', err);
      setError(err.message || 'Failed to update project');
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteClick() {
    setShowDeleteConfirm(true);
  }

  async function confirmDelete() {
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
    
    setShowDeleteConfirm(false);
    try {
      await deleteFolder(`projects/${projectId}`);
      await deleteDoc(doc(dbInstance, 'projects', projectId));
      router.push('/projects');
    } catch (error) {
      console.error('Error deleting project:', error);
      setAlertData({
        title: 'Delete Failed',
        message: 'Failed to delete project. Please try again.',
        type: 'error',
      });
      setShowAlert(true);
    }
  }

  // Don't show full-page loading - use skeleton in content area instead

  if (error && !project) {
    return (
      <div className="px-8 py-8">
          <div className="bg-white border border-gray-200 rounded-sm p-8">
            <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 text-sm mb-4">
              {error}
            </div>
            <Link
              href="/projects"
              className="text-sm text-green-power-600 hover:text-green-power-700 font-medium"
            >
              ← Back to Projects
            </Link>
          </div>
  
      </div>
    );
  }

  return (
    <div className="px-8 py-8">
        <div className="mb-6">
          <Link
            href="/projects"
            className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block"
          >
            ← Back to Projects
          </Link>
          <div className="flex items-center justify-between">
            <div>
              {editing ? (
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="text-2xl font-semibold text-gray-900 border border-gray-300 rounded-sm px-3 py-1"
                />
              ) : (
                <h2 className="text-2xl font-semibold text-gray-900">{project?.name}</h2>
              )}
              {project?.year && (
                <p className="text-sm text-gray-500 mt-1">Year: {project.year}</p>
              )}
            </div>
            {!loading && (
              <div className="flex items-center space-x-2">
                {editing ? (
                  <>
                    <button
                      onClick={() => {
                        setEditing(false);
                        setName(project!.name);
                        setYear(project!.year?.toString() || '');
                        setCustomerId(project!.customerId);
                      }}
                      className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-3 py-1.5 text-sm bg-green-power-500 text-white rounded-sm hover:bg-green-power-600 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setEditing(true)}
                      className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={handleDeleteClick}
                      className="px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded-sm hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {editing && (
          <div className="bg-white border border-gray-200 rounded-sm p-5 mb-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Customer ID
                </label>
                <input
                  type="text"
                  value={customerId}
                  disabled
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm font-mono bg-gray-50 text-gray-600 cursor-not-allowed"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Customer cannot be changed after project creation.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Year
                </label>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        {/* Folder Structure - Grid Layout */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Project Folders</h2>
              <p className="text-sm text-gray-600 mt-1">Click on any folder to manage files</p>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                <div key={i} className="h-32 bg-gray-100 rounded-lg"></div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {PROJECT_FOLDER_STRUCTURE.map((folder) => {
                const getFolderIcon = (path: string) => {
                  if (path === '00_New_Not_Viewed_Yet_') return '🔔';
                  if (path.startsWith('01_')) return '📤';
                  if (path.startsWith('02_')) return '📷';
                  if (path.startsWith('03_')) return '📄';
                  if (path.startsWith('04_')) return '✉️';
                  if (path.startsWith('05_')) return '💰';
                  if (path.startsWith('06_')) return '🧾';
                  if (path.startsWith('07_')) return '📦';
                  if (path.startsWith('08_')) return '📋';
                  return '📁';
                };

                const getFolderColor = (path: string) => {
                  if (path === '00_New_Not_Viewed_Yet_') return 'from-orange-50 to-orange-100 border-orange-200';
                  if (path.startsWith('01_')) return 'from-blue-50 to-blue-100 border-blue-200';
                  if (path.startsWith('02_')) return 'from-purple-50 to-purple-100 border-purple-200';
                  if (path.startsWith('03_')) return 'from-green-power-50 to-green-power-100 border-green-power-200';
                  if (path.startsWith('04_')) return 'from-yellow-50 to-yellow-100 border-yellow-200';
                  if (path.startsWith('05_')) return 'from-indigo-50 to-indigo-100 border-indigo-200';
                  if (path.startsWith('06_')) return 'from-pink-50 to-pink-100 border-pink-200';
                  if (path.startsWith('07_')) return 'from-teal-50 to-teal-100 border-teal-200';
                  if (path.startsWith('08_')) return 'from-gray-50 to-gray-100 border-gray-200';
                  return 'from-gray-50 to-gray-100 border-gray-200';
                };

                return (
                  <div
                    key={folder.path}
                    className={`bg-gradient-to-br ${getFolderColor(folder.path)} rounded-xl p-5 border-2 hover:shadow-lg transition-all duration-200 cursor-pointer group`}
                  >
                    <Link href={`/files/${projectId}?folder=${encodeURIComponent(folder.path)}`} className="block">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <span className="text-3xl">{getFolderIcon(folder.path)}</span>
                          <div>
                            <h3 className="font-semibold text-gray-900 text-sm leading-tight group-hover:text-green-power-700 transition-colors">
                              {folder.name.replace(/^\d+_/, '').replace(/_/g, ' ')}
                            </h3>
                            {folder.children && (
                              <p className="text-xs text-gray-600 mt-1">
                                {folder.children.length} {folder.children.length === 1 ? 'subfolder' : 'subfolders'}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="text-gray-400 group-hover:text-green-power-600 transition-colors">→</span>
                      </div>

                      {folder.children && folder.children.length > 0 && (
                        <div className="mt-4 pt-4 border-t-2 border-white/60">
                          <div className="grid grid-cols-1 gap-2">
                            {folder.children.slice(0, 3).map((child, idx) => (
                              <Link
                                key={child.path}
                                href={`/files/${projectId}?folder=${encodeURIComponent(child.path)}`}
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center justify-between px-3 py-2.5 text-xs font-medium text-gray-800 bg-white/80 hover:bg-white hover:shadow-sm rounded-lg border border-white/40 transition-all duration-200 group"
                              >
                                <span className="flex items-center space-x-2">
                                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full group-hover:bg-green-power-500 transition-colors"></span>
                                  <span className="group-hover:text-green-power-700 transition-colors">{child.name.replace(/_/g, ' ')}</span>
                                </span>
                                <span className="text-gray-300 group-hover:text-green-power-500 transition-colors text-[10px]">→</span>
                              </Link>
                            ))}
                            {folder.children.length > 3 && (
                              <div className="px-3 py-2 text-xs text-gray-600 bg-white/50 rounded-lg border border-white/30 text-center font-medium">
                                +{folder.children.length - 3} more subfolder{folder.children.length - 3 > 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </Link>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-xs text-blue-800 flex items-start">
              <span className="mr-2 mt-0.5">ℹ️</span>
              <span>
                <strong>Note:</strong> Folder structure is predefined and identical for all projects. Click on any folder card to upload or manage files within that folder.
              </span>
            </p>
          </div>
        </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title="Delete Project"
        message="Are you sure you want to delete this project? This will also delete all associated files. This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
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

