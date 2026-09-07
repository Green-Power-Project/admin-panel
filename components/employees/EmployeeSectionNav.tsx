'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  EMPLOYEE_AREA_MASTER_DATA,
  EMPLOYEE_AREA_SECTIONS,
  isEmployeeAreaLinkActive,
} from '@/lib/navigation/employeeArea';

/**
 * Section navigation for the employee area.
 *
 * Rendered by AdminLayout on every page inside "Mitarbeiter", including the
 * employee detail, so an admin can move between employee sections without
 * going back to the sidebar. Master-data links sit after a divider and are
 * styled quieter, because they are occasional configuration rather than
 * day-to-day work.
 */
export default function EmployeeSectionNav() {
  const pathname = usePathname();
  const { t } = useLanguage();

  const linkClass = (active: boolean, muted: boolean) => `
    shrink-0 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors
    ${
      active
        ? 'bg-green-power-600 text-white shadow-sm'
        : muted
          ? 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
    }
  `;

  return (
    <nav
      aria-label={t('navigation.employees')}
      className="bg-white border-b border-gray-200"
    >
      <div className="px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-1 overflow-x-auto overscroll-x-contain">
        {EMPLOYEE_AREA_SECTIONS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            prefetch={true}
            aria-current={
              isEmployeeAreaLinkActive(pathname, link.href) ? 'page' : undefined
            }
            className={linkClass(
              isEmployeeAreaLinkActive(pathname, link.href),
              false,
            )}
          >
            {t(link.nameKey)}
          </Link>
        ))}

        <span
          className="shrink-0 mx-2 h-5 w-px bg-gray-200"
          aria-hidden="true"
        />

        {EMPLOYEE_AREA_MASTER_DATA.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            prefetch={true}
            aria-current={
              isEmployeeAreaLinkActive(pathname, link.href) ? 'page' : undefined
            }
            className={linkClass(
              isEmployeeAreaLinkActive(pathname, link.href),
              true,
            )}
          >
            {t(link.nameKey)}
          </Link>
        ))}
      </div>
    </nav>
  );
}
