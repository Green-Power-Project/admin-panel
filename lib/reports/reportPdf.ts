import jsPDF from 'jspdf';

import {
  reportLvPositions,
  totalReportHours,
  type AdminReport,
} from './types';

export interface ReportPdfLabels {
  documentTitle: string;
  project: string;
  employee: string;
  date: string;
  status: string;
  hoursSection: string;
  machinesSection: string;
  materialsSection: string;
  deliveryNotesSection: string;
  documentationSection: string;
  lvSection: string;
  officeNote: string;
  total: string;
  none: string;
  draftWatermark: string;
}

const MARGIN = 14;
const LINE = 5.5;

/**
 * Renders a report to PDF from the already-linked data (requirement 61).
 *
 * Nothing is re-entered here: hours, machines, materials, delivery notes and
 * documentation all come from the same records the employee created, and the
 * BOQ positions come with the hours.
 */
export function buildReportPdf(
  report: AdminReport,
  labels: ReportPdfLabels,
): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = MARGIN;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const heading = (text: string) => {
    ensureSpace(LINE * 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(31, 61, 50);
    doc.text(text, MARGIN, y);
    y += LINE;
    doc.setDrawColor(210);
    doc.line(MARGIN, y - 3.5, pageWidth - MARGIN, y - 3.5);
    doc.setTextColor(30);
  };

  const line = (text: string, indent = 0) => {
    ensureSpace(LINE);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const wrapped = doc.splitTextToSize(text, pageWidth - MARGIN * 2 - indent);
    for (const part of wrapped as string[]) {
      ensureSpace(LINE);
      doc.text(part, MARGIN + indent, y);
      y += LINE;
    }
  };

  // Title block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(report.title || labels.documentTitle, MARGIN, y);
  y += LINE * 1.6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(
    `${labels.date}: ${report.date}   |   ${labels.project}: ${report.projectName}`,
    MARGIN,
    y,
  );
  y += LINE;
  doc.text(
    `${labels.employee}: ${report.employeeName}   |   ${labels.status}: ${report.status}`,
    MARGIN,
    y,
  );
  y += LINE * 1.4;
  doc.setTextColor(30);

  // A report that is not released is clearly marked as a draft.
  if (report.status !== 'released') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(180, 90, 20);
    doc.text(labels.draftWatermark, MARGIN, y);
    y += LINE * 1.3;
    doc.setTextColor(30);
  }

  // Report hours
  heading(labels.hoursSection);
  if (report.reportHours.length === 0) {
    line(labels.none);
  } else {
    for (const entry of report.reportHours) {
      const clock =
        entry.startTime && entry.endTime
          ? ` (${entry.startTime}–${entry.endTime})`
          : '';
      line(`${entry.date}${clock} — ${entry.hours} h   ${entry.note}`.trim());
    }
    doc.setFont('helvetica', 'bold');
    line(`${labels.total}: ${totalReportHours(report)} h`);
  }
  y += 2;

  // BOQ positions carried by those hours
  const lvPositions = reportLvPositions(report);
  if (lvPositions.length > 0) {
    heading(labels.lvSection);
    for (const position of lvPositions) line(`• ${position}`);
    y += 2;
  }

  heading(labels.machinesSection);
  if (report.machines.length === 0) line(labels.none);
  else {
    for (const machine of report.machines) {
      line(`${machine.date} — ${machine.machine}: ${machine.hours} h`);
    }
  }
  y += 2;

  heading(labels.materialsSection);
  if (report.materials.length === 0) line(labels.none);
  else {
    for (const material of report.materials) {
      line(
        `${material.material}: ${material.installed} ${material.unit} ` +
          `(${material.delivered} ${material.unit})`,
      );
    }
  }
  y += 2;

  heading(labels.deliveryNotesSection);
  if (report.deliveryNotes.length === 0) line(labels.none);
  else {
    for (const note of report.deliveryNotes) {
      line(
        `${note.date} — ${note.number} · ${note.supplier} · ${note.lineCount}`,
      );
    }
  }
  y += 2;

  heading(labels.documentationSection);
  if (report.documentation.length === 0) line(labels.none);
  else {
    for (const item of report.documentation) {
      line(`${item.date} — ${item.title} (${item.photoCount})`);
    }
  }

  if (report.officeNote) {
    y += 2;
    heading(labels.officeNote);
    line(report.officeNote);
  }

  return doc;
}

export function reportPdfFileName(report: AdminReport): string {
  const safe = (report.title || 'report')
    .replace(/[^\p{L}\p{N}\-_ ]/gu, '')
    .trim()
    .replace(/\s+/g, '_');
  return `${report.date}_${safe || 'report'}.pdf`;
}
