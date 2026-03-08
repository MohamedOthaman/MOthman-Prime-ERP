import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

interface ExportColumn {
  header: string;
  key: string;
  width?: number;
}

interface ExportConfig {
  title: string;
  filename: string;
  sheetName: string;
  columns: ExportColumn[];
  rows: Record<string, any>[];
  subtitle?: string;
}

// ─── Excel Export (styled like PDF) ───
export async function exportExcel(config: ExportConfig) {
  const { columns, rows, filename, sheetName, title, subtitle } = config;
  if (rows.length === 0) { toast.info("No data to export"); return; }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Stock Manager";
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName);

  const colCount = columns.length;

  // ── Title row ──
  const titleRow = ws.addRow([title]);
  ws.mergeCells(1, 1, 1, colCount);
  titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: "FF292929" } };
  titleRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
  titleRow.height = 28;

  // ── Subtitle row ──
  let currentRow = 2;
  if (subtitle) {
    const subRow = ws.addRow([subtitle]);
    ws.mergeCells(currentRow, 1, currentRow, colCount);
    subRow.getCell(1).font = { size: 10, italic: true, color: { argb: "FF666666" } };
    subRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
    currentRow++;
  }

  // ── Date row ──
  const dateStr = `Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
  const dateRow = ws.addRow([dateStr]);
  ws.mergeCells(currentRow, 1, currentRow, colCount);
  dateRow.getCell(1).font = { size: 8, color: { argb: "FF828282" } };
  currentRow++;

  // ── Empty spacer row ──
  ws.addRow([]);
  currentRow++;

  // ── Header row (dark background like PDF) ──
  const headerValues = columns.map(c => c.header);
  const headerRow = ws.addRow(headerValues);
  headerRow.height = 24;
  headerRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF292929" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: "FFC8C8C8" } },
      bottom: { style: "thin", color: { argb: "FFC8C8C8" } },
      left: { style: "thin", color: { argb: "FFC8C8C8" } },
      right: { style: "thin", color: { argb: "FFC8C8C8" } },
    };
  });
  currentRow++;

  // ── Data rows with alternating colors ──
  rows.forEach((row, idx) => {
    const values = columns.map(c => row[c.key] ?? "");
    const dataRow = ws.addRow(values);
    dataRow.height = 20;
    const isAlt = idx % 2 === 1;
    dataRow.eachCell((cell, colNumber) => {
      cell.font = { size: 9, color: { argb: "FF333333" } };
      if (isAlt) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
      }
      cell.border = {
        top: { style: "thin", color: { argb: "FFE0E0E0" } },
        bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
        left: { style: "thin", color: { argb: "FFE0E0E0" } },
        right: { style: "thin", color: { argb: "FFE0E0E0" } },
      };
      // Center qty/days columns
      const colKey = columns[colNumber - 1]?.key;
      if (colKey === "qty" || colKey === "Qty" || colKey === "daysLeft") {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else {
        cell.alignment = { vertical: "middle" };
      }
    });
  });

  // ── Column widths ──
  columns.forEach((col, i) => {
    ws.getColumn(i + 1).width = col.width || 14;
  });

  // ── Save ──
  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${filename}_${new Date().toISOString().split("T")[0]}.xlsx`);
  toast.success("Excel exported ✔");
}

// ─── PDF Export ───
export function exportPDF(config: ExportConfig) {
  const { columns, rows, title, filename, subtitle } = config;
  if (rows.length === 0) { toast.info("No data to export"); return; }

  const doc = new jsPDF({ orientation: columns.length > 6 ? "landscape" : "portrait", unit: "mm", format: "a4" });

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, 18);

  let startY = 24;
  if (subtitle) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(subtitle, 14, startY);
    startY += 6;
  }

  // Date
  doc.setFontSize(8);
  doc.setTextColor(130);
  doc.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, startY);
  startY += 6;

  // Table
  const head = [columns.map(c => c.header)];
  const body = rows.map(row => columns.map(c => String(row[c.key] ?? "")));

  autoTable(doc, {
    head,
    body,
    startY,
    theme: "grid",
    headStyles: {
      fillColor: [41, 41, 41],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      halign: "center",
    },
    bodyStyles: {
      fontSize: 7.5,
      cellPadding: 2,
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    styles: {
      lineColor: [200, 200, 200],
      lineWidth: 0.3,
      overflow: "linebreak",
    },
    columnStyles: columns.reduce((acc, col, i) => {
      if (col.key === "qty" || col.key === "Qty" || col.key === "daysLeft") {
        acc[i] = { halign: "center" };
      }
      return acc;
    }, {} as Record<number, any>),
    margin: { left: 10, right: 10 },
    didDrawPage: (data: any) => {
      // Footer with page number
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}`,
        doc.internal.pageSize.width / 2, doc.internal.pageSize.height - 8,
        { align: "center" }
      );
    },
  });

  doc.save(`${filename}_${new Date().toISOString().split("T")[0]}.pdf`);
  toast.success("PDF exported ✔");
}

// ─── Pre-built configs ───

export function getExpiryExportConfig(data: any[], filterDays: number): ExportConfig {
  return {
    title: "Expiry Report",
    subtitle: `Products expiring within ${filterDays} days`,
    filename: `expiry_${filterDays}d`,
    sheetName: "Near Expiry",
    columns: [
      { header: "Brand", key: "brand", width: 16 },
      { header: "Code", key: "code", width: 12 },
      { header: "Product Name", key: "name", width: 28 },
      { header: "Batch No.", key: "batchNo", width: 14 },
      { header: "Qty", key: "qty", width: 8 },
      { header: "Unit", key: "unit", width: 8 },
      { header: "Expiry Date", key: "expiryDate", width: 14 },
      { header: "Days Left", key: "daysLeft", width: 10 },
    ],
    rows: data,
  };
}

export function getMovementsExportConfig(data: any[]): ExportConfig {
  return {
    title: "Stock Movements Report",
    subtitle: `${data.length} movement records`,
    filename: "movements",
    sheetName: "Movements",
    columns: [
      { header: "Date", key: "date", width: 12 },
      { header: "Time", key: "time", width: 10 },
      { header: "Type", key: "type", width: 6 },
      { header: "Code", key: "productCode", width: 12 },
      { header: "Product Name", key: "productName", width: 28 },
      { header: "Batch No.", key: "batchNo", width: 14 },
      { header: "Qty", key: "qty", width: 8 },
      { header: "Unit", key: "unit", width: 8 },
      { header: "Invoice #", key: "invoiceNo", width: 14 },
    ],
    rows: data.map(m => ({ ...m, invoiceNo: m.invoiceNo || "" })),
  };
}

export function getInvoicesExportConfig(data: any[], subTab: string): ExportConfig {
  const rows = data.flatMap((inv: any) =>
    inv.items.map((it: any) => ({
      invoiceNo: inv.invoiceNo,
      date: inv.date,
      time: inv.time || "",
      customer: inv.customerName || "",
      status: inv.status,
      productCode: it.productCode,
      productName: it.productName,
      qty: it.qty,
      unit: it.unit,
      batchNo: it.batchNo || "",
      expiryDate: it.expiryDate || "",
    }))
  );
  return {
    title: `Invoices Report — ${subTab.charAt(0).toUpperCase() + subTab.slice(1)}`,
    subtitle: `${data.length} invoices, ${rows.length} line items`,
    filename: `invoices_${subTab}`,
    sheetName: "Invoices",
    columns: [
      { header: "Invoice #", key: "invoiceNo", width: 14 },
      { header: "Date", key: "date", width: 12 },
      { header: "Customer", key: "customer", width: 20 },
      { header: "Status", key: "status", width: 10 },
      { header: "Code", key: "productCode", width: 12 },
      { header: "Product Name", key: "productName", width: 26 },
      { header: "Qty", key: "qty", width: 8 },
      { header: "Unit", key: "unit", width: 8 },
      { header: "Batch", key: "batchNo", width: 14 },
      { header: "Expiry", key: "expiryDate", width: 12 },
    ],
    rows,
  };
}

export function getBrandsExportConfig(data: any[]): ExportConfig {
  return {
    title: "Brands Summary Report",
    subtitle: `${data.length} brands`,
    filename: "brands",
    sheetName: "Brands",
    columns: [
      { header: "Brand", key: "name", width: 22 },
      { header: "Products", key: "products", width: 10 },
      { header: "Batches", key: "totalBatches", width: 10 },
      { header: "Total Qty", key: "totalQty", width: 12 },
      { header: "Nearest Expiry", key: "nearestExpiry", width: 16 },
    ],
    rows: data.map(b => ({
      ...b,
      nearestExpiry: b.nearestExpiry < 999 ? `${b.nearestExpiry} days` : "—",
    })),
  };
}

export function getReturnsExportConfig(data: any[]): ExportConfig {
  const rows = data.flatMap((ret: any) =>
    ret.items.map((it: any) => ({
      date: ret.date,
      customer: ret.customerName || "",
      driver: ret.driverName || "",
      voucher: ret.voucherNumber || "",
      productCode: it.productCode,
      productName: it.productName,
      qty: it.qty,
      unit: it.unit,
      batchNo: it.batchNo || "",
      expiryDate: it.expiryDate || "",
    }))
  );
  return {
    title: "Market Returns Report",
    subtitle: `${data.length} returns, ${rows.length} items`,
    filename: "returns",
    sheetName: "Returns",
    columns: [
      { header: "Date", key: "date", width: 12 },
      { header: "Customer", key: "customer", width: 20 },
      { header: "Driver", key: "driver", width: 16 },
      { header: "Voucher #", key: "voucher", width: 14 },
      { header: "Code", key: "productCode", width: 12 },
      { header: "Product Name", key: "productName", width: 26 },
      { header: "Qty", key: "qty", width: 8 },
      { header: "Unit", key: "unit", width: 8 },
      { header: "Batch", key: "batchNo", width: 14 },
      { header: "Expiry", key: "expiryDate", width: 12 },
    ],
    rows,
  };
}
