import { useState, useRef, useCallback } from "react";
import { Camera, Check, X, FileSearch, Edit3, Loader2 } from "lucide-react";
import { useStockContext } from "@/contexts/StockContext";
import { toast } from "sonner";
import Tesseract from "tesseract.js";

interface DetectedItem {
  productCode: string;
  productName: string;
  qty: number;
  unit: string;
  matched: boolean;
}

interface DetectedInvoice {
  invoiceNo: string;
  items: DetectedItem[];
}

export default function ScanInvoice() {
  const { stock, findProduct, deductFIFO, addInvoice } = useStockContext();
  const [photo, setPhoto] = useState<string | null>(null);
  const [detected, setDetected] = useState<DetectedInvoice | null>(null);
  const [processing, setProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Get all product codes from stock for matching
  const allProductCodes = useCallback(() => {
    const codes: string[] = [];
    stock.forEach(brand => {
      brand.products.forEach(product => {
        codes.push(product.code);
      });
    });
    return codes;
  }, [stock]);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      setPhoto(dataUrl);
      await performOCR(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const performOCR = async (imageData: string) => {
    setProcessing(true);
    setOcrProgress(0);

    try {
      const result = await Tesseract.recognize(imageData, "eng", {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setOcrProgress(Math.round((m.progress || 0) * 100));
          }
        },
      });

      const text = result.data.text;
      parseOCRResult(text);
    } catch (err) {
      toast.error("OCR failed. Please try a clearer image.");
      setProcessing(false);
    }
  };

  const parseOCRResult = (text: string) => {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    const productCodes = allProductCodes();

    // Extract invoice number: look for pattern of 4+ digits
    let invoiceNo = "";
    const invPatterns = [
      /inv[oice]*[:\s#-]*([A-Z0-9-]{4,})/i,
      /invoice[:\s#-]*([A-Z0-9-]{4,})/i,
      /\b(INV-?\d{4,})\b/i,
      /\b(\d{4,})\b/,
    ];
    for (const pattern of invPatterns) {
      const match = text.match(pattern);
      if (match) {
        invoiceNo = match[1];
        break;
      }
    }
    if (!invoiceNo) {
      invoiceNo = `OCR-${Date.now().toString().slice(-6)}`;
    }

    // Extract products by matching known codes
    const detectedItems: DetectedItem[] = [];
    for (const line of lines) {
      const upperLine = line.toUpperCase();
      for (const code of productCodes) {
        if (upperLine.includes(code.toUpperCase())) {
          // Try to extract quantity from same line
          const qtyMatch = line.match(/(\d+)\s*(CTN|PCS|BAG|KG|TIN|PAIL|BTL|BLK|BOX)/i);
          const numMatch = line.match(/\b(\d+)\b/);
          const found = findProduct(code);
          if (found && !detectedItems.find(d => d.productCode === code)) {
            detectedItems.push({
              productCode: code,
              productName: found.product.name,
              qty: qtyMatch ? parseInt(qtyMatch[1]) : (numMatch ? parseInt(numMatch[1]) : 1),
              unit: qtyMatch ? qtyMatch[2].toUpperCase() : (found.product.batches[0]?.unit || "PCS"),
              matched: true,
            });
          }
        }
      }
    }

    setDetected({
      invoiceNo,
      items: detectedItems,
    });
    setProcessing(false);

    if (detectedItems.length === 0) {
      toast.info("No matching products found. Please review and add manually.");
    } else {
      toast.success(`Found ${detectedItems.length} product(s). Review before confirming.`);
    }
  };

  const updateDetectedItem = (idx: number, field: keyof DetectedItem, value: string | number) => {
    if (!detected) return;
    setDetected({
      ...detected,
      items: detected.items.map((item, i) => {
        if (i !== idx) return item;
        if (field === "qty") return { ...item, qty: Number(value) || 1 };
        if (field === "productCode") {
          const found = findProduct(String(value).toUpperCase());
          return {
            ...item,
            productCode: String(value).toUpperCase(),
            productName: found?.product.name || item.productName,
            matched: !!found,
          };
        }
        return { ...item, [field]: value };
      }),
    });
  };

  const removeDetectedItem = (idx: number) => {
    if (!detected) return;
    setDetected({
      ...detected,
      items: detected.items.filter((_, i) => i !== idx),
    });
  };

  const addManualItem = () => {
    if (!detected) return;
    setDetected({
      ...detected,
      items: [...detected.items, {
        productCode: "",
        productName: "",
        qty: 1,
        unit: "PCS",
        matched: false,
      }],
    });
    setEditingIdx(detected.items.length);
  };

  const confirmDetected = () => {
    if (!detected || detected.items.length === 0) {
      toast.error("No items to process");
      return;
    }

    // Verify all items are matched
    const unmatched = detected.items.filter(i => !i.matched);
    if (unmatched.length > 0) {
      toast.error(`${unmatched.length} unmatched item(s). Fix product codes first.`);
      return;
    }

    for (const item of detected.items) {
      deductFIFO(item.productCode, item.qty, item.unit, detected.invoiceNo);
    }

    const now = new Date();
    addInvoice({
      invoiceNo: detected.invoiceNo,
      date: now.toISOString().split("T")[0],
      time: now.toLocaleTimeString(),
      items: detected.items.map(i => ({
        productCode: i.productCode,
        productName: i.productName,
        qty: i.qty,
        unit: i.unit,
        batchNo: "FIFO",
        expiryDate: "",
      })),
      type: "OUT",
      deductionLog: [],
    });

    toast.success(`Invoice ${detected.invoiceNo} processed`);
    setPhoto(null);
    setDetected(null);
  };

  const reset = () => {
    setPhoto(null);
    setDetected(null);
    setProcessing(false);
    setEditingIdx(null);
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <FileSearch className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground tracking-tight">AI Invoice Scan</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {!photo && (
          <div className="bg-card border border-border rounded-lg p-6 text-center">
            <Camera className="w-12 h-12 mx-auto mb-3 text-primary opacity-60" />
            <p className="text-sm text-muted-foreground mb-2">Take a photo of a paper invoice to auto-detect products using OCR</p>
            <p className="text-xs text-muted-foreground mb-4">Matches against your existing product database</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleCapture}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="bg-primary text-primary-foreground font-semibold px-6 py-2.5 rounded-md text-sm"
            >
              Capture Invoice Photo
            </button>
          </div>
        )}

        {photo && processing && (
          <div className="bg-card border border-border rounded-lg p-6 text-center">
            <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3 text-primary" />
            <p className="text-sm text-foreground mb-2">Analyzing invoice with OCR...</p>
            <div className="w-full bg-secondary rounded-full h-2 mb-1">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${ocrProgress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{ocrProgress}%</p>
          </div>
        )}

        {photo && detected && (
          <div className="space-y-3">
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <img src={photo} alt="Invoice" className="w-full max-h-48 object-cover opacity-60" />
            </div>

            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-brand-header border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  Detected Invoice: <span className="text-primary font-mono">{detected.invoiceNo}</span>
                </span>
                <button
                  onClick={addManualItem}
                  className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded"
                >
                  + Add Item
                </button>
              </div>

              {detected.items.length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                  No products detected. Add items manually.
                </div>
              )}

              {detected.items.map((item, idx) => (
                <div key={idx} className={`px-3 py-2.5 border-b border-border/50 ${!item.matched ? "bg-destructive/10" : ""}`}>
                  {editingIdx === idx ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={item.productCode}
                        onChange={e => updateDetectedItem(idx, "productCode", e.target.value)}
                        placeholder="Product code..."
                        className="w-full bg-secondary text-foreground text-sm rounded px-2 py-1 border border-border font-mono"
                      />
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={item.qty}
                          onChange={e => updateDetectedItem(idx, "qty", e.target.value)}
                          className="w-20 bg-secondary text-foreground text-sm rounded px-2 py-1 border border-border font-mono"
                          min={1}
                        />
                        <input
                          type="text"
                          value={item.unit}
                          onChange={e => updateDetectedItem(idx, "unit", e.target.value)}
                          className="w-20 bg-secondary text-foreground text-sm rounded px-2 py-1 border border-border font-mono"
                        />
                        <button
                          onClick={() => setEditingIdx(null)}
                          className="text-xs bg-primary text-primary-foreground px-3 py-1 rounded"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className={`font-mono text-xs w-16 ${item.matched ? "text-primary" : "text-destructive"}`}>
                        {item.productCode || "???"}
                      </span>
                      <span className="text-sm text-foreground flex-1 truncate">
                        {item.productName || "Unknown product"}
                      </span>
                      <span className="font-mono text-sm text-secondary-foreground">{item.qty} {item.unit}</span>
                      <button onClick={() => setEditingIdx(idx)} className="text-muted-foreground hover:text-foreground">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => removeDetectedItem(idx)} className="text-destructive">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}

              <div className="p-3 flex gap-2">
                <button
                  onClick={reset}
                  className="flex-1 bg-secondary text-secondary-foreground font-semibold py-2.5 rounded-md text-sm flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" /> Cancel
                </button>
                <button
                  onClick={confirmDetected}
                  className="flex-1 bg-success text-primary-foreground font-semibold py-2.5 rounded-md text-sm flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" /> Confirm & Deduct
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
