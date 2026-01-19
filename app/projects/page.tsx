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
  deleteDoc,
  doc,
} from 'firebase/firestore';

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
      <ProjectsContent />
    </ProtectedRoute>
  );
}

function ProjectsContent() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    setLoading(true);
    try {
      // Load projects
      const q = query(collection(db, 'projects'), orderBy('name', 'asc'));
      const querySnapshot = await getDocs(q);
      const projectsList: Project[] = [];
      
      querySnapshot.forEach((doc) => {
        projectsList.push({ id: doc.id, ...doc.data() } as Project);
      });

      // Load customers to get customer numbers
      const customersSnapshot = await getDocs(collection(db, 'customers'));
      const customerMap = new Map<string, { customerNumber: string; email: string }>();
      
      customersSnapshot.forEach((doc) => {
        const data = doc.data();
        customerMap.set(data.uid, {
          customerNumber: data.customerNumber || 'N/A',
          email: data.email || 'N/A',
        });
      });

      // Enrich projects with customer information
      const enrichedProjects = projectsList.map((project) => {
        const customerInfo = customerMap.get(project.customerId);
        return {
          ...project,
          customerNumber: customerInfo?.customerNumber,
          customerEmail: customerInfo?.email,
        };
      });

      setProjects(enrichedProjects);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(projectId: string) {
    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      return;
    }

    setDeleting(projectId);
    try {
      await deleteDoc(doc(db, 'projects', projectId));
      await loadProjects();
    } catch (error) {
      console.error('Error deleting project:', error);
      alert('Failed to delete project. Please try again.');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-6 py-8">
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
                          onClick={() => handleDelete(project.id)}
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
      </main>
    </div>
  );
}

