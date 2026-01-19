'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface AppHeaderProps {
  title?: string;
}

export default function AppHeader({ title }: AppHeaderProps) {
  const { currentUser, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    try {
      await logout();
      // Force redirect to login page
      // Use window.location for a hard redirect to ensure session is cleared
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      } else {
        router.push('/login');
      }
    } catch (error) {
      console.error('Error logging out:', error);
      // Even on error, redirect to login
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      } else {
        router.push('/login');
      }
    }
  }

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex justify-between items-center h-14">
          <div className="flex items-center space-x-8">
            <Link href="/dashboard" className="flex items-center">
              <h1 className="text-lg font-semibold text-gray-900 tracking-tight">
                Green Power
              </h1>
              <span className="ml-3 text-xs text-gray-500 font-normal">
                Admin Panel
              </span>
            </Link>
            <nav className="hidden md:flex items-center space-x-4">
              <Link
                href="/dashboard"
                className="text-sm text-gray-600 hover:text-gray-900 font-medium"
              >
                Dashboard
              </Link>
              <Link
                href="/projects"
                className="text-sm text-gray-600 hover:text-gray-900 font-medium"
              >
                Projects
              </Link>
              <Link
                href="/customers"
                className="text-sm text-gray-600 hover:text-gray-900 font-medium"
              >
                Customers
              </Link>
              <Link
                href="/files"
                className="text-sm text-gray-600 hover:text-gray-900 font-medium"
              >
                Files
              </Link>
              <Link
                href="/tracking"
                className="text-sm text-gray-600 hover:text-gray-900 font-medium"
              >
                Tracking
              </Link>
              <Link
                href="/approvals"
                className="text-sm text-gray-600 hover:text-gray-900 font-medium"
              >
                Approvals
              </Link>
              <Link
                href="/audit-logs"
                className="text-sm text-gray-600 hover:text-gray-900 font-medium"
              >
                Audit Logs
              </Link>
              <Link
                href="/customer-uploads"
                className="text-sm text-gray-600 hover:text-gray-900 font-medium"
              >
                Customer Uploads
              </Link>
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-xs text-gray-600 hidden sm:inline">
              {currentUser?.email || 'Admin'}
            </span>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-xs text-gray-700 hover:text-gray-900 border border-gray-300 rounded-sm hover:bg-gray-50 font-medium"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

