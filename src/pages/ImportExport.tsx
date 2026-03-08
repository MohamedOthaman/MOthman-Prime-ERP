import { useState, useRef } from "react";
import { FileSpreadsheet, Download, Upload, FileText, AlertTriangle, Check, X } from "lucide-react";
import { useStockContext } from "@/contexts/StockContext";
import { Brand, recalcDaysLeft } from "@/data/stockData";
import { toast } from "sonner";
import { WheelPicker } from "@/components/WheelPicker";
import { PdfImportSection } from "@/components/PdfImportSection";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Tab = "export" | "import";

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export default function ImportExport() {
  const { stock, importProducts } = useStockContext();
  const [tab, setTab] = useState<Tab>("export");
  const [expiryDays, setExpiryDays] = useState(30);
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);
  const [importPreview, setImportPreview] = useState<Brand[] | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const expiryOptions = [30, 60, 90, 180].map(d => ({ label: `${d} days`, value: d }));

  const flattenStock = () => {
    const rows: any[] = [];
    stock.forEach(brand => {
      brand.products.forEach(product => {
        product.batches.forEach(batch => {
          rows.push({
            Brand: brand.name,
            "Product Code": product.code,
            "Product Name": product.name,
            "Storage Type": product.storageType,
            "Batch No": batch.batchNo,
            Qty: batch.qty,
            Unit: batch.unit,
            "Production Date": batch.productionDate,
            "Expiry Date": batch.expiryDate,
            "D.Left": batch.daysLeft,
          });
        });
      });
    });
    return rows;
  };

  const exportExcel = () => {
    const rows = flattenStock();
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock");
    XLSX.writeFile(wb, `stock_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success("Excel exported");
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text("Stock Report", 14, 15);
    doc.setFontSize(8);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 22);
    const rows = flattenStock();
    autoTable(doc, {
      head: [["Brand", "Code", "Name", "Storage", "Batch", "Qty", "Unit", "Prod", "Exp", "D.Left"]],
      body: rows.map(r => [r.Brand, r["Product Code"], r["Product Name"], r["Storage Type"], r["Batch No"], r.Qty, r.Unit, r["Production Date"], r["Expiry Date"], r["D.Left"]]),
      startY: 26,
      styles: { fontSize: 7 },
    });
    doc.save(`stock_${new Date().toISOString().split("T")[0]}.pdf`);
    toast.success("PDF exported");
  };

  const exportNearExpiry = () => {
    const rows = flattenStock().filter(r => r["D.Left"] <= expiryDays && r["D.Left"] > 0);
    if (rows.length === 0) {
      toast.info("No items near expiry");
      return;
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Near Expiry");
    XLSX.writeFile(wb, `near_expiry_${expiryDays}d_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success(`Near expiry report (${expiryDays}d) exported`);
  };

  const validateRow = (row: any, rowNum: number): ValidationError[] => {
    const errors: ValidationError[] = [];
    const code = row["Product Code"] || row["product_code"] || row["Code"];
    if (!code || String(code).trim() === "") {
      errors.push({ row: rowNum, field: "Product Code", message: "Missing Product Code" });
    }
    const batch = row["Batch No"] || row["batch_no"] || row["Batch"];
    if (!batch || String(batch).trim() === "") {
      errors.push({ row: rowNum, field: "Batch", message: "Missing Batch No" });
    }
    const prodDate = row["Production Date"] || row["production_date"] || row["Prod Date"];
    if (!prodDate) {
      errors.push({ row: rowNum, field: "Production Date", message: "Missing Production Date" });
    }
    const expDate = row["Expiry Date"] || row["expiry_date"] || row["Exp Date"];
    if (!expDate) {
      errors.push({ row: rowNum, field: "Expiry Date", message: "Missing Expiry Date" });
    }
    const qty = row["Qty"] || row["qty"] || row["Quantity"];
    if (qty === undefined || qty === null || isNaN(Number(qty)) || Number(qty) <= 0) {
      errors.push({ row: rowNum, field: "Quantity", message: "Invalid or missing Quantity" });
    }
    return errors;
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".xlsx")) {
      toast.error("Only .xlsx files are accepted");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws);
        if (rows.length === 0) { toast.error("File is empty"); return; }
        const allErrors: ValidationError[] = [];
        rows.forEach((row, i) => { allErrors.push(...validateRow(row, i + 2)); });
        setValidationErrors(allErrors);
        if (allErrors.length > 0) {
          toast.error(`${allErrors.length} validation error(s) found.`);
        }
        const brandsMap = new Map<string, Brand>();
        for (const row of rows) {
          const brandName = row["Brand"] || row["brand"] || "Unknown";
          if (!brandsMap.has(brandName)) brandsMap.set(brandName, { name: brandName, products: [] });
          const brand = brandsMap.get(brandName)!;
          const code = String(row["Product Code"] || row["product_code"] || row["Code"] || "").trim();
          if (!code) continue;
          let product = brand.products.find(p => p.code === code);
          if (!product) {
            const storageRaw = String(row["Storage Type"] || row["storage_type"] || "D");
            let storageType: "Frozen" | "Chilled" | "Dry" = "Dry";
            if (storageRaw.charAt(0).toUpperCase() === "F") storageType = "Frozen";
            else if (storageRaw.charAt(0).toUpperCase() === "C") storageType = "Chilled";
            product = { code, name: row["Product Name"] || row["product_name"] || row["Name"] || "", totalQty: [], packaging: "", nearestExpiryDays: 999, storageType, batches: [] };
            brand.products.push(product);
          }
          const unit = row["Unit"] || row["unit"] || "PCS";
          let prodDate = row["Production Date"] || row["production_date"] || row["Prod Date"] || "";
          let expDate = row["Expiry Date"] || row["expiry_date"] || row["Exp Date"] || "";
          if (typeof prodDate === "number") { const d = XLSX.SSF.parse_date_code(prodDate); prodDate = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`; }
          if (typeof expDate === "number") { const d = XLSX.SSF.parse_date_code(expDate); expDate = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`; }
          product.batches.push({ batchNo: String(row["Batch No"] || row["batch_no"] || `B-${Date.now()}`), qty: Number(row["Qty"] || row["qty"] || row["Quantity"] || 0), unit, productionDate: String(prodDate), expiryDate: String(expDate), daysLeft: 0, receivedDate: row["Received Date"] || row["received_date"] || new Date().toISOString().split("T")[0] });
          product.packaging = [...new Set(product.batches.map(b => b.unit))].join(" / ");
        }
        const parsed = recalcDaysLeft(Array.from(brandsMap.values()));
        parsed.forEach(b => b.products.forEach(p => {
          const map: Record<string, number> = {};
          p.batches.forEach(batch => { map[batch.unit] = (map[batch.unit] || 0) + batch.qty; });
          p.totalQty = Object.entries(map).map(([unit, amount]) => ({ unit, amount }));
        }));
        setImportPreview(parsed);
      } catch { toast.error("Failed to parse Excel file."); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handlePDFImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".pdf")) { toast.error("Only .pdf files are accepted"); e.target.value = ""; return; }
    setPdfError("PDF packing list import requires a structured format. Please convert to Excel (.xlsx) and use Excel import.");
    toast.error("PDF import: structured parsing not available. Use Excel import.");
    e.target.value = "";
  };

  const applyImport = async () => {
    if (!importPreview) return;
    if (validationErrors.length > 0) { toast.error("Fix validation errors first"); return; }
    await importProducts(importPreview);
    setImportPreview(null);
    setValidationErrors([]);
    toast.success("Products imported successfully");
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground tracking-tight">Import / Export</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        <div className="flex bg-secondary rounded-lg p-1">
          <button onClick={() => setTab("export")} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${tab === "export" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
            <Download className="w-4 h-4 inline mr-1" /> Export
          </button>
          <button onClick={() => setTab("import")} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${tab === "import" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
            <Upload className="w-4 h-4 inline mr-1" /> Import
          </button>
        </div>

        {tab === "export" && (
          <div className="space-y-3">
            <button onClick={exportExcel} className="w-full bg-card border border-border rounded-lg p-4 text-left hover:bg-row-hover transition-colors flex items-center gap-3">
              <FileSpreadsheet className="w-8 h-8 text-success" />
              <div>
                <p className="text-sm font-semibold text-foreground">Export Stock as Excel</p>
                <p className="text-xs text-muted-foreground">Full stock with batches (.xlsx)</p>
              </div>
            </button>

            <button onClick={exportPDF} className="w-full bg-card border border-border rounded-lg p-4 text-left hover:bg-row-hover transition-colors flex items-center gap-3">
              <FileText className="w-8 h-8 text-destructive" />
              <div>
                <p className="text-sm font-semibold text-foreground">Export Stock as PDF</p>
                <p className="text-xs text-muted-foreground">Printable report format</p>
              </div>
            </button>

            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <AlertTriangle className="w-8 h-8 text-warning" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Near Expiry Report</p>
                  <p className="text-xs text-muted-foreground">Export items expiring within selected period</p>
                </div>
              </div>
              <button
                onClick={() => setShowExpiryPicker(!showExpiryPicker)}
                className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border text-left mb-3"
              >
                Period: {expiryDays} days {showExpiryPicker ? "▲" : "▼"}
              </button>
              {showExpiryPicker && (
                <div className="mb-3">
                  <WheelPicker
                    items={expiryOptions}
                    selectedValue={expiryDays}
                    onChange={(v) => setExpiryDays(v as number)}
                    height={120}
                  />
                </div>
              )}
              <button onClick={exportNearExpiry} className="w-full bg-warning text-primary-foreground font-semibold py-2 rounded-md text-sm">
                Export Near Expiry ({expiryDays} days)
              </button>
            </div>
          </div>
        )}

        {tab === "import" && (
          <div className="space-y-3">
            {/* AI-Powered PDF Import */}
            <div className="mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">PDF Import (AI-Powered)</p>
              <PdfImportSection />
            </div>

            {/* Excel Import */}
            <div className="mt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Excel Import</p>
              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-sm font-semibold text-foreground mb-1">Import Excel File (.xlsx)</p>
                <p className="text-xs text-muted-foreground mb-3">Columns: Product Code, Batch No, Production Date, Expiry Date, Qty</p>
                <input ref={fileRef} type="file" accept=".xlsx" onChange={handleImport} className="hidden" />
                <button onClick={() => fileRef.current?.click()} className="w-full bg-secondary text-secondary-foreground font-semibold py-2.5 rounded-md text-sm">
                  Select Excel File
                </button>
              </div>
            </div>

            {validationErrors.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                <p className="text-xs font-semibold text-destructive mb-2">Validation Errors ({validationErrors.length})</p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {validationErrors.map((err, i) => (
                    <p key={i} className="text-xs text-destructive/80">Row {err.row}: {err.field} — {err.message}</p>
                  ))}
                </div>
              </div>
            )}

            {importPreview && (
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-brand-header border-b border-border flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Import Preview</span>
                  <span className="text-xs text-muted-foreground">{importPreview.reduce((a, b) => a + b.products.length, 0)} products</span>
                </div>
                {importPreview.map(brand => (
                  <div key={brand.name}>
                    <div className="px-3 py-1.5 text-xs font-bold text-primary border-b border-border/50 bg-muted/30">{brand.name}</div>
                    {brand.products.map(p => (
                      <div key={p.code} className="px-3 py-1.5 border-b border-border/50 flex items-center gap-2 text-sm">
                        <span className="font-mono text-xs text-primary w-16">{p.code}</span>
                        <span className="flex-1 truncate text-foreground">{p.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{p.batches.length} batch</span>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="p-3 flex gap-2">
                  <button onClick={() => { setImportPreview(null); setValidationErrors([]); }} className="flex-1 bg-secondary text-secondary-foreground font-semibold py-2 rounded-md text-sm">Cancel</button>
                  <button onClick={applyImport} disabled={validationErrors.length > 0} className={`flex-1 font-semibold py-2 rounded-md text-sm flex items-center justify-center gap-1 ${validationErrors.length > 0 ? "bg-muted text-muted-foreground" : "bg-success text-primary-foreground"}`}>
                    <Check className="w-4 h-4" /> Apply Import
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
