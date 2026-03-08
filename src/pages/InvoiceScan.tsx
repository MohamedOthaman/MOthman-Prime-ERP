import { useState, useRef, useEffect, useCallback } from "react";
import {
  ScanLine, Flashlight, FlashlightOff, Check, X, Plus, Minus,
  FileText, Upload, RotateCcw, Edit3, Ban, ChevronRight, Camera, Loader2, CalendarIcon
} from "lucide-react";
import { useStockContext } from "@/contexts/StockContext";
import { Invoice, InvoiceItem, MarketReturn } from "@/data/stockData";
import { toast } from "sonner";
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from "@zxing/library";
import { parsePdf } from "@/lib/pdfParser";
import { NumberWheel, DateWheel } from "@/components/WheelPicker";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type View = "main" | "details" | "scanning" | "returns" | "return-scan" | "completed-view";

interface PendingItem {
  productCode: string;
  productName: string;
  qty: number;
  unit: string;
  nearestExpiry: string;
  scannedQty: number;
}

export default function InvoiceScan() {
  const {
    stock, invoices, findProduct, findProductByBarcode,
    deductFIFO, addInvoice, updateInvoice, restoreStock, addReturn
  } = useStockContext();

  const [view, setView] = useState<View>("main");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [items, setItems] = useState<PendingItem[]>([]);
  const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);

  // Return form
  const [returnCustomer, setReturnCustomer] = useState("");
  const [returnDriver, setReturnDriver] = useState("");
  const [returnVoucher, setReturnVoucher] = useState("");
  const [returnItems, setReturnItems] = useState<{ productCode: string; productName: string; qty: number; unit: string; expiryDate: string }[]>([]);
  const [returnManualCode, setReturnManualCode] = useState("");
  const [returnQty, setReturnQty] = useState(1);
  const [returnExpiry, setReturnExpiry] = useState(new Date().toISOString().split("T")[0]);
  const [showReturnQtyPicker, setShowReturnQtyPicker] = useState(false);
  const [showReturnExpiryPicker, setShowReturnExpiryPicker] = useState(false);
  const [returnScanning, setReturnScanning] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastScanRef = useRef<number>(0);
  const lastBarcodeRef = useRef<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const lastCompletedInvoice = invoices.find(i => i.status === "done" || i.status === "edited");

  const stopCamera = useCallback(() => {
    if (readerRef.current) { readerRef.current.reset(); readerRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startScanning = useCallback(async (onScan: (barcode: string) => void) => {
    stopCamera();
    try {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39, BarcodeFormat.QR_CODE, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints);
      readerRef.current = reader;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      const scanLoop = async () => {
        while (readerRef.current && videoRef.current && streamRef.current) {
          try {
            const result = await readerRef.current.decodeOnceFromVideoDevice(undefined, videoRef.current);
            if (result) {
              const now = Date.now();
              const text = result.getText();
              if (now - lastScanRef.current >= 500 && !(text === lastBarcodeRef.current && now - lastScanRef.current < 2000)) {
                lastScanRef.current = now;
                lastBarcodeRef.current = text;
                onScan(text);
              }
            }
          } catch {}
          await new Promise(r => setTimeout(r, 100));
        }
      };
      scanLoop();
    } catch { toast.error("Cannot access camera"); }
  }, [stopCamera]);

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      await (track as any).applyConstraints({ advanced: [{ torch: !torchOn } as any] });
      setTorchOn(!torchOn);
    } catch { toast.error("Torch not supported"); }
  };

  // --- INVOICE INPUT ---
  const handleInvoiceBarcodeScan = () => {
    startScanning((barcode) => {
      const existing = invoices.find(i => i.invoiceNo === barcode);
      if (existing) {
        if (existing.status === "ready") {
          loadExistingInvoiceItems(existing);
          stopCamera();
          return;
        }
        setActiveInvoice(existing);
        setView("completed-view");
        stopCamera();
        return;
      }
      setInvoiceNo(barcode);
      toast.success(`Invoice: ${barcode}`);
      stopCamera();
    });
  };

  const loadExistingInvoiceItems = (inv: Invoice) => {
    setInvoiceNo(inv.invoiceNo);
    setCustomerName(inv.customerName || "");
    setItems(inv.items.map(it => {
      const found = findProduct(it.productCode);
      const nearestBatch = found ? [...found.product.batches].sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())[0] : null;
      return {
        productCode: it.productCode, productName: it.productName,
        qty: it.qty, unit: it.unit,
        nearestExpiry: nearestBatch?.expiryDate || it.expiryDate || "", scannedQty: 0,
      };
    }));
    toast.success(`تم تحميل فاتورة ${inv.invoiceNo} - ${inv.items.length} منتج`);
    setView("details");
  };

  const handleManualInvoiceSubmit = () => {
    const trimmed = invoiceNo.trim();
    if (!trimmed) { 
      setInvoiceNo(`INV-${Date.now().toString().slice(-6)}`);
      setView("details");
      return;
    }
    const existing = invoices.find(i => i.invoiceNo === trimmed);
    if (existing) {
      if (existing.status === "ready") {
        // Load existing ready invoice items
        loadExistingInvoiceItems(existing);
        return;
      }
      setActiveInvoice(existing);
      setView("completed-view");
      return;
    }
    // Check if user typed a product code instead of invoice number
    const foundAsProduct = findProductByBarcode(trimmed) || findProduct(trimmed.toUpperCase());
    if (foundAsProduct) {
      const autoInv = `INV-${Date.now().toString().slice(-6)}`;
      setInvoiceNo(autoInv);
      const nearestBatch = [...foundAsProduct.product.batches].sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())[0];
      setItems([{
        productCode: foundAsProduct.product.code, productName: foundAsProduct.product.name,
        qty: 1, unit: foundAsProduct.product.batches[0]?.unit || "PCS",
        nearestExpiry: nearestBatch?.expiryDate || "", scannedQty: 0,
      }]);
      toast.success(`Added ${foundAsProduct.product.name}`);
      setView("details");
      return;
    }
    setView("details");
  };

  const handlePDFUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const isPdf = file.name.toLowerCase().endsWith(".pdf");
    setProcessing(true);
    setOcrProgress(0);
    
    try {
      if (isPdf) {
        // Use AI-powered parser for PDFs
        setOcrProgress(10);
        const result = await parsePdf(file, "invoices", (msg) => {
          setOcrProgress(prev => Math.min(prev + 15, 90));
        });
        setOcrProgress(100);
        
        if (result.error) {
          toast.error(result.error);
          setProcessing(false);
          e.target.value = "";
          return;
        }
        
        if (result.invoices && result.invoices.length > 0) {
          // Take the first invoice for the scan flow
          const inv = result.invoices[0];
          setInvoiceNo(inv.invoiceNo);
          setCustomerName(inv.customerName || "");
          setItems(inv.items.map(it => {
            const found = findProduct(it.itemCode);
            const nearestBatch = found ? [...found.product.batches].sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())[0] : null;
            return {
              productCode: it.itemCode,
              productName: it.itemName,
              qty: it.qty,
              unit: it.uom,
              nearestExpiry: nearestBatch?.expiryDate || "",
              scannedQty: 0,
            };
          }));
          toast.success(`Found ${result.invoices.length} invoice(s), ${inv.items.length} items`);
          if (result.invoices.length > 1) {
            toast.info(`${result.invoices.length - 1} more invoice(s) can be imported from IO page`);
          }
          setView("details");
        } else {
          toast.error("No invoices found in the PDF");
        }
      } else {
        // For images, fall back to text-based parsing
        parseInvoiceText("");
        toast.info("For best results, upload PDF files");
      }
    } catch (err: any) {
      console.error("PDF parse error:", err);
      toast.error(err.message || "Failed to process file");
    }
    setProcessing(false);
    e.target.value = "";
  };

  const parseInvoiceText = (text: string) => {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    const allCodes: string[] = [];
    stock.forEach(b => b.products.forEach(p => allCodes.push(p.code)));

    // Extract invoice number
    let inv = "";
    const patterns = [/inv[oice]*[:\s#-]*([A-Z0-9-]{4,})/i, /\b(INV-?\d{4,})\b/i, /\b(\d{4,})\b/];
    for (const p of patterns) { const m = text.match(p); if (m) { inv = m[1]; break; } }
    if (!inv) inv = `INV-${Date.now().toString().slice(-6)}`;
    setInvoiceNo(inv);

    // Extract customer name (look for "customer" or "to:" patterns)
    const custMatch = text.match(/(?:customer|to|client)[:\s]+([^\n]+)/i);
    if (custMatch) setCustomerName(custMatch[1].trim());

    // Extract products
    const detected: PendingItem[] = [];
    for (const line of lines) {
      const upper = line.toUpperCase();
      for (const code of allCodes) {
        if (upper.includes(code) && !detected.find(d => d.productCode === code)) {
          const found = findProduct(code);
          if (!found) continue;
          const qtyMatch = line.match(/(\d+)\s*(CTN|PCS|BAG|KG|TIN|PAIL|BTL|BLK|BOX)/i);
          const numMatch = line.match(/\b(\d+)\b/);
          const nearestBatch = [...found.product.batches].sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())[0];
          detected.push({
            productCode: code,
            productName: found.product.name,
            qty: qtyMatch ? parseInt(qtyMatch[1]) : (numMatch ? parseInt(numMatch[1]) : 1),
            unit: qtyMatch ? qtyMatch[2].toUpperCase() : (found.product.batches[0]?.unit || "PCS"),
            nearestExpiry: nearestBatch?.expiryDate || "",
            scannedQty: 0,
          });
        }
      }
    }
    setItems(detected);
    if (detected.length > 0) {
      toast.success(`Found ${detected.length} product(s)`);
    } else {
      toast.info("No products detected. Add manually.");
    }
    setView("details");
  };

  // --- DETAILS VIEW ---
  const addProductToInvoice = (code: string) => {
    const trimmed = code.trim();
    const found = findProductByBarcode(trimmed) || findProduct(trimmed.toUpperCase()) || findProduct(trimmed);
    if (!found) { toast.error(`منتج غير موجود: ${trimmed}`); return; }
    const existing = items.findIndex(i => i.productCode === found.product.code);
    if (existing >= 0) {
      setItems(prev => prev.map((item, i) => i === existing ? { ...item, qty: item.qty + 1 } : item));
    } else {
      const nearestBatch = [...found.product.batches].sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())[0];
      setItems(prev => [...prev, {
        productCode: found.product.code, productName: found.product.name,
        qty: 1, unit: found.product.batches[0]?.unit || "PCS",
        nearestExpiry: nearestBatch?.expiryDate || "", scannedQty: 0,
      }]);
    }
    toast.success(`✔ ${found.product.name}`);
  };

  const updateItemQty = (idx: number, delta: number) => {
    setItems(prev => prev.map((item, i) => i !== idx ? item : { ...item, qty: Math.max(1, item.qty + delta) }));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  // --- SCAN PRODUCTS (verification) ---
  const startProductScanning = () => {
    setView("scanning");
    startScanning((barcode) => {
      const found = findProductByBarcode(barcode) || findProduct(barcode.toUpperCase());
      if (!found) { toast.error(`Unknown: ${barcode}`); return; }
      setItems(prev => {
        const idx = prev.findIndex(i => i.productCode === found.product.code);
        if (idx < 0) { toast("Product not in invoice"); return prev; }
        const item = prev[idx];
        if (item.scannedQty >= item.qty) { toast.info(`${found.product.name} already fully scanned`); return prev; }
        toast.success(`✔ ${found.product.name} (${item.scannedQty + 1}/${item.qty})`);
        return prev.map((it, i) => i === idx ? { ...it, scannedQty: it.scannedQty + 1 } : it);
      });
    });
  };

  const allScanned = items.length > 0 && items.every(i => i.scannedQty >= i.qty);

  // --- CONFIRM / DONE ---
  const confirmInvoice = async (scanned: boolean) => {
    if (items.length === 0) { toast.error("No items"); return; }
    stopCamera();

    const allDeductions: Invoice["deductionLog"] = [];
    const invoiceItems: InvoiceItem[] = [];
    for (const item of items) {
      const result = await deductFIFO(item.productCode, item.qty, item.unit, invoiceNo);
      allDeductions.push(...result.deductionLog);
      for (const d of result.deductionLog) {
        invoiceItems.push({
          productCode: item.productCode, productName: item.productName,
          qty: d.qty, unit: d.unit, batchNo: d.batchNo, expiryDate: d.expiryDate,
        });
      }
    }

    // Check if this invoice already exists (e.g. status "ready") → update it
    const existingInvoice = invoices.find(i => i.invoiceNo === invoiceNo);
    if (existingInvoice) {
      await updateInvoice(invoiceNo, inv => ({ ...inv, status: "done" }));
      toast.success(`Invoice ${invoiceNo} → Done ✔`);
    } else {
      const now = new Date();
      await addInvoice({
        invoiceNo, customerName, date: now.toISOString().split("T")[0],
        time: now.toLocaleTimeString(), items: invoiceItems, type: "OUT",
        status: "done", deductionLog: allDeductions,
      });
      toast.success(`Invoice ${invoiceNo} completed`);
    }
    resetForm();
  };

  // --- COMPLETED INVOICE ACTIONS ---
  const handleEditInvoice = () => {
    if (!activeInvoice) return;
    setInvoiceNo(activeInvoice.invoiceNo);
    setCustomerName(activeInvoice.customerName || "");
    setItems(activeInvoice.items.map(i => ({
      productCode: i.productCode, productName: i.productName,
      qty: i.qty, unit: i.unit, nearestExpiry: i.expiryDate, scannedQty: 0,
    })));
    setView("details");
  };

  const handleCancelInvoice = async () => {
    if (!activeInvoice) return;
    // Restore stock from items (which have product codes)
    for (const item of activeInvoice.items) {
      await restoreStock(item.productCode, item.qty, item.unit, item.batchNo, item.expiryDate, "cancelled", activeInvoice.invoiceNo);
    }
    await updateInvoice(activeInvoice.invoiceNo, inv => ({ ...inv, status: "cancelled" }));
    toast.success(`Invoice ${activeInvoice.invoiceNo} cancelled. Stock restored.`);
    setActiveInvoice(null);
    setView("main");
  };

  // --- MARKET RETURNS ---
  const addReturnProduct = () => {
    if (!returnManualCode.trim()) return;
    const found = findProductByBarcode(returnManualCode.trim()) || findProduct(returnManualCode.trim().toUpperCase());
    if (!found) { toast.error("Product not found"); return; }
    setReturnItems(prev => [...prev, {
      productCode: found.product.code, productName: found.product.name,
      qty: returnQty, unit: found.product.batches[0]?.unit || "PCS", expiryDate: returnExpiry,
    }]);
    setReturnManualCode("");
    setReturnQty(1);
    toast.success(`Added ${found.product.name}`);
  };

  const startReturnScanning = () => {
    setReturnScanning(true);
    startScanning((barcode) => {
      const found = findProductByBarcode(barcode) || findProduct(barcode.toUpperCase());
      if (!found) { toast.error(`Product not found: ${barcode}`); return; }
      setReturnItems(prev => [...prev, {
        productCode: found.product.code, productName: found.product.name,
        qty: returnQty, unit: found.product.batches[0]?.unit || "PCS", expiryDate: returnExpiry,
      }]);
      toast.success(`Scanned: ${found.product.name}`);
    });
  };

  const stopReturnScanning = () => {
    stopCamera();
    setReturnScanning(false);
  };

  const confirmReturn = async () => {
    if (returnItems.length === 0) { toast.error("No items to return"); return; }
    const now = new Date();
    const ret: MarketReturn = {
      id: crypto.randomUUID(), date: now.toISOString().split("T")[0], time: now.toLocaleTimeString(),
      customerName: returnCustomer, driverName: returnDriver, voucherNumber: returnVoucher,
      items: returnItems.map(i => ({ ...i, batchNo: `RET-${Date.now().toString().slice(-6)}` })),
    };
    // Restore stock for each returned item
    for (const item of ret.items) {
      await restoreStock(item.productCode, item.qty, item.unit, item.batchNo, item.expiryDate, "return", ret.id);
    }
    await addReturn(ret);
    toast.success("Return processed. Stock restored.");
    setReturnCustomer(""); setReturnDriver(""); setReturnVoucher(""); setReturnItems([]);
    setView("main");
  };

  const resetForm = () => {
    setInvoiceNo(""); setCustomerName(""); setItems([]);
    setActiveInvoice(null); setView("main");
  };

  const [manualCode, setManualCode] = useState("");

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <ScanLine className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground tracking-tight">Invoice Scan</h1>
          {view !== "main" && (
            <button onClick={() => { stopCamera(); resetForm(); }} className="ml-auto text-xs text-muted-foreground">
              ← Back
            </button>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">

        {/* LAST COMPLETED INVOICE RIBBON */}
        {view === "main" && lastCompletedInvoice && (
          <button
            onClick={() => { setActiveInvoice(lastCompletedInvoice); setView("completed-view"); }}
            className="w-full bg-success/10 border border-success/30 rounded-lg px-4 py-3 flex items-center gap-3 text-left"
          >
            <Check className="w-5 h-5 text-success shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Last: {lastCompletedInvoice.invoiceNo}</p>
              <p className="text-xs text-muted-foreground truncate">{lastCompletedInvoice.customerName || "No customer"} · {lastCompletedInvoice.date}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        )}

        {/* MAIN VIEW */}
        {view === "main" && (
          <>
            {/* Camera preview */}
            <div className="relative bg-card border border-border rounded-lg overflow-hidden">
              <video ref={videoRef} className="w-full aspect-video object-cover" playsInline muted />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-64 h-16 border-2 border-primary/60 rounded-lg" />
              </div>
              <div className="absolute top-2 right-2">
                <button onClick={toggleTorch} className="bg-background/80 backdrop-blur p-2 rounded-md">
                  {torchOn ? <Flashlight className="w-4 h-4 text-warning" /> : <FlashlightOff className="w-4 h-4 text-muted-foreground" />}
                </button>
              </div>
            </div>

            <button onClick={handleInvoiceBarcodeScan}
              className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-md text-sm flex items-center justify-center gap-2">
              <Camera className="w-4 h-4" /> Scan Invoice Barcode
            </button>

            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <label className="text-sm font-semibold text-foreground block">Or Enter Manually</label>
              <input type="text" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleManualInvoiceSubmit()}
                placeholder="رقم الفاتورة أو كود المنتج..."
                className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2.5 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground font-mono" />
              <button onClick={handleManualInvoiceSubmit}
                className="w-full bg-secondary text-secondary-foreground font-semibold py-2.5 rounded-md text-sm">
                Continue →
              </button>
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
              <label className="text-sm font-semibold text-foreground block mb-2">
                <Upload className="w-4 h-4 inline mr-1" /> Upload Invoice PDF / Image
              </label>
              <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={handlePDFUpload} className="hidden" />
              <button onClick={() => fileRef.current?.click()}
                className="w-full bg-secondary text-secondary-foreground font-semibold py-2.5 rounded-md text-sm">
                Select File
              </button>
            </div>

            {processing && (
              <div className="bg-card border border-border rounded-lg p-6 text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
                <p className="text-sm text-foreground">Processing... {ocrProgress}%</p>
                <div className="w-full bg-secondary rounded-full h-2 mt-2">
                  <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${ocrProgress}%` }} />
                </div>
              </div>
            )}

            <button onClick={() => setView("returns")}
              className="w-full bg-card border border-border rounded-lg p-4 text-left flex items-center gap-3 hover:bg-row-hover transition-colors">
              <RotateCcw className="w-6 h-6 text-storage-chilled" />
              <div>
                <p className="text-sm font-semibold text-foreground">Market Returns</p>
                <p className="text-xs text-muted-foreground">Process returned products</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
            </button>
          </>
        )}

        {/* DETAILS VIEW */}
        {view === "details" && (
          <div className="space-y-3">
            <div className="bg-card border border-border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Invoice</span>
                <span className="font-mono text-sm text-primary font-bold">{invoiceNo}</span>
              </div>
              <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)}
                placeholder="Customer name (optional)"
                className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString()}</p>
            </div>

            {/* Product list */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-brand-header border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  Products ({items.length})
                </span>
              </div>
              {items.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">No products yet. Add below.</div>
              )}
              {items.map((item, idx) => (
                <div key={idx} className="px-3 py-2.5 border-b border-border/50 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-xs text-primary">{item.productCode}</span>
                    <p className="text-sm text-foreground truncate">{item.productName}</p>
                    {item.nearestExpiry && <p className="text-xs text-muted-foreground">FEFO: {item.nearestExpiry}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateItemQty(idx, -1)} className="w-7 h-7 rounded bg-secondary flex items-center justify-center"><Minus className="w-3 h-3 text-foreground" /></button>
                    <span className="font-mono text-sm w-8 text-center text-foreground">{item.qty}</span>
                    <button onClick={() => updateItemQty(idx, 1)} className="w-7 h-7 rounded bg-secondary flex items-center justify-center"><Plus className="w-3 h-3 text-foreground" /></button>
                    <span className="text-xs text-muted-foreground ml-1">{item.unit}</span>
                  </div>
                  <button onClick={() => removeItem(idx)} className="text-destructive"><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>

            {/* Manual add */}
            <div className="flex gap-2">
              <input type="text" value={manualCode} onChange={e => setManualCode(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && manualCode.trim()) { addProductToInvoice(manualCode.trim()); setManualCode(""); } }}
                placeholder="Product code or barcode..."
                className="flex-1 bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground font-mono" />
              <button onClick={() => { if (manualCode.trim()) { addProductToInvoice(manualCode.trim()); setManualCode(""); } }}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-semibold">Add</button>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button onClick={startProductScanning}
                className="flex-1 bg-success text-primary-foreground font-semibold py-3 rounded-md text-sm flex items-center justify-center gap-2">
                <ScanLine className="w-4 h-4" /> Scan Products
              </button>
              <button onClick={() => confirmInvoice(false)}
                className="flex-1 bg-primary text-primary-foreground font-semibold py-3 rounded-md text-sm flex items-center justify-center gap-2">
                <Check className="w-4 h-4" /> Done
              </button>
            </div>
          </div>
        )}

        {/* SCANNING VIEW */}
        {view === "scanning" && (
          <div className="space-y-3">
            <div className="relative bg-card border border-border rounded-lg overflow-hidden">
              <video ref={videoRef} className="w-full aspect-video object-cover" playsInline muted />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 border-2 border-success/60 rounded-lg" />
              </div>
              <div className="absolute top-2 left-2 bg-background/80 backdrop-blur text-xs font-mono text-primary px-2 py-1 rounded">
                INV: {invoiceNo}
              </div>
              <div className="absolute top-2 right-2">
                <button onClick={toggleTorch} className="bg-background/80 backdrop-blur p-2 rounded-md">
                  {torchOn ? <Flashlight className="w-4 h-4 text-warning" /> : <FlashlightOff className="w-4 h-4 text-muted-foreground" />}
                </button>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-brand-header border-b border-border">
                <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Scan Progress</span>
              </div>
              {items.map((item, idx) => {
                const complete = item.scannedQty >= item.qty;
                return (
                  <div key={idx} className={`px-3 py-2 border-b border-border/50 flex items-center gap-2 ${complete ? "bg-success/10" : ""}`}>
                    {complete ? <Check className="w-4 h-4 text-success shrink-0" /> : <div className="w-4 h-4 rounded-full border-2 border-muted-foreground shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{item.productName}</p>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">{item.scannedQty}/{item.qty}</span>
                  </div>
                );
              })}
            </div>

            {allScanned && (
              <button onClick={() => confirmInvoice(true)}
                className="w-full bg-success text-primary-foreground font-semibold py-3 rounded-md text-sm flex items-center justify-center gap-2 animate-slide-up">
                <Check className="w-5 h-5" /> All Scanned — Done
              </button>
            )}

            <button onClick={() => { stopCamera(); setView("details"); }}
              className="w-full bg-secondary text-secondary-foreground font-semibold py-2.5 rounded-md text-sm">
              ← Back to Details
            </button>
          </div>
        )}

        {/* COMPLETED INVOICE VIEW */}
        {view === "completed-view" && activeInvoice && (
          <div className="space-y-3">
            <div className="bg-card border border-border rounded-lg p-4 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase">Invoice</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  activeInvoice.status === "done" ? "bg-success/20 text-success" :
                  activeInvoice.status === "edited" ? "bg-warning/20 text-warning" :
                  "bg-destructive/20 text-destructive"
                }`}>
                  {activeInvoice.status.toUpperCase()}
                </span>
              </div>
              <p className="font-mono text-lg text-primary font-bold">{activeInvoice.invoiceNo}</p>
              <p className="text-sm text-foreground">{activeInvoice.customerName || "—"}</p>
              <p className="text-xs text-muted-foreground">{activeInvoice.date} · {activeInvoice.time}</p>
            </div>

            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-brand-header border-b border-border">
                <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Items ({activeInvoice.items.length})</span>
              </div>
              {activeInvoice.items.map((item, idx) => (
                <div key={idx} className="px-3 py-2 border-b border-border/50 flex items-center gap-2">
                  <span className="font-mono text-xs text-primary w-16">{item.productCode}</span>
                  <span className="flex-1 text-sm text-foreground truncate">{item.productName}</span>
                  <span className="font-mono text-xs text-muted-foreground">{item.qty} {item.unit}</span>
                </div>
              ))}
            </div>

            {activeInvoice.status !== "cancelled" && (
              <div className="space-y-2">
                <button onClick={handleEditInvoice}
                  className="w-full bg-warning/20 text-warning font-semibold py-2.5 rounded-md text-sm flex items-center justify-center gap-2">
                  <Edit3 className="w-4 h-4" /> Edit Quantities
                </button>
                <button onClick={handleCancelInvoice}
                  className="w-full bg-destructive/20 text-destructive font-semibold py-2.5 rounded-md text-sm flex items-center justify-center gap-2">
                  <Ban className="w-4 h-4" /> Cancel Invoice
                </button>
              </div>
            )}

            <button onClick={() => { setActiveInvoice(null); setView("main"); }}
              className="w-full bg-secondary text-secondary-foreground font-semibold py-2.5 rounded-md text-sm flex items-center justify-center gap-2">
              <X className="w-4 h-4" /> Close
            </button>
          </div>
        )}

        {/* MARKET RETURNS */}
        {view === "returns" && (
          <div className="space-y-3">
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Market Returns</h2>
              <input type="text" value={returnCustomer} onChange={e => setReturnCustomer(e.target.value)}
                placeholder="Customer / Market Name"
                className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground" />
              <input type="text" value={returnDriver} onChange={e => setReturnDriver(e.target.value)}
                placeholder="Driver Name"
                className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground" />
              <input type="text" value={returnVoucher} onChange={e => setReturnVoucher(e.target.value)}
                placeholder="Return Voucher Number"
                className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Date & time recorded automatically</p>
            </div>

            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">Add Returned Products</h3>
                <button onClick={returnScanning ? stopReturnScanning : startReturnScanning}
                  className={`text-xs font-semibold px-2.5 py-1.5 rounded-md flex items-center gap-1 ${returnScanning ? "bg-destructive/20 text-destructive" : "bg-primary/20 text-primary"}`}>
                  <Camera className="w-3 h-3" /> {returnScanning ? "Stop Scan" : "Scan Barcode"}
                </button>
              </div>

              {returnScanning && (
                <div className="relative rounded-lg overflow-hidden border border-border">
                  <video ref={videoRef} className="w-full aspect-video object-cover" playsInline muted />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-12 border-2 border-success/60 rounded-lg" />
                  </div>
                </div>
              )}

              <input type="text" value={returnManualCode} onChange={e => setReturnManualCode(e.target.value)}
                placeholder="Or enter code manually..."
                className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground font-mono" />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Quantity</label>
                  <input type="number" value={returnQty} onChange={e => setReturnQty(Math.max(1, parseInt(e.target.value) || 1))}
                    min="1"
                    className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Expiry Date</label>
                  <input type="date" value={returnExpiry} onChange={e => setReturnExpiry(e.target.value)}
                    className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
              </div>

              <button onClick={addReturnProduct}
                className="w-full bg-primary text-primary-foreground font-semibold py-2.5 rounded-md text-sm">
                + Add Product
              </button>
            </div>

            {returnItems.length > 0 && (
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-brand-header border-b border-border">
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Return Items ({returnItems.length})</span>
                </div>
                {returnItems.map((item, idx) => (
                  <div key={idx} className="px-3 py-2 border-b border-border/50 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-xs text-primary">{item.productCode}</span>
                      <p className="text-sm text-foreground truncate">{item.productName}</p>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">{item.qty} {item.unit}</span>
                    <button onClick={() => setReturnItems(prev => prev.filter((_, i) => i !== idx))} className="text-destructive">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <div className="p-3">
                  <button onClick={confirmReturn}
                    className="w-full bg-success text-primary-foreground font-semibold py-2.5 rounded-md text-sm flex items-center justify-center gap-2">
                    <Check className="w-4 h-4" /> Confirm Return
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
