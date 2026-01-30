'use client';

import { useState, useEffect, FormEvent, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, orderBy, where } from 'firebase/firestore';
import { createProjectFolderStructure } from '@/lib/projectUtils';
import { useLanguage } from '@/contexts/LanguageContext';

interface Customer {
  uid: string;
  customerNumber: string;
  email: string;
}

export default function NewProjectPage() {
  const { t } = useLanguage();
  return (
    <ProtectedRoute>
      <AdminLayout title={t('projects.createProject')}>
        <NewProjectContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function NewProjectContent() {
  const { t } = useLanguage();
  const router = useRouter();
  const [name, setName] = useState('');
  const [year, setYear] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [projectNumber, setProjectNumber] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadCustomers();
  }, []);

  // Click outside to close customer dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setCustomerDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery.trim()) return customers;
    const q = customerSearchQuery.trim().toLowerCase();
    return customers.filter(
      (c) =>
        (c.customerNumber && c.customerNumber.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q))
    );
  }, [customers, customerSearchQuery]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.uid === customerId) || null,
    [customers, customerId]
  );

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
      setError(t('projectsNew.dbNotInitialized'));
      setLoading(false);
      return;
    }
    const dbInstance = db;

    if (!customerId) {
      setError(t('projectsNew.selectCustomer'));
      setLoading(false);
      return;
    }

    if (!projectNumber.trim()) {
      setError(t('projectsNew.projectNumberRequired'));
      setLoading(false);
      return;
    }

    try {
      const projectData: any = {
        name: name.trim(),
        customerId: customerId.trim(),
        projectNumber: projectNumber.trim(),
        enabled: true,
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

      // Send welcome email to customer with project details
      try {
        // Fetch customer details
        const customerQuery = query(
          collection(dbInstance, 'customers'),
          where('uid', '==', customerId.trim())
        );
        const customerSnapshot = await getDocs(customerQuery);
        
        if (!customerSnapshot.empty) {
          const customerDoc = customerSnapshot.docs[0];
          const customerData = customerDoc.data();
          
          const welcomeResponse = await fetch('/api/notifications/welcome-project', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              projectId,
              projectNumber: projectNumber.trim(),
              projectName: name.trim(),
              customerId: customerId.trim(),
              customerNumber: customerData.customerNumber || '',
              customerName: customerData.name || '',
              customerEmail: customerData.email || '',
            }),
          });
          
          if (welcomeResponse.ok) {
            console.log('[project-create] Welcome email sent successfully');
          } else {
            console.warn('[project-create] Failed to send welcome email');
          }
        }
      } catch (emailError) {
        console.error('[project-create] Error sending welcome email:', emailError);
        // Don't fail project creation if email fails
      }

      router.push(`/projects/${projectId}`);
    } catch (err: any) {
      console.error('Error creating project:', err);
      setError(err.message || t('projectsNew.createFailed'));
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
            ← {t('projectsNew.backToProjects')}
          </Link>
          <h2 className="text-2xl font-semibold text-gray-900 mt-2">{t('projects.newProject')}</h2>
          <p className="text-sm text-gray-500 mt-1">{t('projectsNew.description')}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-sm">
          <div className="px-6 py-5">
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 text-sm">
                  {error}
                </div>
              )}

              <div ref={customerDropdownRef}>
                <label htmlFor="customerSearch" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Customer <span className="text-red-500">*</span>
                </label>
                {loadingCustomers ? (
                  <div className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm text-gray-500">
                    {t('projectsNew.loadingCustomers')}
                  </div>
                ) : customers.length === 0 ? (
                  <div className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm text-gray-500 bg-gray-50">
                    No customers available. <Link href="/customers/new" className="text-green-power-600 hover:text-green-power-700">Create a customer first</Link>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="flex rounded-sm border border-gray-300 bg-white focus-within:ring-1 focus-within:ring-green-power-500 focus-within:border-green-power-500">
                      <input
                        id="customerSearch"
                        type="text"
                        value={customerDropdownOpen ? customerSearchQuery : (selectedCustomer ? `${selectedCustomer.customerNumber.charAt(0).toUpperCase() + selectedCustomer.customerNumber.slice(1)} - ${selectedCustomer.email}` : '')}
                        onChange={(e) => {
                          setCustomerSearchQuery(e.target.value);
                          setCustomerDropdownOpen(true);
                        }}
                        onFocus={() => setCustomerDropdownOpen(true)}
                        placeholder="Search or select a customer..."
                        className="w-full px-3 py-2 text-sm focus:outline-none border-0 rounded-sm"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerDropdownOpen(!customerDropdownOpen);
                          if (!customerDropdownOpen) setCustomerSearchQuery('');
                        }}
                        className="px-2 text-gray-400 hover:text-gray-600 border-l border-gray-200"
                        aria-label="Toggle dropdown"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                    {customerDropdownOpen && (
                      <ul className="absolute z-10 mt-1 w-full max-h-60 overflow-auto bg-white border border-gray-300 rounded-sm shadow-lg text-sm">
                        {filteredCustomers.length === 0 ? (
                          <li className="px-3 py-2 text-gray-500">No matching customers</li>
                        ) : (
                          filteredCustomers.map((customer) => (
                            <li
                              key={customer.uid}
                              role="option"
                              aria-selected={customerId === customer.uid}
                              onClick={() => {
                                setCustomerId(customer.uid);
                                setCustomerSearchQuery('');
                                setCustomerDropdownOpen(false);
                              }}
                              className={`px-3 py-2 cursor-pointer hover:bg-green-power-50 ${customerId === customer.uid ? 'bg-green-power-100 text-green-power-800' : 'text-gray-700'}`}
                            >
                              {customer.customerNumber.charAt(0).toUpperCase() + customer.customerNumber.slice(1)} - {customer.email}
                            </li>
                          ))
                        )}
                      </ul>
                    )}
                  </div>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  One project belongs to one customer.
                </p>
              </div>

              <div>
                <label htmlFor="projectNumber" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Project Number <span className="text-red-500">*</span>
                </label>
                <input
                  id="projectNumber"
                  type="text"
                  value={projectNumber}
                  onChange={(e) => setProjectNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
                  placeholder="e.g., 2026-2030"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Enter a unique project number (e.g., 2026-2030).
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
                  disabled={loading || loadingCustomers || customers.length === 0 || !customerId || !projectNumber.trim()}
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
