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
import Pagination from '@/components/Pagination';

interface Customer {
  uid: string;
  name?: string;
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
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSearch, setFilterSearch] = useState<string>('');
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

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
          name: data.name || '',
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

  // Filter customers based on search query
  useEffect(() => {
    let filtered = [...customers];

    const term = filterSearch.trim().toLowerCase();
    if (term) {
      filtered = filtered.filter((customer) => {
        const name = customer.name?.toLowerCase() || '';
        const customerNumber = customer.customerNumber.toLowerCase();
        const email = customer.email.toLowerCase();
        return (
          name.includes(term) ||
          customerNumber.includes(term) ||
          email.includes(term)
        );
      });
    }

    setFilteredCustomers(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  }, [customers, filterSearch]);

  const totalCustomers = filteredCustomers.length;

  return (
    <div className="px-8 py-8 space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-green-power-50 to-green-power-100">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-lg md:text-xl font-semibold text-gray-900">Customers</h2>
              <p className="text-xs md:text-sm text-gray-600 mt-1">
                Manage customer accounts
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-3 py-2 rounded-lg bg-white/90 border border-gray-200">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">Total</p>
                <p className="text-sm font-semibold text-gray-900">{totalCustomers}</p>
              </div>
              <Link
                href="/customers/new"
                className="px-4 py-2 bg-green-power-600 text-white text-sm font-medium rounded-lg hover:bg-green-power-700 transition-colors"
              >
                + New Customer
              </Link>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/60">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Filter by Customer / Email / Customer Number
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
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Search by customer name, number, or email"
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500 placeholder:text-gray-400"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 animate-pulse"
                >
                  <div className="h-5 w-32 rounded-full bg-gray-200" />
                  <div className="h-3 w-40 rounded bg-gray-200" />
                  <div className="h-3 w-32 rounded bg-gray-200" />
                  <div className="h-3 w-28 rounded bg-gray-200" />
                  <div className="h-3 w-20 rounded bg-gray-200" />
                </div>
              ))}
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-8 text-center">
              <p className="text-sm font-medium text-gray-700">
                No customers found for the selected filters.
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {filterSearch ? 'Try adjusting your search query.' : 'Create your first customer account to get started.'}
              </p>
              {!filterSearch && (
                <Link
                  href="/customers/new"
                  className="mt-4 inline-block text-sm text-green-power-600 hover:text-green-power-700 font-medium"
                >
                  Create your first customer account →
                </Link>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[25%]">
                      Customer Number
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[30%]">
                      Email
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[15%]">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[15%]">
                      Projects
                    </th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[10%]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {filteredCustomers
                    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                    .map((customer) => (
                  <tr 
                    key={customer.uid} 
                    className="hover:bg-green-power-50/30 transition-colors group"
                  >
                    <td className="px-3 py-2.5">
                      <Link href={`/customers/${customer.uid}`} className="flex items-center gap-2 group/link">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center flex-shrink-0 shadow-sm group-hover/link:shadow-md transition-shadow">
                          <span className="text-white font-semibold text-xs">
                            {customer.name 
                              ? customer.name.charAt(0).toUpperCase()
                              : customer.customerNumber.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          {customer.name && (
                            <div className="text-xs font-semibold text-gray-900 group-hover/link:text-green-power-700 transition-colors truncate">
                              {customer.name.charAt(0).toUpperCase() + customer.name.slice(1).toLowerCase()}
                            </div>
                          )}
                          <div className={`text-xs ${customer.name ? 'text-gray-500' : 'font-semibold text-gray-900'} group-hover/link:text-green-power-700 transition-colors truncate`}>
                            {customer.customerNumber.charAt(0).toUpperCase() + customer.customerNumber.slice(1)}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span className="truncate">{customer.email}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          customer.enabled
                            ? 'bg-green-100 text-green-700 border border-green-200'
                            : 'bg-red-100 text-red-700 border border-red-200'
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${customer.enabled ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        {customer.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        <span className="font-medium">{customer.projectCount}</span>
                        <span className="text-[10px] text-gray-500">{customer.projectCount === 1 ? 'project' : 'projects'}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-right">
                      <div 
                        className="flex items-center justify-end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link
                          href={`/customers/${customer.uid}`}
                          className="w-7 h-7 rounded-md bg-green-power-50 hover:bg-green-power-100 flex items-center justify-center text-green-power-600 hover:text-green-power-700 transition-colors group/icon"
                          title="View Details"
                        >
                          <svg className="w-4 h-4 group-hover/icon:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.522 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.478 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
                </tbody>
              </table>
              <Pagination
                currentPage={currentPage}
                totalPages={Math.ceil(filteredCustomers.length / itemsPerPage)}
                totalItems={filteredCustomers.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={(newItemsPerPage) => {
                  setItemsPerPage(newItemsPerPage);
                  setCurrentPage(1);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
