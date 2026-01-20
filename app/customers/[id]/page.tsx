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
    <div className="px-8 py-8">
        <div className="mb-6">
          <Link
            href="/customers"
            className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block"
          >
            ← Back to Customers
          </Link>
          <div className="flex items-center justify-between">
            {loading ? (
              <div className="animate-pulse">
                <div className="h-8 bg-gray-200 rounded w-64 mb-2"></div>
                <div className="h-4 bg-gray-100 rounded w-48"></div>
              </div>
            ) : (
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">
                  {editing ? 'Edit Customer' : customer?.customerNumber || 'Customer Details'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {customer?.email}
                </p>
                <p className="text-xs text-gray-400 mt-1 font-mono">ID: {customerId}</p>
              </div>
            )}
            {!loading && (
              <div className="flex items-center space-x-2">
              {editing ? (
                <>
                  <button
                    onClick={() => {
                      setEditing(false);
                      setCustomerNumber(customer?.customerNumber || '');
                      setEnabled(customer?.enabled ?? true);
                      setError('');
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
                <button
                  onClick={() => setEditing(true)}
                  className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-50"
                >
                  Edit
                </button>
              )}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        {/* Customer Information */}
        <div className="bg-white border border-gray-200 rounded-sm mb-6">
          <div className="px-5 py-4 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">Customer Information</h3>
          </div>
          <div className="p-5">
            {loading ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-32 mb-4"></div>
                <div className="h-10 bg-gray-100 rounded"></div>
                <div className="h-10 bg-gray-100 rounded"></div>
              </div>
            ) : editing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Customer Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={customerNumber}
                    onChange={(e) => setCustomerNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
                    placeholder="e.g., CUST-001"
                  />
                </div>
                <div className="flex items-center">
                  <input
                    id="enabled"
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="h-4 w-4 text-green-power-500 focus:ring-green-power-500 border-gray-300 rounded"
                  />
                  <label htmlFor="enabled" className="ml-2 block text-sm text-gray-700">
                    Enable customer access
                  </label>
                </div>
                <p className="text-xs text-gray-500">
                  Disabled customers cannot log in to the portal
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500">Customer Number</p>
                  <p className="text-sm font-medium text-gray-900 mt-1">
                    {customer?.customerNumber || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Email</p>
                  <p className="text-sm font-medium text-gray-900 mt-1">
                    {customer?.email || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Status</p>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${
                      customer?.enabled
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {customer?.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Assigned Projects */}
        <div className="bg-white border border-gray-200 rounded-sm">
          <div className="px-5 py-4 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">Assigned Projects</h3>
          </div>
          {projects.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm text-gray-500">No projects assigned to this customer.</p>
              <Link
                href="/projects/new"
                className="mt-2 inline-block text-sm text-green-power-600 hover:text-green-power-700"
              >
                Assign a project →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {projects.map((project) => (
                <div key={project.id} className="px-5 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <Link
                        href={`/projects/${project.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-green-power-600"
                      >
                        {project.name}
                      </Link>
                      {project.year && (
                        <p className="text-xs text-gray-500 mt-1">Year: {project.year}</p>
                      )}
                    </div>
                    <Link
                      href={`/projects/${project.id}`}
                      className="text-sm text-green-power-600 hover:text-green-power-700"
                    >
                      View →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

    </div>
  );
}
