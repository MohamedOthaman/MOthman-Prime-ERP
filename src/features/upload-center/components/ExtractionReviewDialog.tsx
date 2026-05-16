import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { DocumentTypeBadge } from "./DocumentTypeBadge";
import type { UploadItem, DocumentType } from "../types";
import { useLang } from "@/contexts/LanguageContext";

interface Props {
  item: UploadItem;
  onConfirm: (item: UploadItem, chosenType: DocumentType) => void;
  onClose: () => void;
}

const DOC_TYPES: DocumentType[] = ["invoice", "sku", "packing_list"];

export function ExtractionReviewDialog({ item, onConfirm, onClose }: Props) {
  const { t } = useLang();
  const [chosenType, setChosenType] = useState<DocumentType>(
    item.result?.documentType ?? "invoice"
  );

  if (!item.result) return null;
  const { rows, warnings, confidence } = item.result;
  const previewRows = rows.slice(0, 8);
  const headers = previewRows.length > 0 ? Object.keys(previewRows[0]) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <DocumentTypeBadge type={chosenType} />
            <ConfidenceBadge confidence={confidence ?? 0} />
            <span className="text-sm text-muted-foreground">{item.file.name}</span>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-muted/50">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Type selector */}
        <div className="border-b border-border px-5 py-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {t("reviewDocumentType", "Document type")}
          </p>
          <div className="flex gap-2">
            {DOC_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setChosenType(type)}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                  chosenType === type
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-muted/50"
                }`}
              >
                <DocumentTypeBadge type={type} />
              </button>
            ))}
          </div>
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="border-b border-border bg-amber-500/5 px-5 py-3">
            {warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-amber-600">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {w}
              </div>
            ))}
          </div>
        )}

        {/* Data preview */}
        <div className="flex-1 overflow-auto px-5 py-4">
          <p className="mb-2 text-xs text-muted-foreground">
            {t("reviewPreview", "Preview")} — {rows.length} {t("rows", "rows")}
            {rows.length > 8 ? ` (${t("showing", "showing")} 8)` : ""}
          </p>
          {previewRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noDataExtracted", "No data extracted.")}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    {headers.map((h) => (
                      <th key={h} className="border-b border-border px-3 py-2 text-left font-medium text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, ri) => (
                    <tr key={ri} className={ri % 2 === 0 ? "" : "bg-muted/20"}>
                      {headers.map((h) => (
                        <td key={h} className="border-b border-border px-3 py-1.5 text-foreground">
                          {String(row[h] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
          >
            {t("cancel", "Cancel")}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(item, chosenType)}
            disabled={rows.length === 0}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {t("importRows", "Import")} {rows.length > 0 ? `(${rows.length})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
