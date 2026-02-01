'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface NavItem {
  nameKey: string;
  href: string;
  icon: string;
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navigation: NavItem[] = [
  { nameKey: 'navigation.dashboard', href: '/dashboard', icon: '📊' },
  { nameKey: 'navigation.projects', href: '/projects', icon: '📁' },
  { nameKey: 'navigation.customers', href: '/customers', icon: '👥' },
  { nameKey: 'navigation.gallery', href: '/gallery', icon: '🖼️' },
  { nameKey: 'navigation.tracking', href: '/tracking', icon: '👁️' },
  { nameKey: 'navigation.approvals', href: '/approvals', icon: '✅' },
  { nameKey: 'navigation.auditLogs', href: '/audit-logs', icon: '📋' },
  { nameKey: 'navigation.customerUploads', href: '/customer-uploads', icon: '📥' },
  { nameKey: 'navigation.profile', href: '/profile', icon: '⚙️' },
];

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { currentUser } = useAuth();
  const { t } = useLanguage();

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <div className={`
        flex flex-col h-screen bg-gradient-to-b from-green-power-700 to-green-power-800 text-white 
        w-64 fixed left-0 top-0 z-50 shadow-2xl
        transform transition-transform duration-300 ease-in-out
        lg:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
      {/* Logo Section */}
      <div className="flex items-center px-6 py-5 border-b border-green-power-600/30">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-lg overflow-hidden">
            <img 
              src="/logo.png" 
              alt="Grün Power Logo" 
              className="w-full h-full object-contain p-1"
            />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Grün Power</h1>
            <p className="text-xs text-green-power-200">{t('navigation.adminPanel')}</p>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
          return (
            <Link
              key={item.nameKey}
              href={item.href}
              prefetch={true}
              onClick={() => {
                // Close sidebar on mobile when navigating
                if (window.innerWidth < 1024) {
                  onClose();
                }
              }}
              className={`
                flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200
                ${
                  isActive
                    ? 'bg-white text-green-power-700 shadow-lg font-semibold'
                    : 'text-green-power-100 hover:bg-green-power-700/50 hover:text-white'
                }
              `}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-sm">{t(item.nameKey)}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Info Footer */}
      <div className="px-4 py-4 border-t border-green-power-600/30">
        <div className="flex items-center space-x-3 px-3 py-2 rounded-lg bg-green-power-700/30">
          <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
            <span className="text-green-power-700 font-semibold text-sm">
              {currentUser?.email?.charAt(0).toUpperCase() || 'A'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">
              {currentUser?.email || 'Admin'}
            </p>
            <p className="text-xs text-green-power-200">{t('navigation.administrator')}</p>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

