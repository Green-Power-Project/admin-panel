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
  customerId: string;
  customerNumber?: string;
  customerEmail?: string;
  customerName?: string;
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
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!db) return;
    const dbInstance = db; // Store for TypeScript narrowing

    // Show loader whenever data is being fetched
    setLoading(true);
    let customersMap = new Map<string, { customerNumber: string; email: string; name?: string }>();

    // Real-time listener for customers
    const customersUnsubscribe = onSnapshot(
      collection(dbInstance, 'customers'),
      (customersSnapshot) => {
        customersMap = new Map<string, { customerNumber: string; email: string; name?: string }>();
        
        customersSnapshot.forEach((doc) => {
          const data = doc.data();
          customersMap.set(data.uid, {
            customerNumber: data.customerNumber || 'N/A',
            email: data.email || 'N/A',
            name: data.name || '',
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
              customerName: customerInfo?.name,
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
          const data = doc.data();
          const customerInfo = customersMap.get(data.customerId);
          projectsList.push({
            id: doc.id,
            name: data.name,
            year: data.year,
            customerId: data.customerId,
            customerNumber: customerInfo?.customerNumber,
            customerEmail: customerInfo?.email,
            customerName: customerInfo?.name,
          } as Project);
        });

        setProjects(projectsList);
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

    const term = searchQuery.trim().toLowerCase();
    if (term) {
      filtered = filtered.filter((project) => {
        const name = project.name.toLowerCase();
        const customerName = project.customerName?.toLowerCase() || '';
        const customerNumber = project.customerNumber?.toLowerCase() || '';
        const year = project.year?.toString() || '';
        return (
          name.includes(term) ||
          customerName.includes(term) ||
          customerNumber.includes(term) ||
          year.includes(term)
        );
      });
    }

    setFilteredProjects(filtered);
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

  const totalProjects = filteredProjects.length;

  return (
    <div className="px-8 py-8 space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-green-power-50 to-green-power-100">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-lg md:text-xl font-semibold text-gray-900">File Management</h2>
              <p className="text-xs md:text-sm text-gray-600 mt-1">
                Upload, organize, and manage project files
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-3 py-2 rounded-lg bg-white/90 border border-gray-200">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">Total</p>
                <p className="text-sm font-semibold text-gray-900">{totalProjects}</p>
              </div>
              <Link
                href="/projects/new"
                className="px-4 py-2 bg-green-power-600 text-white text-sm font-medium rounded-lg hover:bg-green-power-700 transition-colors"
              >
                + New Project
              </Link>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/60">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Filter by Project / Customer / Year
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
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by project name, customer name, customer number, or year..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500 placeholder:text-gray-400"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4">
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
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-8 text-center">
              {searchQuery ? (
                <>
                  <p className="text-sm font-medium text-gray-700">
                    No projects found for the selected filters.
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Try adjusting your search query.
                  </p>
                  <button
                    onClick={() => setSearchQuery('')}
                    className="mt-4 px-4 py-2 text-sm text-green-power-600 hover:text-green-power-700 font-medium"
                  >
                    Clear search
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-700">
                    No projects yet
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Get started by creating your first project to manage files
                  </p>
                  <Link
                    href="/projects/new"
                    className="mt-4 inline-block px-4 py-2 bg-green-power-600 text-white text-sm font-medium rounded-lg hover:bg-green-power-700 transition-colors"
                  >
                    + Create Project
                  </Link>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.map((project, index) => (
                <Link
                  key={project.id}
                  href={`/files/${project.id}?from=files`}
                  className="group bg-white border-2 border-gray-200 rounded-xl overflow-hidden hover:border-green-power-400 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 flex flex-col h-full"
                >
                  {/* Card Header with Icon */}
                  <div className={`bg-gradient-to-br ${getCardGradient(index)} p-5 flex items-center justify-between`}>
                    <div className="flex items-center gap-3">
                      <div className="text-3xl">{getProjectIcon(project.name)}</div>
                      <div>
                        <div className="bg-white/60 rounded-lg px-2.5 py-1">
                          <span className="text-[10px] font-semibold text-gray-700">Project</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-5 flex-1 flex flex-col">

                  {/* Project Info */}
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-green-power-700 transition-colors line-clamp-2">
                      {project.name}
                    </h3>
                    <div className="flex flex-col gap-2">
                      {project.customerName && (
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span className="text-xs font-medium text-gray-700 truncate">
                            {project.customerName}
                          </span>
                        </div>
                      )}
                      {project.customerNumber && (
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                          </svg>
                          <span className="text-xs text-gray-600 truncate">
                            {project.customerNumber.charAt(0).toUpperCase() + project.customerNumber.slice(1)}
                          </span>
                        </div>
                      )}
                      {project.year && (
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-xs text-gray-600">
                            {project.year}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="mt-auto pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-600 group-hover:text-green-power-600 transition-colors">
                        Manage Files
                      </span>
                      <div className="w-8 h-8 rounded-full bg-green-power-50 group-hover:bg-green-power-100 flex items-center justify-center transition-colors">
                        <svg className="w-5 h-5 text-green-power-600 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

