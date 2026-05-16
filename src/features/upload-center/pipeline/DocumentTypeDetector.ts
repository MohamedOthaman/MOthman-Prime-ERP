import type { DocumentType } from "../types";

export function documentTypeLabel(type: DocumentType): string {
  switch (type) {
    case "invoice": return "Sales Invoice";
    case "sku": return "Product / SKU";
    case "packing_list": return "Packing List";
    default: return "Unknown";
  }
}

export function documentTypeLabelAr(type: DocumentType): string {
  switch (type) {
    case "invoice": return "فاتورة بيع";
    case "sku": return "منتج / SKU";
    case "packing_list": return "قائمة تعبئة";
    default: return "غير محدد";
  }
}
