import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Loader2,
  Eye,
  FileText,
  FileSpreadsheet,
} from "lucide-react";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { DocumentTypeBadge } from "./DocumentTypeBadge";
import type { UploadItem } from "../types";
import { useLang } from "@/contexts/LanguageContext";

interface Props {
  items: UploadItem[];
  onReview: (item: UploadItem) => void;
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return <FileText className="h-4 w-4 text-red-400" />;
  return <FileSpreadsheet className="h-4 w-4 text-emerald-500" />;
}

function StatusIcon({ status }: { status: UploadItem["status"] }) {
  switch (status) {
    case "queued":    return <Clock className="h-4 w-4 text-muted-foreground" />;
    case "extracting":return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    case "review":    return <Eye className="h-4 w-4 text-amber-500" />;
    case "applying":  return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    case "done":      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "error":     return <AlertTriangle className="h-4 w-4 text-destructive" />;
  }
}

export function UploadQueueTable({ items, onReview }: Props) {
  const { t } = useLang();

  if (items.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {t("uploadQueue", "Upload Queue")} — {items.length}
        </p>
      </div>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-4 py-3">
            <FileIcon name={item.file.name} />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {item.file.name}
                </span>
                {item.documentType && <DocumentTypeBadge type={item.documentType} />}
                {item.confidence !== undefined && <ConfidenceBadge confidence={item.confidence} />}
              </div>
              {item.progress && (
                <p className="mt-0.5 text-xs text-muted-foreground">{item.progress}</p>
              )}
              {item.error && (
                <p className="mt-0.5 text-xs text-destructive">{item.error}</p>
              )}
              {item.status === "done" && item.appliedCount !== undefined && (
                <p className="mt-0.5 text-xs text-emerald-500">
                  {t("importedRows", "Imported")} {item.appliedCount} {t("rows", "rows")}
                </p>
              )}
              {item.warnings.length > 0 && item.status !== "error" && (
                <p className="mt-0.5 text-xs text-amber-500">{item.warnings[0]}</p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <StatusIcon status={item.status} />
              {item.status === "review" && (
                <button
                  type="button"
                  onClick={() => onReview(item)}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                >
                  {t("review", "Review")}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
