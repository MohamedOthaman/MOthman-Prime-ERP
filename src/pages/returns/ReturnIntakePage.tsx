import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Search, Loader2, AlertCircle, CheckCircle2, Info,
} from "lucide-react";
import { fetchInvoiceDetail } from "@/features/invoices/salesInvoiceService";
import { fetchExecutionSummary } from "@/features/invoices/pickingService";
import { fetchInvoiceReturnSummary, createDraftReturn, addReturnLines, type ReturnCondition } from "@/features/invoices/returnsService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type InvoiceDetail  = Awaited<ReturnType<typeof fetchInvoiceDetail>>;
type ExecSummary    = Awaited<ReturnType<typeof fetchExecutionSummary>>;
type ReturnSummary  = Awaited<ReturnType<typeof fetchInvoiceReturnSummary>>;

interface DraftLine {
  invoice_line_id: string;
  product_id: string;
  product_name: string;
  item_code: string | null;
  uom: string | null;
  outbound_execution_line_id: string | null;
  batch_no: string | null;
  expiry_date: string | null;
  unit_price: number;
  original_qty: number;
  already_returned: number;
  max_returnable: number;
  /** Number of outbound allocation slices for this exec line (multi-batch indicator) */
  allocation_count: number;
  qty: number;
  condition: ReturnCondition;
  reason: string;
}

const CONDITION_OPTS: { value: ReturnCondition; label: string; cls: string }[] = [
  { value: "OK",     label: "OK",     cls: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  { value: "DMG",    label: "DMG",    cls: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
  { value: "EXPIRY", label: "EXP",    cls: "text-red-400 border-red-500/30 bg-red-500/10" },
];

export default function ReturnIntakePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const presetInvoiceId = params.get("invoiceId");

  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<{ id: string; invoice_number: string | null; customer_name: string | null }[]>([]);

  const [invoiceId, setInvoiceId]         = useState<string | null>(presetInvoiceId);
  const [detail, setDetail]               = useState<InvoiceDetail | null>(null);
  const [execSummary, setExecSummary]     = useState<ExecSummary>(null);
  const [returnSummary, setReturnSummary] = useState<ReturnSummary | null>(null);
  const [loading, setLoading]             = useState(!!presetInvoiceId);
  const [saving, setSaving]               = useState(false);
  const [notes, setNotes]                 = useState("");
  const [lines, setLines]                 = useState<DraftLine[]>([]);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load invoice data when invoiceId is set
  const loadInvoice = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const [d, exec, ret] = await Promise.allSettled([
        fetchInvoiceDetail(id),
        fetchExecutionSummary(id),
        fetchInvoiceReturnSummary(id),
      ]);

      if (d.status !== "fulfilled") {
        toast.error((d.reason as Error)?.message ?? "Invoice not found");
        setInvoiceId(null);
        setLoading(false);
        return;
      }

      const inv = d.value;
      setDetail(inv);
      const exec_val = exec.status === "fulfilled" ? exec.value : null;
      const ret_val  = ret.status === "fulfilled"  ? ret.value  : null;
      setExecSummary(exec_val);
      setReturnSummary(ret_val);

      // Build exec line map: product_id → exec line
      const execLineMap = new Map<string, typeof exec_val extends null ? never : NonNullable<typeof exec_val>["lines"][number]>();
      if (exec_val) {
        exec_val.lines.forEach((el) => execLineMap.set(el.product_id, el));
      }

      // Build already-returned map
      const retMap = ret_val?.lineReturns ?? {};

      // Fetch allocation counts per exec line for multi-batch awareness
      const execLineIds = exec_val ? exec_val.lines.map((el) => el.id) : [];
      let allocCountMap: Record<string, number> = {};
      if (execLineIds.length > 0) {
        const { data: allocData } = await supabase
          .from("outbound_execution_allocations" as any)
          .select("outbound_execution_line_id")
          .in("outbound_execution_line_id", execLineIds);
        if (allocData) {
          for (const row of allocData as any[]) {
            const eid = row.outbound_execution_line_id;
            allocCountMap[eid] = (allocCountMap[eid] ?? 0) + 1;
          }
        }
      }

      const draftLines: DraftLine[] = inv.lines.map((il) => {
        const execLine  = execLineMap.get(il.product_id);
        const alreadyRet = retMap[il.id] ?? 0;
        const maxRet     = Math.max(0, il.quantity - alreadyRet);
        return {
          invoice_line_id:            il.id,
          product_id:                 il.product_id,
          product_name:               il.product?.name ?? il.product?.name_en ?? il.product_id.slice(0, 8),
          item_code:                  il.product?.item_code ?? null,
          uom:                        il.product?.uom ?? null,
          outbound_execution_line_id: execLine?.id ?? null,
          batch_no:                   execLine?.batch_no ?? null,
          expiry_date:                execLine?.expiry_date ?? null,
          unit_price:                 il.unit_price,
          original_qty:               il.quantity,
          already_returned:           alreadyRet,
          max_returnable:             maxRet,
          allocation_count:           execLine ? (allocCountMap[execLine.id] ?? 0) : 0,
          qty:                        0,
          condition:                  "OK" as ReturnCondition,
          reason:                     "",
        };
      });

      setLines(draftLines);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (presetInvoiceId) void loadInvoice(presetInvoiceId);
  }, [presetInvoiceId, loadInvoice]);

  // Invoice search
  const handleInvoiceSearch = (q: string) => {
    setInvoiceSearch(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const { data } = await supabase
          .from("sales_invoices" as any)
          .select("id, invoice_number, customer_name")
          .ilike("invoice_number", `%${q}%`)
          .in("status", ["received", "done"])
          .limit(8);
        setSearchResults((data ?? []) as any[]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  };

  const selectInvoice = (id: string) => {
    setInvoiceId(id);
    setSearchResults([]);
    setInvoiceSearch("");
    void loadInvoice(id);
  };

  const setLineField = <K extends keyof DraftLine>(idx: number, field: K, value: DraftLine[K]) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  };

  const activeLines = lines.filter((l) => l.qty > 0);

  const handleSave = async () => {
    if (!invoiceId || !detail) return;
    if (!activeLines.length) { toast.error("Add at least one return line"); return; }

    // Validate qtys
    for (const l of activeLines) {
      if (l.qty > l.max_returnable) {
        toast.error(`${l.product_name}: qty exceeds max returnable (${l.max_returnable})`);
        return;
      }
    }

    setSaving(true);
    try {
      const returnId = await createDraftReturn(invoiceId, detail.header.customer_id, notes || undefined);
      await addReturnLines(returnId, activeLines.map((l) => ({
        invoice_line_id:            l.invoice_line_id,
        outbound_execution_line_id: l.outbound_execution_line_id,
        product_id:                 l.product_id,
        qty_returned:               l.qty,
        unit_price:                 l.unit_price || null,
        condition:                  l.condition,
        reason:                     l.reason || null,
        batch_no:                   l.batch_no || null,
        expiry_date:                l.expiry_date || null,
      })));
      toast.success("Return document created");
      navigate(`/returns/${returnId}`);
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  // ─── Step 1: Invoice selection ──────────────────────────────────────────────
  if (!invoiceId) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-11 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition">
              <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <h1 className="text-[15px] font-bold text-foreground">New Return</h1>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <p className="text-xs text-muted-foreground">Search for the original invoice to return against.</p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            {searchLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            <input
              type="text"
              placeholder="Invoice number (DONE or RECEIVED)..."
              value={invoiceSearch}
              onChange={(e) => handleInvoiceSearch(e.target.value)}
              autoFocus
              className="w-full bg-background border border-border rounded-xl pl-9 pr-3 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          {searchResults.length > 0 && (
            <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
              {searchResults.map((inv) => (
                <button
                  key={inv.id}
                  onClick={() => selectInvoice(inv.id)}
                  className="w-full px-4 py-3 text-left hover:bg-muted/20 transition flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">#{inv.invoice_number ?? inv.id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">{inv.customer_name ?? "—"}</p>
                  </div>
                  <ArrowLeft className="w-4 h-4 text-muted-foreground rotate-180" />
                </button>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  // ─── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const header = detail?.header;

  // ─── Step 2: Build return lines ───────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-11 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => { setInvoiceId(null); setDetail(null); setLines([]); }} className="p-1.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition">
            <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <div className="flex-1">
            <p className="text-[15px] font-bold text-foreground">Return Against #{header?.invoice_number ?? "—"}</p>
            <p className="text-[10px] text-muted-foreground">{header?.customer_name ?? "—"}</p>
          </div>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
            activeLines.length > 0 ? "text-amber-400 bg-amber-500/10 border-amber-500/20" : "text-muted-foreground bg-muted/20 border-border"
          }`}>{activeLines.length} line{activeLines.length !== 1 ? "s" : ""}</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        {/* Invoice lines */}
        {lines.map((line, idx) => {
          const exhausted = line.max_returnable <= 0;
          return (
            <div key={line.invoice_line_id} className={`rounded-xl border bg-card p-4 space-y-3 ${
              line.qty > 0 ? "border-violet-500/25" : "border-border"
            } ${exhausted ? "opacity-50" : ""}`}>
              {/* Product info */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">
                    {line.item_code ? `[${line.item_code}] ` : ""}{line.product_name}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                    <span>Orig: {line.original_qty} {line.uom ?? ""}</span>
                    {line.already_returned > 0 && (
                      <span className="text-amber-400">Returned: {line.already_returned}</span>
                    )}
                    <span className={line.max_returnable === 0 ? "text-muted-foreground/50" : "text-foreground"}>
                      Max: <strong>{line.max_returnable}</strong>
                    </span>
                  </div>
                  {(line.batch_no || line.expiry_date) && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {line.batch_no ? `Batch: ${line.batch_no}` : ""}
                      {line.batch_no && line.expiry_date ? " · " : ""}
                      {line.expiry_date ? `Exp: ${line.expiry_date}` : ""}
                    </p>
                  )}
                </div>
                {line.qty > 0 && <CheckCircle2 className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />}
              </div>

              {!exhausted && (
                <>
                  {/* Qty + Condition */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 border border-border rounded-lg overflow-hidden">
                      <button
                        onClick={() => setLineField(idx, "qty", Math.max(0, line.qty - 1))}
                        className="w-8 h-8 text-muted-foreground hover:bg-muted/40 transition text-base font-bold flex items-center justify-center"
                      >−</button>
                      <input
                        type="number"
                        min={0}
                        max={line.max_returnable}
                        value={line.qty || ""}
                        onChange={(e) => {
                          const v = Math.min(line.max_returnable, Math.max(0, Number(e.target.value) || 0));
                          setLineField(idx, "qty", v);
                        }}
                        className="w-14 text-center text-sm font-semibold bg-transparent text-foreground focus:outline-none py-1"
                        placeholder="0"
                      />
                      <button
                        onClick={() => setLineField(idx, "qty", Math.min(line.max_returnable, line.qty + 1))}
                        className="w-8 h-8 text-muted-foreground hover:bg-muted/40 transition text-base font-bold flex items-center justify-center"
                      >+</button>
                    </div>

                    {/* Condition selector */}
                    <div className="flex gap-1">
                      {CONDITION_OPTS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setLineField(idx, "condition", opt.value)}
                          className={`text-[10px] font-semibold px-2 py-1 rounded border transition ${
                            line.condition === opt.value ? opt.cls : "text-muted-foreground border-border hover:bg-muted/20"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Multi-batch allocation notice */}
                  {line.allocation_count > 1 && line.qty > 0 && (
                    <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                      <Info className="w-3 h-3 shrink-0 mt-0.5" />
                      <span>
                        Outbound used {line.allocation_count} batches — return qty will be
                        auto-allocated across them in FIFO order.
                      </span>
                    </div>
                  )}

                  {/* Condition warning for DMG/EXPIRY */}
                  {line.qty > 0 && line.condition !== "OK" && (
                    <div className="flex items-center gap-1.5 text-[10px] text-amber-400">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      {line.condition === "DMG" ? "Damaged goods will not be restocked." : "Expired goods will not be restocked."}
                    </div>
                  )}

                  {/* Reason */}
                  {line.qty > 0 && (
                    <input
                      type="text"
                      placeholder="Reason / notes (optional)"
                      value={line.reason}
                      onChange={(e) => setLineField(idx, "reason", e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  )}
                </>
              )}

              {exhausted && (
                <p className="text-[10px] text-muted-foreground">All units already returned.</p>
              )}
            </div>
          );
        })}

        {/* Notes */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Return Notes</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes for this return..."
            rows={2}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
        </div>
      </main>

      {/* Sticky CTA */}
      <div className="fixed bottom-16 left-0 right-0 z-40 px-4 pb-2 bg-background/95 backdrop-blur-sm border-t border-border pt-3">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={handleSave}
            disabled={saving || !activeLines.length}
            className={`w-full py-3.5 rounded-xl font-bold text-sm transition ${
              activeLines.length > 0 && !saving
                ? "bg-violet-500 text-white hover:bg-violet-600 active:scale-[0.98]"
                : "bg-muted/30 text-muted-foreground cursor-not-allowed"
            }`}
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : `Create Return (${activeLines.length} line${activeLines.length !== 1 ? "s" : ""})`}
          </button>
        </div>
      </div>
    </div>
  );
}
