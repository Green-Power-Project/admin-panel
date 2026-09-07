/**
 * Entities whose changes are logged (requirement 68).
 *
 * The list follows the requirement: working hours, report hours, material,
 * delivery notes, measurements and reports — plus the admin catalogues whose
 * edits change what the app offers.
 */
export const CHANGE_LOG_ENTITIES = [
  'workingHours',
  'reportHours',
  'material',
  'deliveryNote',
  'measurement',
  'report',
  'materialOrder',
  'task',
  'lvPosition',
  'machine',
  'employee',
] as const;

export type ChangeLogEntity = (typeof CHANGE_LOG_ENTITIES)[number];

/** One recorded change: what changed, from what, to what, by whom, when. */
export interface ChangeLogEntry {
  id: string;
  entity: ChangeLogEntity;
  entityId: string;
  /** Human-readable subject, e.g. the report title. */
  entityLabel: string;
  field: string;
  oldValue: string;
  newValue: string;
  user: string;
  /** ISO timestamp; the UI splits it into date and time. */
  at: string;
}

export interface ChangeLogFilter {
  entity: 'all' | ChangeLogEntity;
  user: string;
  from: string;
  to: string;
}

export const EMPTY_CHANGE_LOG_FILTER: ChangeLogFilter = {
  entity: 'all',
  user: '',
  from: '',
  to: '',
};

export function filterChangeLog(
  entries: ChangeLogEntry[],
  filter: ChangeLogFilter,
): ChangeLogEntry[] {
  return entries.filter((entry) => {
    if (filter.entity !== 'all' && entry.entity !== filter.entity) return false;
    if (filter.user && entry.user !== filter.user) return false;
    const day = entry.at.slice(0, 10);
    if (filter.from && day < filter.from) return false;
    if (filter.to && day > filter.to) return false;
    return true;
  });
}

export function changeLogToCsv(
  entries: ChangeLogEntry[],
  headers: string[],
): string {
  const escape = (value: string) =>
    /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

  const lines = [headers.map(escape).join(';')];
  for (const entry of entries) {
    lines.push(
      [
        entry.at.slice(0, 10),
        entry.at.slice(11, 16),
        entry.entity,
        entry.entityLabel,
        entry.field,
        entry.oldValue,
        entry.newValue,
        entry.user,
      ]
        .map(escape)
        .join(';'),
    );
  }
  return lines.join('\n');
}
