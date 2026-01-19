'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AppHeader from '@/components/AppHeader';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';

export default function NewCustomerPage() {
  return (
    <ProtectedRoute>
      <NewCustomerContent />
    </ProtectedRoute>
  );
}

function NewCustomerContent() {
  const router = useRouter();
  const { createCustomerAccount } = useAuth();
  const [email, setEmail] = useState('');
  const [customerNumber, setCustomerNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    // Validation
    if (!customerNumber.trim()) {
      setError('Customer Number is required');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      // Check if customer number already exists
      const existingCustomerQuery = query(
        collection(db, 'customers'),
        where('customerNumber', '==', customerNumber.trim())
      );
      const existingSnapshot = await getDocs(existingCustomerQuery);
      
      if (!existingSnapshot.empty) {
        setError('Customer Number already exists. Please use a different number.');
        setLoading(false);
        return;
      }

      // Create Firebase Auth account
      const uid = await createCustomerAccount(email, password);

      // Create customer document in Firestore
      await addDoc(collection(db, 'customers'), {
        uid,
        email: email.trim(),
        customerNumber: customerNumber.trim(),
        enabled,
        createdAt: new Date(),
      });

      router.push(`/customers/${uid}`);
    } catch (err: any) {
      console.error('Error creating customer:', err);
      const errorCode = err?.code || '';
      if (errorCode === 'auth/email-already-in-use') {
        setError('This email is already registered');
      } else if (errorCode === 'auth/invalid-email') {
        setError('Invalid email address');
      } else {
        setError(err.message || 'Failed to create customer account. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <Link
            href="/customers"
            className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block"
          >
            ← Back to Customers
          </Link>
          <h2 className="text-2xl font-semibold text-gray-900 mt-2">Create Customer Account</h2>
          <p className="text-sm text-gray-500 mt-1">Create a new customer account for the portal</p>
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
                <label htmlFor="customerNumber" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Customer Number <span className="text-red-500">*</span>
                </label>
                <input
                  id="customerNumber"
                  type="text"
                  value={customerNumber}
                  onChange={(e) => setCustomerNumber(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
                  placeholder="e.g., CUST-001"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Unique identifier for this customer
                </p>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
                  placeholder="customer@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Password <span className="text-red-500">*</span>
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
                  placeholder="Minimum 6 characters"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Password must be at least 6 characters long
                </p>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Confirm Password <span className="text-red-500">*</span>
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
                  placeholder="Re-enter password"
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
              <p className="text-xs text-gray-500 -mt-3">
                Disabled customers cannot log in to the portal
              </p>

              <div className="flex items-center justify-end space-x-3 pt-4">
                <Link
                  href="/customers"
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-50 font-medium"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-green-power-500 text-white text-sm font-medium rounded-sm hover:bg-green-power-600 focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

