/** One bill-of-quantities position stored against a project (requirement 59). */
export interface LvPositionRecord {
  id: string;
  projectId: string;
  /** e.g. "01.02" */
  code: string;
  title: string;
  description: string;
  unit: string;
  /**
   * Unit price. Employees never see this — the app only receives position,
   * description and unit unless the admin authorises prices.
   */
  unitPrice: number | null;
  isActive: boolean;
}

export interface LvImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface LvSnapshot {
  /** Positions keyed by project id. */
  positionsByProject: Record<string, LvPositionRecord[]>;
  /** Last imported file name per project, for traceability. */
  sourceFileByProject: Record<string, string>;
}

export const LV_UNITS = ['m', 'm²', 'm³', 'lfdm', 'St', 'to', 'h', 'psch'] as const;

/**
 * Parses a semicolon or comma separated LV export.
 *
 * Columns: code; title; unit; description?; unitPrice?
 *
 * True GAEB (D81/X81) is a binary/XML interchange format that needs a server
 * side parser — this frontend phase accepts the CSV export every GAEB tool can
 * produce, and records the file name so the origin stays traceable.
 */
export function parseLvCsv(
  content: string,
  projectId: string,
): { positions: Omit<LvPositionRecord, 'id'>[]; result: LvImportResult } {
  const positions: Omit<LvPositionRecord, 'id'>[] = [];
  const errors: string[] = [];
  let skipped = 0;

  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i].trim();
    if (!raw) continue;

    // Semicolon wins when present: German GAEB exports use ";" as the
    // delimiter and "," as the decimal separator, so splitting on both would
    // tear "3,20" into two cells.
    const delimiter = raw.includes(';') ? ';' : raw.includes('\t') ? '\t' : ',';
    const cells = raw.split(delimiter).map((c) => c.trim());
    // Skip a header row.
    if (i === 0 && /^(code|pos|position|nr)$/i.test(cells[0] ?? '')) continue;

    const [code, title, unit, description, price] = cells;
    if (!code || !title) {
      skipped += 1;
      errors.push(`Line ${i + 1}: code and description are required.`);
      continue;
    }

    const parsedPrice = price ? Number(price.replace(',', '.')) : NaN;

    positions.push({
      projectId,
      code,
      title,
      description: description ?? '',
      unit: unit ?? '',
      unitPrice: Number.isFinite(parsedPrice) ? parsedPrice : null,
      isActive: true,
    });
  }

  return {
    positions,
    result: { imported: positions.length, skipped, errors },
  };
}
