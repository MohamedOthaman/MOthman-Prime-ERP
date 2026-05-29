import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, Save, ScanLine, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/reports/hooks/useAuth";
import { useLang } from "@/contexts/LanguageContext";

interface ProductLookup {
  id: string;
  code: string;
  name: string;
  name_ar?: string;
  uom?: string;
  primary_barcode?: string;
  all_barcodes?: string[];
  buying_price?: number;
}

interface GRNLineForm {
  product_id: string;
  product_code: string;
  product_name: string;
  unit: string;
  qty_ordered: string;
  qty_received: string;
  unit_cost: string;
  batch_no: string;
  expiry_date: string;
  production_date: string;
  notes: string;
  isUnmatched?: boolean;
  originalName?: string;
}

const EMPTY_LINE: GRNLineForm = {
  product_id: "",
  product_code: "",
  product_name: "",
  unit: "",
  qty_ordered: "",
  qty_received: "",
  unit_cost: "",
  batch_no: "",
  expiry_date: "",
  production_date: "",
  notes: "",
};

const lineInputClass =
  "h-7 w-full rounded-sm border border-border bg-background px-1.5 text-[11.5px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60";

const readOnlyInputClass =
  "h-7 w-full rounded-sm border border-border/50 bg-muted/40 px-1.5 text-[11.5px] text-foreground/70 select-none cursor-default overflow-hidden text-ellipsis whitespace-nowrap flex items-center";

export default function GRNFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { t } = useLang();

  // Header state
  const [grnNo, setGrnNo] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("draft");

  // Lines
  const [lines, setLines] = useState<GRNLineForm[]>([{ ...EMPTY_LINE }]);

  // Lookups
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<ProductLookup[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const grnNoRef = useRef<HTMLInputElement>(null);
  const didInjectRef = useRef(false);

  // Product lookup maps
  const productByCode = useMemo(() => {
    const m = new Map<string, ProductLookup>();
    products.forEach((p) => {
      if (p.code) m.set(p.code.toLowerCase().trim(), p);
    });
    return m;
  }, [products]);

  const productByBarcode = useMemo(() => {
    const m = new Map<string, ProductLookup>();
    products.forEach((p) => {
      if (p.primary_barcode) m.set(p.primary_barcode.trim(), p);
      (p.all_barcodes ?? []).forEach((b) => {
        if (b) m.set(b.trim(), p);
      });
    });
    return m;
  }, [products]);

  // Load suppliers + products
  useEffect(() => {
    void (async () => {
      const [sRes, pRes] = await Promise.all([
        supabase.from("suppliers" as any).select("id, name").order("name"),
        supabase
          .from("products")
          .select("id, code, name, name_ar, uom, primary_barcode, all_barcodes, buying_price")
          .order("code"),
      ]);
      if (!sRes.error && sRes.data) setSuppliers(sRes.data as any[]);
      if (!pRes.error && pRes.data) setProducts(pRes.data as ProductLookup[]);
    })();
    setTimeout(() => grnNoRef.current?.focus(), 100);
  }, []);

  // Pre-fill from AI extraction via navigation state (once, after products load)
  useEffect(() => {
    if (didInjectRef.current || products.length === 0) return;
    const state = location.state as {
      rawLines?: {
        itemCode: string;
        itemName: string;
        qty: number;
        uom: string;
        unitPrice?: number;
        barcode?: string;
      }[];
      poNumber?: string;
      referenceNo?: string;
      supplierName?: string;
    } | null;
    if (!state?.rawLines?.length) return;
    didInjectRef.current = true;

    if (state.poNumber || state.referenceNo)
      setReferenceNo(state.referenceNo ?? state.poNumber ?? "");

    if (state.supplierName) {
      const norm = state.supplierName.toLowerCase();
      const match = suppliers.find(
        (s) =>
          s.name.toLowerCase().includes(norm) || norm.includes(s.name.toLowerCase())
      );
      if (match) setSupplierId(match.id);
      setSupplierName(state.supplierName);
    }

    const matched: GRNLineForm[] = state.rawLines.map((raw) => {
      const barcode = raw.barcode?.trim() ?? "";
      const code = raw.itemCode?.toLowerCase().trim() ?? "";
      const product =
        (barcode ? productByBarcode.get(barcode) : null) ??
        (code ? productByCode.get(code) : null);

      return {
        product_id: product?.id ?? "",
        product_code: product?.code ?? raw.itemCode ?? "",
        product_name: product?.name ?? "",
        unit: product?.uom ?? raw.uom ?? "",
        qty_ordered: raw.qty != null ? String(raw.qty) : "",
        qty_received: raw.qty != null ? String(raw.qty) : "",
        unit_cost:
          raw.unitPrice != null
            ? String(raw.unitPrice)
            : product?.buying_price != null
              ? String(product.buying_price)
              : "",
        batch_no: "",
        expiry_date: "",
        production_date: "",
        notes: "",
        isUnmatched: !product,
        originalName: !product ? raw.itemName : undefined,
      };
    });

    setLines([...matched, { ...EMPTY_LINE }]);
    const matchedCount = matched.filter((l) => l.product_id).length;
    toast.info(
      `${matched.length} lines loaded from document · ${matchedCount} matched · ${matched.length - matchedCount} unmatched`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  // Focus helper
  const focusField = useCallback((attr: string, index: number) => {
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[${attr}="${index}"]`);
      if (el instanceof HTMLInputElement) {
        el.focus();
        el.select();
      }
    }, 0);
  }, []);

  // Instant code lookup on product code change
  const handleCodeChange = useCallback(
    (index: number, value: string) => {
      setLines((prev) =>
        prev.map((l, i) =>
          i !== index
            ? l
            : { ...l, product_code: value, product_id: "", product_name: "", unit: "" }
        )
      );

      const p =
        productByBarcode.get(value.trim()) ??
        productByCode.get(value.toLowerCase().trim());
      if (!p) return;

      setLines((prev) =>
        prev.map((l, i) =>
          i !== index
            ? l
            : {
                ...l,
                product_id: p.id,
                product_code: p.code,
                product_name: p.name,
                unit: p.uom ?? l.unit,
                unit_cost:
                  l.unit_cost ||
                  (p.buying_price != null ? String(p.buying_price) : ""),
                isUnmatched: false,
                originalName: undefined,
              }
        )
      );

      focusField("data-grn-qty", index);
      if (index === lines.length - 1) {
        setLines((prev) => [...prev, { ...EMPTY_LINE }]);
      }
    },
    [productByBarcode, productByCode, lines.length, focusField]
  );

  // Enter-key field navigation: Code → Received → Cost → Batch → Expiry → ProdDate → Next Row
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number, field: string) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      e.preventDefault();
      const nextAttr: Record<string, string> = {
        code: "data-grn-qty",
        qty: "data-grn-cost",
        cost: "data-grn-batch",
        batch: "data-grn-expiry",
        expiry: "data-grn-proddate",
        proddate: "data-grn-code",
      };
      const attr = nextAttr[field];
      if (!attr) return;
      const isRowEnd = field === "proddate";
      const nextIndex = isRowEnd ? index + 1 : index;
      if (isRowEnd && index === lines.length - 1) {
        setLines((prev) => [...prev, { ...EMPTY_LINE }]);
      }
      focusField(attr, nextIndex);
    },
    [lines.length, focusField]
  );

  // Global barcode scanner (timing-based, same heuristic as InvoiceEntryPage)
  useEffect(() => {
    let buf = "";
    let lastTime = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
      const now = Date.now();

      if (e.key === "Enter") {
        if (buf.length >= 4) {
          const code = buf.trim();
          buf = "";
          const product =
            productByBarcode.get(code) ?? productByCode.get(code.toLowerCase());
          if (!product) return;
          setLines((prev) => {
            const emptyIdx = prev.findIndex((l) => !l.product_code && !l.product_id);
            const idx = emptyIdx >= 0 ? emptyIdx : prev.length;
            const next = [...prev];
            if (idx >= prev.length) next.push({ ...EMPTY_LINE });
            next[idx] = {
              ...next[idx],
              product_id: product.id,
              product_code: product.code,
              product_name: product.name,
              unit: product.uom ?? "",
              qty_received: next[idx].qty_received || "1",
              unit_cost:
                next[idx].unit_cost ||
                (product.buying_price != null ? String(product.buying_price) : ""),
              isUnmatched: false,
              originalName: undefined,
            };
            return next;
          });
          toast.success(`Scanned: ${product.code} — ${product.name}`, {
            duration: 1500,
          });
        } else {
          buf = "";
        }
        return;
      }

      const diff = now - lastTime;
      lastTime = now;
      if (e.key.length === 1) {
        buf = diff < 50 ? buf + e.key : e.key;
      } else {
        buf = "";
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [productByCode, productByBarcode]);

  // Totals
  const totals = useMemo(() => {
    let validLines = 0;
    let totalCost = 0;
    for (const l of lines) {
      if (!l.product_id && !l.product_code.trim()) continue;
      validLines++;
      totalCost +=
        parseFloat(l.qty_received || "0") * parseFloat(l.unit_cost || "0");
    }
    return { validLines, totalCost };
  }, [lines]);

  const handleSave = async () => {
    if (!grnNo.trim()) {
      setError(t("grnNumberRequired", "GRN number is required."));
      return;
    }
    const validLines = lines.filter((l) => l.product_id || l.product_code.trim());
    if (!validLines.length) {
      setError(t("atLeastOneLineRequired", "At least one line is required."));
      return;
    }

    setSaving(true);
    setError(null);

    const { data: header, error: hErr } = await supabase
      .from("receiving_headers" as any)
      .insert({
        grn_no: grnNo.trim().toUpperCase(),
        supplier_id: supplierId || null,
        supplier_name: supplierName.trim() || null,
        status,
        reference_no: referenceNo.trim() || null,
        received_date: receivedDate,
        notes: notes.trim() || null,
        created_by: user?.id,
      })
      .select("id")
      .single();

    if (hErr || !header) {
      setSaving(false);
      setError(hErr?.message ?? t("failedToCreateGrn", "Failed to create GRN."));
      return;
    }

    const { error: lErr } = await supabase.from("receiving_lines" as any).insert(
      validLines.map((l, i) => ({
        header_id: (header as { id: string }).id,
        line_no: i + 1,
        product_id: l.product_id || null,
        batch_no: l.batch_no.trim() || null,
        expiry_date: l.expiry_date || null,
        production_date: l.production_date || null,
        quantity: parseFloat(l.qty_ordered || "0"),
        received_quantity: parseFloat(l.qty_received || "0"),
        unit_cost: parseFloat(l.unit_cost || "0"),
        notes: l.notes.trim() || null,
        qc_status: "pending",
      }))
    );

    setSaving(false);
    if (lErr) {
      setError(lErr.message);
      return;
    }
    navigate(`/grn/${(header as { id: string }).id}`);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Sticky header bar */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => navigate("/grn")}
            className="p-1.5 rounded-md hover:bg-secondary transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold shrink-0">
            {t("newGrn", "New GRN")}
          </span>

          {/* GRN No */}
          <div className="flex items-center gap-1 ms-2">
            <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">
              GRN #
            </span>
            <input
              ref={grnNoRef}
              value={grnNo}
              onChange={(e) => setGrnNo(e.target.value)}
              placeholder="GRN-0001"
              className="h-6 w-28 rounded border border-border bg-secondary px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Date */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-medium text-muted-foreground">
              {t("date", "Date")}
            </span>
            <input
              type="date"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
              className="h-6 w-32 rounded border border-border bg-secondary px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Supplier */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">
              {t("supplier", "Supplier")}
            </span>
            <select
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value);
                setSupplierName(
                  suppliers.find((s) => s.id === e.target.value)?.name ?? ""
                );
              }}
              className="h-6 w-40 rounded border border-border bg-secondary px-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">— {t("noSupplier", "no supplier")} —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Ref / PO */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">
              {t("refPo", "Ref / PO")}
            </span>
            <input
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="Supplier inv / PO #"
              className="h-6 w-36 rounded border border-border bg-secondary px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Status */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-medium text-muted-foreground">
              {t("status", "Status")}
            </span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-6 w-24 rounded border border-border bg-secondary px-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="draft">{t("draft", "Draft")}</option>
              <option value="completed">{t("completed", "Completed")}</option>
            </select>
          </div>

          <div className="flex-1" />

          {/* Summary */}
          <span className="text-[10px] text-muted-foreground hidden sm:inline shrink-0">
            {totals.validLines} {t("lines", "lines")} ·{" "}
            {totals.totalCost.toFixed(3)} KWD
          </span>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground text-[11px] px-3 py-1.5 rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {t("save", "Save")}
          </button>
        </div>
      </header>

      <main className="px-3 py-3">
        {error && (
          <div className="mb-2 flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-md px-3 py-1.5 text-[11px] text-destructive">
            {error}
            <button
              onClick={() => setError(null)}
              className="ms-auto text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
        )}

        {/* Lines grid */}
        <div className="rounded-md border border-border overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 960 }}>
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                {(
                  [
                    ["#", "w-8 text-center"],
                    [t("code", "Code"), "w-28"],
                    [t("productName", "Product Name"), "min-w-44"],
                    [t("uom", "UOM"), "w-14"],
                    [t("ordered", "Ordered"), "w-20 text-right"],
                    [t("received", "Received"), "w-20 text-right"],
                    [t("unitCost", "Unit Cost"), "w-24 text-right"],
                    [t("batchNo", "Batch No"), "w-28"],
                    [t("expiry", "Expiry"), "w-28"],
                    [t("prodDate", "Prod Date"), "w-28"],
                    ["", "w-7"],
                  ] as [string, string][]
                ).map(([label, cls]) => (
                  <th
                    key={label}
                    className={`px-1.5 py-1.5 text-left text-[10px] font-semibold text-muted-foreground ${cls}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr
                  key={idx}
                  className={`border-b border-border/50 hover:bg-muted/10 ${
                    line.isUnmatched ? "bg-amber-500/5" : ""
                  }`}
                >
                  {/* Row number */}
                  <td className="px-1.5 py-0.5 text-center text-[10px] text-muted-foreground select-none">
                    {idx + 1}
                  </td>

                  {/* Code */}
                  <td className="px-1 py-0.5">
                    <input
                      data-grn-code={idx}
                      value={line.product_code}
                      onChange={(e) => handleCodeChange(idx, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, idx, "code")}
                      className={lineInputClass}
                      placeholder={t("codeOrBarcode", "code / barcode")}
                    />
                  </td>

                  {/* Name (read-only, auto-populated) */}
                  <td className="px-1 py-0.5">
                    <div
                      className={readOnlyInputClass}
                      title={
                        line.isUnmatched ? line.originalName : line.product_name
                      }
                    >
                      {line.product_name ? (
                        line.product_name
                      ) : line.isUnmatched ? (
                        <span className="text-amber-500 text-[11px]">
                          ⚠ {line.originalName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40 text-[11px]">
                          auto
                        </span>
                      )}
                    </div>
                  </td>

                  {/* UOM */}
                  <td className="px-1 py-0.5">
                    <input
                      value={line.unit}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === idx ? { ...l, unit: e.target.value } : l
                          )
                        )
                      }
                      className={lineInputClass}
                    />
                  </td>

                  {/* Qty Ordered */}
                  <td className="px-1 py-0.5">
                    <input
                      value={line.qty_ordered}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === idx ? { ...l, qty_ordered: e.target.value } : l
                          )
                        )
                      }
                      className={`${lineInputClass} text-right`}
                      placeholder="0"
                    />
                  </td>

                  {/* Qty Received */}
                  <td className="px-1 py-0.5">
                    <input
                      data-grn-qty={idx}
                      value={line.qty_received}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === idx ? { ...l, qty_received: e.target.value } : l
                          )
                        )
                      }
                      onKeyDown={(e) => handleKeyDown(e, idx, "qty")}
                      className={`${lineInputClass} text-right font-medium`}
                      placeholder="0"
                    />
                  </td>

                  {/* Unit Cost */}
                  <td className="px-1 py-0.5">
                    <input
                      data-grn-cost={idx}
                      value={line.unit_cost}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === idx ? { ...l, unit_cost: e.target.value } : l
                          )
                        )
                      }
                      onKeyDown={(e) => handleKeyDown(e, idx, "cost")}
                      className={`${lineInputClass} text-right`}
                      placeholder="0.000"
                    />
                  </td>

                  {/* Batch No */}
                  <td className="px-1 py-0.5">
                    <input
                      data-grn-batch={idx}
                      value={line.batch_no}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === idx ? { ...l, batch_no: e.target.value } : l
                          )
                        )
                      }
                      onKeyDown={(e) => handleKeyDown(e, idx, "batch")}
                      className={lineInputClass}
                      placeholder={t("batchNo", "batch no")}
                    />
                  </td>

                  {/* Expiry */}
                  <td className="px-1 py-0.5">
                    <input
                      data-grn-expiry={idx}
                      type="date"
                      value={line.expiry_date}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === idx ? { ...l, expiry_date: e.target.value } : l
                          )
                        )
                      }
                      onKeyDown={(e) => handleKeyDown(e, idx, "expiry")}
                      className={lineInputClass}
                    />
                  </td>

                  {/* Production Date */}
                  <td className="px-1 py-0.5">
                    <input
                      data-grn-proddate={idx}
                      type="date"
                      value={line.production_date}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === idx ? { ...l, production_date: e.target.value } : l
                          )
                        )
                      }
                      onKeyDown={(e) => handleKeyDown(e, idx, "proddate")}
                      className={lineInputClass}
                    />
                  </td>

                  {/* Delete */}
                  <td className="px-1 py-0.5 text-center">
                    <button
                      type="button"
                      onClick={() =>
                        setLines((prev) =>
                          prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev
                        )
                      }
                      className="p-0.5 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                      tabIndex={-1}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer controls */}
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setLines((prev) => [...prev, { ...EMPTY_LINE }]);
              setTimeout(() => focusField("data-grn-code", lines.length), 0);
            }}
            className="flex items-center gap-1.5 text-[11px] bg-secondary text-foreground px-3 py-1.5 rounded-md hover:bg-muted/70 border border-border transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t("addRow", "Add Row")}
          </button>

          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <ScanLine className="w-3.5 h-3.5" />
            {t("barcodeScannerActive", "Barcode scanner active")}
          </div>

          <div className="ms-auto text-[11px] font-medium text-right">
            <span className="text-muted-foreground me-3">
              {totals.validLines} {t("lines", "lines")}
            </span>
            <span>
              {t("total", "Total")}:{" "}
              <span className="font-semibold text-foreground">
                {totals.totalCost.toFixed(3)} KWD
              </span>
            </span>
          </div>
        </div>

        {/* Notes */}
        <div className="mt-4">
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">
            {t("notes", "Notes")}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-[11px] text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </main>
    </div>
  );
}
