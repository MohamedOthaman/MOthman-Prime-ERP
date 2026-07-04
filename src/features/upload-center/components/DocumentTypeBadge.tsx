import type { DocumentType } from "../types";
import { useLang } from "@/contexts/LanguageContext";

interface Props {
  type: DocumentType;
}

export function DocumentTypeBadge({ type }: Props) {
  const { t } = useLang();
  const map: Record<DocumentType, { label: string; color: string }> = {
    invoice:      { label: t("docTypeInvoice", "Sales Invoice"),   color: "text-primary border-primary/30 bg-primary/10" },
    purchase_order: { label: t("docTypePurchaseOrder", "Purchase Order"), color: "text-amber-500 border-amber-500/30 bg-amber-500/10" },
    sku:          { label: t("docTypeSku", "Product / SKU"),       color: "text-violet-500 border-violet-500/30 bg-violet-500/10" },
    packing_list: { label: t("docTypePackingList", "Packing List"), color: "text-teal-500 border-teal-500/30 bg-teal-500/10" },
    unknown:      { label: t("docTypeUnknown", "Unknown"),          color: "text-muted-foreground border-border bg-secondary" },
  };
  const { label, color } = map[type];
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${color}`}>
      {label}
    </span>
  );
}
