import { jsPDF } from 'jspdf';

/** German-only labels for the PDF */
const DE = {
  title: 'Angebotsanfrage',
  date: 'Datum',
  customer: 'Kunde',
  projectNote: 'Projektnotiz',
  projectPhotos: 'Projektfotos',
  requestedItems: 'Angefragte Positionen',
  item: 'Artikel',
  color: 'Farbe',
  dimension: 'Maße',
  qty: 'Menge',
  note: 'Notiz',
  itemPhoto: 'Artikelbild',
  viewItemPhoto: 'Artikelbild ansehen',
  customerPhotos: 'Kundenfotos',
  photo: 'Foto',
  noValue: '—',
} as const;

export interface OfferItemForPdf {
  itemName: string;
  color?: string;
  dimension?: string;
  quantityMeters?: string;
  quantityPieces?: string;
  note?: string;
  imageUrl?: string;
  photoUrls?: string[];
}

export interface OfferRequestForPdf {
  firstName: string;
  lastName: string;
  email: string;
  address: string;
  projectNote?: string;
  projectPhotoUrls?: string[];
  items: OfferItemForPdf[];
  createdAt: string | null;
}

// Landscape A4: 297mm x 210mm
const MARGIN = 14;
const PAGE_WIDTH = 297;
const PAGE_HEIGHT = 210;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LINE_HEIGHT = 4.5;
const CELL_PAD = 2;

/** Draw text with wrapping; no truncation. Returns the y position after the last line. */
function drawWrappedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number = LINE_HEIGHT
): number {
  if (!text || !String(text).trim()) {
    doc.text(DE.noValue, x, y);
    return y + lineHeight;
  }
  const lines = doc.splitTextToSize(String(text), maxWidth);
  lines.forEach((line: string) => {
    doc.text(line, x, y);
    y += lineHeight;
  });
  return y;
}

/** Draw a clickable link text at (x, y). Returns y + lineHeight. */
function drawLink(doc: jsPDF, label: string, x: number, y: number, url: string): number {
  doc.setTextColor(0, 0, 255);
  if (typeof (doc as any).textWithLink === 'function') {
    (doc as any).textWithLink(label, x, y, { url });
  } else {
    doc.text(label, x, y);
    const w = doc.getTextWidth(label);
    (doc as any).link(x, y, w, LINE_HEIGHT, { url });
  }
  doc.setTextColor(0, 0, 0);
  return y + LINE_HEIGHT;
}

/** Builds the PDF document (for reuse by blob or buffer export). */
function buildOfferPdfDoc(offer: OfferRequestForPdf): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  let y = MARGIN;

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(DE.title, MARGIN, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  if (offer.createdAt) {
    const dateStr = new Date(offer.createdAt).toLocaleString('de-DE');
    doc.text(`${DE.date}: ${dateStr}`, MARGIN, y);
    y += 6;
  }

  y += 2;
  doc.setDrawColor(200, 200, 200);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(DE.customer, MARGIN, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  y = drawWrappedText(doc, `${offer.firstName} ${offer.lastName}`, MARGIN, y, CONTENT_WIDTH) + 1;
  y = drawWrappedText(doc, offer.email, MARGIN, y, CONTENT_WIDTH) + 1;
  y = drawWrappedText(doc, offer.address || DE.noValue, MARGIN, y, CONTENT_WIDTH) + 6;

  if (offer.projectNote) {
    doc.setFont('helvetica', 'bold');
    doc.text(DE.projectNote, MARGIN, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    y = drawWrappedText(doc, offer.projectNote, MARGIN, y, CONTENT_WIDTH) + 4;
  }

  if (offer.projectPhotoUrls && offer.projectPhotoUrls.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.text(DE.projectPhotos, MARGIN, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    offer.projectPhotoUrls.forEach((url, i) => {
      if (y > PAGE_HEIGHT - 20) {
        doc.addPage('a4', 'l');
        y = MARGIN;
      }
      y = drawLink(doc, `${DE.photo} ${i + 1}`, MARGIN, y, url);
    });
    y += 4;
  }

  doc.setFont('helvetica', 'bold');
  doc.text(DE.requestedItems, MARGIN, y);
  y += 7;

  const fontSize = 9;
  doc.setFontSize(fontSize);
  const colCount = 7;
  const gap = 2;
  const totalGap = (colCount - 1) * gap;
  const colWidths: number[] = [
    (CONTENT_WIDTH - totalGap) * 0.22,  // Artikel
    (CONTENT_WIDTH - totalGap) * 0.10,  // Farbe
    (CONTENT_WIDTH - totalGap) * 0.14,  // Maße
    (CONTENT_WIDTH - totalGap) * 0.08,  // Menge
    (CONTENT_WIDTH - totalGap) * 0.18,  // Notiz
    (CONTENT_WIDTH - totalGap) * 0.12,  // Artikelbild
    (CONTENT_WIDTH - totalGap) * 0.16,  // Kundenfotos
  ];
  const headers = [DE.item, DE.color, DE.dimension, DE.qty, DE.note, DE.itemPhoto, DE.customerPhotos];

  const getCellWidth = (i: number) => colWidths[i] - CELL_PAD * 2;
  const rowHeights: number[] = [];

  offer.items.forEach((it) => {
    const qtyStr = [it.quantityMeters ? it.quantityMeters + ' m' : '', it.quantityPieces ? it.quantityPieces + ' Stk.' : ''].filter(Boolean).join(' ') || DE.noValue;
    const itemNameLines = doc.splitTextToSize(it.itemName || DE.noValue, getCellWidth(0));
    const colorLines = doc.splitTextToSize(it.color || DE.noValue, getCellWidth(1));
    const dimensionLines = doc.splitTextToSize(it.dimension || DE.noValue, getCellWidth(2));
    const qtyLines = doc.splitTextToSize(qtyStr, getCellWidth(3));
    const noteLines = doc.splitTextToSize(it.note || DE.noValue, getCellWidth(4));
    const itemPhotoLines = it.imageUrl ? 1 : 1;
    const customerPhotosCount = it.photoUrls?.length ?? 0;
    const customerPhotosLines = Math.max(1, customerPhotosCount);
    const rowH = Math.max(
      itemNameLines.length,
      colorLines.length,
      dimensionLines.length,
      qtyLines.length,
      noteLines.length,
      itemPhotoLines,
      customerPhotosLines
    ) * LINE_HEIGHT + CELL_PAD * 2;
    rowHeights.push(rowH);
  });

  const headerRowHeight = 7;
  let x = MARGIN;
  doc.setFont('helvetica', 'bold');
  headers.forEach((h, i) => {
    doc.text(h, x + CELL_PAD, y - 2);
    doc.rect(x, y - headerRowHeight + 2, colWidths[i] + gap, headerRowHeight);
    x += colWidths[i] + gap;
  });
  y += 2;
  doc.setFont('helvetica', 'normal');

  offer.items.forEach((it, rowIndex) => {
    if (y > PAGE_HEIGHT - 35) {
      doc.addPage('a4', 'l');
      y = MARGIN;
      x = MARGIN;
      headers.forEach((_, i) => {
        doc.rect(x, y - headerRowHeight + 2, colWidths[i] + gap, headerRowHeight);
        x += colWidths[i] + gap;
      });
      y += 2;
    }

    const rowH = rowHeights[rowIndex];
    const rowYStart = y;
    const qtyStr = [it.quantityMeters ? it.quantityMeters + ' m' : '', it.quantityPieces ? it.quantityPieces + ' Stk.' : ''].filter(Boolean).join(' ') || DE.noValue;

    const cellContents: { lines: string[]; width: number }[] = [
      { lines: doc.splitTextToSize(it.itemName || DE.noValue, getCellWidth(0)), width: colWidths[0] },
      { lines: doc.splitTextToSize(it.color || DE.noValue, getCellWidth(1)), width: colWidths[1] },
      { lines: doc.splitTextToSize(it.dimension || DE.noValue, getCellWidth(2)), width: colWidths[2] },
      { lines: doc.splitTextToSize(qtyStr, getCellWidth(3)), width: colWidths[3] },
      { lines: doc.splitTextToSize(it.note || DE.noValue, getCellWidth(4)), width: colWidths[4] },
      { lines: [], width: colWidths[5] },
      { lines: [], width: colWidths[6] },
    ];

    let cellX = MARGIN;
    cellContents.forEach((cell, colIdx) => {
      doc.rect(cellX, rowYStart, cell.width + gap, rowH);
      cellX += cell.width + gap;
    });

    let cellY = rowYStart + CELL_PAD + 1;
    const maxLines = Math.max(...cellContents.slice(0, 5).map((c) => c.lines.length), 1);
    for (let lineIdx = 0; lineIdx < maxLines; lineIdx++) {
      cellX = MARGIN;
      cellContents.slice(0, 5).forEach((cell, colIdx) => {
        const line = cell.lines[lineIdx];
        if (line) doc.text(line, cellX + CELL_PAD, cellY);
        cellX += cell.width + gap;
      });
      cellY += LINE_HEIGHT;
    }

    cellX = MARGIN;
    for (let i = 0; i < 5; i++) cellX += colWidths[i] + gap;
    const col5X = cellX + CELL_PAD;
    const col6X = cellX + colWidths[5] + gap + CELL_PAD;

    if (it.imageUrl) {
      drawLink(doc, DE.viewItemPhoto, col5X, rowYStart + CELL_PAD + 1, it.imageUrl);
    } else {
      doc.text(DE.noValue, col5X, rowYStart + CELL_PAD + 1);
    }

    if (it.photoUrls && it.photoUrls.length > 0) {
      let linkY = rowYStart + CELL_PAD + 1;
      it.photoUrls.forEach((url, i) => {
        linkY = drawLink(doc, `${DE.photo} ${i + 1}`, col6X, linkY, url);
      });
    } else {
      doc.text(DE.noValue, col6X, rowYStart + CELL_PAD + 1);
    }

    y = rowYStart + rowH;
  });

  return doc;
}

/** Returns PDF as Blob (for browser download/view). */
export function generateOfferPdf(offer: OfferRequestForPdf): Blob {
  return buildOfferPdfDoc(offer).output('blob') as Blob;
}

/** Returns PDF as Buffer (for Node.js e.g. email attachment). */
export function generateOfferPdfBuffer(offer: OfferRequestForPdf): Buffer {
  const doc = buildOfferPdfDoc(offer);
  const arrayBuffer = doc.output('arraybuffer') as ArrayBuffer;
  return Buffer.from(arrayBuffer);
}
