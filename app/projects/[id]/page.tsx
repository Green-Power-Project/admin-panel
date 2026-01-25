'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
import { PROJECT_FOLDER_STRUCTURE, Folder } from '@/lib/folderStructure';
import { deleteFolder } from '@/lib/cloudinary';
import ConfirmationModal from '@/components/ConfirmationModal';
import AlertModal from '@/components/AlertModal';
import { useLanguage } from '@/contexts/LanguageContext';
import { translateFolderPath } from '@/lib/translations';

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

const folderConfig: Record<string, { description: string; icon: string; gradient: string; color: string; subfolderBg: string }> = {
  '02_Photos': {
    description: 'Progress photos and visual documentation',
    icon: '📸',
    gradient: 'from-purple-500 to-pink-500',
    color: 'text-purple-600',
    subfolderBg: 'bg-gray-50/60 border-gray-200',
  },
  '03_Reports': {
    description: 'Daily and weekly reports from the team',
    icon: '📊',
    gradient: 'from-green-500 to-emerald-500',
    color: 'text-green-600',
    subfolderBg: 'bg-gray-50/60 border-gray-200',
  },
  '04_Emails': {
    description: 'Email communications and correspondence',
    icon: '📧',
    gradient: 'from-indigo-500 to-blue-500',
    color: 'text-indigo-600',
    subfolderBg: 'bg-gray-50/60 border-gray-200',
  },
  '05_Quotations': {
    description: 'Quotes, estimates and pricing documents',
    icon: '💰',
    gradient: 'from-yellow-500 to-amber-500',
    color: 'text-yellow-600',
    subfolderBg: 'bg-gray-50/60 border-gray-200',
  },
  '06_Invoices': {
    description: 'Invoices and billing documents',
    icon: '🧾',
    gradient: 'from-red-500 to-rose-500',
    color: 'text-red-600',
    subfolderBg: 'bg-gray-50/60 border-gray-200',
  },
  '07_Delivery_Notes': {
    description: 'Delivery notes and material tracking',
    icon: '🚚',
    gradient: 'from-teal-500 to-cyan-500',
    color: 'text-teal-600',
    subfolderBg: 'bg-gray-50/60 border-gray-200',
  },
  '08_General': {
    description: 'General documents and miscellaneous files',
    icon: '📁',
    gradient: 'from-slate-500 to-gray-600',
    color: 'text-slate-600',
    subfolderBg: 'bg-gray-50/60 border-gray-200',
  },
};

function ChildList({ childrenFolders, projectId, accentColor, subfolderBg }: { childrenFolders: Folder[]; projectId: string; accentColor: string; subfolderBg: string }) {
  const { t } = useLanguage();
  const router = useRouter();

  const handleSubfolderClick = (folderPath: string) => {
    router.push(`/files/${projectId}?folder=${encodeURIComponent(folderPath)}&from=project`);
  };

  return (
    <div className="max-h-[240px] overflow-y-auto space-y-2 pt-2 pr-1 custom-scrollbar animate-in fade-in slide-in-from-top-2 duration-300">
      {childrenFolders.map((child, idx) => {
        return (
          <div
            key={child.path}
            onClick={() => handleSubfolderClick(child.path)}
            className={`group rounded-lg px-4 py-3 border ${subfolderBg} hover:shadow-md transition-all duration-200 cursor-pointer`}
            style={{ animationDelay: `${idx * 50}ms` }}
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${accentColor} flex items-center justify-center group-hover:scale-110 transition-transform duration-200 shadow-sm`}>
                <span className="text-base">📄</span>
              </div>
              <div className="flex-1 text-sm font-semibold text-gray-800 group-hover:text-gray-900 transition-colors duration-200">
                {translateFolderPath(child.path, t)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FolderCard({ folder, projectId }: { folder: Folder; projectId: string }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const hasChildren = folder.children && folder.children.length > 0;
  const baseConfig = folderConfig[folder.path] || {
    description: 'Folder contents',
    icon: '📁',
    gradient: 'from-gray-500 to-gray-600',
    color: 'text-gray-600',
    subfolderBg: 'bg-gray-50 border-gray-200',
  };
  const config = {
    ...baseConfig,
    description: t(`folders.${folder.path}.description`) || baseConfig.description,
  };

  const handleCardClick = () => {
    if (hasChildren) {
      setOpen((v) => !v);
    } else {
      router.push(`/files/${projectId}?folder=${encodeURIComponent(folder.path)}&from=project`);
    }
  };

  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-100 hover:border-green-power-200 hover:-translate-y-1">
      {/* Gradient accent bar */}
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${config.gradient}`}></div>
      
      {/* Animated background gradient on hover */}
      <div className={`absolute inset-0 bg-gradient-to-br ${config.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}></div>
      
      <div className="relative">
        <button
          onClick={handleCardClick}
          className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-gradient-to-r hover:from-transparent hover:to-gray-50/50 transition-all duration-200"
        >
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {/* Icon with gradient background */}
            <div className={`flex-shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
              <span className="text-2xl filter drop-shadow-sm">{config.icon}</span>
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="text-lg font-bold text-gray-900 mb-1 group-hover:text-green-power-700 transition-colors duration-200">
                {translateFolderPath(folder.path, t)}
              </div>
              <div className="text-xs text-gray-500 font-medium">{t(`folders.${folder.path}.description`) || config.description}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 flex-shrink-0 ml-4">
            {hasChildren && (
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${config.gradient} flex items-center justify-center transition-transform duration-300 ${open ? 'rotate-180' : ''}`}>
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            )}
            {!hasChildren && (
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${config.gradient} flex items-center justify-center transition-transform duration-300`}>
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            )}
          </div>
        </button>
        
        {/* Smooth accordion animation */}
        <div 
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            open ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          {hasChildren && (
            <div className="px-6 pb-6 border-t border-gray-100">
              <ChildList childrenFolders={folder.children!} projectId={projectId} accentColor={config.gradient} subfolderBg={config.subfolderBg} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectFoldersSection({ projectId, loading }: { projectId: string; loading: boolean }) {
  const { t } = useLanguage();
  const folders = useMemo(() => PROJECT_FOLDER_STRUCTURE.filter(
    (folder) => folder.path !== '00_New_Not_Viewed_Yet_' && folder.path !== '01_Customer_Uploads'
  ), []);

  if (loading) {
    return (
      <div className="mb-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Project Folders</h2>
          <p className="text-sm text-gray-600">Click on any folder to manage files</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-32 bg-gray-100 rounded-2xl"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Project Folders</h2>
        <p className="text-sm text-gray-600">Click on any folder to manage files</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {folders.map((folder, idx) => (
          <div
            key={folder.path}
            style={{ animationDelay: `${idx * 100}ms` }}
            className="animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            <FolderCard folder={folder} projectId={projectId} />
          </div>
        ))}
      </div>
    </div>
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

        {/* Folder Structure - Customer Panel Style */}
        <ProjectFoldersSection projectId={projectId} loading={loading} />

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

