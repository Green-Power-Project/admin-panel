'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { PROJECT_FOLDER_STRUCTURE, Folder } from '@/lib/folderStructure';
import AlertModal from '@/components/AlertModal';
import { useLanguage } from '@/contexts/LanguageContext';
import { getProjectFolderDisplayName } from '@/lib/translations';

interface Project {
  id: string;
  name: string;
  year?: number;
  customerId: string;
  folderDisplayNames?: Record<string, string>;
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

type InlineEditProps = {
  editingFolderPath: string | null;
  setEditingFolderPath: (path: string | null) => void;
  editingValue: string;
  setEditingValue: (v: string) => void;
  onSaveFolderName: (path: string, value: string) => void | Promise<void>;
  onCancelEdit: () => void;
  onStartEdit: (path: string, currentDisplayName: string) => void;
  savingFolderName: boolean;
};

function ChildList({
  childrenFolders,
  projectId,
  accentColor,
  subfolderBg,
  folderDisplayNames,
  editingFolderPath,
  setEditingFolderPath,
  editingValue,
  setEditingValue,
  onSaveFolderName,
  onCancelEdit,
  onStartEdit,
  savingFolderName,
}: {
  childrenFolders: Folder[];
  projectId: string;
  accentColor: string;
  subfolderBg: string;
  folderDisplayNames?: Record<string, string>;
} & InlineEditProps) {
  const { t } = useLanguage();
  const router = useRouter();

  const handleSubfolderClick = (folderPath: string) => {
    if (editingFolderPath) return;
    router.push(`/files/${projectId}?folder=${encodeURIComponent(folderPath)}&from=project`);
  };

  return (
    <div className="max-h-[240px] overflow-y-auto space-y-2 pt-2 pr-1 custom-scrollbar animate-in fade-in slide-in-from-top-2 duration-300">
      {childrenFolders.map((child, idx) => {
        const isEditing = editingFolderPath === child.path;
        const displayName = getProjectFolderDisplayName(child.path, folderDisplayNames, t);
        return (
          <div
            key={child.path}
            onClick={() => !isEditing && handleSubfolderClick(child.path)}
            className={`group rounded-lg px-4 py-3 border ${subfolderBg} hover:shadow-md transition-all duration-200 cursor-pointer`}
            style={{ animationDelay: `${idx * 50}ms` }}
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${accentColor} flex items-center justify-center group-hover:scale-110 transition-transform duration-200 shadow-sm flex-shrink-0`}>
                <span className="text-base">📄</span>
              </div>
              {isEditing ? (
                <div className="flex-1 flex items-center gap-2 min-w-0" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    className="flex-1 min-w-0 text-sm font-semibold text-gray-800 border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500"
                    placeholder={displayName}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onSaveFolderName(child.path, editingValue);
                      if (e.key === 'Escape') onCancelEdit();
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => onSaveFolderName(child.path, editingValue)}
                    disabled={savingFolderName}
                    className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 disabled:opacity-50"
                    title="Save"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                    title="Cancel"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex-1 text-sm font-semibold text-gray-800 group-hover:text-gray-900 transition-colors duration-200">
                    {displayName}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onStartEdit(child.path, displayName); }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    title="Edit name"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FolderCard({
  folder,
  projectId,
  folderDisplayNames,
  editingFolderPath,
  setEditingFolderPath,
  editingValue,
  setEditingValue,
  onSaveFolderName,
  onCancelEdit,
  onStartEdit,
  savingFolderName,
}: {
  folder: Folder;
  projectId: string;
  folderDisplayNames?: Record<string, string>;
} & InlineEditProps) {
  const { t } = useLanguage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const hasChildren = folder.children && folder.children.length > 0;
  const isEditing = editingFolderPath === folder.path;
  const displayName = getProjectFolderDisplayName(folder.path, folderDisplayNames, t);
  const baseConfig = folderConfig[folder.path] || {
    description: t('folders.folderContents'),
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
    if (isEditing) return;
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
          type="button"
          onClick={handleCardClick}
          className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-gradient-to-r hover:from-transparent hover:to-gray-50/50 transition-all duration-200"
        >
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {/* Icon with gradient background */}
            <div className={`flex-shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
              <span className="text-2xl filter drop-shadow-sm">{config.icon}</span>
            </div>
            
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <div className="flex items-center gap-2 min-w-0 mb-1" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 text-lg font-bold text-gray-900 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500"
                    placeholder={displayName}
                    autoFocus
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') onSaveFolderName(folder.path, editingValue);
                      if (e.key === 'Escape') onCancelEdit();
                    }}
                  />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSaveFolderName(folder.path, editingValue); }}
                    disabled={savingFolderName}
                    className="p-2 rounded-lg text-green-600 hover:bg-green-50 disabled:opacity-50 flex-shrink-0"
                    title="Save"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onCancelEdit(); }}
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 flex-shrink-0"
                    title="Cancel"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ) : (
                <>
                  <div className="text-lg font-bold text-gray-900 mb-1 group-hover:text-green-power-700 transition-colors duration-200 flex items-center gap-2">
                    <span className="min-w-0 truncate">{displayName}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onStartEdit(folder.path, displayName); }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      title="Edit name"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                  </div>
                  <div className="text-xs text-gray-500 font-medium">{t(`folders.${folder.path}.description`) || config.description}</div>
                </>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3 flex-shrink-0 ml-4">
            {hasChildren && !isEditing && (
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${config.gradient} flex items-center justify-center transition-transform duration-300 ${open ? 'rotate-180' : ''}`}>
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            )}
            {!hasChildren && !isEditing && (
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
              <ChildList
                childrenFolders={folder.children!}
                projectId={projectId}
                accentColor={config.gradient}
                subfolderBg={config.subfolderBg}
                folderDisplayNames={folderDisplayNames}
                editingFolderPath={editingFolderPath}
                setEditingFolderPath={setEditingFolderPath}
                editingValue={editingValue}
                setEditingValue={setEditingValue}
                onSaveFolderName={onSaveFolderName}
                onCancelEdit={onCancelEdit}
                onStartEdit={onStartEdit}
                savingFolderName={savingFolderName}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectFoldersSection({
  projectId,
  loading,
  folderDisplayNames,
  editingFolderPath,
  setEditingFolderPath,
  editingValue,
  setEditingValue,
  onSaveFolderName,
  onCancelEdit,
  onStartEdit,
  savingFolderName,
}: {
  projectId: string;
  loading: boolean;
  folderDisplayNames?: Record<string, string>;
} & InlineEditProps) {
  const { t } = useLanguage();
  const folders = useMemo(() => PROJECT_FOLDER_STRUCTURE.filter(
    (folder) => folder.path !== '00_New_Not_Viewed_Yet_' && folder.path !== '01_Customer_Uploads'
  ), []);

  if (loading) {
    return (
      <div className="mb-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('files.projectFolders')}</h2>
          <p className="text-sm text-gray-600">{t('files.clickOnFolderToManageFiles')}</p>
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
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('files.projectFolders')}</h2>
        <p className="text-sm text-gray-600">{t('files.clickOnFolderToManageFiles')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {folders.map((folder, idx) => (
          <div
            key={folder.path}
            style={{ animationDelay: `${idx * 100}ms` }}
            className="animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            <FolderCard
              folder={folder}
              projectId={projectId}
              folderDisplayNames={folderDisplayNames}
              editingFolderPath={editingFolderPath}
              setEditingFolderPath={setEditingFolderPath}
              editingValue={editingValue}
              setEditingValue={setEditingValue}
              onSaveFolderName={onSaveFolderName}
              onCancelEdit={onCancelEdit}
              onStartEdit={onStartEdit}
              savingFolderName={savingFolderName}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectDetailContent() {
  const params = useParams();
  const projectId = params.id as string;
  const { t } = useLanguage();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAlert, setShowAlert] = useState(false);
  const [alertData, setAlertData] = useState<{ title: string; message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const [editingFolderPath, setEditingFolderPath] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [savingFolderName, setSavingFolderName] = useState(false);

  const handleSaveFolderName = async (path: string, value: string) => {
    if (!projectId || !db || !project) return;
    setSavingFolderName(true);
    try {
      const next = { ...(project.folderDisplayNames ?? {}), [path]: value.trim() };
      if (!value.trim()) delete next[path];
      await updateDoc(doc(db, 'projects', projectId), { folderDisplayNames: next });
      setProject((p) => (p ? { ...p, folderDisplayNames: next } : null));
      setEditingFolderPath(null);
      setEditingValue('');
      setAlertData({ title: t('projectsDetail.folderNameSaved'), message: t('projectsDetail.folderNameSavedMessage'), type: 'success' });
      setShowAlert(true);
    } catch (err) {
      setAlertData({ title: t('messages.error.generic'), message: err instanceof Error ? err.message : t('projectsDetail.saveFailed'), type: 'error' });
      setShowAlert(true);
    } finally {
      setSavingFolderName(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingFolderPath(null);
    setEditingValue('');
  };

  const handleStartEdit = (path: string, currentDisplayName: string) => {
    setEditingFolderPath(path);
    setEditingValue(currentDisplayName);
  };

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

    // Real-time listener for project document (t is stable from useLanguage)
    const dbInstance = db;
    const unsubscribe = onSnapshot(
      doc(dbInstance, 'projects', projectId),
      (projectDoc) => {
        if (projectDoc.exists()) {
          const projectData = { id: projectDoc.id, ...projectDoc.data() } as Project;
          setProject(projectData);
          setError('');
        } else {
          setError(t('projectsDetail.projectNotFound'));
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to project:', error);
        setError(t('projectsDetail.loadFailed'));
        setLoading(false);
      }
    );

    // Cleanup listener on unmount
    return () => {
      unsubscribe();
    };
  }, [projectId, t]);

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
              ← {t('projectsDetail.backToProjects')}
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
            ← {t('projectsDetail.backToProjects')}
          </Link>
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">{project?.name}</h2>
            {project?.year && (
              <p className="text-sm text-gray-500 mt-1">{t('projectsDetail.year')}: {project.year}</p>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        {/* Folder Structure - Customer Panel Style */}
        <ProjectFoldersSection
          projectId={projectId}
          loading={loading}
          folderDisplayNames={project?.folderDisplayNames}
          editingFolderPath={editingFolderPath}
          setEditingFolderPath={setEditingFolderPath}
          editingValue={editingValue}
          setEditingValue={setEditingValue}
          onSaveFolderName={handleSaveFolderName}
          onCancelEdit={handleCancelEdit}
          onStartEdit={handleStartEdit}
          savingFolderName={savingFolderName}
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

