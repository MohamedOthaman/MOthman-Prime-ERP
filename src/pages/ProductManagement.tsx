import { useState, useRef } from "react";
import { Settings, Plus, Edit3, X, Check, Search, Barcode, Camera, Trash2, ChevronDown, ChevronUp, CalendarIcon } from "lucide-react";
import { useStockContext } from "@/contexts/StockContext";
import { Product, Batch, StorageType } from "@/data/stockData";
import { StorageBadge } from "@/components/StorageBadge";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { DateWheel } from "@/components/WheelPicker";
import { useLang } from "@/contexts/LanguageContext";
import { LanguageToggle } from "@/components/LanguageToggle";

type View = "list" | "add" | "edit";

const storageOptions: { label: string; value: StorageType }[] = [
  { label: "❄️ Frozen", value: "Frozen" },
  { label: "🧊 Chilled", value: "Chilled" },
  { label: "📦 Dry", value: "Dry" },
];

const unitOptions = ["CTN", "PCS", "BAG", "KG", "TIN", "PAIL", "BTL", "BLK", "BOX"];

interface BatchForm {
  batchNo: string;
  qty: number;
  unit: string;
  productionDate: string;
  expiryDate: string;
  receivedDate: string;
}

const emptyBatch = (): BatchForm => ({
  batchNo: "",
  qty: 1,
  unit: "CTN",
  productionDate: "",
  expiryDate: "",
  receivedDate: new Date().toISOString().split("T")[0],
});

export default function ProductManagement() {
  const { stock, addProduct, updateProduct } = useStockContext();
  const { t, lang } = useLang();
  const { videoRef, startScanning, stopCamera } = useBarcodeScanner();
  const [view, setView] = useState<View>("list");
  const [search, setSearch] = useState("");
  const [brandName, setBrandName] = useState("");
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  // Product form
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [packaging, setPackaging] = useState("");
  const [storageType, setStorageType] = useState<StorageType>("Dry");
  const [barcodes, setBarcodes] = useState<string[]>([]);
  const [cartonHolds, setCartonHolds] = useState<number | undefined>();
  const [batches, setBatches] = useState<BatchForm[]>([]);
  const [newBarcode, setNewBarcode] = useState("");
  const [expandedBatch, setExpandedBatch] = useState<number | null>(null);

  const allProducts = stock.flatMap(brand =>
    brand.products.map(p => ({ ...p, brand: brand.name }))
  );

  const filtered = allProducts.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.code.toLowerCase().includes(search.toLowerCase())
  );

  const resetForm = () => {
    setCode(""); setName(""); setPackaging(""); setStorageType("Dry");
    setBarcodes([]); setCartonHolds(undefined); setBatches([]);
    setNewBarcode(""); setExpandedBatch(null); setBrandName("");
    setEditingCode(null);
  };

  const startAdd = () => {
    resetForm();
    setView("add");
  };

  const startEdit = (product: Product & { brand: string }) => {
    setCode(product.code);
    setName(product.name);
    setPackaging(product.packaging);
    setStorageType(product.storageType);
    setBarcodes(product.barcodes || []);
    setCartonHolds(product.cartonHolds);
    setBatches(product.batches.map(b => ({
      batchNo: b.batchNo,
      qty: b.qty,
      unit: b.unit,
      productionDate: b.productionDate,
      expiryDate: b.expiryDate,
      receivedDate: b.receivedDate,
    })));
    setBrandName(product.brand);
    setEditingCode(product.code);
    setView("edit");
  };

  const addBarcodeToForm = () => {
    if (!newBarcode.trim()) return;
    if (barcodes.includes(newBarcode.trim())) { toast.error("Barcode already added"); return; }
    setBarcodes(prev => [...prev, newBarcode.trim()]);
    setNewBarcode("");
  };

  const startBarcodeScanning = () => {
    setScanning(true);
    startScanning((barcode) => {
      if (!barcodes.includes(barcode)) {
        setBarcodes(prev => [...prev, barcode]);
        toast.success(`Barcode added: ${barcode}`);
      } else {
        toast.info("Barcode already exists");
      }
    });
  };

  const stopBarcodeScanning = () => {
    stopCamera();
    setScanning(false);
  };

  const addBatch = () => {
    setBatches(prev => [...prev, emptyBatch()]);
    setExpandedBatch(batches.length);
  };

  const updateBatch = (idx: number, field: keyof BatchForm, value: any) => {
    setBatches(prev => prev.map((b, i) => i === idx ? { ...b, [field]: value } : b));
  };

  const removeBatch = (idx: number) => {
    setBatches(prev => prev.filter((_, i) => i !== idx));
    setExpandedBatch(null);
  };

  const handleSave = async () => {
    if (!code.trim()) { toast.error("Product Code required"); return; }
    if (!name.trim()) { toast.error("Product Name required"); return; }
    if (!brandName.trim()) { toast.error("Brand required"); return; }

    const product: Product = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      packaging: packaging.trim(),
      storageType,
      batches: batches.map(b => ({
        ...b,
        daysLeft: 0,
      })),
      barcodes,
      cartonHolds,
      totalQty: [],
      nearestExpiryDays: 999,
    };

    const map: Record<string, number> = {};
    product.batches.forEach(b => { map[b.unit] = (map[b.unit] || 0) + b.qty; });
    product.totalQty = Object.entries(map).map(([unit, amount]) => ({ unit, amount }));

    if (view === "edit" && editingCode) {
      await updateProduct(editingCode, product, brandName.trim());
      toast.success("Product updated");
    } else {
      await addProduct(brandName.trim(), product);
      toast.success("Product added");
    }

    resetForm();
    setView("list");
  };

  const cancel = () => {
    stopCamera();
    setScanning(false);
    resetForm();
    setView("list");
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground tracking-tight">Product Management</h1>
          {view === "list" && (
            <button onClick={startAdd} className="ml-auto bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add
            </button>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4">
        {view === "list" && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search products..."
                className="w-full bg-secondary text-foreground text-sm rounded-md pl-9 pr-3 py-2.5 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
              />
            </div>

            <p className="text-xs text-muted-foreground">{filtered.length} products</p>

            {filtered.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">No products found</div>
            ) : (
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                {filtered.map((p) => (
                  <button
                    key={p.code}
                    onClick={() => startEdit(p)}
                    className="w-full text-left px-3 py-3 border-b border-border/50 last:border-b-0 hover:bg-row-hover transition-colors flex items-center gap-2"
                  >
                    <span className="font-mono text-xs text-primary w-16 shrink-0">{p.code}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.brand} · {p.batches.length} batches · {p.totalQty.map(q => `${q.amount} ${q.unit}`).join(", ") || "0"}</p>
                    </div>
                    <StorageBadge type={p.storageType} />
                    <Edit3 className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {(view === "add" || view === "edit") && (
          <div className="space-y-4">
            {/* Basic Info */}
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                {view === "add" ? "Add New Product" : "Edit Product"}
              </h2>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">Brand *</label>
                <input type="text" value={brandName} onChange={e => setBrandName(e.target.value)}
                  placeholder="e.g. Monin" list="brand-suggestions"
                  className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2.5 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground" />
                <datalist id="brand-suggestions">
                  {stock.map(b => <option key={b.name} value={b.name} />)}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Product Code *</label>
                  <input type="text" value={code} onChange={e => setCode(e.target.value)}
                    placeholder="e.g. MN001" disabled={view === "edit"}
                    className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2.5 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground font-mono disabled:opacity-50" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Packaging</label>
                  <div className="flex flex-wrap gap-1">
                    {unitOptions.map(u => {
                      const selected = packaging.split(" / ").includes(u);
                      return (
                        <button key={u} type="button" onClick={() => {
                          const current = packaging ? packaging.split(" / ").filter(Boolean) : [];
                          const next = selected ? current.filter(c => c !== u) : [...current, u];
                          setPackaging(next.join(" / "));
                        }}
                          className={`text-xs font-semibold px-2.5 py-1.5 rounded-md transition-colors ${selected ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground border border-border"}`}>
                          {u}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">Product Name *</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Monin Mango Syrup 700ml"
                  className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2.5 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Storage Type</label>
                  <div className="flex gap-1">
                    {storageOptions.map(opt => (
                      <button key={opt.value} onClick={() => setStorageType(opt.value)}
                        className={`flex-1 text-xs font-semibold py-2 rounded-md transition-colors ${storageType === opt.value ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Carton Holds</label>
                  <input type="number" value={cartonHolds || ""} onChange={e => setCartonHolds(e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="pcs" min="1"
                    className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2.5 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground" />
                </div>
              </div>
            </div>

            {/* Barcodes */}
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1">
                  <Barcode className="w-3.5 h-3.5" /> Barcodes ({barcodes.length})
                </h3>
                <button onClick={scanning ? stopBarcodeScanning : startBarcodeScanning}
                  className={`text-xs font-semibold px-2 py-1 rounded-md flex items-center gap-1 ${scanning ? "bg-destructive/20 text-destructive" : "bg-primary/20 text-primary"}`}>
                  <Camera className="w-3 h-3" /> {scanning ? "Stop" : "Scan"}
                </button>
              </div>

              {scanning && (
                <div className="relative rounded-lg overflow-hidden border border-border">
                  <video ref={videoRef} className="w-full aspect-video object-cover" playsInline muted />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-12 border-2 border-primary/60 rounded-lg" />
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <input type="text" value={newBarcode} onChange={e => setNewBarcode(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addBarcodeToForm())}
                  placeholder="Enter barcode..."
                  className="flex-1 bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground font-mono" />
                <button onClick={addBarcodeToForm} className="bg-primary text-primary-foreground px-3 py-2 rounded-md text-xs font-semibold">Add</button>
              </div>

              {barcodes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {barcodes.map(bc => (
                    <span key={bc} className="inline-flex items-center gap-1 bg-secondary text-secondary-foreground text-xs font-mono px-2 py-1 rounded">
                      {bc}
                      <button onClick={() => setBarcodes(prev => prev.filter(b => b !== bc))} className="text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Batches */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between border-b border-border">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  Batches ({batches.length})
                </h3>
                <button onClick={addBatch} className="text-xs font-semibold text-primary flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add Batch
                </button>
              </div>

              {batches.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No batches. Tap "Add Batch" to create one.
                </div>
              )}

              {batches.map((batch, idx) => (
                <div key={idx} className="border-b border-border/50 last:border-b-0">
                  <button
                    onClick={() => setExpandedBatch(expandedBatch === idx ? null : idx)}
                    className="w-full px-4 py-2.5 flex items-center gap-2 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground font-mono">{batch.batchNo || "New Batch"}</p>
                      <p className="text-xs text-muted-foreground">
                        {batch.qty} {batch.unit} · Exp: {batch.expiryDate || "—"}
                      </p>
                    </div>
                    {expandedBatch === idx ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>

                  {expandedBatch === idx && (
                    <div className="px-4 pb-3 space-y-2 bg-muted/30">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Batch No *</label>
                          <input type="text" value={batch.batchNo} onChange={e => updateBatch(idx, "batchNo", e.target.value)}
                            placeholder="B-001"
                            className="w-full bg-secondary text-foreground text-sm rounded-md px-2.5 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground font-mono" />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Unit</label>
                          <select value={batch.unit} onChange={e => updateBatch(idx, "unit", e.target.value)}
                            className="w-full bg-secondary text-foreground text-sm rounded-md px-2.5 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring">
                            {(packaging ? packaging.split(" / ").filter(Boolean) : unitOptions).map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Quantity</label>
                        <input type="number" value={batch.qty} onChange={e => updateBatch(idx, "qty", Math.max(0, parseInt(e.target.value) || 0))}
                          min="0"
                          className="w-full bg-secondary text-foreground text-sm rounded-md px-2.5 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Production Date</label>
                          <Drawer>
                            <DrawerTrigger asChild>
                              <Button variant="outline" className={cn("w-full justify-start text-left text-sm font-normal h-9 bg-secondary border-border", !batch.productionDate && "text-muted-foreground")}>
                                <CalendarIcon className="mr-1.5 h-3.5 w-3.5 opacity-60" />
                                {batch.productionDate ? format(new Date(batch.productionDate), "dd/MM/yyyy") : "Select"}
                              </Button>
                            </DrawerTrigger>
                            <DrawerContent className="px-4 pb-8">
                              <div className="mt-4">
                                <DateWheel value={batch.productionDate || format(new Date(), "yyyy-MM-dd")} onChange={v => updateBatch(idx, "productionDate", v)} label="Production Date" />
                              </div>
                            </DrawerContent>
                          </Drawer>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Expiry Date *</label>
                          <Drawer>
                            <DrawerTrigger asChild>
                              <Button variant="outline" className={cn("w-full justify-start text-left text-sm font-normal h-9 bg-secondary border-border", !batch.expiryDate && "text-muted-foreground")}>
                                <CalendarIcon className="mr-1.5 h-3.5 w-3.5 opacity-60" />
                                {batch.expiryDate ? format(new Date(batch.expiryDate), "dd/MM/yyyy") : "Select"}
                              </Button>
                            </DrawerTrigger>
                            <DrawerContent className="px-4 pb-8">
                              <div className="mt-4">
                                <DateWheel value={batch.expiryDate || format(new Date(), "yyyy-MM-dd")} onChange={v => updateBatch(idx, "expiryDate", v)} label="Expiry Date" />
                              </div>
                            </DrawerContent>
                          </Drawer>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Received Date</label>
                        <Drawer>
                          <DrawerTrigger asChild>
                            <Button variant="outline" className={cn("w-full justify-start text-left text-sm font-normal h-9 bg-secondary border-border", !batch.receivedDate && "text-muted-foreground")}>
                              <CalendarIcon className="mr-1.5 h-3.5 w-3.5 opacity-60" />
                              {batch.receivedDate ? format(new Date(batch.receivedDate), "dd/MM/yyyy") : "Select"}
                            </Button>
                          </DrawerTrigger>
                          <DrawerContent className="px-4 pb-8">
                            <div className="mt-4">
                              <DateWheel value={batch.receivedDate || format(new Date(), "yyyy-MM-dd")} onChange={v => updateBatch(idx, "receivedDate", v)} label="Received Date" />
                            </div>
                          </DrawerContent>
                        </Drawer>
                      </div>
                      <button onClick={() => removeBatch(idx)}
                        className="w-full bg-destructive/10 text-destructive font-semibold py-2 rounded-md text-xs flex items-center justify-center gap-1">
                        <Trash2 className="w-3 h-3" /> Remove Batch
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Save/Cancel */}
            <div className="flex gap-2">
              <button onClick={cancel} className="flex-1 bg-secondary text-secondary-foreground font-semibold py-3 rounded-md text-sm">
                Cancel
              </button>
              <button onClick={handleSave} className="flex-1 bg-success text-primary-foreground font-semibold py-3 rounded-md text-sm flex items-center justify-center gap-1">
                <Check className="w-4 h-4" /> {view === "add" ? "Add Product" : "Save Changes"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
