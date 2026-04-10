import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, QrCode, CheckCheck, Loader2, AlertCircle,
  ChevronRight, CheckCircle2,
} from "lucide-react";
import {
  fetchInvoiceDetail,
} from "@/features/invoices/salesInvoiceService";
import {
  startOrGetPickingSession,
  recordOutboundScan,
  confirmPickingDone,
  type PickingExecLine,
} from "@/features/invoices/pickingService";
import { toast } from "sonner";

type InvoiceDetail = Awaited<ReturnType<typeof fetchInvoiceDetail>>;

interface EnrichedLine extends PickingExecLine {
  product_name: string;
  item_code: string | null;
  uom: string | null;
  primary_barcode: string | null;
}

type ScanFeedback = { type: "success" | "error"; message: string };

export default function PickingScreenPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();

  const [invoiceDetail, setInvoiceDetail] = useState<InvoiceDetail | null>(null);
  const [execLines, setExecLines]         = useState<EnrichedLine[]>([]);
  const [sessionStatus, setSessionStatus] = useState<string>("in_progress");
  const [loading, setLoading]             = useState(true);
  const [confirming, setConfirming]       = useState(false);
  const [scanInput, setScanInput]         = useState("");
  const [scanning, setScanning]           = useState(false);
  const [feedback, setFeedback]           = useState<ScanFeedback | null>(null);
  const scanRef      = useRef<HTMLInputElement>(null);
  const feedbackRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    try {
      const [detail, session] = await Promise.all([
        fetchInvoiceDetail(invoiceId),
        startOrGetPickingSession(invoiceId),
      ]);
      setInvoiceDetail(detail);
      setSessionStatus(session.session.status);

      const productMap = new Map(detail.lines.map((l) => [l.product_id, l]));
      setExecLines(
        session.lines.map((el) => {
          const inv = productMap.get(el.product_id);
          return {
            ...el,
            qty_required:    Number(el.qty_required),
            qty_scanned:     Number(el.qty_scanned),
            product_name:    inv?.product?.name ?? inv?.product?.name_en ?? el.product_id.slice(0, 8),
            item_code:       inv?.product?.item_code ?? null,
            uom:             inv?.product?.uom ?? null,
            primary_barcode: inv?.product?.primary_barcode ?? null,
          };
        })
      );
    } catch (e: any) {
      toast.error(e.message);
    }
    setLoading(false);
  }, [invoiceId]);

  useEffect(() => { void load(); }, [load]);

  // Auto-focus scan input
  useEffect(() => {
    if (!loading && sessionStatus === "in_progress") {
      setTimeout(() => scanRef.current?.focus(), 100);
    }
  }, [loading, sessionStatus]);

  const showFeedback = (type: ScanFeedback["type"], message: string) => {
    if (feedbackRef.current) clearTimeout(feedbackRef.current);
    setFeedback({ type, message });
    feedbackRef.current = setTimeout(() => setFeedback(null), 2500);
  };

  const handleScan = async (barcode: string) => {
    if (!invoiceId || !barcode.trim() || scanning) return;
    const b = barcode.trim();
    setScanInput("");
    setScanning(true);
    try {
      const result = await recordOutboundScan(invoiceId, b);
      setExecLines((prev) =>
        prev.map((l) =>
          l.product_id === result.product_id ? { ...l, qty_scanned: result.qty_scanned } : l
        )
      );
      showFeedback(
        "success",
        result.line_complete
          ? `Line complete ✓ (${result.qty_scanned}/${result.qty_required})`
          : `+1 scanned — ${result.remaining} remaining`
      );
    } catch (e: any) {
      const code = (e as any).code as string | undefined;
      if (code === "NOT_IN_INVOICE")  showFeedback("error", "Product not in this invoice");
      else if (code === "OVER_SCAN")  showFeedback("error", "Already scanned full quantity for this item");
      else if (code === "UNKNOWN_BARCODE") showFeedback("error", `Unknown barcode: ${b}`);
      else showFeedback("error", e.message ?? "Scan failed");
    }
    setScanning(false);
    setTimeout(() => scanRef.current?.focus(), 50);
  };

  const handleConfirmDone = async () => {
    if (!invoiceId) return;
    setConfirming(true);
    try {
      await confirmPickingDone(invoiceId);
      toast.success("Picking confirmed — invoice is now DONE");
      setSessionStatus("completed");
    } catch (e: any) {
      const code = (e as any).code as string | undefined;
      if (code === "INCOMPLETE") {
        toast.error("Not all items scanned yet.");
      } else if (code === "INSUFFICIENT_STOCK") {
        toast.error("Insufficient stock — check inventory batches before confirming.", { duration: 6000 });
      } else {
        toast.error(e.message ?? "Failed to confirm picking");
      }
    }
    setConfirming(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const header        = invoiceDetail?.header;
  const totalRequired = execLines.reduce((s, l) => s + l.qty_required, 0);
  const totalScanned  = execLines.reduce((s, l) => s + l.qty_scanned, 0);
  const completedLines = execLines.filter((l) => l.qty_scanned >= l.qty_required).length;
  const allComplete   = execLines.length > 0 && completedLines === execLines.length;
  const progressPct   = totalRequired > 0 ? Math.min(100, (totalScanned / totalRequired) * 100) : 0;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-11 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-foreground">
                Picking #{header?.invoice_number ?? invoiceId?.slice(0, 8)}
              </span>
              {sessionStatus === "completed" && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                  DONE
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">{header?.customer_name ?? "—"}</p>
          </div>
          <button
            onClick={() => navigate(`/invoices/${invoiceId}`)}
            className="p-1.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition"
            title="Invoice details"
          >
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="max-w-2xl mx-auto px-4 pb-3 space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">
              {completedLines}/{execLines.length} lines · {totalScanned}/{totalRequired} units
            </span>
            <span className={`font-bold ${allComplete ? "text-emerald-400" : "text-amber-400"}`}>
              {Math.round(progressPct)}%
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-muted/30 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${allComplete ? "bg-emerald-500" : "bg-amber-500"}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">

        {/* Completion banner */}
        {sessionStatus === "completed" && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-400">Picking Complete</p>
              <p className="text-[11px] text-muted-foreground">
                Invoice marked DONE. All items confirmed and logged.
              </p>
            </div>
          </div>
        )}

        {/* Scan area */}
        {sessionStatus === "in_progress" && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <QrCode className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-foreground">Scan Product Barcode</span>
            </div>
            <div className="flex gap-2">
              <input
                ref={scanRef}
                type="text"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleScan(scanInput);
                }}
                placeholder="Scan or type barcode, then Enter..."
                autoComplete="off"
                autoCapitalize="off"
                className="flex-1 bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary font-mono"
              />
              <button
                onClick={() => void handleScan(scanInput)}
                disabled={!scanInput.trim() || scanning}
                className="px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition disabled:opacity-40 active:scale-95"
              >
                {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : "Go"}
              </button>
            </div>

            {/* Scan feedback */}
            {feedback && (
              <div
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium transition-all ${
                  feedback.type === "success"
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                    : "bg-red-500/10 border border-red-500/20 text-red-400"
                }`}
              >
                {feedback.type === "success"
                  ? <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                  : <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                }
                {feedback.message}
              </div>
            )}
          </div>
        )}

        {/* Items list */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Required Items
            </p>
            <p className="text-[10px] text-muted-foreground">
              {completedLines}/{execLines.length} complete
            </p>
          </div>
          {execLines.map((line, i) => {
            const complete  = line.qty_scanned >= line.qty_required;
            const remaining = line.qty_required - line.qty_scanned;
            const pct       = line.qty_required > 0 ? (line.qty_scanned / line.qty_required) * 100 : 0;
            return (
              <div
                key={line.id}
                className={`px-4 py-3 flex items-start gap-3 ${i > 0 ? "border-t border-border" : ""} ${
                  complete ? "bg-emerald-500/[0.03]" : ""
                }`}
              >
                {/* Completion indicator */}
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                    complete
                      ? "border-emerald-500 bg-emerald-500/20"
                      : "border-border bg-muted/10"
                  }`}
                >
                  {complete && <CheckCheck className="w-3 h-3 text-emerald-400" />}
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium ${complete ? "text-muted-foreground" : "text-foreground"}`}>
                    {line.item_code ? `[${line.item_code}] ` : ""}
                    {line.product_name}
                  </p>
                  {line.primary_barcode && (
                    <p className="text-[10px] text-muted-foreground font-mono">{line.primary_barcode}</p>
                  )}

                  {/* Progress bar */}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${complete ? "bg-emerald-500" : "bg-amber-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-bold shrink-0 w-20 text-right ${complete ? "text-emerald-400" : "text-amber-400"}`}>
                      {line.qty_scanned}/{line.qty_required}{line.uom ? ` ${line.uom}` : ""}
                    </span>
                  </div>
                  {!complete && remaining > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">{remaining} remaining</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Confirm Done CTA */}
        {sessionStatus === "in_progress" && (
          <button
            onClick={handleConfirmDone}
            disabled={!allComplete || confirming}
            className={`w-full py-4 rounded-2xl font-bold text-sm transition-all ${
              allComplete && !confirming
                ? "bg-emerald-500 text-white hover:bg-emerald-600 active:scale-[0.98] shadow-lg shadow-emerald-500/20"
                : "bg-muted/30 text-muted-foreground cursor-not-allowed"
            }`}
          >
            {confirming ? (
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            ) : allComplete ? (
              "Confirm Picking Done →"
            ) : (
              `${execLines.length - completedLines} line${execLines.length - completedLines !== 1 ? "s" : ""} remaining`
            )}
          </button>
        )}

        {sessionStatus === "completed" && (
          <button
            onClick={() => navigate(`/invoices/${invoiceId}`)}
            className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 active:scale-[0.98] transition"
          >
            View Invoice Details →
          </button>
        )}
      </main>
    </div>
  );
}
