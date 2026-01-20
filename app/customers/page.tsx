'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
} from 'firebase/firestore';

interface Customer {
  uid: string;
  email: string;
  customerNumber: string;
  enabled: boolean;
  projectCount: number;
}

export default function CustomersPage() {
  return (
    <ProtectedRoute>
      <AdminLayout title="Customers">
        <CustomersContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function CustomersContent() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) return;

    // Show loader whenever data is being fetched
    setLoading(true);
    let customerProjectCounts = new Map<string, number>();

    // Helper function to update customers with project counts
    const updateCustomersWithProjectCounts = (
      customersSnapshot: any,
      projectCounts: Map<string, number>
    ) => {
      const customersList: Customer[] = [];
      customersSnapshot.forEach((doc: any) => {
        const data = doc.data();
        customersList.push({
          uid: data.uid,
          email: data.email || 'N/A',
          customerNumber: data.customerNumber || 'N/A',
          enabled: data.enabled !== false, // Default to true if not set
          projectCount: projectCounts.get(data.uid) || 0,
        });
      });
      setCustomers(customersList);
      setLoading(false);
    };

    // Real-time listener for projects (to calculate project counts)
    const projectsUnsubscribe = onSnapshot(
      collection(db, 'projects'),
      (projectsSnapshot) => {
        customerProjectCounts = new Map<string, number>();

        projectsSnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.customerId) {
            customerProjectCounts.set(
              data.customerId,
              (customerProjectCounts.get(data.customerId) || 0) + 1
            );
          }
        });

        // Trigger customers update when projects change
        // We'll get the customers snapshot from the customers listener
      },
      (error) => {
        console.error('Error listening to projects:', error);
      }
    );

    // Real-time listener for customers
    const customersUnsubscribe = onSnapshot(
      query(collection(db, 'customers'), orderBy('customerNumber', 'asc')),
      (customersSnapshot) => {
        updateCustomersWithProjectCounts(customersSnapshot, customerProjectCounts);
      },
      (error) => {
        console.error('Error listening to customers:', error);
        setLoading(false);
      }
    );

    // Cleanup listeners on unmount
    return () => {
      projectsUnsubscribe();
      customersUnsubscribe();
    };
  }, []);

  return (
    <div className="px-8 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Customers</h2>
            <p className="text-sm text-gray-500 mt-1">Manage customer accounts</p>
          </div>
          <Link
            href="/customers/new"
            className="px-4 py-2 bg-green-power-500 text-white text-sm font-medium rounded-sm hover:bg-green-power-600"
          >
            + New Customer
          </Link>
        </div>

        {loading ? (
          <div className="bg-white border border-gray-200 rounded-sm overflow-hidden animate-pulse">
            <div className="px-6 py-3 bg-gray-50">
              <div className="h-4 bg-gray-200 rounded w-32"></div>
            </div>
            <div className="divide-y divide-gray-200">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="px-6 py-4">
                  <div className="h-4 bg-gray-200 rounded w-40 mb-2"></div>
                  <div className="h-3 bg-gray-100 rounded w-56"></div>
                </div>
              ))}
            </div>
          </div>
        ) : customers.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-sm p-12 text-center">
            <p className="text-sm text-gray-500">No customers found.</p>
            <Link
              href="/customers/new"
              className="mt-4 inline-block text-sm text-green-power-600 hover:text-green-power-700 font-medium"
            >
              Create your first customer account →
            </Link>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-sm overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Projects
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {customers.map((customer) => (
                  <tr key={customer.uid} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {customer.customerNumber}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {customer.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          customer.enabled
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {customer.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {customer.projectCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Link
                        href={`/customers/${customer.uid}`}
                        className="text-green-power-600 hover:text-green-power-700"
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
