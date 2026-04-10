import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Loader2,
  PackageCheck,
  ShieldAlert,
} from "lucide-react";
import { WorkflowStepper } from "@/components/workflow/WorkflowStepper";
import { WorkflowActions } from "@/components/workflow/WorkflowActions";
import { StatusBadge } from "@/components/workflow/StatusBadge";
import { logAudit } from "@/services/auditService";
import { useAuth } from "@/features/reports/hooks/useAuth";
import {
  fetchGrnQcRecord,
  fetchReceivingPostingSummary,
  postReceivingToInventory,
  saveGrnQcRecord,
  type GrnQcHeaderRecord,
  type GrnQcLineRecord,
  type QcLineStatus,
  type ReceivingPostResult,
} from "@/features/services/grnQcService";
import type { GRNWorkflowStatus } from "@/config/workflowConfig";

const statusOptions: Array<{ value: QcLineStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "pass", label: "Pass" },
  { value: "reject", label: "Reject" },
  { value: "hold", label: "Hold" },
];

const POST_ERROR_MESSAGES: Record<string, string> = {
  RECEIVING_NOT_READY: "GRN must be in APPROVED status before posting to inventory.",
  RECEIVING_ALREADY_POSTED: "This GRN has already been posted to inventory.",
  BATCH_DATA_REQUIRED: "All QC-passed lines require a batch number before posting.",
  EXPIRY_REQUIRED: "All QC-passed lines require an expiry date before posting.",
  QC_DATA_MISSING: "No QC-passed lines with positive received quantity found.",
};

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export default function GRNQcPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postResult, setPostResult] = useState<ReceivingPostResult | null>(null);
  const [postSummary, setPostSummary] = useState<{
    batchCount: number;
    totalQty: number;
    movements: Array<{
      product_id: string;
      batch_no: string | null;
      expiry_date: string | null;
      qty_in: number;
      location_ref: string | null;
      batch_id: string;
    }>;
  } | null>(null);
  const [header, setHeader] = useState<GrnQcHeaderRecord | null>(null);
  const [lines, setLines] = useState<GrnQcLineRecord[]>([]);
  const [municipalityReferenceNo, setMunicipalityReferenceNo] = useState("");
  const [municipalityNotes, setMunicipalityNotes] = useState("");
  const [expandedDiscrepancy, setExpandedDiscrepancy] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) return;

    async function loadRecord() {
      setLoading(true);
      setError(null);

      try {
        const result = await fetchGrnQcRecord(id);
        setHeader(result.header);
        setLines(result.lines);
        setMunicipalityReferenceNo(result.header.municipality_reference_no ?? "");
        setMunicipalityNotes(result.header.municipality_notes ?? "");

        if (result.header.status === "completed") {
          const summary = await fetchReceivingPostingSummary(id);
          setPostSummary(summary);
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load GRN QC record."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadRecord();
  }, [id]);

  const qcSummary = useMemo(() => {
    return lines.reduce(
      (summary, line) => {
        if (line.received_quantity <= 0) return summary;

        summary.total += 1;
        summary.pass += line.qc_status === "pass" ? 1 : 0;
        summary.reject += line.qc_status === "reject" ? 1 : 0;
        summary.hold += line.qc_status === "hold" ? 1 : 0;
        summary.pending += line.qc_status === "pending" ? 1 : 0;
        return summary;
      },
      { total: 0, pass: 0, reject: 0, hold: 0, pending: 0 }
    );
  }, [lines]);

  const updateLine = (
    index: number,
    patch: Partial<Pick<
      GrnQcLineRecord,
      | "qc_status"
      | "qc_reason"
      | "qc_notes"
      | "qc_checked_quantity"
      | "qty_damaged"
      | "qty_missing"
      | "qty_sample"
      | "qty_accepted"
      | "putaway_location_ref"
    >>
  ) => {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line
      )
    );
  };

  const toggleDiscrepancy = (lineId: string) => {
    setExpandedDiscrepancy((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  // completed and rejected are fully locked; approved still allows discrepancy/putaway edits
  const isTerminalStatus =
    header?.status === "completed" || header?.status === "rejected";

  const validateBeforePersist = (targetStatus: GRNWorkflowStatus) => {
    const activeLines = lines.filter((line) => line.received_quantity > 0);

    if (activeLines.length === 0) {
      return "No active receiving lines are available for QC.";
    }

    for (const line of activeLines) {
      if (line.qc_status === "pass" && toNumber(line.qc_checked_quantity) <= 0) {
        return `Line ${line.line_no}: checked quantity is required for QC pass lines.`;
      }

      if (
        (line.qc_status === "reject" || line.qc_status === "hold") &&
        !(line.qc_reason ?? "").trim()
      ) {
        return `Line ${line.line_no}: a QC reason is required for held/rejected lines.`;
      }
    }

    if (targetStatus === "inspected") {
      if (activeLines.some((line) => line.qc_status === "pending")) {
        return "All active lines must be reviewed before completing QC.";
      }
    }

    if (targetStatus === "municipality_pending" || targetStatus === "approved") {
      if (activeLines.some((line) => line.qc_status === "pending")) {
        return "Pending QC lines must be resolved before municipality submission or approval.";
      }

      if (activeLines.some((line) => line.qc_status === "hold")) {
        return "Held QC lines must be resolved before municipality submission or approval.";
      }

      if (!activeLines.some((line) => line.qc_status === "pass")) {
        return "At least one QC-passed line is required before municipality submission or approval.";
      }

      for (const line of activeLines.filter((entry) => entry.qc_status === "pass")) {
        if (!(line.batch_no ?? "").trim()) {
          return `Line ${line.line_no}: batch no is required for QC-passed lines.`;
        }

        if (!line.expiry_date) {
          return `Line ${line.line_no}: expiry date is required for QC-passed lines.`;
        }
      }
    }

    if (targetStatus === "approved" && !municipalityReferenceNo.trim()) {
      return "Municipality reference no is required before approval.";
    }

    return null;
  };

  const persistRecord = async (targetStatus: GRNWorkflowStatus) => {
    if (!header || !id) return;

    const validationError = validateBeforePersist(targetStatus);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await saveGrnQcRecord({
        headerId: id,
        userId: user?.id ?? null,
        targetStatus,
        municipalityReferenceNo,
        municipalityNotes,
        lines: lines.map((line) => ({
          id: line.id,
          qc_status: line.qc_status,
          qc_reason: line.qc_reason,
          qc_notes: line.qc_notes,
          qc_checked_quantity:
            line.qc_status === "pass" ? toNumber(line.qc_checked_quantity) : null,
          qty_damaged: line.qty_damaged,
          qty_missing: line.qty_missing,
          qty_sample: line.qty_sample,
          qty_accepted: line.qty_accepted,
          putaway_location_ref: line.putaway_location_ref,
        })),
      });

      void logAudit({
        entityType: "grn",
        entityId: id,
        action:
          targetStatus === header.status ? "qc_updated" : `qc_${targetStatus}`,
        oldValue: { status: header.status },
        newValue: {
          status: targetStatus,
          qc_summary: qcSummary,
          municipality_reference_no: municipalityReferenceNo || null,
        },
        metadata: {
          grn_no: header.grn_no,
          user_email: user?.email,
        },
      });

      const refreshed = await fetchGrnQcRecord(id);
      setHeader(refreshed.header);
      setLines(refreshed.lines);
      setMunicipalityReferenceNo(refreshed.header.municipality_reference_no ?? "");
      setMunicipalityNotes(refreshed.header.municipality_notes ?? "");
    } catch (persistError) {
      setError(
        persistError instanceof Error
          ? persistError.message
          : "Failed to save GRN QC record."
      );
    } finally {
      setSaving(false);
    }
  };

  const handlePostToInventory = async () => {
    if (!id) return;

    setPosting(true);
    setError(null);
    setPostResult(null);

    try {
      const result = await postReceivingToInventory(id);
      setPostResult(result);

      if (result.success) {
        const refreshed = await fetchGrnQcRecord(id);
        setHeader(refreshed.header);
        setLines(refreshed.lines);

        const summary = await fetchReceivingPostingSummary(id);
        setPostSummary(summary);
      } else {
        const knownMessage = result.code ? POST_ERROR_MESSAGES[result.code] : null;
        setError(knownMessage ?? result.error ?? "Failed to post to inventory.");
      }
    } catch (postError) {
      setError(
        postError instanceof Error
          ? postError.message
          : "Failed to post receiving to inventory."
      );
    } finally {
      setPosting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!header) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="mx-auto max-w-6xl rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error ?? "GRN QC record not found."}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/grn")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold text-foreground">
                QC Inspection
              </h1>
              <StatusBadge status={header.status} />
            </div>
            <p className="text-xs text-muted-foreground">
              {header.grn_no} | {header.supplier_name || "No supplier"} | PO{" "}
              {header.po_no || "-"}
            </p>
          </div>

          {!isTerminalStatus && (
            <button
              type="button"
              onClick={() => void persistRecord(header.status)}
              disabled={saving}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-medium text-foreground disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save QC
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4">
        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {/* Completed success banner */}
        {header.status === "completed" && postSummary && (
          <section className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-4 py-4">
            <div className="mb-3 flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-teal-500" />
              <h2 className="text-sm font-semibold text-teal-500">
                Posted to Inventory
              </h2>
              <span className="ml-auto text-xs text-muted-foreground">
                Completed {formatDate(header.completed_at)}
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-border bg-background px-3 py-2">
                <p className="text-xs text-muted-foreground">Batches Created</p>
                <p className="text-lg font-semibold text-teal-500">
                  {postSummary.batchCount}
                </p>
              </div>
              <div className="rounded-md border border-border bg-background px-3 py-2">
                <p className="text-xs text-muted-foreground">Total Qty In</p>
                <p className="text-lg font-semibold text-foreground">
                  {postSummary.totalQty.toFixed(3)}
                </p>
              </div>
              <div className="rounded-md border border-border bg-background px-3 py-2">
                <p className="text-xs text-muted-foreground">QC Lines</p>
                <p className="text-lg font-semibold text-foreground">
                  {qcSummary.total}
                </p>
              </div>
            </div>
            {postSummary.movements.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-md border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-secondary/50 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Batch ID</th>
                      <th className="px-3 py-2">Batch No</th>
                      <th className="px-3 py-2">Expiry</th>
                      <th className="px-3 py-2">Qty In</th>
                      <th className="px-3 py-2">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {postSummary.movements.map((m) => (
                      <tr key={m.batch_id} className="border-t border-border/50">
                        <td className="px-3 py-1.5 font-mono text-muted-foreground">
                          {m.batch_id.slice(0, 8)}…
                        </td>
                        <td className="px-3 py-1.5 text-foreground">
                          {m.batch_no || "-"}
                        </td>
                        <td className="px-3 py-1.5 text-foreground">
                          {formatDate(m.expiry_date)}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-emerald-500">
                          +{m.qty_in.toFixed(3)}
                        </td>
                        <td className="px-3 py-1.5 text-foreground">
                          {m.location_ref || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Post to Inventory action — shown only when approved */}
        {header.status === "approved" && (
          <section className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <PackageCheck className="h-5 w-5 text-emerald-500" />
                  <h2 className="text-sm font-semibold text-emerald-500">
                    Ready to Post to Inventory
                  </h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  This GRN is approved. Posting will create inventory batches for all
                  QC-passed lines and mark the GRN as completed.
                </p>
                {postResult?.success && (
                  <p className="mt-2 text-xs font-medium text-emerald-500">
                    Posted successfully — {postResult.batches_created} batch
                    {postResult.batches_created !== 1 ? "es" : ""} created
                    {postResult.lines_skipped && postResult.lines_skipped > 0
                      ? `, ${postResult.lines_skipped} line${postResult.lines_skipped !== 1 ? "s" : ""} skipped`
                      : ""}
                    .
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void handlePostToInventory()}
                disabled={posting || saving}
                className="inline-flex shrink-0 items-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {posting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PackageCheck className="h-4 w-4" />
                )}
                {posting ? "Posting…" : "Post to Inventory"}
              </button>
            </div>
          </section>
        )}

        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Workflow
              </div>
              <WorkflowStepper currentStatus={header.status} />
            </div>

            {!isTerminalStatus && (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Actions
                </div>
                <WorkflowActions
                  currentStatus={header.status}
                  saving={saving}
                  onTransition={(targetStatus) => void persistRecord(targetStatus)}
                />
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Pending
            </div>
            <div className="mt-2 text-2xl font-semibold text-foreground">
              {qcSummary.pending}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Passed
            </div>
            <div className="mt-2 text-2xl font-semibold text-emerald-500">
              {qcSummary.pass}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Rejected
            </div>
            <div className="mt-2 text-2xl font-semibold text-destructive">
              {qcSummary.reject}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Hold
            </div>
            <div className="mt-2 text-2xl font-semibold text-amber-500">
              {qcSummary.hold}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              Municipality Tracking
            </h2>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs text-muted-foreground">
              Municipality Reference No
              <input
                value={municipalityReferenceNo}
                onChange={(event) => setMunicipalityReferenceNo(event.target.value)}
                disabled={isTerminalStatus}
                className="mt-1 h-9 w-full rounded-md border border-border bg-secondary px-3 text-sm text-foreground disabled:opacity-50"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Municipality Notes
              <textarea
                value={municipalityNotes}
                onChange={(event) => setMunicipalityNotes(event.target.value)}
                disabled={isTerminalStatus}
                rows={3}
                className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground disabled:opacity-50"
              />
            </label>
          </div>

          <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-4">
            <div>GRN Date: {formatDate(header.arrival_date)}</div>
            <div>Transaction Date: {formatDate(header.transaction_date)}</div>
            <div>Inspected At: {formatDate(header.inspected_at)}</div>
            <div>Approved At: {formatDate(header.approved_at)}</div>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border bg-muted/30 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                Line-Level QC
              </h2>
              <div className="text-xs text-muted-foreground">
                Only QC-passed lines can move into stock after final approval.
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-left text-sm">
              <thead className="bg-secondary/50 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Line</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Received</th>
                  <th className="px-3 py-2">Batch</th>
                  <th className="px-3 py-2">Expiry</th>
                  <th className="px-3 py-2">QC Status</th>
                  <th className="px-3 py-2">Checked Qty</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2">Notes</th>
                  <th className="px-3 py-2">Discrepancy</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const isExpanded = expandedDiscrepancy.has(line.id);
                  const hasDiscrepancy =
                    line.qty_damaged > 0 ||
                    line.qty_missing > 0 ||
                    line.qty_sample > 0 ||
                    (line.qty_accepted ?? 0) > 0 ||
                    !!line.putaway_location_ref;

                  return (
                    <>
                      <tr key={line.id} className="border-t border-border/70 align-top">
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                          {line.line_no}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-foreground">
                            {line.product_name || line.product_code || "Unnamed product"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {line.product_code || "-"} | {line.store || "No store"}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-foreground">
                          {line.received_quantity.toFixed(3)} {line.uom || ""}
                        </td>
                        <td className="px-3 py-2 text-xs text-foreground">
                          {line.batch_no || "-"}
                        </td>
                        <td className="px-3 py-2 text-xs text-foreground">
                          {line.expiry_date ? formatDate(line.expiry_date) : "-"}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={line.qc_status}
                            onChange={(event) =>
                              updateLine(index, {
                                qc_status: event.target.value as QcLineStatus,
                                qc_checked_quantity:
                                  event.target.value === "pass"
                                    ? line.qc_checked_quantity ?? line.received_quantity
                                    : event.target.value === "pending"
                                    ? null
                                    : line.qc_checked_quantity,
                              })
                            }
                            disabled={isTerminalStatus}
                            className="h-9 w-full rounded-md border border-border bg-secondary px-2 text-sm text-foreground disabled:opacity-50"
                          >
                            {statusOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={line.qc_checked_quantity ?? ""}
                            onChange={(event) =>
                              updateLine(index, {
                                qc_checked_quantity:
                                  event.target.value.trim() === ""
                                    ? null
                                    : toNumber(event.target.value),
                              })
                            }
                            disabled={isTerminalStatus}
                            className="h-9 w-full rounded-md border border-border bg-secondary px-2 text-sm text-foreground disabled:opacity-50"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={line.qc_reason ?? ""}
                            onChange={(event) =>
                              updateLine(index, { qc_reason: event.target.value })
                            }
                            disabled={isTerminalStatus}
                            className="h-9 w-full rounded-md border border-border bg-secondary px-2 text-sm text-foreground disabled:opacity-50"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <textarea
                            value={line.qc_notes ?? ""}
                            onChange={(event) =>
                              updateLine(index, { qc_notes: event.target.value })
                            }
                            disabled={isTerminalStatus}
                            rows={2}
                            className="w-full rounded-md border border-border bg-secondary px-2 py-2 text-sm text-foreground disabled:opacity-50"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => toggleDiscrepancy(line.id)}
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition ${
                              hasDiscrepancy
                                ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
                                : "border-border bg-secondary text-muted-foreground"
                            }`}
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                            {hasDiscrepancy ? "Has data" : "Add"}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${line.id}-disc`} className="border-t border-border/40 bg-muted/20">
                          <td colSpan={10} className="px-4 py-3">
                            <div className="grid gap-3 md:grid-cols-5">
                              <label className="text-xs text-muted-foreground">
                                Damaged Qty
                                <input
                                  type="number"
                                  min="0"
                                  step="0.001"
                                  value={line.qty_damaged || ""}
                                  onChange={(event) =>
                                    updateLine(index, {
                                      qty_damaged: toNumber(event.target.value),
                                    })
                                  }
                                  disabled={isTerminalStatus}
                                  placeholder="0"
                                  className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground disabled:opacity-50"
                                />
                              </label>
                              <label className="text-xs text-muted-foreground">
                                Missing Qty
                                <input
                                  type="number"
                                  min="0"
                                  step="0.001"
                                  value={line.qty_missing || ""}
                                  onChange={(event) =>
                                    updateLine(index, {
                                      qty_missing: toNumber(event.target.value),
                                    })
                                  }
                                  disabled={isTerminalStatus}
                                  placeholder="0"
                                  className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground disabled:opacity-50"
                                />
                              </label>
                              <label className="text-xs text-muted-foreground">
                                Sample Qty
                                <input
                                  type="number"
                                  min="0"
                                  step="0.001"
                                  value={line.qty_sample || ""}
                                  onChange={(event) =>
                                    updateLine(index, {
                                      qty_sample: toNumber(event.target.value),
                                    })
                                  }
                                  disabled={isTerminalStatus}
                                  placeholder="0"
                                  className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground disabled:opacity-50"
                                />
                              </label>
                              <label className="text-xs text-muted-foreground">
                                Accepted Qty
                                <input
                                  type="number"
                                  min="0"
                                  step="0.001"
                                  value={line.qty_accepted ?? ""}
                                  onChange={(event) =>
                                    updateLine(index, {
                                      qty_accepted:
                                        event.target.value.trim() === ""
                                          ? null
                                          : toNumber(event.target.value),
                                    })
                                  }
                                  disabled={isTerminalStatus}
                                  placeholder="auto"
                                  className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground disabled:opacity-50"
                                />
                              </label>
                              <label className="text-xs text-muted-foreground">
                                Putaway Location
                                <input
                                  value={line.putaway_location_ref ?? ""}
                                  onChange={(event) =>
                                    updateLine(index, {
                                      putaway_location_ref:
                                        event.target.value.trim() || null,
                                    })
                                  }
                                  disabled={isTerminalStatus}
                                  placeholder="e.g. WH-A-01"
                                  className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground disabled:opacity-50"
                                />
                              </label>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          QC pass lines require checked quantity. Hold and reject lines require a reason.
          Municipality submission and approval are blocked while any line is still pending
          or on hold. Expand the Discrepancy section per line to record damaged, missing,
          sample quantities, accepted qty override, and putaway location.
        </section>

        <section className="flex justify-end">
          <button
            type="button"
            onClick={() => navigate(`/grn/${header.id}`)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground"
          >
            <CheckCircle2 className="h-4 w-4" />
            Open GRN Details
          </button>
        </section>
      </main>
    </div>
  );
}
