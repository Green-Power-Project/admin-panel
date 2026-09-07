'use client';

import { getDemoAppData, getDemoEmployees } from '@/lib/employees/demoStore';
import { recordChange } from '@/lib/changelog/changeLogStore';
import {
  canTransition,
  emptyReview,
  isOpenReport,
  type AdminReport,
  type AdminReportReview,
  type AdminReportStatus,
} from './types';

const STORAGE_KEY = 'green-power-report-reviews-demo-v1';

type StoreListener = () => void;

/** Office review state keyed by report id. */
let reviews: Record<string, AdminReportReview> | null = null;
const listeners = new Set<StoreListener>();

function load(): Record<string, AdminReportReview> {
  if (reviews) return reviews;

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        reviews = JSON.parse(raw) as Record<string, AdminReportReview>;
        return reviews;
      }
    } catch (error) {
      console.warn('report reviews load failed:', error);
    }
  }

  reviews = {};
  return reviews;
}

function persist() {
  if (!reviews || typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
  } catch (error) {
    console.warn('report reviews persist failed:', error);
  }
}

function notify() {
  persist();
  listeners.forEach((listener) => listener());
}

export function subscribeReportReviews(listener: StoreListener): () => void {
  load();
  listeners.add(listener);
  listener();
  return () => listeners.delete(listener);
}

function reviewFor(reportId: string): AdminReportReview {
  const store = load();
  return store[reportId] ?? emptyReview(reportId);
}

/**
 * Composes every report with the data already linked to it.
 *
 * Content is matched the way the app's own report query works — project +
 * date + the employee who wrote it (requirement 70). Material records carry no
 * date in the admin demo data, so they are matched on employee + project only.
 */
export function getAdminReports(): AdminReport[] {
  const employees = getDemoEmployees();
  const result: AdminReport[] = [];

  for (const employee of employees) {
    const data = getDemoAppData(employee.id);
    const employeeName = `${employee.firstName} ${employee.lastName}`.trim();

    for (const report of data.reports) {
      const review = reviewFor(report.id);
      const sameProjectAndDay = (r: { projectName: string; date: string }) =>
        r.projectName === report.projectName && r.date === report.date;

      result.push({
        id: report.id,
        employeeId: employee.id,
        employeeName,
        projectName: report.projectName,
        date: report.date,
        originalTitle: report.title,
        title: review.editedTitle || report.title,
        status: review.status,
        officeNote: review.officeNote,
        checkedAt: review.checkedAt,
        editedAt: review.editedAt,
        releasedAt: review.releasedAt,

        // Only report-type hours reach a report (requirement 35).
        reportHours: data.time.filter(
          (t) => t.entryType === 'report' && sameProjectAndDay(t),
        ),
        machines: data.machines.filter(sameProjectAndDay),
        deliveryNotes: data.deliveryNotes.filter(sameProjectAndDay),
        documentation: data.documentation.filter(sameProjectAndDay),
        materials: data.materials.filter(
          (m) => m.projectName === report.projectName,
        ),
      });
    }
  }

  return result.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getAdminReport(reportId: string): AdminReport | null {
  return getAdminReports().find((r) => r.id === reportId) ?? null;
}

export function countOpenReports(): number {
  return getAdminReports().filter((r) => isOpenReport(r.status)).length;
}

/** Moves a report along the workflow; refuses moves the model disallows. */
export function setReportStatus(
  reportId: string,
  next: AdminReportStatus,
): boolean {
  // Guard against orphan review state for a report that does not exist.
  if (!getAdminReport(reportId)) return false;

  const store = load();
  const current = reviewFor(reportId);
  if (!canTransition(current.status, next)) return false;

  const now = new Date().toISOString();
  store[reportId] = {
    ...current,
    status: next,
    checkedAt: next === 'checked' ? now : current.checkedAt,
    releasedAt: next === 'released' ? now : current.releasedAt,
  };

  recordChange({
    entity: 'report',
    entityId: reportId,
    entityLabel: getAdminReport(reportId)?.title ?? reportId,
    field: 'status',
    oldValue: current.status,
    newValue: next,
  });

  notify();
  return true;
}

/**
 * Applies an office amendment.
 *
 * Editing a released report is refused — a released report is final until it is
 * explicitly reopened.
 */
export function editReport(
  reportId: string,
  changes: { title?: string; officeNote?: string },
): boolean {
  if (!getAdminReport(reportId)) return false;

  const store = load();
  const current = reviewFor(reportId);
  if (current.status === 'released') return false;

  const before = getAdminReport(reportId);
  const label = before?.title ?? reportId;

  if (changes.title !== undefined) {
    recordChange({
      entity: 'report',
      entityId: reportId,
      entityLabel: label,
      field: 'title',
      oldValue: before?.title ?? '',
      newValue: changes.title.trim(),
    });
  }
  if (changes.officeNote !== undefined) {
    recordChange({
      entity: 'report',
      entityId: reportId,
      entityLabel: label,
      field: 'officeNote',
      oldValue: current.officeNote,
      newValue: changes.officeNote.trim(),
    });
  }

  store[reportId] = {
    ...current,
    editedTitle: changes.title !== undefined ? changes.title.trim() : current.editedTitle,
    officeNote:
      changes.officeNote !== undefined ? changes.officeNote.trim() : current.officeNote,
    status: 'edited',
    editedAt: new Date().toISOString(),
  };
  notify();
  return true;
}

/** Test/demo helper — clears all office review state. */
export function resetReportReviews(): void {
  reviews = {};
  notify();
}
