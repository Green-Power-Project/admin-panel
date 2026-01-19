'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AppHeader from '@/components/AppHeader';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  getDoc,
  updateDoc,
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
      <CustomerDetailContent />
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
    if (customerId) {
      loadCustomerData();
      loadCustomerProjects();
    }
  }, [customerId]);

  async function loadCustomerData() {
    setLoading(true);
    try {
      const customerDoc = await getDoc(doc(db, 'customers', customerId));
      
      if (customerDoc.exists()) {
        const data = customerDoc.data();
        const customerData: CustomerData = {
          uid: data.uid || customerId,
          email: data.email || 'N/A',
          customerNumber: data.customerNumber || 'N/A',
          enabled: data.enabled !== false,
        };
        setCustomer(customerData);
        setCustomerNumber(customerData.customerNumber);
        setEnabled(customerData.enabled);
      } else {
        // Customer document doesn't exist, create it with basic info
        setCustomer({
          uid: customerId,
          email: 'N/A',
          customerNumber: 'N/A',
          enabled: true,
        });
      }
    } catch (error) {
      console.error('Error loading customer:', error);
      setError('Failed to load customer data');
    } finally {
      setLoading(false);
    }
  }

  async function loadCustomerProjects() {
    try {
      const q = query(
        collection(db, 'projects'),
        where('customerId', '==', customerId),
        orderBy('name', 'asc')
      );
      const snapshot = await getDocs(q);
      const projectsList: Project[] = [];
      
      snapshot.forEach((doc) => {
        projectsList.push({ id: doc.id, ...doc.data() } as Project);
      });

      setProjects(projectsList);
    } catch (error) {
      console.error('Error loading customer projects:', error);
    }
  }

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

      // Update customer document
      const customerRef = doc(db, 'customers', customerId);
      const customerDoc = await getDoc(customerRef);

      if (customerDoc.exists()) {
        await updateDoc(customerRef, {
          customerNumber: customerNumber.trim(),
          enabled,
        });
      } else {
        // Create customer document if it doesn't exist
        await updateDoc(customerRef, {
          uid: customerId,
          email: customer?.email || 'N/A',
          customerNumber: customerNumber.trim(),
          enabled,
          createdAt: new Date(),
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <main className="max-w-7xl mx-auto px-6 py-8">
          <div className="bg-white border border-gray-200 rounded-sm p-12 text-center">
            <div className="inline-block h-6 w-6 border-2 border-gray-300 border-t-green-power-500 rounded-full animate-spin"></div>
            <p className="mt-4 text-sm text-gray-500">Loading customer...</p>
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
            href="/customers"
            className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block"
          >
            ← Back to Customers
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">
                {editing ? 'Edit Customer' : customer?.customerNumber || 'Customer Details'}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {customer?.email}
              </p>
              <p className="text-xs text-gray-400 mt-1 font-mono">ID: {customerId}</p>
            </div>
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
            {editing ? (
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
      </main>
    </div>
  );
}
