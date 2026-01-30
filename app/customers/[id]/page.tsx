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
import { useLanguage } from '@/contexts/LanguageContext';

interface Project {
  id: string;
  name: string;
  year?: number;
}

interface CustomerData {
  uid: string;
  name?: string;
  mobileNumber?: string;
  email: string;
  customerNumber: string;
  canViewAllProjects?: boolean;
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
  const { t } = useLanguage();
  const customerId = params.id as string;
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [customerNumber, setCustomerNumber] = useState('');
  const [canViewAllProjects, setCanViewAllProjects] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!customerId || !db) return;
    const dbInstance = db; // Store for TypeScript narrowing

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
      collection(dbInstance, 'customers'),
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
            name: data.name || '',
            mobileNumber: data.mobileNumber || '',
            email: data.email || 'N/A',
            customerNumber: data.customerNumber || 'N/A',
            canViewAllProjects: data.canViewAllProjects === true,
          };
          setCustomer(customerData);
          setName(customerData.name || '');
          setMobileNumber(customerData.mobileNumber || '');
          setCustomerNumber(customerData.customerNumber);
          setCanViewAllProjects(customerData.canViewAllProjects === true);
        } else {
          // Customer document doesn't exist - try to get from Firebase Auth or set defaults
          setCustomer({
            uid: customerId,
            name: '',
            mobileNumber: '',
            email: 'N/A',
            customerNumber: 'N/A',
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
      collection(dbInstance, 'projects'),
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
    if (!db) {
      setError('Database not initialized');
      return;
    }
    const dbInstance = db; // Store for TypeScript narrowing
    
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
          collection(dbInstance, 'customers'),
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
        collection(dbInstance, 'customers'),
        where('uid', '==', customerId)
      );
      const customerSnapshot = await getDocs(customerQuery);

      if (!customerSnapshot.empty) {
        // Customer document exists - update it
        const customerDoc = customerSnapshot.docs[0];
        await updateDoc(doc(dbInstance, 'customers', customerDoc.id), {
          name: name.trim() ? name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase() : '',
          mobileNumber: mobileNumber.trim() || '',
          customerNumber: customerNumber.trim(),
          canViewAllProjects,
          updatedAt: new Date(),
        });
      } else {
        // Customer document doesn't exist - create it
        // Use setDoc with customerId as document ID for consistency
        await setDoc(doc(dbInstance, 'customers', customerId), {
          uid: customerId,
          name: name.trim() ? name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase() : '',
          mobileNumber: mobileNumber.trim() || '',
          email: customer?.email || 'N/A',
          customerNumber: customerNumber.trim(),
          canViewAllProjects,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      setCustomer({
        ...customer!,
        name: name.trim() ? name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase() : '',
        mobileNumber: mobileNumber.trim() || '',
        customerNumber: customerNumber.trim(),
        canViewAllProjects,
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
    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          href="/customers"
          className="inline-flex items-center text-sm text-gray-600 hover:text-green-power-700 transition-colors mb-4 group"
        >
          <svg className="w-4 h-4 mr-1 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('customers.backToCustomers')}
        </Link>
      </div>

      {/* Single Combined Card */}
      {loading ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 p-8 animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-64 mb-3"></div>
          <div className="h-4 bg-gray-100 rounded w-48"></div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden relative">
          {/* Gradient Header Bar */}
          <div className="h-2 bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-500"></div>
          
          {/* Customer Info Section */}
          <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 border-b border-gray-200">
            {/* Edit Button */}
            {!editing && (
              <div className="absolute top-4 right-4 sm:top-6 sm:right-6 lg:top-8 lg:right-8">
                <button
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  {t('common.edit')}
                </button>
              </div>
            )}

            {editing ? (
              /* Edit Form */
              <div className="space-y-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-900">{t('customers.editCustomer')}</h2>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setEditing(false);
                        setName(customer?.name || '');
                        setMobileNumber(customer?.mobileNumber || '');
                        setCustomerNumber(customer?.customerNumber || '');
                        setCanViewAllProjects(customer?.canViewAllProjects === true);
                        setError('');
                      }}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-2 text-sm font-semibold text-white bg-green-power-600 rounded-lg hover:bg-green-power-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {saving ? t('common.saving') : t('customers.saveChanges')}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('customers.customerName')}
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500"
                      placeholder={t('customers.enterCustomerName')}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('customers.customerNumber')}
                    </label>
                    <input
                      type="text"
                      value={customerNumber}
                      onChange={(e) => setCustomerNumber(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500"
                      placeholder={t('customers.enterCustomerNumber')}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('customers.mobileNumber')}
                    </label>
                    <input
                      type="text"
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500"
                      placeholder={t('customers.enterMobileNumber')}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('common.email')}
                    </label>
                    <input
                      type="email"
                      value={customer?.email || ''}
                      disabled
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                      placeholder={t('customers.emailReadOnly')}
                    />
                    <p className="mt-1 text-xs text-gray-500">{t('customers.emailCannotBeChanged')}</p>
                  </div>

                  <div>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={canViewAllProjects}
                          onChange={(e) => setCanViewAllProjects(e.target.checked)}
                          className="sr-only"
                        />
                        <div className={`w-11 h-6 rounded-full transition-colors duration-200 ${
                          canViewAllProjects ? 'bg-green-power-600' : 'bg-gray-300'
                        }`}>
                          <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
                            canViewAllProjects ? 'translate-x-5' : 'translate-x-0'
                          }`} style={{ marginTop: '2px', marginLeft: '2px' }}></div>
                        </div>
                      </div>
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-700 block">
                          {t('customers.allowViewAllProjects')}
                        </span>
                        <span className="text-xs text-gray-500 mt-0.5 block">
                          {t('customers.allowViewAllProjectsDescription')}
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            ) : (
              /* View Mode */
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                {/* Left Section - Customer Info */}
                <div className="flex items-start gap-6 flex-1 min-w-0">
                  {/* Avatar */}
                  <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-500 via-cyan-500 to-emerald-500 flex items-center justify-center shadow-xl flex-shrink-0 ring-4 ring-white">
                    <span className="text-white font-bold text-3xl">
                      {customer?.name 
                        ? customer.name.charAt(0).toUpperCase()
                        : customer?.customerNumber?.charAt(0).toUpperCase() || 'C'}
                    </span>
                  </div>
                  
                  {/* Customer Details */}
                  <div className="flex-1 min-w-0">
                    <div className="mb-3">
                      <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
                        {customer?.name 
                          ? customer.name.charAt(0).toUpperCase() + customer.name.slice(1).toLowerCase()
                          : t('customers.customerSingular')}
                      </h1>
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200">
                        <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">{t('customers.customerNumber')}</span>
                        <span className="text-sm font-bold text-blue-700">
                          {customer?.customerNumber 
                            ? customer.customerNumber.charAt(0).toUpperCase() + customer.customerNumber.slice(1)
                            : 'N/A'}
                        </span>
                      </div>
                    </div>
                    
                    {/* Contact Information */}
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <span className="text-gray-700 font-medium">{customer?.email || 'N/A'}</span>
                      </div>
                      
                      {customer?.mobileNumber && (
                        <div className="flex items-center gap-3 text-sm">
                          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                          </div>
                          <span className="text-gray-700 font-medium">{customer.mobileNumber}</span>
                        </div>
                      )}
                    </div>
                    
                  </div>
                </div>
                
                {/* Right Section - Quick Stats */}
                <div className="flex flex-col sm:flex-row lg:flex-col gap-4 lg:min-w-[200px]">
                  <div className="px-6 py-4 rounded-xl bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200">
                    <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">{t('customers.totalProjects')}</div>
                    <div className="text-3xl font-bold text-blue-700">{projects.length}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="mx-8 my-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </div>
          )}

          {/* Assigned Projects Section */}
          <div className="px-8 py-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">{t('customers.assignedProjects')}</h3>
                <p className="text-sm text-gray-600">{t('customers.manageAndViewProjectsForCustomer')}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200">
                  <span className="text-sm font-bold text-blue-700">{projects.length}</span>
                  <span className="text-xs text-blue-600 ml-1">{projects.length === 1 ? t('customers.project') : t('customers.projectsPlural')}</span>
                </span>
                <Link
                  href="/projects/new"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-green-power-600 to-green-power-700 rounded-lg hover:from-green-power-700 hover:to-green-power-800 transition-all shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {t('projects.newProject')}
                </Link>
              </div>
            </div>
            
            {projects.length === 0 ? (
              <div className="py-12 text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 mb-6 shadow-inner">
                  <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </div>
                <p className="text-lg font-semibold text-gray-900 mb-2">{t('customers.noProjectsAssigned')}</p>
                <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">{t('customers.noProjectsAssignedDescription')}</p>
                <Link
                  href="/projects/new"
                  className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-green-power-600 to-green-power-700 rounded-xl hover:from-green-power-700 hover:to-green-power-800 transition-all shadow-md hover:shadow-lg"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {t('customers.createFirstProject')}
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {projects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="group relative bg-gradient-to-br from-white to-gray-50 rounded-xl border-2 border-gray-200 hover:border-green-power-300 p-6 transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
                  >
                    {/* Gradient accent bar */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-power-500 to-emerald-500 rounded-t-xl"></div>
                    
                    <div className="flex items-start gap-4">
                      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-green-power-500 to-emerald-600 flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                        <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-green-power-700 transition-colors line-clamp-1">
                          {project.name}
                        </h4>
                        {project.year && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="font-medium">{project.year}</span>
                          </div>
                        )}
                      </div>
                      <svg className="w-5 h-5 text-gray-400 group-hover:text-green-power-600 group-hover:translate-x-1 transition-all flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
