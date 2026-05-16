import { useState, useCallback } from "react";
import { Upload, Info } from "lucide-react";
import { toast } from "sonner";
import { DragDropZone } from "./DragDropZone";
import { UploadQueueTable } from "./UploadQueueTable";
import { ExtractionReviewDialog } from "./ExtractionReviewDialog";
import { runExtraction } from "../pipeline/ExtractionPipeline";
import type { UploadItem, DocumentType } from "../types";
import type { ParsedInvoice, ParsedProduct, ParsedPackingItem } from "@/lib/pdfParser";
import { useStockContext } from "@/contexts/StockContext";
import { useLang } from "@/contexts/LanguageContext";

let _idCounter = 0;
function nextId() {
  return `uc-${Date.now()}-${++_idCounter}`;
}

export function UploadCenter() {
  const { t } = useLang();
  const { addInvoice, importProducts, loadData } = useStockContext();
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [reviewItem, setReviewItem] = useState<UploadItem | null>(null);

  function updateItem(id: string, patch: Partial<UploadItem>) {
    setQueue((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  const processFile = useCallback(
    async (item: UploadItem) => {
      updateItem(item.id, { status: "extracting", progress: t("extractingFile", "Extracting…") });
      try {
        const { result } = await runExtraction(item.file, {
          onProgress: (msg) => updateItem(item.id, { progress: msg }),
        });
        updateItem(item.id, {
          status: "review",
          result,
          documentType: result.documentType,
          confidence: result.confidence,
          warnings: result.warnings,
          progress: undefined,
        });
      } catch (err) {
        updateItem(item.id, {
          status: "error",
          error: err instanceof Error ? err.message : t("extractionFailed", "Extraction failed"),
          progress: undefined,
        });
      }
    },
    [t],
  );

  function handleFiles(files: File[]) {
    const newItems: UploadItem[] = files.map((file) => ({
      id: nextId(),
      file,
      status: "queued",
      warnings: [],
    }));
    setQueue((prev) => [...prev, ...newItems]);
    newItems.reduce(
      (chain, item) => chain.then(() => processFile(item)),
      Promise.resolve(),
    );
  }

  async function handleConfirm(item: UploadItem, chosenType: DocumentType) {
    setReviewItem(null);
    if (!item.result) return;
    updateItem(item.id, { status: "applying", documentType: chosenType, progress: t("applying", "Applying…") });

    try {
      let count = 0;

      if (chosenType === "invoice") {
        const invoices = item.result.rows as unknown as ParsedInvoice[];
        for (const inv of invoices) {
          try {
            await addInvoice({
              invoiceNo: inv.invoiceNo,
              date: inv.date,
              time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
              customerName: inv.customerName,
              items: inv.items.map((it) => ({
                productCode: it.itemCode,
                productName: it.itemName,
                qty: it.qty,
                unit: it.uom,
                batchNo: "",
                expiryDate: "",
              })),
              type: "OUT",
              status: "ready",
              deductionLog: [],
            });
            count++;
          } catch {
            // skip individual failures
          }
        }
        await loadData();
      } else if (chosenType === "sku") {
        const products = item.result.rows as unknown as ParsedProduct[];
        const brandMap = new Map<string, ParsedProduct[]>();
        for (const p of products) {
          const brand = p.brand || "Unknown";
          if (!brandMap.has(brand)) brandMap.set(brand, []);
          brandMap.get(brand)!.push(p);
        }
        const brands = Array.from(brandMap.entries()).map(([name, prods]) => ({
          name,
          products: prods.map((p) => ({
            code: p.itemCode,
            name: p.itemName,
            totalQty: [{ amount: p.totalStock ?? p.batches.reduce((s, b) => s + b.qty, 0), unit: p.baseUom }],
            packaging: p.baseUom,
            nearestExpiryDays: 999,
            storageType: "Dry" as const,
            batches: p.batches
              .filter((b) => b.qty > 0)
              .map((b) => ({
                batchNo: b.batchNo,
                qty: b.qty,
                unit: p.baseUom,
                productionDate: "",
                expiryDate: b.expiryDate,
                daysLeft: 0,
                receivedDate: new Date().toISOString().split("T")[0],
              })),
          })),
        }));
        await importProducts(brands);
        count = products.length;
      } else if (chosenType === "packing_list") {
        const items = item.result.rows as unknown as ParsedPackingItem[];
        const brands = [
          {
            name: "Incoming",
            products: items.map((p) => ({
              code: p.itemCode,
              name: p.itemName,
              totalQty: [{ amount: p.qty, unit: p.unit }],
              packaging: p.unit,
              nearestExpiryDays: 999,
              storageType: "Dry" as const,
              batches: [
                {
                  batchNo: p.batchNo ?? `PL-${Date.now()}`,
                  qty: p.qty,
                  unit: p.unit,
                  productionDate: p.productionDate ?? "",
                  expiryDate: p.expiryDate ?? "",
                  daysLeft: 0,
                  receivedDate: new Date().toISOString().split("T")[0],
                },
              ],
            })),
          },
        ];
        await importProducts(brands);
        count = items.length;
      }

      updateItem(item.id, { status: "done", appliedCount: count, progress: undefined });
      toast.success(`${count} ${t("rowsImported", "rows imported")} — ${item.file.name}`);
    } catch (err) {
      updateItem(item.id, {
        status: "error",
        error: err instanceof Error ? err.message : t("applyFailed", "Failed to apply"),
        progress: undefined,
      });
    }
  }

  const stats = {
    total: queue.length,
    done: queue.filter((i) => i.status === "done").length,
    errors: queue.filter((i) => i.status === "error").length,
    pending: queue.filter((i) => ["queued", "extracting", "review", "applying"].includes(i.status)).length,
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-11 z-40 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">
              {t("uploadCenterTitle", "Owner Upload Center")}
            </h1>
            {queue.length > 0 && (
              <span className="ms-auto text-xs text-muted-foreground">
                {stats.done}/{stats.total} {t("done", "done")}
                {stats.errors > 0 && (
                  <span className="ms-2 text-destructive">
                    · {stats.errors} {t("failed", "failed")}
                  </span>
                )}
              </span>
            )}
            {stats.done > 0 && (
              <button
                type="button"
                onClick={() => setQueue((prev) => prev.filter((i) => i.status !== "done"))}
                className="ms-2 text-xs text-muted-foreground hover:text-foreground"
              >
                {t("clearDone", "Clear done")}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-5">
        <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-xs text-foreground">
            {t(
              "uploadCenterInfo",
              "Upload PDF invoices, Excel SKU reports, or packing lists. Files are extracted by AI and reviewed before importing.",
            )}
          </p>
        </div>

        {queue.length > 0 && (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: t("total", "Total"), value: stats.total, color: "text-foreground" },
              { label: t("pending", "Pending"), value: stats.pending, color: "text-amber-500" },
              { label: t("done", "Done"), value: stats.done, color: "text-emerald-500" },
              { label: t("failed", "Failed"), value: stats.errors, color: "text-destructive" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-lg border border-border bg-card p-3 text-center">
                <p className={`text-xl font-semibold ${color}`}>{value}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        )}

        <DragDropZone onFiles={handleFiles} />

        <UploadQueueTable items={queue} onReview={(item) => setReviewItem(item)} />
      </main>

      {reviewItem && (
        <ExtractionReviewDialog
          item={reviewItem}
          onConfirm={handleConfirm}
          onClose={() => setReviewItem(null)}
        />
      )}
    </div>
  );
}
