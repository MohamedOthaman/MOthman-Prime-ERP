import { useState, useRef, useEffect, useCallback } from "react";
import { ShoppingCart, X, Check, Plus, Minus, ScanLine, Flashlight, FlashlightOff } from "lucide-react";
import { useStockContext } from "@/contexts/StockContext";
import { InvoiceItem, Invoice } from "@/data/stockData";
import { toast } from "sonner";
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from "@zxing/library";

interface SaleItem {
  productCode: string;
  productName: string;
  qty: number;
  unit: string;
}

type SaleStep = "invoice-scan" | "product-scan" | "review";

export default function SaleMode() {
  const { findProduct, findProductByBarcode, deductFIFO, addInvoice } = useStockContext();
  const [step, setStep] = useState<SaleStep>("invoice-scan");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [items, setItems] = useState<SaleItem[]>([]);
  const [manualCode, setManualCode] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastScanRef = useRef<number>(0);
  const lastBarcodeRef = useRef<string>("");
  const scanModeRef = useRef<"invoice" | "product">("invoice");

  const stopCamera = useCallback(() => {
    if (readerRef.current) {
      readerRef.current.reset();
      readerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const startScanning = useCallback(async (mode: "invoice" | "product") => {
    stopCamera();
    scanModeRef.current = mode;

    try {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      const reader = new BrowserMultiFormatReader(hints);
      readerRef.current = reader;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Continuous decode loop
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

                if (scanModeRef.current === "invoice") {
                  handleInvoiceScan(text);
                } else {
                  handleProductScan(text);
                }
              }
            }
          } catch {
            // No barcode found in frame, continue scanning
          }
          await new Promise(r => setTimeout(r, 100));
        }
      };
      scanLoop();
    } catch (e) {
      toast.error("Cannot access camera");
    }
  }, [stopCamera]);

  const handleInvoiceScan = (barcode: string) => {
    setInvoiceNo(barcode);
    toast.success(`Invoice: ${barcode}`);
    // Auto proceed to product scanning
    setTimeout(() => {
      setStep("product-scan");
      scanModeRef.current = "product";
    }, 300);
  };

  const handleProductScan = useCallback((barcode: string) => {
    // Try barcode first, then product code
    const found = findProductByBarcode(barcode) || findProduct(barcode.toUpperCase());
    if (!found) {
      toast.error(`Product not found: ${barcode}`);
      return;
    }
    setItems(prev => {
      const existing = prev.findIndex(i => i.productCode === found.product.code);
      if (existing >= 0) {
        return prev.map((item, i) =>
          i === existing ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, {
        productCode: found.product.code,
        productName: found.product.name,
        qty: 1,
        unit: found.product.batches[0]?.unit || "PCS",
      }];
    });
    toast.success(`Added ${found.product.name}`);
  }, [findProduct, findProductByBarcode]);

  const handleInvoiceSubmit = () => {
    if (!invoiceNo.trim()) {
      toast.error("Enter invoice number");
      return;
    }
    setStep("product-scan");
    startScanning("product");
  };

  const startInvoiceScan = () => {
    startScanning("invoice");
  };

  const addProduct = (code: string) => {
    const found = findProductByBarcode(code) || findProduct(code.toUpperCase());
    if (!found) {
      toast.error(`Product ${code} not found`);
      return;
    }
    const existing = items.findIndex(i => i.productCode === found.product.code);
    if (existing >= 0) {
      setItems(prev => prev.map((item, i) =>
        i === existing ? { ...item, qty: item.qty + 1 } : item
      ));
    } else {
      setItems(prev => [...prev, {
        productCode: found.product.code,
        productName: found.product.name,
        qty: 1,
        unit: found.product.batches[0]?.unit || "PCS",
      }]);
    }
    toast.success(`Added ${found.product.name}`);
  };

  const handleManualAdd = () => {
    if (manualCode.trim()) {
      addProduct(manualCode.trim());
      setManualCode("");
    }
  };

  const updateQty = (idx: number, delta: number) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const newQty = Math.max(1, item.qty + delta);
      return { ...item, qty: newQty };
    }));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const toggleTorch = async () => {
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track) {
        try {
          await (track as any).applyConstraints({
            advanced: [{ torch: !torchOn } as any],
          });
          setTorchOn(!torchOn);
        } catch {
          toast.error("Torch not supported");
        }
      }
    }
  };

  const confirmInvoice = () => {
    if (items.length === 0) {
      toast.error("No items to invoice");
      return;
    }
    stopCamera();

    const allDeductions: Invoice["deductionLog"] = [];
    const invoiceItems: InvoiceItem[] = [];

    for (const item of items) {
      const result = deductFIFO(item.productCode, item.qty, item.unit, invoiceNo);
      allDeductions.push(...result.deductionLog);
      for (const d of result.deductionLog) {
        invoiceItems.push({
          productCode: item.productCode,
          productName: item.productName,
          qty: d.qty,
          unit: d.unit,
          batchNo: d.batchNo,
          expiryDate: d.expiryDate,
        });
      }
    }

    const now = new Date();
    addInvoice({
      invoiceNo,
      date: now.toISOString().split("T")[0],
      time: now.toLocaleTimeString(),
      items: invoiceItems,
      type: "OUT",
      deductionLog: allDeductions,
    });

    toast.success(`Invoice ${invoiceNo} confirmed`);
    setInvoiceNo("");
    setItems([]);
    setStep("invoice-scan");
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground tracking-tight">Sale Mode</h1>
          {items.length > 0 && (
            <span className="ml-auto bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">
              {items.length}
            </span>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4">
        {step === "invoice-scan" && (
          <div className="space-y-4">
            {/* Camera for invoice barcode scanning */}
            <div className="relative bg-card border border-border rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                className="w-full aspect-video object-cover"
                playsInline
                muted
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-64 h-16 border-2 border-primary/60 rounded-lg" />
              </div>
              <div className="absolute top-2 right-2 flex gap-2">
                <button
                  onClick={toggleTorch}
                  className="bg-background/80 backdrop-blur p-2 rounded-md"
                >
                  {torchOn ? <Flashlight className="w-4 h-4 text-warning" /> : <FlashlightOff className="w-4 h-4 text-muted-foreground" />}
                </button>
              </div>
            </div>

            <button
              onClick={startInvoiceScan}
              className="w-full bg-secondary text-secondary-foreground font-semibold py-2 rounded-md text-sm"
            >
              <ScanLine className="w-4 h-4 inline mr-1" />
              Start Camera Scan for Invoice
            </button>

            <div className="bg-card border border-border rounded-lg p-4">
              <label className="text-sm font-semibold text-foreground block mb-2">
                <ScanLine className="w-4 h-4 inline mr-1" />
                Or Type Invoice Number
              </label>
              <input
                type="text"
                value={invoiceNo}
                onChange={e => setInvoiceNo(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleInvoiceSubmit()}
                placeholder="Scan or type invoice number..."
                className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2.5 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground font-mono"
                autoFocus
              />
              <button
                onClick={handleInvoiceSubmit}
                className="mt-3 w-full bg-primary text-primary-foreground font-semibold py-2.5 rounded-md text-sm hover:opacity-90 transition-opacity"
              >
                Start Scanning Products
              </button>
            </div>
          </div>
        )}

        {step === "product-scan" && (
          <div className="space-y-3">
            {/* Camera View */}
            <div className="relative bg-card border border-border rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                className="w-full aspect-video object-cover"
                playsInline
                muted
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 border-2 border-primary/60 rounded-lg" />
              </div>
              <div className="absolute top-2 left-2 bg-background/80 backdrop-blur text-xs font-mono text-primary px-2 py-1 rounded">
                INV: {invoiceNo}
              </div>
              <div className="absolute top-2 right-2 flex gap-2">
                <button
                  onClick={toggleTorch}
                  className="bg-background/80 backdrop-blur p-2 rounded-md"
                >
                  {torchOn ? <Flashlight className="w-4 h-4 text-warning" /> : <FlashlightOff className="w-4 h-4 text-muted-foreground" />}
                </button>
              </div>
            </div>

            {/* Manual entry */}
            <div className="flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleManualAdd()}
                placeholder="Type product code or barcode..."
                className="flex-1 bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground font-mono"
              />
              <button
                onClick={handleManualAdd}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-semibold"
              >
                Add
              </button>
            </div>

            {/* Item list overlay */}
            {items.length > 0 && (
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-brand-header border-b border-border">
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    Invoice Items ({items.length})
                  </span>
                </div>
                {items.map((item, idx) => (
                  <div key={idx} className="px-3 py-2 border-b border-border/50 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-xs text-primary">{item.productCode}</span>
                      <p className="text-sm text-foreground truncate">{item.productName}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQty(idx, -1)} className="w-7 h-7 rounded bg-secondary flex items-center justify-center text-foreground">
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-mono text-sm w-8 text-center text-foreground">{item.qty}</span>
                      <button onClick={() => updateQty(idx, 1)} className="w-7 h-7 rounded bg-secondary flex items-center justify-center text-foreground">
                        <Plus className="w-3 h-3" />
                      </button>
                      <span className="text-xs text-muted-foreground ml-1">{item.unit}</span>
                    </div>
                    <button onClick={() => removeItem(idx)} className="text-destructive">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <div className="p-3">
                  <button
                    onClick={confirmInvoice}
                    className="w-full bg-success text-primary-foreground font-semibold py-2.5 rounded-md text-sm flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Confirm Invoice
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
