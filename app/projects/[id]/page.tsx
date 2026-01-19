'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AppHeader from '@/components/AppHeader';
import Link from 'next/link';
import { db, storage } from '@/lib/firebase';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, listAll, deleteObject } from 'firebase/storage';
import { PROJECT_FOLDER_STRUCTURE } from '@/lib/folderStructure';

interface Project {
  id: string;
  name: string;
  year?: number;
  customerId: string;
}

export default function ProjectDetailPage() {
  return (
    <ProtectedRoute>
      <ProjectDetailContent />
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

  useEffect(() => {
    if (projectId) {
      loadProject();
    }
  }, [projectId]);

  async function loadProject() {
    setLoading(true);
    try {
      const projectDoc = await getDoc(doc(db, 'projects', projectId));
      if (projectDoc.exists()) {
        const projectData = { id: projectDoc.id, ...projectDoc.data() } as Project;
        setProject(projectData);
        setName(projectData.name);
        setYear(projectData.year?.toString() || '');
        setCustomerId(projectData.customerId);
      } else {
        setError('Project not found');
      }
    } catch (error) {
      console.error('Error loading project:', error);
      setError('Failed to load project');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const updateData: any = {
        name: name.trim(),
        customerId: customerId.trim(),
      };

      if (year) {
        const yearNum = parseInt(year, 10);
        if (!isNaN(yearNum)) {
          updateData.year = yearNum;
        }
      } else {
        updateData.year = null;
      }

      await updateDoc(doc(db, 'projects', projectId), updateData);
      setProject({ ...project!, ...updateData });
      setEditing(false);
    } catch (err: any) {
      console.error('Error updating project:', err);
      setError(err.message || 'Failed to update project');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this project? This will also delete all associated files. This action cannot be undone.')) {
      return;
    }

    try {
      // Delete all files in storage
      const projectRef = ref(storage, `projects/${projectId}`);
      const fileList = await listAll(projectRef);
      const deletePromises = fileList.items.map((item) => deleteObject(item));
      await Promise.all(deletePromises);

      // Delete project document
      await deleteDoc(doc(db, 'projects', projectId));
      router.push('/projects');
    } catch (error) {
      console.error('Error deleting project:', error);
      alert('Failed to delete project. Please try again.');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <main className="max-w-7xl mx-auto px-6 py-8">
          <div className="bg-white border border-gray-200 rounded-sm p-12 text-center">
            <div className="inline-block h-6 w-6 border-2 border-gray-300 border-t-green-power-500 rounded-full animate-spin"></div>
            <p className="mt-4 text-sm text-gray-500">Loading project...</p>
          </div>
        </main>
      </div>
    );
  }

  if (error && !project) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <main className="max-w-7xl mx-auto px-6 py-8">
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
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-6 py-8">
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
                    onClick={handleDelete}
                    className="px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded-sm hover:bg-red-50"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
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
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm font-mono"
                />
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

        <div className="bg-white border border-gray-200 rounded-sm">
          <div className="px-5 py-4 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">Project Folders</h3>
            <p className="text-xs text-gray-500 mt-1">Fixed folder structure (read-only, identical for all projects)</p>
            <p className="text-xs text-gray-400 mt-1">⚠️ Folder structure is predefined and cannot be modified. Admin can upload files to these folders only.</p>
          </div>
          <div className="p-5">
            <div className="space-y-2">
              {PROJECT_FOLDER_STRUCTURE.map((folder) => (
                <div key={folder.path}>
                  <Link
                    href={`/files/${projectId}`}
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-sm border border-gray-200"
                  >
                    {folder.name}
                  </Link>
                  {folder.children && (
                    <div className="ml-6 mt-1 space-y-1">
                      {folder.children.map((child) => (
                        <Link
                          key={child.path}
                          href={`/files/${projectId}`}
                          className="block px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded-sm border border-gray-100"
                        >
                          └─ {child.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

