'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, updateDoc, getDocs, query, orderBy, collection } from 'firebase/firestore';

interface Customer {
  uid: string;
  customerNumber: string;
  email: string;
  enabled: boolean;
}

interface Project {
  id: string;
  name: string;
  year?: number;
  customerId: string;
  projectNumber?: string;
}

export default function EditProjectPage() {
  return (
    <ProtectedRoute>
      <AdminLayout title="Edit Project">
        <EditProjectContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function EditProjectContent() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [year, setYear] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectId || !db) return;
    const dbInstance = db; // Store for TypeScript narrowing

    // Load project
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

    // Load customers
    loadCustomers();

    return () => {
      unsubscribe();
    };
  }, [projectId]);

  async function loadCustomers() {
    if (!db) return;
    const dbInstance = db; // Store for TypeScript narrowing
    
    setLoadingCustomers(true);
    try {
      const customersSnapshot = await getDocs(
        query(collection(dbInstance, 'customers'), orderBy('customerNumber', 'asc'))
      );
      const customersList: Customer[] = [];
      
      customersSnapshot.forEach((doc) => {
        const data = doc.data();
        customersList.push({
          uid: data.uid,
          customerNumber: data.customerNumber || 'N/A',
          email: data.email || 'N/A',
          enabled: data.enabled !== false,
        });
      });

      setCustomers(customersList);
    } catch (error) {
      console.error('Error loading customers:', error);
    } finally {
      setLoadingCustomers(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    if (!db) {
      setError('Database not initialized');
      setSaving(false);
      return;
    }
    const dbInstance = db; // Store for TypeScript narrowing

    if (!customerId) {
      setError('Customer ID is required');
      setSaving(false);
      return;
    }

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
      router.push(`/projects/${projectId}`);
    } catch (err: any) {
      console.error('Error updating project:', err);
      setError(err.message || 'Failed to update project. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="px-8 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white border border-gray-200 rounded-sm p-12 text-center">
            <div className="inline-block h-8 w-8 border-3 border-gray-300 border-t-green-power-500 rounded-full animate-spin"></div>
            <p className="mt-4 text-sm text-gray-500">Loading project...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !project) {
    return (
      <div className="px-8 py-8">
        <div className="max-w-3xl mx-auto">
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
      </div>
    );
  }

  return (
    <div className="px-8 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link
            href={`/projects/${projectId}`}
            className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block"
          >
            ← Back to Project
          </Link>
          <h2 className="text-2xl font-semibold text-gray-900 mt-2">Edit Project</h2>
          <p className="text-sm text-gray-500 mt-1">Update project details</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-sm">
          <div className="px-6 py-5">
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 text-sm">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="projectNumber" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Project Number
                </label>
                <input
                  id="projectNumber"
                  type="text"
                  value={project?.projectNumber || ''}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm bg-gray-50 text-gray-600 cursor-not-allowed"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Project number is auto-generated and cannot be changed.
                </p>
              </div>

              <div>
                <label htmlFor="customerId" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Customer
                </label>
                {loadingCustomers ? (
                  <div className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm text-gray-500 bg-gray-50">
                    Loading customer information...
                  </div>
                ) : (
                  <div className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm bg-gray-50 text-gray-700">
                    {customerId && customers.find(c => c.uid === customerId) ? (
                      `${(() => {
                        const cust = customers.find(c => c.uid === customerId);
                        const num = cust?.customerNumber || '';
                        return num ? num.charAt(0).toUpperCase() + num.slice(1) : '';
                      })()} - ${customers.find(c => c.uid === customerId)?.email}`
                    ) : (
                      'Loading...'
                    )}
                  </div>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Customer cannot be changed after project creation. To assign a different customer, create a new project.
                </p>
              </div>

              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
                  placeholder="e.g., Solar Installation - Main Office"
                />
              </div>

              <div>
                <label htmlFor="year" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Year (Optional)
                </label>
                <input
                  id="year"
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  min="2000"
                  max="2100"
                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
                  placeholder="e.g., 2024"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4">
                <Link
                  href={`/projects/${projectId}`}
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-50 font-medium"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={saving || loadingCustomers}
                  className="px-4 py-2 bg-green-power-500 text-white text-sm font-medium rounded-sm hover:bg-green-power-600 focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
