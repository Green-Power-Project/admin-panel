'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { db } from '@/lib/firebase';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';

export default function NewCustomerPage() {
  const { t } = useLanguage();
  return (
    <ProtectedRoute>
      <AdminLayout title={t('customersNew.title')}>
        <NewCustomerContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function NewCustomerContent() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const [name, setName] = useState('');
  const [customerNumber, setCustomerNumber] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [city, setCity] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function generatePassword() {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    setPassword(result);
    setConfirmPassword(result);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!db) {
      setError(t('customersNew.databaseNotInitialized'));
      return;
    }
    const dbInstance = db; // Store for TypeScript narrowing

    // Validation
    if (!name.trim()) {
      setError(t('customersNew.customerNameRequired'));
      return;
    }

    if (!email.trim()) {
      setError(t('customersNew.emailRequired'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('customersNew.passwordsDoNotMatch'));
      return;
    }

    if (password.length < 6) {
      setError(t('customersNew.passwordMinLength'));
      return;
    }

    if (!customerNumber.trim()) {
      setError(t('customersNew.customerNumberRequired'));
      return;
    }

    setLoading(true);

    try {
      // Create customer account and document using Admin SDK (doesn't affect client auth)
      const createResponse = await fetch('/api/customers/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase(),
          customerNumber: customerNumber.trim(),
          mobileNumber: mobileNumber.trim() || '',
          zipCode: zipCode.trim() || '',
          city: city.trim() || '',
          email: email.trim(),
          password: password,
          notifyCustomer: notifyCustomer,
          language: language || 'en',
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({}));
        throw new Error(errorData.error || t('customersNew.failedToCreateCustomer'));
      }

      const result = await createResponse.json();
      
      // Navigate back to customer list
      router.push('/customers');
    } catch (err: any) {
      console.error('Error creating customer:', err);
      const errorCode = err?.code || '';
      if (errorCode === 'auth/email-already-in-use') {
        setError(t('customersNew.emailAlreadyRegistered'));
      } else if (errorCode === 'auth/invalid-email') {
        setError(t('customersNew.invalidEmailAddress'));
      } else {
        setError(err.message || t('customersNew.failedToCreateCustomer'));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-8 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link
            href="/customers"
            className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block"
          >
            ← {t('customersNew.backToCustomers')}
          </Link>
          <h2 className="text-2xl font-semibold text-gray-900 mt-2">{t('customersNew.createCustomerAccount')}</h2>
          <p className="text-sm text-gray-500 mt-1">{t('customersNew.createCustomerAccountDescription')}</p>
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
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('customers.customerName')} <span className="text-red-500">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
                  placeholder={t('customersNew.enterCustomerFullName')}
                />
              </div>

              <div>
                <label htmlFor="customerNumber" className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('customers.customerNumber')} <span className="text-red-500">*</span>
                </label>
                <input
                  id="customerNumber"
                  type="text"
                  value={customerNumber}
                  onChange={(e) => setCustomerNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
                  placeholder="e.g., 204729"
                />
                <p className="mt-1 text-xs text-gray-500">
                  {t('customersNew.customerNumberHelp')}
                </p>
              </div>

              <div>
                <label htmlFor="mobileNumber" className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('customersNew.customerMobileOptional')}
                </label>
                <input
                  id="mobileNumber"
                  type="tel"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
                  placeholder="e.g., +1234567890"
                />
              </div>

              <div>
                <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Address (ZIP / City)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <input
                      id="zipCode"
                      type="text"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
                      placeholder="ZIP Code"
                    />
                  </div>
                  <div>
                    <input
                      id="city"
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
                      placeholder={t('customersNew.city')}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('common.email')} <span className="text-red-500">*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
                  placeholder={t('customersNew.emailPlaceholder')}
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  id="notifyCustomer"
                  type="checkbox"
                  checked={notifyCustomer}
                  onChange={(e) => setNotifyCustomer(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-green-power-600 focus:ring-green-power-500"
                />
                <label htmlFor="notifyCustomer" className="text-sm font-medium text-gray-700">
                  {t('customersNew.notifyCustomerHelp')}
                </label>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('common.password')} <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="relative flex-1">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
                    placeholder={t('customersNew.minimumCharacters')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700 focus:outline-none"
                  >
                    {showPassword ? (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                  </div>
                  <button
                    type="button"
                    onClick={generatePassword}
                    className="px-3 py-2 text-sm font-medium text-green-power-700 bg-green-power-50 border border-green-power-200 rounded-sm hover:bg-green-power-100 focus:outline-none focus:ring-1 focus:ring-green-power-500 whitespace-nowrap"
                  >
                    {t('customersNew.autoGenerate')}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {t('customersNew.passwordMinLength')}
                </p>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('profile.confirmPassword')} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
                    placeholder={t('customersNew.reenterPassword')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700 focus:outline-none"
                  >
                    {showConfirmPassword ? (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4">
                <Link
                  href="/customers"
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-50 font-medium"
                >
                  {t('common.cancel')}
                </Link>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-green-power-500 text-white text-sm font-medium rounded-sm hover:bg-green-power-600 focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? t('customersNew.creating') : t('customersNew.createAccount')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

