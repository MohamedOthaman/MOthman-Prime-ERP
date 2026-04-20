import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Clock, CheckCircle2, Truck, XCircle, RotateCcw,
  FileText, User, Loader2, Play, Plus, ChevronRight,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import {
  fetchInvoiceDetail,
  markInvoiceDone,
  markInvoiceReceived,
  cancelInvoice,
  postSalesInvoice,
} from "@/features/invoices/salesInvoiceService";
import { fetchExecutionSummary } from "@/features/invoices/pickingService";
import {
  fetchInvoiceReturnSummary,
  type InvoiceReturnSummary,
} from "@/features/invoices/returnsService";
import { toast } from "sonner";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) +
    " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

function fmtAED(n: number | null | undefined) {
  if (n == null) return "—";
  return `AED ${Number(n).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_CLS: Record<string, string> = {
  draft:     "text-muted-foreground bg-muted/20 border-border",
  ready:     "text-amber-400 bg-amber-500/10 border-amber-500/20",
  done:      "text-blue-400 bg-blue-500/10 border-blue-500/20",
  received:  "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  cancelled: "text-red-400 bg-red-500/10 border-red-500/20",
  returns:   "text-violet-400 bg-violet-500/10 border-violet-500/20",
};

type InvoiceDetail = Awaited<ReturnType<typeof fetchInvoiceDetail>>;
type ExecSummary   = Awaited<ReturnType<typeof fetchExecutionSummary>>;

const RETURN_STATUS_CLS: Record<string, string> = {
  draft:     "text-muted-foreground bg-muted/20 border-border",
  received:  "text-amber-400 bg-amber-500/10 border-amber-500/20",
  reviewed:  "text-blue-400 bg-blue-500/10 border-blue-500/20",
  posted:    "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  cancelled: "text-red-400 bg-red-500/10 border-red-500/20",
};

export default function InvoiceDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, isManager, canManageInvoices, canManageReceiving } = usePermissions();

  const [detail, setDetail]             = useState<InvoiceDetail | null>(null);
  const [execSummary, setExecSummary]   = useState<ExecSummary>(null);
  const [returnSummary, setReturnSummary] = useState<InvoiceReturnSummary | null>(null);
  const [loading, setLoading]           = useState(true);
  const [acting, setActing]             = useState(false);
  const [cancelModal, setCancelModal]   = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [d, exec, ret] = await Promise.allSettled([
        fetchInvoiceDetail(id),
        fetchExecutionSummary(id),
        fetchInvoiceReturnSummary(id),
      ]);
      if (d.status === "fulfilled") setDetail(d.value);
      else toast.error((d.reason as Error)?.message ?? "Failed to load invoice");
      if (exec.status === "fulfilled") setExecSummary(exec.value);
      if (ret.status === "fulfilled") setReturnSummary(ret.value);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const header = detail?.header;
  const lines  = detail?.lines ?? [];

  const handlePostToReady = async () => {
    if (!id) return;
    setActing(true);
    try { await postSalesInvoice(id); toast.success("Posted — invoice is now READY"); void load(); }
    catch (e: any) { toast.error(e.message); }
    setActing(false);
  };

  const handleMarkDone = async () => {
    if (!id) return;
    setActing(true);
    try { await markInvoiceDone(id); toast.success("Marked DONE"); void load(); }
    catch (e: any) { toast.error(e.message); }
    setActing(false);
  };

  const handleMarkReceived = async () => {
    if (!id) return;
    setActing(true);
    try { await markInvoiceReceived(id); toast.success("Marked RECEIVED"); void load(); }
    catch (e: any) { toast.error(e.message); }
    setActing(false);
  };

  const handleCancelSubmit = async () => {
    if (!id || !cancelReason.trim()) { toast.error("Cancel reason required"); return; }
    setActing(true);
    try {
      await cancelInvoice(id, cancelReason);
      toast.success("Invoice cancelled");
      setCancelModal(false);
      setCancelReason("");
      void load();
    } catch (e: any) {
      if ((e as any).code === "14_DAY_RULE") {
        toast.error("14-day rule: use Returns workflow instead", { duration: 5000 });
      } else {
        toast.error(e.message);
      }
    }
    setActing(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!header) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <FileText className="w-10 h-10 text-muted-foreground opacity-20" />
        <p className="text-sm text-muted-foreground">Invoice not found</p>
        <button onClick={() => navigate(-1)} className="text-xs text-primary hover:underline">← Back</button>
      </div>
    );
  }

  const statusCls  = STATUS_CLS[header.status] ?? STATUS_CLS.draft;
  const totalQty   = lines.reduce((s, l) => s + l.quantity, 0);
  const execLines       = execSummary?.lines ?? [];
  const totalScanned    = execLines.reduce((s, l) => s + l.qty_scanned, 0);
  const pickingStarted  = !!execSummary?.session;
  const pickingComplete = execSummary?.session?.status === "completed";

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-11 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[15px] font-bold text-foreground">
                #{header.invoice_number ?? id?.slice(0, 8)}
              </span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${statusCls}`}>
                {header.status.toUpperCase()}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">{fmtDate(header.invoice_date)}</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">

        {/* Customer / Salesman / Notes */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-semibold text-foreground">{header.customer_name ?? "—"}</span>
          </div>
          {header.salesman_name && (
            <p className="text-[11px] text-muted-foreground ml-5">Salesman: {header.salesman_name}</p>
          )}
          {header.notes && (
            <p className="text-[11px] text-muted-foreground ml-5 italic">{header.notes}</p>
          )}
        </div>

        {/* Lifecycle Timeline */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Lifecycle</p>
          <InvoiceTimeline header={header} />
        </div>

        {/* Lines */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Lines ({lines.length})
            </p>
            <p className="text-[10px] text-muted-foreground">{totalQty} units total</p>
          </div>
          {lines.map((line, i) => (
            <div
              key={line.id}
              className={`px-4 py-3 flex items-start gap-3 ${i > 0 ? "border-t border-border" : ""}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">
                  {line.product?.item_code ? `[${line.product.item_code}] ` : ""}
                  {line.product?.name ?? line.product?.name_en ?? line.product_id.slice(0, 8)}
                </p>
                {line.product?.primary_barcode && (
                  <p className="text-[10px] text-muted-foreground font-mono">{line.product.primary_barcode}</p>
                )}
              </div>
              <div className="text-right shrink-0 space-y-0.5">
                <p className="text-xs font-semibold text-foreground">
                  {line.quantity} {line.product?.uom ?? ""}
                </p>
                <p className="text-[10px] text-muted-foreground">{fmtAED(line.unit_price)} ea</p>
              </div>
              <div className="text-right shrink-0 w-20">
                <p className="text-xs font-semibold text-foreground">{fmtAED(line.line_total)}</p>
                {line.discount > 0 && (
                  <p className="text-[10px] text-muted-foreground">{line.discount}% off</p>
                )}
              </div>
            </div>
          ))}
          <div className="px-4 py-3 border-t border-border bg-muted/10 flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Total</span>
            <span className="text-sm font-bold text-foreground">{fmtAED(header.total_amount)}</span>
          </div>
        </div>

        {/* Execution section */}
        {(header.status === "ready" || header.status === "done" || header.status === "received" || pickingStarted) && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Warehouse Execution
              </p>
              {(header.status === "ready") && (
                <button
                  onClick={() => navigate(`/warehouse/picking/${id}`)}
                  className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded border font-medium border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition"
                >
                  <Play className="w-3 h-3" />
                  {pickingStarted ? "Resume Picking" : "Start Picking"}
                </button>
              )}
              {(header.status === "done" || header.status === "received") && pickingStarted && (
                <button
                  onClick={() => navigate(`/warehouse/picking/${id}`)}
                  className="text-[10px] px-2.5 py-1 rounded border border-blue-500/30 bg-blue-500/10 text-blue-400 font-medium hover:bg-blue-500/20 transition"
                >
                  View Execution
                </button>
              )}
            </div>

            <div className="p-4 space-y-3">
              {pickingStarted ? (
                <>
                  {/* Progress summary */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">
                        {pickingComplete ? `Confirmed ${fmtDateTime(execSummary?.session?.confirmed_at)}` : "In progress"}
                        {" · "}{totalScanned}/{totalQty} units
                      </span>
                      <span className={`font-bold ${pickingComplete ? "text-emerald-400" : "text-amber-400"}`}>
                        {totalQty > 0 ? Math.round((totalScanned / totalQty) * 100) : 0}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-muted/30 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pickingComplete ? "bg-emerald-500" : "bg-amber-500"}`}
                        style={{ width: `${totalQty > 0 ? Math.min(100, (totalScanned / totalQty) * 100) : 0}%` }}
                      />
                    </div>
                  </div>

                  {/* Execution lines with batch info (shown when completed) */}
                  {pickingComplete && execLines.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-border">
                      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider pt-1">
                        Picked Items
                      </p>
                      {execLines.map((el) => {
                        const invLine = lines.find((l) => l.id === el.invoice_line_id);
                        const pName = invLine?.product?.name ?? invLine?.product?.name_en ?? el.product_id.slice(0, 8);
                        const hasBatch = el.batch_no || el.expiry_date;
                        return (
                          <div key={el.id} className="flex items-center justify-between py-1.5 gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-medium text-foreground truncate">{pName}</p>
                              {hasBatch && (
                                <p className="text-[10px] text-muted-foreground">
                                  {el.batch_no ? `Batch: ${el.batch_no}` : ""}
                                  {el.batch_no && el.expiry_date ? " · " : ""}
                                  {el.expiry_date ? `Exp: ${el.expiry_date}` : ""}
                                </p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-[11px] font-semibold text-emerald-400">
                                {el.qty_confirmed ?? el.qty_scanned} {invLine?.product?.uom ?? ""}
                              </span>
                              {el.returned_qty > 0 && (
                                <p className="text-[10px] text-amber-400">-{el.returned_qty} returned</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground">No picking session started yet.</p>
              )}
            </div>
          </div>
        )}

        {/* Returns section — shown once invoice is done/received or has returns */}
        {(["done", "received", "returns"].includes(header.status) ||
          (returnSummary && returnSummary.documents.length > 0)) && (() => {
          const postedCount  = returnSummary?.countsByStatus.posted ?? 0;
          const pendingCount = (returnSummary?.countsByStatus.draft ?? 0) +
                               (returnSummary?.countsByStatus.received ?? 0) +
                               (returnSummary?.countsByStatus.reviewed ?? 0);
          const hasReturns   = (returnSummary?.documents.length ?? 0) > 0;

          return (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <RotateCcw className="w-3.5 h-3.5 text-violet-400" />
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Returns
                  </p>
                  {postedCount > 0 && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                      {postedCount} posted
                    </span>
                  )}
                  {pendingCount > 0 && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border text-amber-400 bg-amber-500/10 border-amber-500/20">
                      {pendingCount} pending
                    </span>
                  )}
                  {returnSummary && returnSummary.totalReturnedQty > 0 && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border text-violet-400 bg-violet-500/10 border-violet-500/20">
                      {returnSummary.totalReturnedQty} units
                    </span>
                  )}
                </div>
                {(isAdmin || isManager || canManageReceiving) && (
                  <button
                    onClick={() => navigate(`/returns/new?invoiceId=${id}`)}
                    className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded border font-medium border-violet-500/30 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition"
                  >
                    <Plus className="w-3 h-3" />
                    New Return
                  </button>
                )}
              </div>

              <div className="p-4">
                {!hasReturns ? (
                  <p className="text-[11px] text-muted-foreground">No return documents yet.</p>
                ) : (
                  <div className="space-y-2">
                    {/* Per-line returned qty indicators */}
                    {Object.keys(returnSummary!.lineReturns).length > 0 && (
                      <div className="space-y-1 pb-2 border-b border-border">
                        <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Returned per line
                        </p>
                        {lines.map((line) => {
                          const retQty = returnSummary!.lineReturns[line.id] ?? 0;
                          if (retQty === 0) return null;
                          const pct = line.quantity > 0 ? Math.min(100, (retQty / line.quantity) * 100) : 0;
                          const fullyReturned = retQty >= line.quantity;
                          return (
                            <div key={line.id} className="flex items-center gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-[10px] text-foreground truncate">
                                    {line.product?.item_code ? `[${line.product.item_code}] ` : ""}
                                    {line.product?.name ?? line.product_id.slice(0, 8)}
                                  </p>
                                  {fullyReturned && (
                                    <span className="text-[9px] text-violet-400 font-semibold shrink-0">Full</span>
                                  )}
                                </div>
                                <div className="w-full h-1 rounded-full bg-muted/30 overflow-hidden mt-0.5">
                                  <div
                                    className={`h-full rounded-full ${fullyReturned ? "bg-violet-500" : "bg-violet-500/60"}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                              <span className="text-[10px] font-semibold text-violet-400 shrink-0">
                                {retQty}/{line.quantity}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Return documents list */}
                    <div className="space-y-1.5">
                      {returnSummary!.documents.map((ret) => (
                        <div
                          key={ret.id}
                          className="flex items-center gap-3 py-1.5 cursor-pointer hover:bg-muted/10 rounded-lg px-1 -mx-1 transition"
                          onClick={() => navigate(`/returns/${ret.id}`)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[11px] font-semibold text-foreground">
                                {ret.return_no ?? ret.id.slice(0, 8)}
                              </span>
                              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${RETURN_STATUS_CLS[ret.status] ?? RETURN_STATUS_CLS.draft}`}>
                                {ret.status.toUpperCase()}
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                              {fmtDate(ret.created_at)}
                              {ret.posted_at ? ` · Posted ${fmtDate(ret.posted_at)}` : ""}
                            </p>
                          </div>
                          <span className="text-[11px] font-semibold text-foreground shrink-0">
                            {fmtAED(ret.total_amount)}
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {header.status === "draft" && canManageInvoices && (
            <button
              onClick={handlePostToReady}
              disabled={acting}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-amber-500 text-black font-semibold hover:bg-amber-400 transition disabled:opacity-40"
            >
              {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
              Post to Ready
            </button>
          )}

          {header.status === "ready" && (canManageReceiving || isManager) && (
            <button
              onClick={() => navigate(`/warehouse/picking/${id}`)}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition"
            >
              <Play className="w-3.5 h-3.5" />
              {pickingStarted ? "Resume Picking" : "Start Picking"}
            </button>
          )}

          {header.status === "ready" && (isAdmin || isManager) && (
            <button
              onClick={handleMarkDone}
              disabled={acting}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-400 font-medium hover:bg-blue-500/20 transition disabled:opacity-40"
            >
              {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Truck className="w-3.5 h-3.5" />}
              Mark Done
            </button>
          )}

          {header.status === "done" && (isAdmin || isManager) && (
            <button
              onClick={handleMarkReceived}
              disabled={acting}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-emerald-500 text-white font-semibold hover:bg-emerald-600 transition disabled:opacity-40"
            >
              {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Mark Received
            </button>
          )}

          {["ready", "done", "received"].includes(header.status) && isAdmin && (
            <>
              <button
                onClick={() => { setCancelModal(true); setCancelReason(""); }}
                disabled={acting}
                className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg border border-red-500/20 bg-transparent text-red-400 font-medium hover:bg-red-500/10 transition disabled:opacity-40"
              >
                <XCircle className="w-3.5 h-3.5" />
                Cancel
              </button>
              {(returnSummary?.documents.length ?? 0) > 0 && (
                <p className="w-full text-[10px] text-amber-400 flex items-center gap-1">
                  <RotateCcw className="w-3 h-3 shrink-0" />
                  Invoice has returns — use the Returns workflow instead of cancellation.
                </p>
              )}
            </>
          )}

          {canManageInvoices && ["draft", "ready"].includes(header.status) && (
            <button
              onClick={() => navigate(`/invoice-entry/${id}`)}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted/30 transition"
            >
              Edit
            </button>
          )}
        </div>
      </main>

      {/* Cancel modal */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-foreground">Cancel Invoice</h2>
              <p className="text-xs text-muted-foreground mt-1">
                #{header.invoice_number ?? "—"} · {header.customer_name ?? "—"}
              </p>
              {header.status === "received" && (
                <div className="mt-2 rounded-lg bg-amber-500/8 border border-amber-500/20 px-3 py-2">
                  <p className="text-[11px] text-amber-400">
                    RECEIVED — cancellation subject to 14-day rule from receipt date.
                  </p>
                </div>
              )}
            </div>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Cancel reason (required)..."
              rows={3}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setCancelModal(false)}
                className="flex-1 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted/30 transition"
              >
                Back
              </button>
              <button
                onClick={handleCancelSubmit}
                disabled={acting || !cancelReason.trim()}
                className="flex-1 py-2 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition disabled:opacity-40"
              >
                {acting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Confirm Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Timeline ──────────────────────────────────────────────────────────────

function InvoiceTimeline({ header }: { header: ReturnType<typeof fetchInvoiceDetail> extends Promise<infer T> ? T["header"] : never }) {
  const STEPS = [
    { key: "draft",    label: "Draft",    at: header.created_at,  color: "text-muted-foreground", ring: "border-border bg-muted/30" },
    { key: "ready",    label: "Ready",    at: header.ready_at,    color: "text-amber-400",        ring: "border-amber-500/60 bg-amber-500/15" },
    { key: "done",     label: "Done",     at: header.done_at,     color: "text-blue-400",         ring: "border-blue-500/60 bg-blue-500/15" },
    { key: "received", label: "Received", at: header.received_at, color: "text-emerald-400",      ring: "border-emerald-500/60 bg-emerald-500/15" },
  ];
  const ORDER      = ["draft", "ready", "done", "received"];
  const currentIdx = ORDER.indexOf(header.status);
  const isFinal    = ["cancelled", "returns"].includes(header.status);

  return (
    <div>
      <div className="flex items-start overflow-x-auto gap-0">
        {STEPS.map((step, idx) => {
          const reached  = isFinal ? idx === 0 : currentIdx >= idx;
          const isCurrent = header.status === step.key;
          return (
            <div key={step.key} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center gap-1 shrink-0 min-w-[48px]">
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                    isCurrent
                      ? step.ring + " shadow-sm"
                      : reached
                      ? step.ring
                      : "border-border bg-muted/10"
                  }`}
                >
                  {reached && !isCurrent && (
                    <div className="w-2 h-2 rounded-full bg-current opacity-50" />
                  )}
                </div>
                <span className={`text-[9px] font-medium text-center ${reached ? step.color : "text-muted-foreground/50"}`}>
                  {step.label}
                </span>
                {step.at && reached && (
                  <span className="text-[8px] text-muted-foreground text-center leading-tight">
                    {new Date(step.at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                  </span>
                )}
              </div>
              {idx < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-1 mt-[-12px] ${reached && currentIdx > idx ? "bg-primary/25" : "bg-border"}`} />
              )}
            </div>
          );
        })}

        {isFinal && (
          <>
            <div className="flex-1 h-px mx-1 mt-[-12px] bg-border" />
            <div className="flex flex-col items-center gap-1 shrink-0 min-w-[48px]">
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                header.status === "cancelled"
                  ? "border-red-500/60 bg-red-500/15"
                  : "border-violet-500/60 bg-violet-500/15"
              }`}>
                {header.status === "cancelled"
                  ? <XCircle className="w-3 h-3 text-red-400" />
                  : <RotateCcw className="w-3 h-3 text-violet-400" />
                }
              </div>
              <span className={`text-[9px] font-medium ${header.status === "cancelled" ? "text-red-400" : "text-violet-400"}`}>
                {header.status === "cancelled" ? "Cancelled" : "Returns"}
              </span>
              {(header.status === "cancelled" ? header.cancelled_at : header.returns_at) && (
                <span className="text-[8px] text-muted-foreground">
                  {new Date((header.status === "cancelled" ? header.cancelled_at : header.returns_at) as string)
                    .toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                </span>
              )}
            </div>
          </>
        )}
      </div>
      {header.status === "cancelled" && header.cancel_reason && (
        <p className="mt-2 text-[10px] text-muted-foreground border-t border-border pt-2">
          Reason: {header.cancel_reason}
        </p>
      )}
    </div>
  );
}
