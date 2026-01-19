'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function Home() {
  const { currentUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      // Only redirect admin users to dashboard
      if (currentUser && currentUser.isAdmin) {
        router.push('/dashboard');
      } else {
        // Non-admin or not logged in, go to login
        router.push('/login');
      }
    }
  }, [currentUser, loading, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <div className="inline-block h-6 w-6 border-2 border-gray-300 border-t-green-power-500 rounded-full animate-spin"></div>
        <p className="mt-4 text-sm text-gray-600">Verifying access...</p>
      </div>
    </div>
  );
}

