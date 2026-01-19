'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Only redirect if not already on login page
    if (!loading && !currentUser && pathname !== '/login') {
      // Use replace to prevent back button navigation
      router.replace('/login');
    }
    
    // If user exists but is not admin, ensure they're logged out
    // This is handled in AuthContext, but we add extra protection here
    if (!loading && currentUser && !currentUser.isAdmin) {
      router.replace('/login');
    }
  }, [currentUser, loading, router, pathname]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="inline-block h-6 w-6 border-2 border-gray-300 border-t-green-power-500 rounded-full animate-spin"></div>
          <p className="mt-4 text-sm text-gray-600">Verifying access...</p>
        </div>
      </div>
    );
  }

  // Block access if not authenticated or not admin
  if (!currentUser || !currentUser.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 text-sm max-w-md">
            <p className="font-semibold">Access Denied</p>
            <p className="mt-2">You do not have permission to access this page.</p>
            <button
              onClick={() => router.push('/login')}
              className="mt-4 px-4 py-2 bg-green-power-500 text-white text-sm font-medium rounded-sm hover:bg-green-power-600"
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

