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
}

/**
 * Export audit logs to PDF
 */
export function exportAuditLogsToPDF(logs: AuditLogEntry[], title: string = 'File Read Audit Logs'): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const lineHeight = 7;
  let yPosition = margin;

  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Green Power', pageWidth / 2, yPosition, { align: 'center' });
  yPosition += lineHeight;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text(title, pageWidth / 2, yPosition, { align: 'center' });
  yPosition += lineHeight;

  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, yPosition, { align: 'center' });
  yPosition += lineHeight * 2;

  // Summary
  const readCount = logs.filter(log => log.isRead).length;
  const unreadCount = logs.filter(log => !log.isRead).length;
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary', margin, yPosition);
  yPosition += lineHeight;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total Files: ${logs.length}`, margin, yPosition);
  yPosition += lineHeight;
  doc.text(`Read: ${readCount}`, margin, yPosition);
  yPosition += lineHeight;
  doc.text(`Unread: ${unreadCount}`, margin, yPosition);
  yPosition += lineHeight * 2;

  // Table headers
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  const headers = ['File Name', 'Project', 'Customer', 'Folder', 'Status', 'Read At'];
  const colWidths = [40, 35, 30, 30, 20, 30];
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
  doc.setFontSize(8);

  logs.forEach((log, index) => {
    // Check if we need a new page
    if (yPosition > pageHeight - margin - lineHeight * 3) {
      doc.addPage();
      yPosition = margin;
    }

    xPosition = margin;

    // File Name (truncate if too long)
    const fileName = log.fileName.length > 25 ? log.fileName.substring(0, 22) + '...' : log.fileName;
    doc.text(fileName, xPosition, yPosition);
    xPosition += colWidths[0];

    // Project (truncate if too long)
    const projectName = log.projectName.length > 20 ? log.projectName.substring(0, 17) + '...' : log.projectName;
    doc.text(projectName, xPosition, yPosition);
    xPosition += colWidths[1];

    // Customer
    const customer = log.customerNumber 
      ? log.customerNumber.charAt(0).toUpperCase() + log.customerNumber.slice(1)
      : 'N/A';
    doc.text(customer, xPosition, yPosition);
    xPosition += colWidths[2];

    // Folder (truncate if too long)
    const folderName = log.folderPath.split('/').pop() || log.folderPath;
    const folderDisplay = folderName.length > 20 ? folderName.substring(0, 17) + '...' : folderName;
    doc.text(folderDisplay, xPosition, yPosition);
    xPosition += colWidths[3];

    // Status
    doc.setFont('helvetica', 'bold');
    doc.text(log.isRead ? 'Read' : 'Unread', xPosition, yPosition);
    doc.setFont('helvetica', 'normal');
    xPosition += colWidths[4];

    // Read At
    const readAt = log.isRead ? log.readAt : 'Not read';
    doc.text(readAt, xPosition, yPosition);

    yPosition += lineHeight;
  });

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
  }

  // Save PDF
  const fileName = `audit-logs-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

/**
 * Export filtered audit logs to PDF
 */
export function exportFilteredLogsToPDF(
  logs: AuditLogEntry[],
  filterProject: string,
  filterStatus: string,
  projects: Array<{ id: string; name: string }>
): void {
  let title = 'File Read Audit Logs';
  
  if (filterProject !== 'all') {
    const project = projects.find(p => p.id === filterProject);
    title += ` - ${project?.name || 'Project'}`;
  }
  
  if (filterStatus !== 'all') {
    title += ` (${filterStatus === 'read' ? 'Read' : 'Unread'} Only)`;
  }

  exportAuditLogsToPDF(logs, title);
}

