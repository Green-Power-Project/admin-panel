/**
 * Single source of truth for the "Mitarbeiter" (employee) area.
 *
 * Everything an admin needs for employees and their work lives under one
 * top-level sidebar entry instead of being spread across the main sidebar.
 * Both the sidebar group and the in-page section navigation read this list, so
 * the two can never drift apart.
 *
 * These are the existing routes, unchanged — this module only describes how
 * they are grouped in the navigation.
 */

export interface EmployeeAreaLink {
  /** i18n key under `navigation.` in locales/{de,en}/common.json */
  nameKey: string;
  href: string;
}

/** The employee area's own root; also where the sidebar group points. */
export const EMPLOYEE_AREA_ROOT = '/employees';

/** Day-to-day employee work. */
export const EMPLOYEE_AREA_SECTIONS: EmployeeAreaLink[] = [
  { nameKey: 'navigation.employeeOverview', href: '/employees' },
  { nameKey: 'navigation.employeeHours', href: '/controlling' },
  { nameKey: 'navigation.tasks', href: '/tasks' },
  { nameKey: 'navigation.reports', href: '/reports' },
  { nameKey: 'navigation.orders', href: '/orders' },
];

/**
 * Configuration the office sets up occasionally: the catalogues and positions
 * the employee app offers for selection. Kept visually secondary so the
 * distinction between employee *records* and *master data* stays readable.
 */
export const EMPLOYEE_AREA_MASTER_DATA: EmployeeAreaLink[] = [
  { nameKey: 'navigation.materials', href: '/materials' },
  { nameKey: 'navigation.machines', href: '/machines' },
  { nameKey: 'navigation.lv', href: '/lv' },
  { nameKey: 'navigation.templates', href: '/templates' },
];

export const EMPLOYEE_AREA_LINKS: EmployeeAreaLink[] = [
  ...EMPLOYEE_AREA_SECTIONS,
  ...EMPLOYEE_AREA_MASTER_DATA,
];

/** True when `pathname` is that link's page or one of its sub-pages. */
export function isEmployeeAreaLinkActive(
  pathname: string | null,
  href: string,
): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** True anywhere inside the employee area, at any depth. */
export function isInEmployeeArea(pathname: string | null): boolean {
  return EMPLOYEE_AREA_LINKS.some((link) =>
    isEmployeeAreaLinkActive(pathname, link.href),
  );
}
