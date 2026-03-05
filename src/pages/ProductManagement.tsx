import { useState } from "react";
import { Settings, Plus, Edit3, X, Check, Search, Barcode } from "lucide-react";
import { useStockContext } from "@/contexts/StockContext";
import { Product, StorageType } from "@/data/stockData";
import { StorageBadge } from "@/components/StorageBadge";
import { DateWheel, NumberWheel, WheelPicker } from "@/components/WheelPicker";
import { toast } from "sonner";

type View = "list" | "add" | "edit";

const storageOptions = [
  { label: "F - Frozen", value: "Frozen" },
  { label: "C - Chilled", value: "Chilled" },
  { label: "D - Dry", value: "Dry" },
];

const emptyProduct: Omit<Product, "nearestExpiryDays" | "totalQty"> = {
  code: "",
  name: "",
  packaging: "",
  storageType: "Dry",
  batches: [],
  barcodes: [],
  cartonHolds: undefined,
};

export default function ProductManagement() {
  const { stock, addProduct, updateProduct } = useStockContext();
  const [view, setView] = useState<View>("list");
  const [search, setSearch] = useState("");
  const [brandName, setBrandName] = useState("");
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyProduct });
  const [newBarcode, setNewBarcode] = useState("");
  const [showCartonPicker, setShowCartonPicker] = useState(false);

  const allProducts = stock.flatMap(brand =>
    brand.products.map(p => ({ ...p, brand: brand.name }))
  );

  const filtered = allProducts.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.code.toLowerCase().includes(search.toLowerCase())
  );

  const startAdd = () => {
    setForm({ ...emptyProduct, barcodes: [] });
    setBrandName("");
    setView("add");
  };

  const startEdit = (product: Product & { brand: string }) => {
    setForm({
      code: product.code,
      name: product.name,
      packaging: product.packaging,
      storageType: product.storageType,
      batches: product.batches,
      barcodes: product.barcodes || [],
      cartonHolds: product.cartonHolds,
    });
    setBrandName(product.brand);
    setEditingCode(product.code);
    setView("edit");
  };

  const addBarcodeToForm = () => {
    if (!newBarcode.trim()) return;
    if (form.barcodes?.includes(newBarcode.trim())) {
      toast.error("Barcode already added");
      return;
    }
    setForm(prev => ({
      ...prev,
      barcodes: [...(prev.barcodes || []), newBarcode.trim()],
    }));
    setNewBarcode("");
  };

  const removeBarcode = (bc: string) => {
    setForm(prev => ({
      ...prev,
      barcodes: (prev.barcodes || []).filter(b => b !== bc),
    }));
  };

  const handleSave = () => {
    if (!form.code.trim()) { toast.error("Product Code required"); return; }
    if (!form.name.trim()) { toast.error("Product Name required"); return; }
    if (!brandName.trim()) { toast.error("Brand required"); return; }

    const product: Product = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      packaging: form.packaging.trim(),
      storageType: form.storageType,
      batches: form.batches,
      barcodes: form.barcodes,
      cartonHolds: form.cartonHolds,
      totalQty: [],
      nearestExpiryDays: 999,
    };

    const map: Record<string, number> = {};
    product.batches.forEach(b => { map[b.unit] = (map[b.unit] || 0) + b.qty; });
    product.totalQty = Object.entries(map).map(([unit, amount]) => ({ unit, amount }));

    if (view === "edit" && editingCode) {
      updateProduct(editingCode, product, brandName.trim());
      toast.success("Product updated");
    } else {
      addProduct(brandName.trim(), product);
      toast.success("Product added");
    }

    setView("list");
    setEditingCode(null);
  };

  const cancel = () => {
    setView("list");
    setEditingCode(null);
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground tracking-tight">Product Management</h1>
          {view === "list" && (
            <button onClick={startAdd} className="ml-auto bg-primary text-primary-foreground px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1">
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
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search products..."
                className="w-full bg-secondary text-foreground text-sm rounded-md pl-9 pr-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
              />
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">No products found</div>
            ) : (
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                {filtered.map((p) => (
                  <button
                    key={p.code}
                    onClick={() => startEdit(p)}
                    className="w-full text-left px-3 py-2.5 border-b border-border/50 last:border-b-0 hover:bg-row-hover transition-colors flex items-center gap-2"
                  >
                    <span className="font-mono text-xs text-primary w-16 shrink-0">{p.code}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.brand} · {p.packaging}</p>
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
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                {view === "add" ? "Add New Product" : "Edit Product"}
              </h2>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">Brand *</label>
                <input
                  type="text"
                  value={brandName}
                  onChange={e => setBrandName(e.target.value)}
                  placeholder="e.g. Monin"
                  className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
                  list="brand-suggestions"
                />
                <datalist id="brand-suggestions">
                  {stock.map(b => <option key={b.name} value={b.name} />)}
                </datalist>
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">Product Code *</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={e => setForm(prev => ({ ...prev, code: e.target.value }))}
                  placeholder="e.g. MN001"
                  className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground font-mono"
                  disabled={view === "edit"}
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">Product Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Monin Mango Syrup 700ml"
                  className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
                />
              </div>

              {/* Storage Type Wheel */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Storage Type</label>
                <WheelPicker
                  items={storageOptions}
                  selectedValue={form.storageType}
                  onChange={(v) => setForm(prev => ({ ...prev, storageType: v as StorageType }))}
                  height={120}
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">Packaging Type</label>
                <input
                  type="text"
                  value={form.packaging}
                  onChange={e => setForm(prev => ({ ...prev, packaging: e.target.value }))}
                  placeholder="e.g. CTN / PCS"
                  className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
                />
              </div>

              {/* Carton Holds Wheel */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Carton Holds (optional)</label>
                <button
                  onClick={() => setShowCartonPicker(!showCartonPicker)}
                  className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border text-left"
                >
                  {form.cartonHolds ? `${form.cartonHolds} pcs` : "Tap to set"}
                </button>
                {showCartonPicker && (
                  <div className="mt-2">
                    <NumberWheel
                      value={form.cartonHolds || 1}
                      onChange={(v) => setForm(prev => ({ ...prev, cartonHolds: v }))}
                      min={1}
                      max={100}
                    />
                  </div>
                )}
              </div>

              {/* Barcodes */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  <Barcode className="w-3 h-3 inline mr-1" />
                  Barcodes
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newBarcode}
                    onChange={e => setNewBarcode(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addBarcodeToForm())}
                    placeholder="Enter barcode..."
                    className="flex-1 bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground font-mono"
                  />
                  <button
                    type="button"
                    onClick={addBarcodeToForm}
                    className="bg-primary text-primary-foreground px-3 py-2 rounded-md text-xs font-semibold"
                  >
                    Add
                  </button>
                </div>
                {(form.barcodes || []).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {form.barcodes!.map(bc => (
                      <span key={bc} className="inline-flex items-center gap-1 bg-secondary text-secondary-foreground text-xs font-mono px-2 py-1 rounded">
                        {bc}
                        <button onClick={() => removeBarcode(bc)} className="text-destructive hover:text-destructive/80">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={cancel} className="flex-1 bg-secondary text-secondary-foreground font-semibold py-2.5 rounded-md text-sm">
                Cancel
              </button>
              <button onClick={handleSave} className="flex-1 bg-success text-primary-foreground font-semibold py-2.5 rounded-md text-sm flex items-center justify-center gap-1">
                <Check className="w-4 h-4" /> {view === "add" ? "Add Product" : "Save Changes"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
