import { useState, useRef } from "react";
import { FileText, Truck, Package, ClipboardList, Loader2, Check, X } from "lucide-react";
import { useStockContext } from "@/contexts/StockContext";
import { parsePdf, PdfType, ParsedInvoice, ParsedProduct, ParsedPackingItem, ParseResult } from "@/lib/pdfParser";
import { toast } from "sonner";

type ImportState = "idle" | "processing" | "preview" | "applying";

interface PdfImportConfig {
  type: PdfType;
  label: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
}

const configs: PdfImportConfig[] = [
  { type: "invoices", label: "Today's Invoices", description: "Transaction Summary Listing — creates invoices & deducts stock", icon: ClipboardList, iconColor: "text-primary" },
  { type: "packing_list", label: "Packing List", description: "Incoming goods — adds stock batches", icon: Truck, iconColor: "text-success" },
  { type: "sku", label: "Stock / SKU Report", description: "Full inventory sync with batch details", icon: Package, iconColor: "text-warning" },
];

export function PdfImportSection() {
  const { addInvoice, deductFIFO, importProducts, loadData } = useStockContext();
  const [state, setState] = useState<ImportState>("idle");
  const [progress, setProgress] = useState("");
  const [activeType, setActiveType] = useState<PdfType | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleFile = async (file: File, type: PdfType) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF files are accepted");
      return;
    }

    setActiveType(type);
    setState("processing");
    setResult(null);

    try {
      const parsed = await parsePdf(file, type, setProgress);
      if (parsed.error) {
        toast.error(parsed.error);
        setState("idle");
        return;
      }
      setResult(parsed);
      setState("preview");
    } catch (err: any) {
      console.error("PDF parse error:", err);
      toast.error(err.message || "Failed to process PDF");
      setState("idle");
    }
  };

  const applyInvoices = async (invoices: ParsedInvoice[]) => {
    setState("applying");
    let processed = 0;
    for (const inv of invoices) {
      try {
        // Deduct stock for each item
        const deductionLog: any[] = [];
        for (const item of inv.items) {
          const result = await deductFIFO(item.itemCode, item.qty, item.uom, inv.invoiceNo);
          if (result?.deductionLog) deductionLog.push(...result.deductionLog);
        }

        // Create invoice record
        await addInvoice({
          invoiceNo: inv.invoiceNo,
          date: inv.date,
          time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
          customerName: inv.customerName,
          items: inv.items.map((it) => ({
            productCode: it.itemCode,
            productName: it.itemName,
            qty: it.qty,
            unit: it.uom,
            batchNo: "",
            expiryDate: "",
          })),
          type: "OUT",
          status: "done",
          deductionLog,
        });
        processed++;
      } catch (err) {
        console.error(`Failed to process invoice ${inv.invoiceNo}:`, err);
      }
    }
    toast.success(`${processed}/${invoices.length} invoices processed`);
    await loadData();
    setState("idle");
    setResult(null);
  };

  const applySkuImport = async (products: ParsedProduct[]) => {
    setState("applying");
    // Group products by brand
    const brandMap = new Map<string, typeof products>();
    for (const p of products) {
      const brand = p.brand || "Unknown";
      if (!brandMap.has(brand)) brandMap.set(brand, []);
      brandMap.get(brand)!.push(p);
    }

    const brands = Array.from(brandMap.entries()).map(([name, prods]) => ({
      name,
      products: prods.map((p) => ({
        code: p.itemCode,
        name: p.itemName,
        totalQty: [{ amount: p.totalStock || p.batches.reduce((s, b) => s + b.qty, 0), unit: p.baseUom }],
        packaging: p.baseUom,
        nearestExpiryDays: 999,
        storageType: "Dry" as const,
        batches: p.batches.filter((b) => b.qty > 0).map((b) => ({
          batchNo: b.batchNo,
          qty: b.qty,
          unit: p.baseUom,
          productionDate: "",
          expiryDate: b.expiryDate,
          daysLeft: 0,
          receivedDate: new Date().toISOString().split("T")[0],
        })),
      })),
    }));

    await importProducts(brands);
    toast.success(`${products.length} products imported from SKU report`);
    setState("idle");
    setResult(null);
  };

  const applyPackingList = async (items: ParsedPackingItem[]) => {
    setState("applying");
    // Group by brand (using item code prefix as fallback)
    const brandMap = new Map<string, ParsedPackingItem[]>();
    for (const item of items) {
      const brand = "Incoming";
      if (!brandMap.has(brand)) brandMap.set(brand, []);
      brandMap.get(brand)!.push(item);
    }

    const brands = Array.from(brandMap.entries()).map(([name, prods]) => ({
      name,
      products: prods.map((p) => ({
        code: p.itemCode,
        name: p.itemName,
        totalQty: [{ amount: p.qty, unit: p.unit }],
        packaging: p.unit,
        nearestExpiryDays: 999,
        storageType: "Dry" as const,
        batches: [{
          batchNo: p.batchNo || `PL-${Date.now()}`,
          qty: p.qty,
          unit: p.unit,
          productionDate: p.productionDate || "",
          expiryDate: p.expiryDate || "",
          daysLeft: 0,
          receivedDate: new Date().toISOString().split("T")[0],
        }],
      })),
    }));

    await importProducts(brands);
    toast.success(`${items.length} items imported from packing list`);
    setState("idle");
    setResult(null);
  };

  const handleApply = async () => {
    if (!result || !activeType) return;
    if (activeType === "invoices" && result.invoices) {
      await applyInvoices(result.invoices);
    } else if (activeType === "sku" && result.products) {
      await applySkuImport(result.products);
    } else if (activeType === "packing_list" && result.items) {
      await applyPackingList(result.items);
    }
  };

  const cancel = () => {
    setState("idle");
    setResult(null);
    setActiveType(null);
  };

  const getSummary = () => {
    if (!result || !activeType) return "";
    if (activeType === "invoices" && result.invoices) {
      const totalItems = result.invoices.reduce((s, inv) => s + inv.items.length, 0);
      return `${result.invoices.length} invoices, ${totalItems} line items`;
    }
    if (activeType === "sku" && result.products) {
      const totalBatches = result.products.reduce((s, p) => s + p.batches.length, 0);
      return `${result.products.length} products, ${totalBatches} batches`;
    }
    if (activeType === "packing_list" && result.items) {
      return `${result.items.length} items`;
    }
    return "";
  };

  return (
    <div className="space-y-3">
      {/* PDF Type Cards */}
      {configs.map((cfg) => (
        <div key={cfg.type} className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            <cfg.icon className={`w-8 h-8 ${cfg.iconColor}`} />
            <div>
              <p className="text-sm font-semibold text-foreground">{cfg.label}</p>
              <p className="text-xs text-muted-foreground">{cfg.description}</p>
            </div>
          </div>
          <input
            ref={(el) => (fileRefs.current[cfg.type] = el)}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file, cfg.type);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileRefs.current[cfg.type]?.click()}
            disabled={state !== "idle"}
            className="w-full bg-primary text-primary-foreground font-semibold py-2.5 rounded-md text-sm disabled:opacity-50"
          >
            Select PDF
          </button>
        </div>
      ))}

      {/* Processing state */}
      {state === "processing" && (
        <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
          <div>
            <p className="text-sm font-semibold text-foreground">Processing PDF...</p>
            <p className="text-xs text-muted-foreground">{progress}</p>
          </div>
        </div>
      )}

      {/* Preview / Apply */}
      {state === "preview" && result && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-muted border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
              {activeType === "invoices" ? "Invoices Preview" : activeType === "sku" ? "SKU Preview" : "Packing List Preview"}
            </span>
            <span className="text-xs text-muted-foreground">{getSummary()}</span>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {activeType === "invoices" && result.invoices?.map((inv) => (
              <div key={inv.invoiceNo} className="px-3 py-2 border-b border-border/50">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-primary font-semibold">{inv.invoiceNo}</span>
                  <span className="text-xs text-muted-foreground">{inv.date}</span>
                </div>
                <p className="text-xs text-foreground truncate">{inv.customerName}</p>
                <p className="text-[10px] text-muted-foreground">{inv.items.length} items — {inv.items.map((i) => `${i.itemCode} x${i.qty}`).join(", ")}</p>
              </div>
            ))}

            {activeType === "sku" && result.products?.slice(0, 50).map((p) => (
              <div key={p.itemCode} className="px-3 py-1.5 border-b border-border/50 flex items-center gap-2">
                <span className="font-mono text-xs text-primary w-20">{p.itemCode}</span>
                <span className="text-xs text-foreground truncate flex-1">{p.itemName}</span>
                <span className="text-xs text-muted-foreground">{p.batches.length}b</span>
              </div>
            ))}
            {activeType === "sku" && result.products && result.products.length > 50 && (
              <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                ...and {result.products.length - 50} more products
              </div>
            )}

            {activeType === "packing_list" && result.items?.map((item, i) => (
              <div key={i} className="px-3 py-1.5 border-b border-border/50 flex items-center gap-2">
                <span className="font-mono text-xs text-primary w-20">{item.itemCode}</span>
                <span className="text-xs text-foreground truncate flex-1">{item.itemName}</span>
                <span className="text-xs text-muted-foreground">{item.qty} {item.unit}</span>
              </div>
            ))}
          </div>

          <div className="p-3 flex gap-2">
            <button onClick={cancel} className="flex-1 bg-secondary text-secondary-foreground font-semibold py-2 rounded-md text-sm">
              <X className="w-4 h-4 inline mr-1" /> Cancel
            </button>
            <button onClick={handleApply} className="flex-1 bg-success text-primary-foreground font-semibold py-2 rounded-md text-sm flex items-center justify-center gap-1">
              <Check className="w-4 h-4" /> Apply
            </button>
          </div>
        </div>
      )}

      {/* Applying state */}
      {state === "applying" && (
        <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-success animate-spin" />
          <p className="text-sm font-semibold text-foreground">Applying to database...</p>
        </div>
      )}
    </div>
  );
}
