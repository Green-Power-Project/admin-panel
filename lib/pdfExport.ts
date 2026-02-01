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
  };
}

/**
 * Export audit logs to PDF (saves file)
 */
export function exportAuditLogsToPDF(
  logs: AuditLogEntry[],
  title: string = 'File Read Audit Logs',
  language: PdfLanguage = 'en'
): void {
  const labels = getPdfLabels(language);
  const doc = new jsPDF();
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
  doc.text(title, pageWidth / 2, yPosition, { align: 'center' });
  yPosition += lineHeight;

  doc.setFontSize(10);
  doc.text(`${labels.generated}: ${new Date().toLocaleString()}`, pageWidth / 2, yPosition, { align: 'center' });
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

  // Table headers (with Uploaded column)
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  const headers = [labels.fileName, labels.project, labels.customer, labels.folder, labels.status, labels.uploadedAt, labels.readAt];
  const colWidths = [32, 28, 24, 24, 16, 26, 26];
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

  // Table rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);

  logs.forEach((log) => {
    if (yPosition > pageHeight - margin - lineHeight * 3) {
      doc.addPage();
      yPosition = margin;
    }

    xPosition = margin;

    const fileName = log.fileName.length > 18 ? log.fileName.substring(0, 15) + '...' : log.fileName;
    doc.text(fileName, xPosition, yPosition);
    xPosition += colWidths[0];

    const projectName = log.projectName.length > 14 ? log.projectName.substring(0, 11) + '...' : log.projectName;
    doc.text(projectName, xPosition, yPosition);
    xPosition += colWidths[1];

    const customer = log.customerNumber 
      ? log.customerNumber.charAt(0).toUpperCase() + log.customerNumber.slice(1)
      : 'N/A';
    doc.text(customer.length > 12 ? customer.substring(0, 9) + '...' : customer, xPosition, yPosition);
    xPosition += colWidths[2];

    const folderName = log.folderPath.split('/').pop() || log.folderPath;
    const folderDisplay = folderName.length > 14 ? folderName.substring(0, 11) + '...' : folderName;
    doc.text(folderDisplay, xPosition, yPosition);
    xPosition += colWidths[3];

    doc.setFont('helvetica', 'bold');
    doc.text(log.isRead ? labels.read : labels.unread, xPosition, yPosition);
    doc.setFont('helvetica', 'normal');
    xPosition += colWidths[4];

    const uploadedAt = log.uploadedAt || '—';
    doc.text(uploadedAt.length > 18 ? uploadedAt.substring(0, 15) + '...' : uploadedAt, xPosition, yPosition);
    xPosition += colWidths[5];

    const readAt = log.isRead ? log.readAt : labels.notRead;
    doc.text(readAt.length > 18 ? readAt.substring(0, 15) + '...' : readAt, xPosition, yPosition);

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
  language: PdfLanguage = 'en'
): Blob {
  const labels = getPdfLabels(language);
  const doc = new jsPDF();
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
  doc.text(`${labels.generated}: ${new Date().toLocaleString()}`, pageWidth / 2, yPosition, { align: 'center' });
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
  const colWidths = [32, 28, 24, 24, 16, 26, 26];
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

  logs.forEach((log) => {
    if (yPosition > pageHeight - margin - lineHeight * 3) {
      doc.addPage();
      yPosition = margin;
    }

    xPosition = margin;

    const fileName = log.fileName.length > 18 ? log.fileName.substring(0, 15) + '...' : log.fileName;
    doc.text(fileName, xPosition, yPosition);
    xPosition += colWidths[0];

    const projectName = log.projectName.length > 14 ? log.projectName.substring(0, 11) + '...' : log.projectName;
    doc.text(projectName, xPosition, yPosition);
    xPosition += colWidths[1];

    const customer = log.customerNumber 
      ? log.customerNumber.charAt(0).toUpperCase() + log.customerNumber.slice(1)
      : 'N/A';
    doc.text(customer.length > 12 ? customer.substring(0, 9) + '...' : customer, xPosition, yPosition);
    xPosition += colWidths[2];

    const folderName = log.folderPath.split('/').pop() || log.folderPath;
    const folderDisplay = folderName.length > 14 ? folderName.substring(0, 11) + '...' : folderName;
    doc.text(folderDisplay, xPosition, yPosition);
    xPosition += colWidths[3];

    doc.setFont('helvetica', 'bold');
    doc.text(log.isRead ? labels.read : labels.unread, xPosition, yPosition);
    doc.setFont('helvetica', 'normal');
    xPosition += colWidths[4];

    const uploadedAt = log.uploadedAt || '—';
    doc.text(uploadedAt.length > 18 ? uploadedAt.substring(0, 15) + '...' : uploadedAt, xPosition, yPosition);
    xPosition += colWidths[5];

    const readAt = log.isRead ? log.readAt : labels.notRead;
    doc.text(readAt.length > 18 ? readAt.substring(0, 15) + '...' : readAt, xPosition, yPosition);

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
    title += ` (${filterStatus === 'read' ? labels.read : labels.unread} Only)`;
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
  language: PdfLanguage = 'en'
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
  language: PdfLanguage = 'en'
): Blob {
  const title = buildFilteredTitle(filterProject, filterStatus, projects, language);
  return exportAuditLogsToPDFBlob(logs, title, language);
}

