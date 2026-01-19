'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AppHeader from '@/components/AppHeader';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  query,
  orderBy,
} from 'firebase/firestore';

interface Project {
  id: string;
  name: string;
  year?: number;
}

export default function FilesPage() {
  return (
    <ProtectedRoute>
      <FilesContent />
    </ProtectedRoute>
  );
}

function FilesContent() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    setLoading(true);
    try {
      const q = query(collection(db, 'projects'), orderBy('name', 'asc'));
      const querySnapshot = await getDocs(q);
      const projectsList: Project[] = [];
      
      querySnapshot.forEach((doc) => {
        projectsList.push({ id: doc.id, ...doc.data() } as Project);
      });

      setProjects(projectsList);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900">File Management</h2>
          <p className="text-sm text-gray-500 mt-1">Select a project to manage files</p>
        </div>

        {loading ? (
          <div className="bg-white border border-gray-200 rounded-sm p-12 text-center">
            <div className="inline-block h-6 w-6 border-2 border-gray-300 border-t-green-power-500 rounded-full animate-spin"></div>
            <p className="mt-4 text-sm text-gray-500">Loading projects...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-sm p-12 text-center">
            <p className="text-sm text-gray-500">No projects found.</p>
            <Link
              href="/projects/new"
              className="mt-4 inline-block text-sm text-green-power-600 hover:text-green-power-700 font-medium"
            >
              Create a project first →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/files/${project.id}`}
                className="bg-white border border-gray-200 rounded-sm p-5 hover:border-green-power-500 hover:shadow-sm transition-colors"
              >
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  {project.name}
                </h3>
                {project.year && (
                  <p className="text-xs text-gray-500 mb-4">{project.year}</p>
                )}
                <div className="flex items-center text-xs text-green-power-600">
                  <span>Manage files</span>
                  <span className="ml-1">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

