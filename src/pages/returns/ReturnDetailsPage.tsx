import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, RotateCcw, Loader2, FileText, Trash2,
  CheckCircle2, AlertCircle, XCircle, ChevronDown, ChevronUp,
  Package,
} from "lucide-react";
import {
  fetchReturnDetails,
  receiveReturn,
  postReturn,
  cancelReturn,
  deleteReturnLine,
  type SalesReturnLine,
  type SalesReturnAllocation,
} from "@/features/invoices/returnsService";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";

type ReturnDetail = Awaited<ReturnType<typeof fetchReturnDetails>>;

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}
function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) +
    " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
function fmtAED(n: number | null | undefined) {
  if (n == null) return "—";
  return `AED ${Number(n).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_CLS: Record<string, string> = {
  draft:     "text-muted-foreground bg-muted/20 border-border",
  received:  "text-amber-400 bg-amber-500/10 border-amber-500/20",
  reviewed:  "text-blue-400 bg-blue-500/10 border-blue-500/20",
  posted:    "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  cancelled: "text-red-400 bg-red-500/10 border-red-500/20",
};

const CONDITION_CLS: Record<string, string> = {
  OK:     "text-emerald-400 bg-emerald-500/10 border-emerald-500/25",
  DMG:    "text-amber-400 bg-amber-500/10 border-amber-500/25",
  EXPIRY: "text-red-400 bg-red-500/10 border-red-500/25",
};

function ConditionPill({ condition }: { condition: string | null }) {
  const c = condition ?? "OK";
  return (
    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${CONDITION_CLS[c] ?? CONDITION_CLS.OK}`}>
      {c}
    </span>
  );
}

// ─── Allocation trace for a single line ────────────────────────────────────

function LineAllocations({
  line,
  allocations,
  isPosted,
}: {
  line: SalesReturnLine;
  allocations: SalesReturnAllocation[];
  isPosted: boolean;
}) {
  const [open, setOpen] = useState(false);
  const lineAllocs = allocations.filter((a) => a.return_line_id === line.id);

  if (!isPosted && lineAllocs.length === 0) return null;

  const hasTrace = lineAllocs.length > 0;

  return (
    <div className="mt-1.5 border-t border-border/50 pt-1.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition w-full text-left"
      >
        {open ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
        {hasTrace
          ? `${lineAllocs.length} allocation slice${lineAllocs.length !== 1 ? "s" : ""}`
          : isPosted
          ? "No outbound allocation link"
          : null}
        {line.return_movement_id && !hasTrace && (
          <span className="ml-1 text-emerald-400">· Movement recorded</span>
        )}
      </button>

      {open && (
        <div className="mt-1.5 space-y-1.5 pl-3 border-l border-border/40">
          {hasTrace ? (
            lineAllocs.map((alloc, i) => (
              <div key={alloc.id} className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-semibold text-foreground">
                    Slice {i + 1}: {alloc.qty_returned} units
                  </span>
                  <ConditionPill condition={alloc.condition} />
                  {alloc.condition === "OK" ? (
                    <span className="text-[9px] text-emerald-400 font-medium">Restocked</span>
                  ) : (
                    <span className="text-[9px] text-amber-400 font-medium">No restock</span>
                  )}
                </div>
                {(alloc.batch_no || alloc.expiry_date) && (
                  <p className="text-[10px] text-muted-foreground">
                    {alloc.batch_no ? `Batch: ${alloc.batch_no}` : ""}
                    {alloc.batch_no && alloc.expiry_date ? " · " : ""}
                    {alloc.expiry_date ? `Exp: ${alloc.expiry_date}` : ""}
                  </p>
                )}
                {alloc.return_movement_id && (
                  <p className="text-[9px] text-muted-foreground/70 font-mono">
                    Mvt: {alloc.return_movement_id.slice(0, 8)}…
                  </p>
                )}
              </div>
            ))
          ) : (
            <p className="text-[10px] text-muted-foreground">
              Movement recorded without outbound allocation link.
              {line.batch_no ? ` Batch: ${line.batch_no}` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function ReturnDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, isManager } = usePermissions();

  const [data, setData]       = useState<ReturnDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing]   = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setData(await fetchReturnDetails(id));
    } catch (e: any) {
      toast.error(e.message);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const handleReceive = async () => {
    if (!id) return;
    setActing(true);
    try { await receiveReturn(id); toast.success("Return marked RECEIVED"); void load(); }
    catch (e: any) { toast.error(e.message); }
    setActing(false);
  };

  const handlePost = async () => {
    if (!id) return;
    setActing(true);
    try {
      await postReturn(id);
      toast.success("Return POSTED — inventory updated");
      void load();
    } catch (e: any) {
      const code = (e as any).code as string | undefined;
      if (code === "RETURN_QTY_EXCEEDS_OUTBOUND")    toast.error("Return qty exceeds outbound allocated qty", { duration: 5000 });
      else if (code === "INVALID_RETURN_STATUS")      toast.error("Invalid status for posting");
      else if (code === "INVALID_RETURN_BATCH_TARGET") toast.error("Original inventory batch not available for restock", { duration: 5000 });
      else toast.error(e.message);
    }
    setActing(false);
  };

  const handleCancel = async () => {
    if (!id) return;
    setActing(true);
    try { await cancelReturn(id); toast.success("Return cancelled"); void load(); }
    catch (e: any) { toast.error(e.message); }
    setActing(false);
  };

  const handleDeleteLine = async (lineId: string) => {
    try { await deleteReturnLine(lineId); toast.success("Line removed"); void load(); }
    catch (e: any) { toast.error(e.message); }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <FileText className="w-10 h-10 text-muted-foreground opacity-20" />
        <p className="text-sm text-muted-foreground">Return not found</p>
        <button onClick={() => navigate(-1)} className="text-xs text-primary hover:underline">← Back</button>
      </div>
    );
  }

  const { returnDoc, lines, allocations, invoiceDetail } = data;
  const isLocked   = returnDoc.status === "posted" || returnDoc.status === "cancelled";
  const isDraft    = returnDoc.status === "draft";
  const isReceived = returnDoc.status === "received";
  const isPosted   = returnDoc.status === "posted";
  const statusCls  = STATUS_CLS[returnDoc.status] ?? STATUS_CLS.draft;

  const totalReturnQty = lines.reduce((s, l) => s + l.qty_returned, 0);
  const okQty   = lines.filter((l) => (l.condition ?? "OK") === "OK").reduce((s, l) => s + l.qty_returned, 0);
  const dmgQty  = lines.filter((l) => l.condition === "DMG").reduce((s, l)  => s + l.qty_returned, 0);
  const expQty  = lines.filter((l) => l.condition === "EXPIRY").reduce((s, l)=> s + l.qty_returned, 0);

  // Multi-batch summary for posted returns
  const totalAllocSlices   = allocations.length;
  const uniqueBatches      = new Set(allocations.map((a) => a.batch_id).filter(Boolean)).size;
  const linesWithAllocs    = new Set(allocations.map((a) => a.return_line_id)).size;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-11 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition">
            <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <RotateCcw className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-[15px] font-bold text-foreground">{returnDoc.return_no ?? id?.slice(0, 8)}</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${statusCls}`}>
                {returnDoc.status.toUpperCase()}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">{fmtDate(returnDoc.created_at)}</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">

        {/* Invoice info */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Original Invoice</p>
            <button
              onClick={() => navigate(`/invoices/${returnDoc.invoice_id}`)}
              className="text-[10px] text-primary hover:underline"
            >
              View Invoice
            </button>
          </div>
          <p className="text-xs font-semibold text-foreground">
            #{invoiceDetail?.invoice_number ?? "—"} · {invoiceDetail?.customer_name ?? returnDoc.customer_id?.slice(0, 8) ?? "—"}
          </p>
          {invoiceDetail?.invoice_date && (
            <p className="text-[10px] text-muted-foreground">{fmtDate(invoiceDetail.invoice_date)}</p>
          )}
          {returnDoc.notes && (
            <p className="text-[11px] text-muted-foreground italic">{returnDoc.notes}</p>
          )}
        </div>

        {/* Return summary KPIs */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
            <p className="text-lg font-bold text-emerald-400">{okQty}</p>
            <p className="text-[10px] text-muted-foreground">OK / Restock</p>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-center">
            <p className="text-lg font-bold text-amber-400">{dmgQty}</p>
            <p className="text-[10px] text-muted-foreground">Damaged</p>
          </div>
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-center">
            <p className="text-lg font-bold text-red-400">{expQty}</p>
            <p className="text-[10px] text-muted-foreground">Expired</p>
          </div>
        </div>

        {/* Posted allocation summary */}
        {isPosted && totalAllocSlices > 0 && (
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 flex items-center gap-3">
            <Package className="w-4 h-4 text-violet-400 shrink-0" />
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="text-[11px] font-semibold text-violet-400">Allocation Trace</p>
              <p className="text-[10px] text-muted-foreground">
                {totalAllocSlices} allocation slice{totalAllocSlices !== 1 ? "s" : ""}
                {uniqueBatches > 0 ? ` across ${uniqueBatches} batch${uniqueBatches !== 1 ? "es" : ""}` : ""}
                {linesWithAllocs > 0 ? ` · ${linesWithAllocs} line${linesWithAllocs !== 1 ? "s" : ""} traced` : ""}
              </p>
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Timeline</p>
          <div className="space-y-1.5">
            <TimelineRow label="Created"  at={returnDoc.created_at}  active />
            <TimelineRow label="Received" at={returnDoc.received_at} active={!!returnDoc.received_at} />
            <TimelineRow label="Posted"   at={returnDoc.posted_at}   active={!!returnDoc.posted_at}
              color={returnDoc.status === "posted" ? "text-emerald-400" : undefined} />
            {returnDoc.status === "cancelled" && (
              <div className="flex items-center gap-2 text-[11px]">
                <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <span className="text-red-400 font-medium">Cancelled</span>
              </div>
            )}
          </div>
        </div>

        {/* Return lines */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Return Lines ({lines.length})
            </p>
            <p className="text-[10px] text-muted-foreground">{totalReturnQty} units total</p>
          </div>
          {lines.length === 0 ? (
            <div className="px-4 py-6 text-center text-[11px] text-muted-foreground">No return lines</div>
          ) : (
            lines.map((line, i) => (
              <div key={line.id} className={`px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-foreground">
                        {line.item_code ? `[${line.item_code}] ` : ""}
                        {line.product_name ?? line.product_id.slice(0, 8)}
                      </span>
                      <ConditionPill condition={line.condition} />
                      {isPosted && line.return_movement_id && (
                        <span className="text-[9px] text-emerald-400 font-medium">Processed</span>
                      )}
                      {line.outbound_execution_line_id && (
                        <span className="text-[9px] text-muted-foreground/60 font-mono">
                          OEL: {line.outbound_execution_line_id.slice(0, 6)}…
                        </span>
                      )}
                    </div>
                    {(line.batch_no || line.expiry_date) && (
                      <p className="text-[10px] text-muted-foreground">
                        {line.batch_no ? `Batch: ${line.batch_no}` : ""}
                        {line.batch_no && line.expiry_date ? " · " : ""}
                        {line.expiry_date ? `Exp: ${line.expiry_date}` : ""}
                      </p>
                    )}
                    {line.reason && <p className="text-[10px] text-muted-foreground italic">{line.reason}</p>}

                    {/* Allocation trace — shown always if posted, expandable */}
                    <LineAllocations
                      line={line}
                      allocations={allocations}
                      isPosted={isPosted}
                    />
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="text-xs font-bold text-foreground">{line.qty_returned}</p>
                    {line.unit_price && (
                      <p className="text-[10px] text-muted-foreground">{fmtAED(line.unit_price)} ea</p>
                    )}
                  </div>
                  {isDraft && (
                    <button
                      onClick={() => void handleDeleteLine(line.id)}
                      className="p-1 rounded hover:bg-red-500/10 transition text-muted-foreground hover:text-red-400 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Actions */}
        {!isLocked && (
          <div className="flex flex-wrap gap-2">
            {isDraft && (
              <>
                <button
                  onClick={handleReceive}
                  disabled={acting || lines.length === 0}
                  className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-amber-500 text-black font-semibold hover:bg-amber-400 transition disabled:opacity-40"
                >
                  {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Receive Goods
                </button>
                <button
                  onClick={() => navigate(`/returns/new?invoiceId=${returnDoc.invoice_id}`)}
                  className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted/30 transition"
                >
                  Edit Lines
                </button>
                {isAdmin && (
                  <button
                    onClick={handleCancel}
                    disabled={acting}
                    className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition disabled:opacity-40"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Cancel
                  </button>
                )}
              </>
            )}

            {isReceived && (isAdmin || isManager) && (
              <>
                <button
                  onClick={handlePost}
                  disabled={acting}
                  className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-violet-500 text-white font-semibold hover:bg-violet-600 transition disabled:opacity-40"
                >
                  {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  Post Return
                </button>
                <div className="w-full">
                  <div className="flex items-start gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-amber-400">
                      Posting will update inventory across all linked batches. OK items restocked to original batch.
                      DMG/EXPIRY logged only — no restock.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Posted summary */}
        {isPosted && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-1.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <p className="text-xs font-bold text-emerald-400">Return Posted</p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {fmtDateTime(returnDoc.posted_at)} · {fmtAED(returnDoc.total_amount)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {okQty > 0 ? `${okQty} units restocked` : ""}
              {okQty > 0 && (dmgQty > 0 || expQty > 0) ? " · " : ""}
              {dmgQty > 0 ? `${dmgQty} damaged` : ""}
              {dmgQty > 0 && expQty > 0 ? " · " : ""}
              {expQty > 0 ? `${expQty} expired` : ""}
            </p>
            {totalAllocSlices > 0 && (
              <p className="text-[10px] text-muted-foreground/70">
                Traced across {totalAllocSlices} allocation slice{totalAllocSlices !== 1 ? "s" : ""}
                {uniqueBatches > 0 ? ` / ${uniqueBatches} batch${uniqueBatches !== 1 ? "es" : ""}` : ""}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Timeline row ───────────────────────────────────────────────────────────

function TimelineRow({
  label, at, active, color,
}: {
  label: string;
  at: string | null | undefined;
  active?: boolean;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <div className={`w-2 h-2 rounded-full ${active || at ? "bg-primary" : "bg-muted/40"}`} />
      <span className={`font-medium ${color ?? (at ? "text-foreground" : "text-muted-foreground/50")}`}>{label}</span>
      {at && <span className="text-muted-foreground">{fmtDateTime(at)}</span>}
    </div>
  );
}
