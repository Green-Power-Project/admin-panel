import type {
  EmployeeDeliveryNoteRecord,
  EmployeeDocumentationRecord,
  EmployeeMachineRecord,
  EmployeeMaterialRecord,
  EmployeeTimeEntry,
} from '@/lib/employees/types';

/**
 * Office workflow state of a report (requirement 61).
 *
 * `submitted` is what arrives from the app; the office then reviews it
 * (`checked`), may amend it (`edited`) and finally releases it (`released`).
 */
export const ADMIN_REPORT_STATUSES = [
  'submitted',
  'checked',
  'edited',
  'released',
] as const;

export type AdminReportStatus = (typeof ADMIN_REPORT_STATUSES)[number];

/** Allowed moves. Released can be reopened for a correction. */
const TRANSITIONS: Record<AdminReportStatus, AdminReportStatus[]> = {
  submitted: ['checked', 'edited'],
  edited: ['checked'],
  checked: ['released', 'edited'],
  released: ['checked'],
};

export function canTransition(
  from: AdminReportStatus,
  to: AdminReportStatus,
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedTransitions(
  from: AdminReportStatus,
): AdminReportStatus[] {
  return TRANSITIONS[from] ?? [];
}

/** A released report is final and appears in the customer-facing output. */
export function isReleased(status: AdminReportStatus): boolean {
  return status === 'released';
}

/** Everything still waiting on the office (dashboard tile, requirement 49). */
export function isOpenReport(status: AdminReportStatus): boolean {
  return status !== 'released';
}

/**
 * Office-side overlay stored per report id.
 *
 * The report itself stays where the employee created it — the office only adds
 * review state on top, so "enter once" is preserved.
 */
export interface AdminReportReview {
  reportId: string;
  status: AdminReportStatus;
  /** Office edits; empty means the employee's original is used. */
  editedTitle: string;
  officeNote: string;
  checkedAt: string;
  editedAt: string;
  releasedAt: string;
}

export function emptyReview(reportId: string): AdminReportReview {
  return {
    reportId,
    status: 'submitted',
    editedTitle: '',
    officeNote: '',
    checkedAt: '',
    editedAt: '',
    releasedAt: '',
  };
}

/**
 * A report with the data already linked to it (requirement 61).
 *
 * Content is derived from the same employee app data the other admin screens
 * read — nothing is duplicated into a second report store.
 */
export interface AdminReport {
  id: string;
  employeeId: string;
  employeeName: string;
  projectName: string;
  date: string;
  /** Employee's title, or the office's edit when present. */
  title: string;
  originalTitle: string;
  status: AdminReportStatus;
  officeNote: string;
  checkedAt: string;
  editedAt: string;
  releasedAt: string;

  reportHours: EmployeeTimeEntry[];
  machines: EmployeeMachineRecord[];
  materials: EmployeeMaterialRecord[];
  deliveryNotes: EmployeeDeliveryNoteRecord[];
  documentation: EmployeeDocumentationRecord[];
}

export function totalReportHours(report: AdminReport): number {
  const sum = report.reportHours.reduce((acc, e) => acc + e.hours, 0);
  return Math.round(sum * 100) / 100;
}

/** BOQ positions the report's hours were booked on (requirements 59, 61). */
export function reportLvPositions(report: AdminReport): string[] {
  const seen = new Set<string>();
  for (const entry of report.reportHours) {
    if (entry.lvPosition) seen.add(entry.lvPosition);
  }
  return Array.from(seen).sort();
}
