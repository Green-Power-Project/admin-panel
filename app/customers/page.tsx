'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
  doc,
  deleteDoc,
  getDocs,
} from 'firebase/firestore';
import Pagination from '@/components/Pagination';
import ConfirmationModal from '@/components/ConfirmationModal';
import AlertModal from '@/components/AlertModal';

interface Customer {
  uid: string;
  name?: string;
  email: string;
  customerNumber: string;
  projectCount: number;
}

export default function CustomersPage() {
  const { t } = useLanguage();
  return (
    <ProtectedRoute>
      <AdminLayout title={t('customers.title')}>
        <CustomersContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function CustomersContent() {
  const { t } = useLanguage();
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSearch, setFilterSearch] = useState<string>('');
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Delete modal states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [alertData, setAlertData] = useState<{ title: string; message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);

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

  const handleDeleteClick = (customer: Customer) => {
    setCustomerToDelete(customer);
    setShowDeleteConfirm(true);
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
    setCustomerToDelete(null);
  };

  const handleDeleteConfirm = async () => {
    if (!customerToDelete || !db) {
      setShowDeleteConfirm(false);
      setCustomerToDelete(null);
      return;
    }
    const dbInstance = db; // Store for TypeScript narrowing

    setDeleting(true);
    try {
      // Find the customer document by uid
      const customersQuery = query(
        collection(dbInstance, 'customers'),
        where('uid', '==', customerToDelete.uid)
      );
      
      const customersSnapshot = await getDocs(customersQuery);
      if (customersSnapshot.empty) {
        throw new Error('Customer document not found');
      }

      // Delete all matching customer documents
      const deletePromises = customersSnapshot.docs.map((docSnapshot) =>
        deleteDoc(doc(dbInstance, 'customers', docSnapshot.id))
      );
      await Promise.all(deletePromises);

      // Cascade: delete report approvals for this customer
      const approvalsQuery = query(
        collection(dbInstance, 'reportApprovals'),
        where('customerId', '==', customerToDelete.uid)
      );
      const approvalsSnapshot = await getDocs(approvalsQuery);
      const approvalDeletePromises = approvalsSnapshot.docs.map((d) =>
        deleteDoc(doc(dbInstance, 'reportApprovals', d.id))
      );
      await Promise.all(approvalDeletePromises);

      setShowDeleteConfirm(false);
      setCustomerToDelete(null);
      setAlertData({
        title: 'Success',
        message: 'Customer deleted successfully',
        type: 'success',
      });
      setShowAlert(true);
    } catch (error: any) {
      console.error('Error deleting customer:', error);
      setAlertData({
        title: 'Delete Failed',
        message: error.message || 'Failed to delete customer. Please try again.',
        type: 'error',
      });
      setShowAlert(true);
    } finally {
      setDeleting(false);
    }
  };

  const totalCustomers = filteredCustomers.length;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-4 sm:space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-green-power-50 to-green-power-100">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-lg md:text-xl font-semibold text-gray-900">{t('customers.title')}</h2>
              <p className="text-xs md:text-sm text-gray-600 mt-1">
                {t('customers.description')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-3 py-2 rounded-lg bg-white/90 border border-gray-200">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">{t('common.total')}</p>
                <p className="text-sm font-semibold text-gray-900">{totalCustomers}</p>
              </div>
              <Link
                href="/customers/new"
                className="px-4 py-2 bg-green-power-600 text-white text-sm font-medium rounded-lg hover:bg-green-power-700 transition-colors"
              >
                + {t('customers.newCustomer')}
              </Link>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/60">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              {t('customers.filterLabel')}
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
                placeholder={t('customers.searchPlaceholder')}
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
                {t('customers.noCustomersFound')}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {filterSearch ? t('customers.tryAdjustingSearch') : t('customers.createFirstCustomer')}
              </p>
              {!filterSearch && (
                <Link
                  href="/customers/new"
                  className="mt-4 inline-block text-sm text-green-power-600 hover:text-green-power-700 font-medium"
                >
                  {t('customers.createFirstCustomer')} →
                </Link>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[25%]">
                      {t('customers.customerNumber')}
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[30%]">
                      {t('common.email')}
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[15%]">
                      {t('customers.projects')}
                    </th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[10%]">
                      {t('common.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {filteredCustomers
                    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                    .map((customer) => (
                  <tr 
                    key={customer.uid} 
                    onClick={() => router.push(`/customers/${customer.uid}`)}
                    className="hover:bg-green-power-50/30 transition-colors group cursor-pointer"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center flex-shrink-0 shadow-sm group-hover:shadow-md transition-shadow">
                          <span className="text-white font-semibold text-xs">
                            {customer.name 
                              ? customer.name.charAt(0).toUpperCase()
                              : customer.customerNumber.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          {customer.name && (
                            <div className="text-xs font-semibold text-gray-900 group-hover:text-green-power-700 transition-colors truncate">
                              {customer.name.charAt(0).toUpperCase() + customer.name.slice(1).toLowerCase()}
                            </div>
                          )}
                          <div className={`text-xs ${customer.name ? 'text-gray-500' : 'font-semibold text-gray-900'} group-hover:text-green-power-700 transition-colors truncate`}>
                            {customer.customerNumber.charAt(0).toUpperCase() + customer.customerNumber.slice(1)}
                          </div>
                        </div>
                      </div>
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
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        <span className="font-medium">{customer.projectCount}</span>
                        <span className="text-[10px] text-gray-500">{customer.projectCount === 1 ? t('customers.project') : t('customers.projectsPlural')}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-right">
                      <div 
                        className="flex items-center justify-end gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link
                          href={`/customers/${customer.uid}`}
                          onClick={(e) => e.stopPropagation()}
                          className="w-7 h-7 rounded-md bg-green-power-50 hover:bg-green-power-100 flex items-center justify-center text-green-power-600 hover:text-green-power-700 transition-colors group/icon"
                          title="View Details"
                        >
                          <svg className="w-4 h-4 group-hover/icon:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.522 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.478 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </Link>
                        <Link
                          href={`/customers/${customer.uid}`}
                          onClick={(e) => e.stopPropagation()}
                          className="w-7 h-7 rounded-md bg-blue-50 hover:bg-blue-100 flex items-center justify-center text-blue-600 hover:text-blue-700 transition-colors group/icon"
                          title="Edit Customer"
                        >
                          <svg className="w-4 h-4 group-hover/icon:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </Link>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(customer);
                          }}
                          className="w-7 h-7 rounded-md bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-600 hover:text-red-700 transition-colors group/icon"
                          title="Delete Customer"
                        >
                          <svg className="w-4 h-4 group-hover/icon:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                </tbody>
              </table>
              </div>
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

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title={t('customers.deleteCustomer')}
        message={
          customerToDelete
            ? t('customers.deleteConfirm', { name: customerToDelete.name || customerToDelete.customerNumber }) +
              (customerToDelete.projectCount > 0
                ? t('customers.deleteConfirmWithProjects', { count: customerToDelete.projectCount })
                : '')
            : t('customers.deleteConfirmGeneric')
        }
        confirmText={deleting ? t('customers.deleting') : t('common.delete')}
        cancelText={t('common.cancel')}
        type="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />

      {/* Alert Modal */}
      <AlertModal
        isOpen={showAlert}
        title={alertData?.title || 'Alert'}
        message={alertData?.message || ''}
        type={alertData?.type || 'info'}
        onClose={() => {
          setShowAlert(false);
          setAlertData(null);
        }}
      />
    </div>
  );
}
