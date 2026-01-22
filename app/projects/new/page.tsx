'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, orderBy } from 'firebase/firestore';
import { createProjectFolderStructure } from '@/lib/projectUtils';

interface Customer {
  uid: string;
  customerNumber: string;
  email: string;
  enabled: boolean;
}

export default function NewProjectPage() {
  return (
    <ProtectedRoute>
      <AdminLayout title="Create Project">
        <NewProjectContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function NewProjectContent() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [year, setYear] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCustomers();
  }, []);

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
    setLoading(true);

    if (!db) {
      setError('Database not initialized');
      setLoading(false);
      return;
    }
    const dbInstance = db; // Store for TypeScript narrowing

    if (!customerId) {
      setError('Please select a customer');
      setLoading(false);
      return;
    }

    try {
      const projectData: any = {
        name: name.trim(),
        customerId: customerId.trim(),
      };

      if (year) {
        const yearNum = parseInt(year, 10);
        if (!isNaN(yearNum)) {
          projectData.year = yearNum;
        }
      }

      // Create project document in Firestore
      const projectRef = await addDoc(collection(dbInstance, 'projects'), projectData);
      const projectId = projectRef.id;

      // Create folder structure in Firebase Storage
      try {
        await createProjectFolderStructure(projectId);
      } catch (folderError) {
        console.error('Error creating folder structure:', folderError);
        // Continue even if folder creation fails - folders will be created when files are uploaded
      }

      router.push(`/projects/${projectId}`);
    } catch (err: any) {
      console.error('Error creating project:', err);
      setError(err.message || 'Failed to create project. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-8 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link
            href="/projects"
            className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block"
          >
            ← Back to Projects
          </Link>
          <h2 className="text-2xl font-semibold text-gray-900 mt-2">Create New Project</h2>
          <p className="text-sm text-gray-500 mt-1">Add a new project and assign it to a customer</p>
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
                <label htmlFor="customerId" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Customer <span className="text-red-500">*</span>
                </label>
                {loadingCustomers ? (
                  <div className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm text-gray-500">
                    Loading customers...
                  </div>
                ) : customers.length === 0 ? (
                  <div className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm text-gray-500 bg-gray-50">
                    No customers available. <Link href="/customers/new" className="text-green-power-600 hover:text-green-power-700">Create a customer first</Link>
                  </div>
                ) : (
                  <select
                    id="customerId"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
                  >
                    <option value="">Select a customer...</option>
                    {customers
                      .filter((customer) => customer.enabled)
                      .map((customer) => (
                        <option key={customer.uid} value={customer.uid}>
                          {customer.customerNumber} - {customer.email}
                        </option>
                      ))}
                  </select>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Only enabled customers are shown. One project belongs to one customer.
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

              <div className="bg-blue-50 border border-blue-200 rounded-sm p-4">
                <p className="text-xs text-blue-800 font-medium mb-1">📁 Folder Structure</p>
                <p className="text-xs text-blue-700">
                  A predefined folder structure will be automatically created for this project, including folders for photos, reports, invoices, and more.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4">
                <Link
                  href="/projects"
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-50 font-medium"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={loading || loadingCustomers || customers.length === 0}
                  className="px-4 py-2 bg-green-power-500 text-white text-sm font-medium rounded-sm hover:bg-green-power-600 focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
