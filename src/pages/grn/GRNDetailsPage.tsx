// This is effectively an editable page and may later be renamed to GRNEditPage.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2, Plus, Save, Trash2, AlertTriangle } from "lucide-react";

type GRNStatus = "draft" | "completed" | "cancelled";

interface SupplierOption {
  id: string;
  name: string;
}

interface ProductOption {
  id: string;
  code: string;
  name: string;
}

interface GRNLineForm {
  id?: string;
  product_id: string;
  product_code: string;
  product_name: string;
  qty: string;
  unit: string;
  notes: string;
}

interface HeaderRow {
  id: string;
  grn_no: string;
  supplier_id: string | null;
  status: GRNStatus;
  reference_no: string | null;
  received_date: string;
  notes: string | null;
}

const EMPTY_LINE: GRNLineForm = {
  product_id: "",
  product_code: "",
  product_name: "",
  qty: "0",
  unit: "PCS",
  notes: "",
};

function createEmptyLine(): GRNLineForm {
  return { ...EMPTY_LINE };
}

function parseQty(value: string) {
  return Number(value || 0);
}

function isLineEmpty(line: GRNLineForm) {
  return (
    !line.product_id &&
    !line.product_code.trim() &&
    !line.product_name.trim() &&
    !line.notes.trim() &&
    parseQty(line.qty) <= 0
  );
}

function normalizeLineForSave(line: GRNLineForm, index: number, headerId: string) {
  return {
    header_id: headerId,
    line_no: index + 1,
    product_id: line.product_id,
    product_code: line.product_code.trim() || null,
    product_name: line.product_name.trim(),
    qty: parseQty(line.qty),
    unit: line.unit.trim() || "PCS",
    notes: line.notes.trim() || null,
  };
}

export default function GRNDetailsPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(true);

  const [grnNo, setGrnNo] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [status, setStatus] = useState<GRNStatus>("draft");
  const [referenceNo, setReferenceNo] = useState("");
  const [receivedDate, setReceivedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<GRNLineForm[]>([]);

  useEffect(() => {
    async function load() {
      if (!id) {
        setError("GRN not found.");
        setNotFound(true);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setNotFound(false);

      const [
        { data: header, error: headerError },
        { data: lineRows, error: linesError },
        suppliersResult,
        productsResult,
      ] = await Promise.all([
        supabase
          .from("receiving_headers" as any)
          .select("id, grn_no, supplier_id, status, reference_no, received_date, notes")
          .eq("id", id)
          .single(),
        supabase
          .from("receiving_lines" as any)
          .select("id, product_id, product_code, product_name, qty, unit, notes")
          .eq("header_id", id)
          .order("line_no"),
        supabase
          .from("suppliers" as any)
          .select("id, name")
          .order("name"),
        supabase
          .from("products")
          .select("id, code, name")
          .order("name"),
      ]);

      if (headerError || !header) {
        setError("GRN not found.");
        setNotFound(true);
        setLines([createEmptyLine()]);
        setSuppliersLoading(false);
        setProductsLoading(false);
        setLoading(false);
        return;
      }

      if (linesError) {
        setError(`Failed to load GRN lines: ${linesError.message}`);
      }

      const record = header as HeaderRow;
      setGrnNo(record.grn_no);
      setSupplierId(record.supplier_id ?? "");
      setStatus(record.status);
      setReferenceNo(record.reference_no ?? "");
      setReceivedDate(record.received_date);
      setNotes(record.notes ?? "");

      const loadedLines = ((lineRows as any[]) ?? []).map((line) => ({
        id: line.id,
        product_id: line.product_id ?? "",
        product_code: line.product_code ?? "",
        product_name: line.product_name ?? "",
        qty: String(line.qty ?? 0),
        unit: line.unit ?? "PCS",
        notes: line.notes ?? "",
      }));

      setLines(loadedLines.length > 0 ? loadedLines : [createEmptyLine()]);

      if (!suppliersResult.error && suppliersResult.data) {
        setSuppliers(suppliersResult.data as SupplierOption[]);
      } else if (suppliersResult.error) {
        setError((current) => current ?? `Failed to load suppliers: ${suppliersResult.error.message}`);
      }

      if (!productsResult.error && productsResult.data) {
        setProducts(productsResult.data as ProductOption[]);
      } else if (productsResult.error) {
        setError((current) => current ?? `Failed to load products: ${productsResult.error.message}`);
      }

      setSuppliersLoading(false);
      setProductsLoading(false);
      setLoading(false);
    }

    void load();
  }, [id]);

  const setLine = (index: number, field: keyof GRNLineForm, value: string) => {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, [field]: value } : line))
    );
  };

  const handleProductChange = (index: number, productId: string) => {
    const product = products.find((item) => item.id === productId);

    setLines((prev) =>
      prev.map((line, i) =>
        i === index
          ? {
              ...line,
              product_id: product?.id ?? "",
              product_code: product?.code ?? "",
              product_name: product?.name ?? "",
            }
          : line
      )
    );
  };

  const addLine = () => {
    setLines((prev) => [...prev, createEmptyLine()]);
  };

  const removeLine = (index: number) => {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const validateLines = () => {
    const filteredLines: GRNLineForm[] = [];

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];

      if (isLineEmpty(line)) {
        continue;
      }

      if (!line.product_id) {
        return { error: `Line ${index + 1}: select a product.`, lines: [] as GRNLineForm[] };
      }

      if (parseQty(line.qty) <= 0) {
        return { error: `Line ${index + 1}: quantity must be greater than 0.`, lines: [] as GRNLineForm[] };
      }

      filteredLines.push(line);
    }

    if (filteredLines.length === 0) {
      return { error: "At least one valid line is required.", lines: [] as GRNLineForm[] };
    }

    return { error: null, lines: filteredLines };
  };

  const handleSave = async () => {
    if (!id) {
      setError("GRN not found.");
      return;
    }

    if (!grnNo.trim()) {
      setError("GRN number is required.");
      return;
    }

    const validation = validateLines();
    if (validation.error) {
      setError(validation.error);
      return;
    }

    setSaving(true);
    setError(null);

    const { error: headerError } = await supabase
      .from("receiving_headers" as any)
      .update({
        grn_no: grnNo.trim().toUpperCase(),
        supplier_id: supplierId || null,
        status,
        reference_no: referenceNo.trim() || null,
        received_date: receivedDate,
        notes: notes.trim() || null,
      })
      .eq("id", id);

    if (headerError) {
      setSaving(false);
      setError(`Failed to save header: ${headerError.message}`);
      return;
    }

    const { error: deleteError } = await supabase
      .from("receiving_lines" as any)
      .delete()
      .eq("header_id", id);

    if (deleteError) {
      setSaving(false);
      setError(`Failed to replace lines: ${deleteError.message}`);
      return;
    }

    const payload = validation.lines.map((line, index) =>
      normalizeLineForSave(line, index, id)
    );

    const { error: linesError } = await supabase
      .from("receiving_lines" as any)
      .insert(payload);

    setSaving(false);

    if (linesError) {
      setError(`Failed to save lines: ${linesError.message}`);
      return;
    }

    navigate("/grn");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <button
              onClick={() => navigate("/grn")}
              className="p-1.5 rounded-md hover:bg-secondary transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            <h1 className="text-lg font-bold text-foreground tracking-tight">GRN Details</h1>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error ?? "GRN not found."}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            onClick={() => navigate("/grn")}
            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-lg font-bold text-foreground tracking-tight">GRN Details</h1>
          <button
            onClick={handleSave}
            disabled={saving}
            className="ml-auto flex items-center gap-1.5 bg-primary text-primary-foreground text-sm px-4 py-2 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Header
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">GRN No</label>
              <input
                value={grnNo}
                onChange={(e) => setGrnNo(e.target.value)}
                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div>
              <label className="block text-xs text-muted-foreground mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as GRNStatus)}
                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="draft">Draft</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Supplier</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                disabled={suppliersLoading || suppliers.length === 0}
                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
              >
                {suppliersLoading ? (
                  <option value="">Loading suppliers...</option>
                ) : suppliers.length === 0 ? (
                  <option value="">No suppliers available</option>
                ) : (
                  <>
                    <option value="">No supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground mb-1">Received Date</label>
              <input
                type="date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Reference No</label>
            <input
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Lines
            </h2>
            <button
              type="button"
              onClick={addLine}
              className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-90"
            >
              <Plus className="w-3.5 h-3.5" />
              Add line
            </button>
          </div>

          <div className="space-y-3">
            {lines.map((line, index) => (
              <div key={line.id ?? index} className="bg-secondary rounded-lg border border-border p-4 space-y-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Product</label>
                  <select
                    value={line.product_id}
                    onChange={(e) => handleProductChange(index, e.target.value)}
                    disabled={productsLoading || products.length === 0}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                  >
                    {productsLoading ? (
                      <option value="">Loading products...</option>
                    ) : products.length === 0 ? (
                      <option value="">No products available</option>
                    ) : (
                      <>
                        <option value="">Select product</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.code} - {product.name}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Product Code</label>
                    <input
                      value={line.product_code}
                      readOnly
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Unit</label>
                    <input
                      value={line.unit}
                      onChange={(e) => setLine(index, "unit", e.target.value)}
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Product Name</label>
                  <input
                    value={line.product_name}
                    readOnly
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Qty</label>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={line.qty}
                      onChange={(e) => setLine(index, "qty", e.target.value)}
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="w-full flex items-center justify-center gap-1.5 rounded-md bg-destructive/10 text-destructive px-3 py-2 text-sm hover:opacity-90"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remove
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Notes</label>
                  <input
                    value={line.notes}
                    onChange={(e) => setLine(index, "notes", e.target.value)}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
