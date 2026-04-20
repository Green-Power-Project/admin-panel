'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';

interface AppHeaderProps {
  title?: string;
  onMenuClick: () => void;
}

export default function AppHeader({ title, onMenuClick }: AppHeaderProps) {
  const { currentUser, logout } = useAuth();
  const router = useRouter();
  const { t } = useLanguage();

  async function handleLogout() {
    try {
      await logout();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      } else {
        router.push('/login');
      }
    } catch (error) {
      console.error('Error logging out:', error);
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      } else {
        router.push('/login');
      }
    }
  }

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30 shrink-0 pt-[env(safe-area-inset-top)]">
      <div className="lg:ml-0 px-3 sm:px-6">
        <div className="flex justify-between items-center min-h-[52px] sm:h-16 gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
            {/* Hamburger Menu Button - Mobile Only */}
            <button
              type="button"
              onClick={onMenuClick}
              className="lg:hidden flex items-center justify-center min-h-[44px] min-w-[44px] -ml-1 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-green-power-500 touch-manipulation"
              aria-label={t('common.toggleMenu')}
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            {title && (
              <h1 className="text-base sm:text-lg font-semibold text-gray-900 lg:hidden truncate min-w-0">{title}</h1>
            )}
          </div>
          <div className="flex items-center space-x-2 sm:space-x-4 shrink-0">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <div className="w-8 h-8 sm:w-9 sm:h-9 bg-gradient-to-br from-green-power-500 to-green-power-600 rounded-full flex items-center justify-center shadow-md shrink-0">
                <span className="text-white font-semibold text-xs sm:text-sm">
                  {currentUser?.email?.charAt(0).toUpperCase() || 'A'}
                </span>
              </div>
              <div className="hidden sm:block min-w-0 max-w-[200px] lg:max-w-xs">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {currentUser?.email || 'Admin'}
                </p>
                <p className="text-xs text-gray-500">{t('navigation.administrator')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="min-h-[44px] px-3 sm:px-4 py-2 text-xs sm:text-sm text-white bg-gradient-to-r from-green-power-600 to-green-power-700 hover:from-green-power-700 hover:to-green-power-800 rounded-lg font-medium shadow-md hover:shadow-lg transition-all duration-200 touch-manipulation inline-flex items-center justify-center"
            >
              {t('common.signOut')}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

