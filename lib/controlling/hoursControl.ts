import type { EmployeeRecord, EmployeeTimeEntry } from '@/lib/employees/types';

export type HoursCategoryFilter = 'all' | 'working' | 'report';

export interface HoursFilter {
  employeeIds: string[];
  projectName: string;
  from: string;
  to: string;
  category: HoursCategoryFilter;
}

export const EMPTY_HOURS_FILTER: HoursFilter = {
  employeeIds: [],
  projectName: '',
  from: '',
  to: '',
  category: 'all',
};

/** One row of the admin hours control table (requirement 60). */
export interface HoursControlRow {
  id: string;
  date: string;
  employeeId: string;
  employeeName: string;
  projectName: string;
  entryType: 'working' | 'report';
  startTime: string;
  endTime: string;
  breakHours: number | null;
  netHours: number;
  targetHours: number;
  differenceHours: number;
  lvPosition: string;
}

/**
 * Applies the admin filters (requirement 66).
 *
 * An empty employee list means "all"; empty date bounds are open ended.
 */
export function filterTimeEntries(
  entries: EmployeeTimeEntry[],
  filter: HoursFilter,
): EmployeeTimeEntry[] {
  return entries.filter((entry) => {
    if (
      filter.employeeIds.length > 0 &&
      !filter.employeeIds.includes(entry.employeeId)
    ) {
      return false;
    }
    if (
      filter.projectName &&
      entry.projectName.toLowerCase() !== filter.projectName.toLowerCase()
    ) {
      return false;
    }
    if (filter.from && entry.date < filter.from) return false;
    if (filter.to && entry.date > filter.to) return false;
    if (filter.category !== 'all' && entry.entryType !== filter.category) {
      return false;
    }
    return true;
  });
}

/**
 * Builds the control rows.
 *
 * Target hours come from the employee's working-time model; report hours carry
 * no target because they are additional to the personal working time
 * (requirement 11), so their difference is always the report time itself.
 */
export function buildHoursRows(
  entries: EmployeeTimeEntry[],
  employees: EmployeeRecord[],
): HoursControlRow[] {
  const byId = new Map(employees.map((e) => [e.id, e]));

  return [...entries]
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))
    .map((entry) => {
      const employee = byId.get(entry.employeeId);
      const name = employee
        ? `${employee.firstName} ${employee.lastName}`.trim()
        : entry.employeeId;
      const target =
        entry.entryType === 'working'
          ? employee?.workingTime?.targetHoursPerDay ?? 0
          : 0;

      return {
        id: entry.id,
        date: entry.date,
        employeeId: entry.employeeId,
        employeeName: name,
        projectName: entry.projectName,
        entryType: entry.entryType,
        startTime: entry.startTime ?? '',
        endTime: entry.endTime ?? '',
        breakHours: entry.breakHours ?? null,
        netHours: entry.hours,
        targetHours: target,
        differenceHours: round2(entry.hours - target),
        lvPosition: entry.lvPosition ?? '',
      };
    });
}

export interface HoursTotals {
  net: number;
  target: number;
  difference: number;
  working: number;
  report: number;
}

export function sumHours(rows: HoursControlRow[]): HoursTotals {
  const totals = rows.reduce(
    (acc, row) => {
      acc.net += row.netHours;
      acc.target += row.targetHours;
      if (row.entryType === 'working') acc.working += row.netHours;
      else acc.report += row.netHours;
      return acc;
    },
    { net: 0, target: 0, difference: 0, working: 0, report: 0 },
  );

  return {
    net: round2(totals.net),
    target: round2(totals.target),
    difference: round2(totals.net - totals.target),
    working: round2(totals.working),
    report: round2(totals.report),
  };
}

/** Hours booked per BOQ position, split by employee (requirements 9, 10). */
export interface LvEvaluationRow {
  lvPosition: string;
  totalHours: number;
  byEmployee: Array<{
    employeeId: string;
    employeeName: string;
    hours: number;
    /** Share of this position's hours, 0-100 (requirement 9). */
    percentage: number;
  }>;
}

export function buildLvEvaluation(rows: HoursControlRow[]): LvEvaluationRow[] {
  const byPosition = new Map<string, Map<string, { name: string; hours: number }>>();

  for (const row of rows) {
    if (!row.lvPosition) continue;
    const employees =
      byPosition.get(row.lvPosition) ??
      new Map<string, { name: string; hours: number }>();
    const current = employees.get(row.employeeId) ?? {
      name: row.employeeName,
      hours: 0,
    };
    current.hours += row.netHours;
    employees.set(row.employeeId, current);
    byPosition.set(row.lvPosition, employees);
  }

  return Array.from(byPosition.entries())
    .map(([lvPosition, employees]) => {
      const entries = Array.from(employees.entries());
      const total = entries.reduce((sum, [, v]) => sum + v.hours, 0);

      return {
        lvPosition,
        totalHours: round2(total),
        byEmployee: entries
          .map(([employeeId, v]) => ({
            employeeId,
            employeeName: v.name,
            hours: round2(v.hours),
            percentage: total > 0 ? Math.round((v.hours / total) * 100) : 0,
          }))
          .sort((a, b) => b.hours - a.hours),
      };
    })
    .sort((a, b) => a.lvPosition.localeCompare(b.lvPosition));
}

/** CSV for Excel (requirement 67). Semicolon delimited for German Excel. */
export function hoursRowsToCsv(
  rows: HoursControlRow[],
  headers: string[],
): string {
  const escape = (value: string) =>
    /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

  const lines = [headers.map(escape).join(';')];
  for (const row of rows) {
    lines.push(
      [
        row.date,
        row.employeeName,
        row.projectName,
        row.entryType,
        row.startTime,
        row.endTime,
        row.breakHours === null ? '' : String(row.breakHours),
        String(row.netHours),
        String(row.targetHours),
        String(row.differenceHours),
        row.lvPosition,
      ]
        .map(escape)
        .join(';'),
    );
  }
  return lines.join('\n');
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/* ---------- reports and delivery notes overview (reqs 61, 62) ---------- */

/** Shared shape for the simple admin overview tables. */
export interface OverviewRow {
  id: string;
  date: string;
  employeeName: string;
  projectName: string;
  primary: string;
  secondary: string;
  status: string;
}

interface DatedEmployeeRecordLike {
  id: string;
  employeeId: string;
  date: string;
  projectName: string;
  status: string;
}

/** Applies the employee / project / period filters to any dated record. */
export function filterDatedRecords<T extends DatedEmployeeRecordLike>(
  records: T[],
  filter: HoursFilter,
): T[] {
  return records.filter((record) => {
    if (
      filter.employeeIds.length > 0 &&
      !filter.employeeIds.includes(record.employeeId)
    ) {
      return false;
    }
    if (
      filter.projectName &&
      record.projectName.toLowerCase() !== filter.projectName.toLowerCase()
    ) {
      return false;
    }
    if (filter.from && record.date < filter.from) return false;
    if (filter.to && record.date > filter.to) return false;
    return true;
  });
}

export function employeeNameOf(
  employeeId: string,
  employees: EmployeeRecord[],
): string {
  const match = employees.find((e) => e.id === employeeId);
  return match ? `${match.firstName} ${match.lastName}`.trim() : employeeId;
}

export function overviewRowsToCsv(
  rows: OverviewRow[],
  headers: string[],
): string {
  const escape = (value: string) =>
    /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

  const lines = [headers.map(escape).join(';')];
  for (const row of rows) {
    lines.push(
      [row.date, row.employeeName, row.projectName, row.primary, row.secondary, row.status]
        .map(escape)
        .join(';'),
    );
  }
  return lines.join('\n');
}
