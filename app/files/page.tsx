'use client';

import { useState, useEffect, useMemo } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
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
      <AdminLayout title="Files">
        <FilesContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function FilesContent() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!db) return;

    // Show loader whenever data is being fetched
    setLoading(true);

    // Real-time listener for projects
    const unsubscribe = onSnapshot(
      query(collection(db, 'projects'), orderBy('name', 'asc')),
      (querySnapshot) => {
        const projectsList: Project[] = [];
        
        querySnapshot.forEach((doc) => {
          projectsList.push({ id: doc.id, ...doc.data() } as Project);
        });

        setProjects(projectsList);
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to projects:', error);
        setLoading(false);
      }
    );

    // Cleanup listener on unmount
    return () => {
      unsubscribe();
    };
  }, []);

  // Filter projects based on search query
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    
    const query = searchQuery.toLowerCase();
    return projects.filter(
      (project) =>
        project.name.toLowerCase().includes(query) ||
        project.year?.toString().includes(query)
    );
  }, [projects, searchQuery]);

  // Get project icon based on name
  const getProjectIcon = (name: string) => {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('solar') || nameLower.includes('energy')) return '☀️';
    if (nameLower.includes('office') || nameLower.includes('building')) return '🏢';
    if (nameLower.includes('home') || nameLower.includes('house')) return '🏠';
    if (nameLower.includes('factory') || nameLower.includes('industrial')) return '🏭';
    return '📁';
  };

  // Get gradient colors for cards
  const getCardGradient = (index: number) => {
    const gradients = [
      'from-green-power-50 to-green-power-100',
      'from-blue-50 to-blue-100',
      'from-purple-50 to-purple-100',
      'from-orange-50 to-orange-100',
      'from-teal-50 to-teal-100',
      'from-pink-50 to-pink-100',
    ];
    return gradients[index % gradients.length];
  };

  return (
    <div className="px-8 py-8">
      {/* Header Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">File Management</h1>
            <p className="text-sm text-gray-600">Upload, organize, and manage project files</p>
          </div>
          <Link
            href="/projects/new"
            className="px-5 py-2.5 bg-gradient-to-r from-green-power-600 to-green-power-700 text-white text-sm font-medium rounded-lg hover:from-green-power-700 hover:to-green-power-800 transition-all shadow-md hover:shadow-lg flex items-center space-x-2"
          >
            <span>+</span>
            <span>New Project</span>
          </Link>
        </div>

        {/* Stats Card */}
        <div className="bg-gradient-to-r from-green-power-50 to-green-power-100 rounded-xl p-6 border border-green-power-200 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">Total Projects</p>
              <p className="text-3xl font-bold text-gray-900">{projects.length}</p>
            </div>
            <div className="bg-white/60 rounded-lg p-4">
              <span className="text-4xl">📁</span>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        {projects.length > 0 && (
          <div className="mb-6">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search projects by name or year..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:border-transparent bg-white"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Projects Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-6 animate-pulse">
              <div className="h-12 bg-gray-200 rounded-lg mb-4"></div>
              <div className="h-4 bg-gray-100 rounded w-24 mb-4"></div>
              <div className="h-8 bg-gray-100 rounded"></div>
            </div>
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          {searchQuery ? (
            <>
              <div className="mb-4">
                <span className="text-6xl">🔍</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No projects found</h3>
              <p className="text-sm text-gray-500 mb-6">
                No projects match your search for "<span className="font-medium">{searchQuery}</span>"
              </p>
              <button
                onClick={() => setSearchQuery('')}
                className="px-4 py-2 text-sm text-green-power-600 hover:text-green-power-700 font-medium"
              >
                Clear search
              </button>
            </>
          ) : (
            <>
              <div className="mb-4">
                <span className="text-6xl">📂</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No projects yet</h3>
              <p className="text-sm text-gray-500 mb-6">
                Get started by creating your first project to manage files
              </p>
              <Link
                href="/projects/new"
                className="inline-flex items-center px-5 py-2.5 bg-gradient-to-r from-green-power-600 to-green-power-700 text-white text-sm font-medium rounded-lg hover:from-green-power-700 hover:to-green-power-800 transition-all shadow-md"
              >
                <span className="mr-2">+</span>
                Create Project
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project, index) => (
            <Link
              key={project.id}
              href={`/files/${project.id}`}
              className="group bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-green-power-400 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
            >
              {/* Card Header with Icon */}
              <div className={`bg-gradient-to-br ${getCardGradient(index)} rounded-lg p-4 mb-4 flex items-center justify-between`}>
                <div className="text-4xl">{getProjectIcon(project.name)}</div>
                <div className="bg-white/60 rounded-lg px-3 py-1.5">
                  <span className="text-xs font-semibold text-gray-700">Project</span>
                </div>
              </div>

              {/* Project Info */}
              <div className="mb-4">
                <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-green-power-700 transition-colors line-clamp-2">
                  {project.name}
                </h3>
                {project.year && (
                  <div className="flex items-center space-x-2">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      📅 {project.year}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Button */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <span className="text-sm font-medium text-gray-600 group-hover:text-green-power-600 transition-colors">
                  Manage Files
                </span>
                <div className="w-8 h-8 rounded-full bg-green-power-50 group-hover:bg-green-power-100 flex items-center justify-center transition-colors">
                  <svg className="w-5 h-5 text-green-power-600 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Search Results Info */}
      {searchQuery && filteredProjects.length > 0 && (
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Showing <span className="font-medium text-gray-700">{filteredProjects.length}</span> of{' '}
            <span className="font-medium text-gray-700">{projects.length}</span> projects
          </p>
        </div>
      )}
    </div>
  );
}

