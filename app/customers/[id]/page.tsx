'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  doc,
  updateDoc,
  getDocs,
  setDoc,
  getDoc,
} from 'firebase/firestore';

interface Project {
  id: string;
  name: string;
  year?: number;
}

interface CustomerData {
  uid: string;
  email: string;
  customerNumber: string;
  enabled: boolean;
}

export default function CustomerDetailPage() {
  return (
    <ProtectedRoute>
      <AdminLayout>
        <CustomerDetailContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function CustomerDetailContent() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [customerNumber, setCustomerNumber] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!customerId || !db) return;

    // Check if this customer page has been visited before in this session
    const storageKey = `customer-${customerId}-visited`;
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

    // Real-time listener for customer document - query by uid field since document ID is auto-generated
    const customerQuery = query(
      collection(db, 'customers'),
      where('uid', '==', customerId)
    );

    const customerUnsubscribe = onSnapshot(
      customerQuery,
      (querySnapshot) => {
        if (!querySnapshot.empty) {
          // Customer found - get the first document (should only be one)
          const customerDoc = querySnapshot.docs[0];
          const data = customerDoc.data();
          const actualCustomerUid = data.uid || customerId; // Use the uid from the document
          const customerData: CustomerData = {
            uid: actualCustomerUid,
            email: data.email || 'N/A',
            customerNumber: data.customerNumber || 'N/A',
            enabled: data.enabled !== false,
          };
          setCustomer(customerData);
          setCustomerNumber(customerData.customerNumber);
          setEnabled(customerData.enabled);
        } else {
          // Customer document doesn't exist - try to get from Firebase Auth or set defaults
          setCustomer({
            uid: customerId,
            email: 'N/A',
            customerNumber: 'N/A',
            enabled: true,
          });
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to customer:', error);
        setError('Failed to load customer data');
        setLoading(false);
      }
    );

    // Real-time listener for customer projects
    // Use the same approach as customer list page: listen to all projects and filter by customerId
    // This matches projects.customerId with customers.uid (customerId from URL is the uid)
    const projectsUnsubscribe = onSnapshot(
      collection(db, 'projects'),
      (snapshot) => {
        const projectsList: Project[] = [];
        
        // Filter projects where customerId matches the customer's uid (same logic as customer list page)
        snapshot.forEach((doc) => {
          const data = doc.data();
          // Match project's customerId with customer's uid (from URL parameter)
          if (data.customerId === customerId) {
            projectsList.push({ 
              id: doc.id, 
              name: data.name || 'Unnamed Project',
              year: data.year,
            } as Project);
          }
        });

        // Sort by name manually
        projectsList.sort((a, b) => {
          const nameA = (a.name || '').toLowerCase();
          const nameB = (b.name || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });

        setProjects(projectsList);
      },
      (error) => {
        console.error('Error listening to customer projects:', error);
        setProjects([]);
      }
    );

    // Cleanup listeners on unmount
    return () => {
      customerUnsubscribe();
      projectsUnsubscribe();
    };
  }, [customerId]);

  async function handleSave() {
    setSaving(true);
    setError('');

    if (!customerNumber.trim()) {
      setError('Customer Number is required');
      setSaving(false);
      return;
    }

    try {
      // Check if customer number is already taken by another customer
      if (customerNumber.trim() !== customer?.customerNumber) {
        const existingQuery = query(
          collection(db, 'customers'),
          where('customerNumber', '==', customerNumber.trim())
        );
        const existingSnapshot = await getDocs(existingQuery);
        
        if (!existingSnapshot.empty && existingSnapshot.docs[0].id !== customerId) {
          setError('Customer Number already exists. Please use a different number.');
          setSaving(false);
          return;
        }
      }

      // Find customer document by uid field (since document ID is auto-generated)
      const customerQuery = query(
        collection(db, 'customers'),
        where('uid', '==', customerId)
      );
      const customerSnapshot = await getDocs(customerQuery);

      if (!customerSnapshot.empty) {
        // Customer document exists - update it
        const customerDoc = customerSnapshot.docs[0];
        await updateDoc(doc(db, 'customers', customerDoc.id), {
          customerNumber: customerNumber.trim(),
          enabled,
          updatedAt: new Date(),
        });
      } else {
        // Customer document doesn't exist - create it
        // Use setDoc with customerId as document ID for consistency
        await setDoc(doc(db, 'customers', customerId), {
          uid: customerId,
          email: customer?.email || 'N/A',
          customerNumber: customerNumber.trim(),
          enabled,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      setCustomer({
        ...customer!,
        customerNumber: customerNumber.trim(),
        enabled,
      });
      setEditing(false);
    } catch (err: any) {
      console.error('Error updating customer:', err);
      setError(err.message || 'Failed to update customer. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // Don't show full-page loading - use skeleton in content area instead

  return (
    <div className="px-6 sm:px-8 py-6 sm:py-8">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          href="/customers"
          className="inline-flex items-center text-sm text-gray-600 hover:text-green-power-700 transition-colors mb-4 group"
        >
          <svg className="w-4 h-4 mr-1 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Customers
        </Link>
      </div>

      {/* Header Card */}
      {loading ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 p-8 animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-64 mb-3"></div>
          <div className="h-4 bg-gray-100 rounded w-48"></div>
        </div>
      ) : (
        <div className="bg-gradient-to-r from-blue-50 via-white to-emerald-50 rounded-2xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
          <div className="px-6 py-6 border-b border-gray-100">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg flex-shrink-0">
                  <span className="text-white font-bold text-xl">
                    {customer?.customerNumber?.charAt(customer.customerNumber.length - 1) || 'C'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">
                    {customer?.customerNumber || 'Customer'}
                  </h1>
                  <div className="flex items-center gap-3 text-sm text-gray-600 flex-wrap">
                    <span className="flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {customer?.email || 'N/A'}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${customer?.enabled ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <span className={`font-semibold ${customer?.enabled ? 'text-green-700' : 'text-red-700'}`}>
                        {customer?.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2 font-mono">ID: {customerId}</p>
                </div>
              </div>
              {!editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
          <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="text-sm text-red-700 font-medium">{error}</p>
        </div>
      )}

      {/* Customer Information Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-50/50 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Customer Information</h3>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-10 bg-gray-100 rounded-lg"></div>
              <div className="h-10 bg-gray-100 rounded-lg"></div>
            </div>
          ) : editing ? (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Customer Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={customerNumber}
                  onChange={(e) => setCustomerNumber(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500 transition-all"
                  placeholder="e.g., CUST-001"
                />
              </div>
              <div className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 bg-gray-50">
                <input
                  id="enabled"
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="h-5 w-5 text-green-power-500 focus:ring-green-power-500 border-gray-300 rounded cursor-pointer"
                />
                <label htmlFor="enabled" className="block text-sm font-medium text-gray-700 cursor-pointer">
                  Enable customer access
                </label>
              </div>
              <p className="text-xs text-gray-500">
                Disabled customers cannot log in to the portal
              </p>
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => {
                    setEditing(false);
                    setCustomerNumber(customer?.customerNumber || '');
                    setEnabled(customer?.enabled ?? true);
                    setError('');
                  }}
                  className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-green-power-600 to-green-power-700 rounded-lg hover:from-green-power-700 hover:to-green-power-800 disabled:opacity-50 transition-all shadow-sm"
                >
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Saving...
                    </span>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer Number</p>
                <p className="text-lg font-bold text-gray-900">
                  {customer?.customerNumber || 'N/A'}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</p>
                <p className="text-lg font-medium text-gray-900 break-words">
                  {customer?.email || 'N/A'}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</p>
                <span
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${
                    customer?.enabled
                      ? 'bg-green-100 text-green-700 border border-green-200'
                      : 'bg-red-100 text-red-700 border border-red-200'
                  }`}
                >
                  <div className={`w-2.5 h-2.5 rounded-full ${customer?.enabled ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  {customer?.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Assigned Projects Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-50/50 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Assigned Projects</h3>
            <span className="px-3 py-1 rounded-full bg-gray-100 text-xs font-semibold text-gray-700">
              {projects.length} {projects.length === 1 ? 'project' : 'projects'}
            </span>
          </div>
        </div>
        {projects.length === 0 ? (
          <div className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <p className="text-base font-medium text-gray-700 mb-1">No projects assigned</p>
            <p className="text-sm text-gray-500 mb-4">This customer doesn't have any projects yet</p>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-green-power-600 to-green-power-700 rounded-lg hover:from-green-power-700 hover:to-green-power-800 transition-all shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Assign a Project
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="block px-6 py-4 hover:bg-gray-50 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-power-500 to-green-power-600 flex items-center justify-center flex-shrink-0 shadow-sm group-hover:shadow-md transition-shadow">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-base font-semibold text-gray-900 group-hover:text-green-power-700 transition-colors">
                        {project.name}
                      </div>
                      {project.year && (
                        <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          Year: {project.year}
                        </div>
                      )}
                    </div>
                  </div>
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-green-power-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
