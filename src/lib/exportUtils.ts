import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

interface ExportColumn {
  header: string;
  key: string;
  width?: number; // Excel col width
}

interface ExportConfig {
  title: string;
  filename: string;
  sheetName: string;
  columns: ExportColumn[];
  rows: Record<string, any>[];
  subtitle?: string;
}

// ─── Excel Export ───
export function exportExcel(config: ExportConfig) {
  const { columns, rows, filename, sheetName, title, subtitle } = config;
  if (rows.length === 0) { toast.info("No data to export"); return; }

  // Build header row + data rows using column keys
  const headerRow = columns.map(c => c.header);
  const dataRows = rows.map(row => columns.map(c => row[c.key] ?? ""));

  // Create worksheet with title rows
  const wsData: any[][] = [];
  wsData.push([title]);
  if (subtitle) wsData.push([subtitle]);
  wsData.push([]); // empty row
  wsData.push(headerRow);
  dataRows.forEach(r => wsData.push(r));

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Merge title cell across all columns
  const colCount = columns.length;
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
  ];
  if (subtitle) {
    ws["!merges"].push({ s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } });
  }

  // Set column widths
  ws["!cols"] = columns.map(c => ({ wch: c.width || 14 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split("T")[0]}.xlsx`);
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
