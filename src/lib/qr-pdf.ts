import { jsPDF } from "jspdf";

export interface QrPrintItem {
  label: string;
  url: string;
  topText?: string | null;
  bottomText?: string | null;
  fontSize?: number | null;
  language?: string | null; // 'ar' | 'en'
}

export type PerPage = 1 | 2 | 4;

/**
 * Render a QR code data URL using a temporary canvas.
 * Uses the qrcode.react canvas through a hidden DOM element is heavy;
 * instead we draw via a lightweight approach: leverage the existing
 * canvases passed in. To keep this pure, callers supply ready-made
 * data URLs via getQrDataUrl helper using qrcode.react's QRCodeCanvas.
 */
export async function generateQrPdf(
  items: QrPrintItem[],
  perPage: PerPage,
  qrDataUrls: string[],
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Grid layout per page
  const layouts: Record<PerPage, { cols: number; rows: number }> = {
    1: { cols: 1, rows: 1 },
    2: { cols: 1, rows: 2 },
    4: { cols: 2, rows: 2 },
  };
  const { cols, rows } = layouts[perPage];
  const cellW = pageW / cols;
  const cellH = pageH / rows;

  for (let i = 0; i < items.length; i++) {
    const slot = i % perPage;
    if (i > 0 && slot === 0) doc.addPage();

    const col = slot % cols;
    const row = Math.floor(slot / cols);
    const x = col * cellW;
    const y = row * cellH;

    const item = items[i];
    const dataUrl = qrDataUrls[i];
    const fontSize = item.fontSize ?? 14;
    const padding = 8;

    // Top text
    let cursorY = y + padding + fontSize * 0.4;
    if (item.topText) {
      doc.setFontSize(fontSize);
      doc.text(item.topText, x + cellW / 2, cursorY, { align: "center" });
      cursorY += fontSize * 0.5;
    }

    // Label (always show)
    doc.setFontSize(fontSize + 2);
    doc.setFont("helvetica", "bold");
    cursorY += 4;
    doc.text(item.label, x + cellW / 2, cursorY, { align: "center" });
    doc.setFont("helvetica", "normal");

    // QR image — sized to fit cell with margins
    const reservedTop = cursorY - y + 4;
    const reservedBottom = item.bottomText ? fontSize + 8 : 6;
    const available = cellH - reservedTop - reservedBottom;
    const qrSize = Math.max(30, Math.min(cellW - padding * 2, available));
    const qrX = x + (cellW - qrSize) / 2;
    const qrY = y + reservedTop;
    doc.addImage(dataUrl, "PNG", qrX, qrY, qrSize, qrSize);

    // Bottom text
    if (item.bottomText) {
      doc.setFontSize(fontSize);
      doc.text(item.bottomText, x + cellW / 2, qrY + qrSize + fontSize * 0.6 + 2, {
        align: "center",
      });
    }

    // Cell border (light)
    doc.setDrawColor(220);
    doc.rect(x + 2, y + 2, cellW - 4, cellH - 4);
  }

  return doc;
}
