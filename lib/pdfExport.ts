import jsPDF from 'jspdf';

export interface AuditLogEntry {
  fileName: string;
  filePath: string;
  projectName: string;
  projectId: string;
  folderPath: string;
  customerNumber: string;
  customerEmail: string;
  customerId: string;
  readAt: string;
  isRead: boolean;
  uploadedAt?: string;
}

export type PdfLanguage = 'en' | 'de';

function getPdfLabels(lang: PdfLanguage) {
  if (lang === 'de') {
    return {
      title: 'Dokumentationslesen / Prüfprotokolle',
      generated: 'Erstellt',
      summary: 'Zusammenfassung',
      totalFiles: 'Dateien gesamt',
      read: 'Gelesen',
      unread: 'Ungelesen',
      fileName: 'Dateiname',
      project: 'Projekt',
      customer: 'Kunde',
      folder: 'Ordner',
      status: 'Status',
      readAt: 'Gelesen am',
      uploadedAt: 'Hochgeladen am',
      notRead: 'Nicht gelesen',
      page: 'Seite',
      of: 'von',
      only: 'Nur',
    };
  }
  return {
    title: 'File Read Audit Logs',
    generated: 'Generated',
    summary: 'Summary',
    totalFiles: 'Total Files',
    read: 'Read',
    unread: 'Unread',
    fileName: 'File Name',
    project: 'Project',
    customer: 'Customer',
    folder: 'Folder',
    status: 'Status',
    readAt: 'Read At',
    uploadedAt: 'Uploaded',
    notRead: 'Not read',
    page: 'Page',
    of: 'of',
    only: 'Only',
  };
}

/**
 * Export audit logs to PDF (saves file)
 */
export function exportAuditLogsToPDF(
  logs: AuditLogEntry[],
  title: string | undefined,
  language: PdfLanguage = 'de'
): void {
  const labels = getPdfLabels(language);
  const resolvedTitle = title || labels.title;
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const lineHeight = 7;
  let yPosition = margin;

  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Grün Power', pageWidth / 2, yPosition, { align: 'center' });
  yPosition += lineHeight;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text(resolvedTitle, pageWidth / 2, yPosition, { align: 'center' });
  yPosition += lineHeight;

  doc.setFontSize(10);
  doc.text(`${labels.generated}: ${new Date().toLocaleString('de-DE')}`, pageWidth / 2, yPosition, { align: 'center' });
  yPosition += lineHeight * 2;

  // Summary
  const readCount = logs.filter(log => log.isRead).length;
  const unreadCount = logs.filter(log => !log.isRead).length;
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(labels.summary, margin, yPosition);
  yPosition += lineHeight;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${labels.totalFiles}: ${logs.length}`, margin, yPosition);
  yPosition += lineHeight;
  doc.text(`${labels.read}: ${readCount}`, margin, yPosition);
  yPosition += lineHeight;
  doc.text(`${labels.unread}: ${unreadCount}`, margin, yPosition);
  yPosition += lineHeight * 2;

  // Table headers – fileName column wide so name stays in one row
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  const headers = [labels.fileName, labels.project, labels.customer, labels.folder, labels.status, labels.uploadedAt, labels.readAt];
  // File name one row; date columns wide; others slightly reduced to fit landscape
  const colWidths = [88, 20, 16, 18, 12, 38, 38];
  let xPosition = margin;

  headers.forEach((header, index) => {
    doc.text(header, xPosition, yPosition);
    xPosition += colWidths[index];
  });
  yPosition += lineHeight;

  // Draw line under headers
  doc.setLineWidth(0.5);
  doc.line(margin, yPosition - 2, pageWidth - margin, yPosition - 2);
  yPosition += 2;

  // Table rows – file name in one row only (truncate with ellipsis if needed)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);

  const maxFileNameWidth = colWidths[0] - 1;
  function oneLineFileName(name: string): string {
    if (doc.getTextWidth(name) <= maxFileNameWidth) return name;
    let s = name;
    while (s.length > 0 && doc.getTextWidth(s + '…') > maxFileNameWidth) s = s.slice(0, -1);
    return s.length < name.length ? s + '…' : name;
  }

  logs.forEach((log) => {
    if (yPosition > pageHeight - margin - lineHeight * 4) {
      doc.addPage();
      yPosition = margin;
    }

    const rowYStart = yPosition;
    xPosition = margin;

    const fileNameOneLine = oneLineFileName(log.fileName);
    doc.text(fileNameOneLine, xPosition, rowYStart);
    xPosition += colWidths[0];

    const projectName = log.projectName.length > 12 ? log.projectName.substring(0, 9) + '…' : log.projectName;
    doc.text(projectName, xPosition, rowYStart);
    xPosition += colWidths[1];

    const customer = log.customerNumber
      ? log.customerNumber.charAt(0).toUpperCase() + log.customerNumber.slice(1)
      : 'N/A';
    doc.text(customer.length > 10 ? customer.substring(0, 8) + '…' : customer, xPosition, rowYStart);
    xPosition += colWidths[2];

    const folderName = log.folderPath.split('/').pop() || log.folderPath;
    const folderDisplay = folderName.length > 12 ? folderName.substring(0, 9) + '…' : folderName;
    doc.text(folderDisplay, xPosition, rowYStart);
    xPosition += colWidths[3];

    doc.setFont('helvetica', 'bold');
    doc.text(log.isRead ? labels.read : labels.unread, xPosition, rowYStart);
    doc.setFont('helvetica', 'normal');
    xPosition += colWidths[4];

    const uploadedAt = log.uploadedAt || '—';
    doc.text(uploadedAt, xPosition, rowYStart);
    xPosition += colWidths[5];

    const readAt = log.isRead ? log.readAt : labels.notRead;
    doc.text(readAt, xPosition, rowYStart);

    yPosition += lineHeight;
  });

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `${labels.page} ${i} ${labels.of} ${totalPages}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
  }

  const fileName = `audit-logs-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

/**
 * Export audit logs to PDF and return as Blob (for preview in new tab)
 */
export function exportAuditLogsToPDFBlob(
  logs: AuditLogEntry[],
  title: string,
  language: PdfLanguage = 'de'
): Blob {
  const labels = getPdfLabels(language);
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const lineHeight = 7;
  let yPosition = margin;

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Grün Power', pageWidth / 2, yPosition, { align: 'center' });
  yPosition += lineHeight;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text(title, pageWidth / 2, yPosition, { align: 'center' });
  yPosition += lineHeight;

  doc.setFontSize(10);
  doc.text(`${labels.generated}: ${new Date().toLocaleString('de-DE')}`, pageWidth / 2, yPosition, { align: 'center' });
  yPosition += lineHeight * 2;

  const readCount = logs.filter(log => log.isRead).length;
  const unreadCount = logs.filter(log => !log.isRead).length;
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(labels.summary, margin, yPosition);
  yPosition += lineHeight;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${labels.totalFiles}: ${logs.length}`, margin, yPosition);
  yPosition += lineHeight;
  doc.text(`${labels.read}: ${readCount}`, margin, yPosition);
  yPosition += lineHeight;
  doc.text(`${labels.unread}: ${unreadCount}`, margin, yPosition);
  yPosition += lineHeight * 2;

  const headers = [labels.fileName, labels.project, labels.customer, labels.folder, labels.status, labels.uploadedAt, labels.readAt];
  // File name one row; match column widths with main export
  const colWidths = [88, 20, 16, 18, 12, 38, 38];
  let xPosition = margin;

  headers.forEach((header, index) => {
    doc.text(header, xPosition, yPosition);
    xPosition += colWidths[index];
  });
  yPosition += lineHeight;

  doc.setLineWidth(0.5);
  doc.line(margin, yPosition - 2, pageWidth - margin, yPosition - 2);
  yPosition += 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);

  const maxFileNameWidthBlob = colWidths[0] - 1;
  function oneLineFileNameBlob(name: string): string {
    if (doc.getTextWidth(name) <= maxFileNameWidthBlob) return name;
    let s = name;
    while (s.length > 0 && doc.getTextWidth(s + '…') > maxFileNameWidthBlob) s = s.slice(0, -1);
    return s.length < name.length ? s + '…' : name;
  }

  logs.forEach((log) => {
    if (yPosition > pageHeight - margin - lineHeight * 4) {
      doc.addPage();
      yPosition = margin;
    }

    const rowYStart = yPosition;
    xPosition = margin;

    const fileNameOneLine = oneLineFileNameBlob(log.fileName);
    doc.text(fileNameOneLine, xPosition, rowYStart);
    xPosition += colWidths[0];

    const projectName = log.projectName.length > 12 ? log.projectName.substring(0, 9) + '…' : log.projectName;
    doc.text(projectName, xPosition, rowYStart);
    xPosition += colWidths[1];

    const customer = log.customerNumber
      ? log.customerNumber.charAt(0).toUpperCase() + log.customerNumber.slice(1)
      : 'N/A';
    doc.text(customer.length > 10 ? customer.substring(0, 8) + '…' : customer, xPosition, rowYStart);
    xPosition += colWidths[2];

    const folderName = log.folderPath.split('/').pop() || log.folderPath;
    const folderDisplay = folderName.length > 12 ? folderName.substring(0, 9) + '…' : folderName;
    doc.text(folderDisplay, xPosition, rowYStart);
    xPosition += colWidths[3];

    doc.setFont('helvetica', 'bold');
    doc.text(log.isRead ? labels.read : labels.unread, xPosition, rowYStart);
    doc.setFont('helvetica', 'normal');
    xPosition += colWidths[4];

    const uploadedAt = log.uploadedAt || '—';
    doc.text(uploadedAt, xPosition, rowYStart);
    xPosition += colWidths[5];

    const readAt = log.isRead ? log.readAt : labels.notRead;
    doc.text(readAt, xPosition, rowYStart);

    yPosition += lineHeight;
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `${labels.page} ${i} ${labels.of} ${totalPages}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
  }

  return doc.output('blob') as Blob;
}

function buildFilteredTitle(
  filterProject: string,
  filterStatus: string,
  projects: Array<{ id: string; name: string }>,
  language: PdfLanguage
): string {
  const labels = getPdfLabels(language);
  let title = labels.title;
  
  if (filterProject !== 'all') {
    const project = projects.find(p => p.id === filterProject);
    title += ` - ${project?.name || labels.project}`;
  }
  
  if (filterStatus !== 'all') {
    title += ` (${labels.only} ${filterStatus === 'read' ? labels.read : labels.unread})`;
  }

  return title;
}

/**
 * Export filtered audit logs to PDF (saves file)
 */
export function exportFilteredLogsToPDF(
  logs: AuditLogEntry[],
  filterProject: string,
  filterStatus: string,
  projects: Array<{ id: string; name: string }>,
  language: PdfLanguage = 'de'
): void {
  const title = buildFilteredTitle(filterProject, filterStatus, projects, language);
  exportAuditLogsToPDF(logs, title, language);
}

/**
 * Export filtered audit logs to PDF and return as Blob (for view in new tab)
 */
export function exportFilteredLogsToPDFBlob(
  logs: AuditLogEntry[],
  filterProject: string,
  filterStatus: string,
  projects: Array<{ id: string; name: string }>,
  language: PdfLanguage = 'de'
): Blob {
  const title = buildFilteredTitle(filterProject, filterStatus, projects, language);
  return exportAuditLogsToPDFBlob(logs, title, language);
}

