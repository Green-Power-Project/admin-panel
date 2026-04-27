'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { deleteField, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import {
  PROJECT_FOLDER_STRUCTURE,
  Folder,
  mergeDynamicSubfolders,
  sanitizeDynamicSubfolderSegment,
  isDynamicSubfolderPath,
} from '@/lib/folderStructure';
import AlertModal from '@/components/AlertModal';
import ConfirmationModal from '@/components/ConfirmationModal';
import ProjectChatPanel from '@/components/ProjectChatPanel';
import UnreadBadge from '@/components/UnreadBadge';
import { useAdminChatUnreadCount } from '@/hooks/useChatUnreadCount';
import { useAdminFolderUnreadByPath } from '@/hooks/useAdminFolderUnreadByPath';
import { sumUnreadForTopLevelFolder } from '@/lib/projectFolderUnreadAdmin';

import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { getProjectFolderDisplayName } from '@/lib/translations';
import { appendDynamicSubfolderTransaction } from '@/lib/appendDynamicSubfolderTransaction';

interface Project {
  id: string;
  name: string;
  year?: number;
  customerId: string;
  folderDisplayNames?: Record<string, string>;
  /** Extra subfolder segments per top-level path, e.g. { "03_Reports": ["Site_Visit"] } */
  dynamicSubfolders?: Record<string, string[]>;
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
  '01_Customer_Uploads': {
    description: 'Files uploaded by the customer for this project',
    icon: '📤',
    gradient: 'from-sky-500 to-blue-600',
    color: 'text-blue-600',
    subfolderBg: 'bg-gray-50/60 border-gray-200',
  },
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
  Signature: {
    description: 'All documents that require customer signature',
    icon: '✍️',
    gradient: 'from-amber-500 to-orange-500',
    color: 'text-amber-600',
    subfolderBg: 'bg-gray-50/60 border-gray-200',
  },
};

const folderIconImages: Record<string, string> = {
  Signature: '/icons/signature-removebg-preview.png',
  'Signature/Offers': '/icons/offer-removebg-preview.png',
  'Signature/Order_Confirmations': '/icons/order_confirmation-removebg-preview.png',
  'Signature/Variations_Additional_Work': '/icons/variations-removebg-preview.png',
  'Signature/Delivery_Notes': '/icons/delivery_notes-removebg-preview.png',
  'Signature/Reports': '/icons/reports-removebg-preview.png',
  'Signature/Contracts': '/icons/contracts-removebg-preview.png',
  'Signature/Documentation': '/icons/documentation-removebg-preview.png',
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
  unreadCounts,
  editingFolderPath,
  setEditingFolderPath,
  editingValue,
  setEditingValue,
  onSaveFolderName,
  onCancelEdit,
  onStartEdit,
  savingFolderName,
  dynamicSubfolders,
  onRequestDeleteDynamicSubfolder,
}: {
  childrenFolders: Folder[];
  projectId: string;
  accentColor: string;
  subfolderBg: string;
  folderDisplayNames?: Record<string, string>;
  unreadCounts?: Map<string, number>;
  dynamicSubfolders?: Record<string, string[]>;
  onRequestDeleteDynamicSubfolder?: (fullPath: string) => void;
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
        const isEmailsIncoming = child.path === '04_Emails/Incoming';
        const isEmailsOutgoing = child.path === '04_Emails/Outgoing';
        const isEmailsSystemFolder = isEmailsIncoming || isEmailsOutgoing;
        const displayName = isEmailsIncoming
          ? 'Received'
          : isEmailsOutgoing
          ? 'Sent'
          : getProjectFolderDisplayName(child.path, folderDisplayNames, t);
        const u = unreadCounts?.get(child.path) || 0;
        const childIcon = folderIconImages[child.path];
        const isDynamic =
          !!onRequestDeleteDynamicSubfolder &&
          isDynamicSubfolderPath(child.path, dynamicSubfolders);
        return (
          <div
            key={child.path}
            onClick={() => !isEditing && handleSubfolderClick(child.path)}
            className={`group rounded-lg px-4 py-3 border ${subfolderBg} hover:shadow-md transition-all duration-200 cursor-pointer`}
            style={{ animationDelay: `${idx * 50}ms` }}
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${childIcon ? 'bg-white' : `bg-gradient-to-br ${accentColor}`} flex items-center justify-center group-hover:scale-110 transition-transform duration-200 shadow-sm flex-shrink-0 overflow-hidden`}>
                {childIcon ? (
                  <Image src={childIcon} alt="" width={28} height={28} className="h-7 w-7 object-contain" />
                ) : (
                  <span className="text-base">📄</span>
                )}
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
                    title={t('common.save')}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                    title={t('common.cancel')}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex-1 text-sm font-semibold text-gray-800 group-hover:text-gray-900 transition-colors duration-200 min-w-0">
                    {displayName}
                  </div>
                  {u > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex-shrink-0">
                      {u}
                    </span>
                  )}
                  {!isEmailsSystemFolder && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartEdit(child.path, displayName);
                      }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      title={t('common.editName')}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                    </button>
                  )}
                  {isDynamic && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRequestDeleteDynamicSubfolder!(child.path);
                      }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      title={t('projectsDetail.deleteSubfolder')}
                      aria-label={t('projectsDetail.deleteSubfolder')}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  )}
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
  totalUnreadCount,
  folderUnreadByPath,
  editingFolderPath,
  setEditingFolderPath,
  editingValue,
  setEditingValue,
  onSaveFolderName,
  onCancelEdit,
  onStartEdit,
  savingFolderName,
  onAddSubfolder,
  dynamicSubfolders,
  onRequestDeleteDynamicSubfolder,
}: {
  folder: Folder;
  projectId: string;
  folderDisplayNames?: Record<string, string>;
  totalUnreadCount: number;
  folderUnreadByPath: Map<string, number>;
  onAddSubfolder?: (parentPath: string) => void;
  dynamicSubfolders?: Record<string, string[]>;
  onRequestDeleteDynamicSubfolder?: (fullPath: string) => void;
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
  const folderIcon = folderIconImages[folder.path];

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
        <div
          role="button"
          tabIndex={0}
          onClick={handleCardClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleCardClick();
            }
          }}
          className="w-full flex items-center justify-between px-6 py-5 text-left cursor-pointer hover:bg-gradient-to-r hover:from-transparent hover:to-gray-50/50 transition-all duration-200"
        >
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {/* Icon with gradient background */}
            <div className={`flex-shrink-0 w-14 h-14 rounded-xl ${folderIcon ? 'bg-white border border-gray-200' : `bg-gradient-to-br ${config.gradient}`} flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 overflow-hidden`}>
              {folderIcon ? (
                <Image src={folderIcon} alt="" width={44} height={44} className="h-11 w-11 object-contain" />
              ) : (
                <span className="text-2xl filter drop-shadow-sm">{config.icon}</span>
              )}
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
                    title={t('common.save')}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onCancelEdit(); }}
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 flex-shrink-0"
                    title={t('common.cancel')}
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
                      title={t('common.editName')}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                    {onAddSubfolder && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onAddSubfolder(folder.path); }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-green-power-600 hover:bg-green-power-50 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 font-bold text-lg leading-none min-w-[2rem]"
                        title={t('projectsDetail.addSubfolder')}
                        aria-label={t('projectsDetail.addSubfolder')}
                      >
                        +
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 font-medium">{t(`folders.${folder.path}.description`) || config.description}</div>
                </>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3 flex-shrink-0 ml-4">
            {totalUnreadCount > 0 && !isEditing && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-red-500/90 text-white text-xs font-semibold">
                {totalUnreadCount} {t('status.unread')}
              </span>
            )}
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
        </div>
        
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
                unreadCounts={folderUnreadByPath}
                editingFolderPath={editingFolderPath}
                setEditingFolderPath={setEditingFolderPath}
                editingValue={editingValue}
                setEditingValue={setEditingValue}
                onSaveFolderName={onSaveFolderName}
                onCancelEdit={onCancelEdit}
                onStartEdit={onStartEdit}
                savingFolderName={savingFolderName}
                dynamicSubfolders={dynamicSubfolders}
                onRequestDeleteDynamicSubfolder={onRequestDeleteDynamicSubfolder}
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
  folderUnreadByPath,
  editingFolderPath,
  setEditingFolderPath,
  editingValue,
  setEditingValue,
  onSaveFolderName,
  onCancelEdit,
  onStartEdit,
  savingFolderName,
  dynamicSubfolders,
  onAddSubfolder,
  onRequestDeleteDynamicSubfolder,
}: {
  projectId: string;
  loading: boolean;
  folderDisplayNames?: Record<string, string>;
  folderUnreadByPath: Map<string, number>;
  dynamicSubfolders?: Record<string, string[]>;
  onAddSubfolder: (parentPath: string) => void;
  onRequestDeleteDynamicSubfolder: (fullPath: string) => void;
} & InlineEditProps) {
  const { t } = useLanguage();
  const folders = useMemo(() => {
    const base = PROJECT_FOLDER_STRUCTURE.filter((folder) => folder.path !== '00_New_Not_Viewed_Yet_');
    return mergeDynamicSubfolders(base, dynamicSubfolders);
  }, [dynamicSubfolders]);
  if (loading) {
    return (
      <div className="mb-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('files.projectFolders')}</h2>
          <p className="text-sm text-gray-600">{t('files.clickOnFolderToManageFiles')}</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-pulse">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
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
              totalUnreadCount={sumUnreadForTopLevelFolder(folder, folderUnreadByPath)}
              folderUnreadByPath={folderUnreadByPath}
              editingFolderPath={editingFolderPath}
              setEditingFolderPath={setEditingFolderPath}
              editingValue={editingValue}
              setEditingValue={setEditingValue}
              onSaveFolderName={onSaveFolderName}
              onCancelEdit={onCancelEdit}
              onStartEdit={onStartEdit}
              savingFolderName={savingFolderName}
              onAddSubfolder={onAddSubfolder}
              dynamicSubfolders={dynamicSubfolders}
              onRequestDeleteDynamicSubfolder={onRequestDeleteDynamicSubfolder}
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
  const { currentUser } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAlert, setShowAlert] = useState(false);
  const [alertData, setAlertData] = useState<{ title: string; message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const [editingFolderPath, setEditingFolderPath] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [savingFolderName, setSavingFolderName] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [addSubfolderParent, setAddSubfolderParent] = useState<string | null>(null);
  const [addSubfolderName, setAddSubfolderName] = useState('');
  const [addingSubfolder, setAddingSubfolder] = useState(false);
  const [deleteSubfolderPath, setDeleteSubfolderPath] = useState<string | null>(null);
  const [deletingSubfolder, setDeletingSubfolder] = useState(false);
  const folderUnreadByPath = useAdminFolderUnreadByPath(projectId);
  const chatUnread = useAdminChatUnreadCount(projectId);

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

  const openAddSubfolder = (parentPath: string) => {
    setAddSubfolderParent(parentPath);
    setAddSubfolderName('');
  };

  const handleConfirmAddSubfolder = async () => {
    if (!projectId || !db || !project || !addSubfolderParent || !addSubfolderName.trim()) return;
    setAddingSubfolder(true);
    try {
      const segment = sanitizeDynamicSubfolderSegment(addSubfolderName);
      if (!segment) {
        setAlertData({
          title: t('messages.error.generic'),
          message: t('projectsDetail.subfolderNameInvalid'),
          type: 'error',
        });
        setShowAlert(true);
        return;
      }
      const fullPath = `${addSubfolderParent}/${segment}`;
      const base = PROJECT_FOLDER_STRUCTURE.filter((f) => f.path !== '00_New_Not_Viewed_Yet_');
      const added = await appendDynamicSubfolderTransaction(
        db,
        projectId,
        base,
        addSubfolderParent,
        segment,
        addSubfolderName.trim(),
        fullPath
      );
      if (!added) {
        setAlertData({
          title: t('messages.error.generic'),
          message: t('projectsDetail.subfolderExists'),
          type: 'error',
        });
        setShowAlert(true);
        return;
      }
      setAddSubfolderParent(null);
      setAddSubfolderName('');
      setAlertData({
        title: t('projectsDetail.subfolderCreated'),
        message: t('projectsDetail.subfolderCreatedMessage'),
        type: 'success',
      });
      setShowAlert(true);
    } catch (err) {
      setAlertData({
        title: t('messages.error.generic'),
        message: err instanceof Error ? err.message : t('projectsDetail.saveFailed'),
        type: 'error',
      });
      setShowAlert(true);
    } finally {
      setAddingSubfolder(false);
    }
  };

  const requestDeleteDynamicSubfolder = (fullPath: string) => {
    setDeleteSubfolderPath(fullPath);
  };

  const executeDeleteDynamicSubfolder = async () => {
    if (!deleteSubfolderPath || !projectId || !db || !project) return;
    const fullPath = deleteSubfolderPath;
    const parts = fullPath.split('/').filter(Boolean);
    if (parts.length !== 2) {
      setDeleteSubfolderPath(null);
      return;
    }
    const [parentPath, segment] = parts;
    if (!isDynamicSubfolderPath(fullPath, project.dynamicSubfolders)) {
      setDeleteSubfolderPath(null);
      return;
    }
    setDeletingSubfolder(true);
    try {
      const list = [...(project.dynamicSubfolders?.[parentPath] ?? [])];
      const nextList = list.filter((s) => s !== segment);
      const nextDynamic: Record<string, string[]> = { ...(project.dynamicSubfolders ?? {}) };
      if (nextList.length === 0) {
        delete nextDynamic[parentPath];
      } else {
        nextDynamic[parentPath] = nextList;
      }
      const nextNames = { ...(project.folderDisplayNames ?? {}) };
      delete nextNames[fullPath];

      const payload: Record<string, unknown> = {
        folderDisplayNames: nextNames,
      };
      if (Object.keys(nextDynamic).length === 0) {
        payload.dynamicSubfolders = deleteField();
      } else {
        payload.dynamicSubfolders = nextDynamic;
      }

      await updateDoc(doc(db, 'projects', projectId), payload);
      setDeleteSubfolderPath(null);
      setAlertData({
        title: t('projectsDetail.subfolderDeleted'),
        message: t('projectsDetail.subfolderDeletedMessage'),
        type: 'success',
      });
      setShowAlert(true);
    } catch (err) {
      setAlertData({
        title: t('messages.error.generic'),
        message: err instanceof Error ? err.message : t('projectsDetail.saveFailed'),
        type: 'error',
      });
      setShowAlert(true);
    } finally {
      setDeletingSubfolder(false);
    }
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
      <div className="px-4 sm:px-8 py-6 sm:py-8 min-w-0 max-w-full">
          <div className="bg-white border border-gray-200 rounded-sm p-4 sm:p-8 min-w-0">
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
    <div className="px-4 sm:px-8 py-6 sm:py-8 min-w-0 max-w-full">
        <div className="mb-6">
          <Link
            href="/projects"
            className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block"
          >
            ← {t('projectsDetail.backToProjects')}
          </Link>
          <div className="flex flex-wrap items-center justify-between gap-4 mt-2">
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold text-gray-900">{project?.name}</h2>
              {project?.year && (
                <p className="text-sm text-gray-500 mt-1">{t('projectsDetail.year')}: {project.year}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="group relative flex items-center gap-3 rounded-xl border border-gray-200 bg-white pl-3 pr-4 py-3 shadow-sm hover:shadow-md hover:border-green-power-200 hover:bg-green-power-50/70 active:scale-[0.98] transition-all duration-200 flex-shrink-0"
            >
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-gray-50 ring-1 ring-gray-100 group-hover:bg-green-power-50 group-hover:ring-green-power-100 transition-colors">
                <Image
                  src="/chat-icon.png"
                  alt=""
                  width={80}
                  height={80}
                  className="rounded-md object-contain max-h-11 max-w-11"
                  style={{ width: 'auto', height: 'auto' }}
                />
              </span>
              <span className="font-semibold text-gray-800 group-hover:text-green-power-800 transition-colors">
                {t('chat.projectChat')}
              </span>
              <UnreadBadge count={chatUnread} className="absolute -top-1 -right-1" size="sm" />
              <svg className="h-5 w-5 text-gray-400 group-hover:text-green-power-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {currentUser && (
          <ProjectChatPanel
            projectId={projectId}
            projectName={project?.name}
            isOpen={chatOpen}
            onClose={() => setChatOpen(false)}
            currentUserId={currentUser.uid}
          />
        )}

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
          folderUnreadByPath={folderUnreadByPath}
          editingFolderPath={editingFolderPath}
          setEditingFolderPath={setEditingFolderPath}
          editingValue={editingValue}
          setEditingValue={setEditingValue}
          onSaveFolderName={handleSaveFolderName}
          onCancelEdit={handleCancelEdit}
          onStartEdit={handleStartEdit}
          savingFolderName={savingFolderName}
          dynamicSubfolders={project?.dynamicSubfolders}
          onAddSubfolder={openAddSubfolder}
          onRequestDeleteDynamicSubfolder={requestDeleteDynamicSubfolder}
        />

      <ConfirmationModal
        isOpen={!!deleteSubfolderPath}
        title={t('projectsDetail.deleteSubfolderTitle')}
        message={t('projectsDetail.deleteSubfolderConfirm')}
        type="danger"
        confirmText={deletingSubfolder ? t('common.loading') : t('common.delete')}
        onConfirm={() => {
          if (!deletingSubfolder) void executeDeleteDynamicSubfolder();
        }}
        onCancel={() => {
          if (!deletingSubfolder) setDeleteSubfolderPath(null);
        }}
      />

      {/* Alert Modal */}
      <AlertModal
        isOpen={showAlert}
        title={alertData?.title || t('common.alert')}
        message={alertData?.message || ''}
        type={alertData?.type || 'info'}
        onClose={() => {
          setShowAlert(false);
          setAlertData(null);
        }}
      />

      {addSubfolderParent && (
        <div
          className="fixed inset-0 z-[100] admin-modal-host bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-subfolder-title"
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[min(100dvh,100svh)] overflow-y-auto my-auto p-6 border border-gray-200 min-h-0">
            <h3 id="add-subfolder-title" className="text-lg font-bold text-gray-900 mb-2">
              {t('projectsDetail.addSubfolder')}
            </h3>
            <p className="text-sm text-gray-600 mb-4">{t('projectsDetail.addSubfolderHint')}</p>
            <input
              type="text"
              value={addSubfolderName}
              onChange={(e) => setAddSubfolderName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500 mb-4"
              placeholder={t('projectsDetail.subfolderNamePlaceholder')}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleConfirmAddSubfolder();
                if (e.key === 'Escape') {
                  setAddSubfolderParent(null);
                  setAddSubfolderName('');
                }
              }}
            />
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAddSubfolderParent(null);
                  setAddSubfolderName('');
                }}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 touch-manipulation"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={addingSubfolder || !addSubfolderName.trim()}
                onClick={() => void handleConfirmAddSubfolder()}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-green-power-600 hover:bg-green-power-700 disabled:opacity-50 touch-manipulation"
              >
                {addingSubfolder ? t('common.loading') : t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

