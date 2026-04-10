export type ProductDisplayLanguage = "en" | "ar";

export interface ProductDisplayNameInput {
  name_en?: string | null;
  name_ar?: string | null;
  name?: string | null;
  item_code?: string | null;
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) return normalized;
  }

  return "";
}

export function getProductDisplayName(
  product: ProductDisplayNameInput,
  lang: ProductDisplayLanguage
) {
  if (lang === "ar") {
    return (
      firstNonEmpty(product.name_ar, product.name_en, product.name, product.item_code) ||
      "Unnamed product"
    );
  }

  return (
    firstNonEmpty(product.name_en, product.name_ar, product.name, product.item_code) ||
    "Unnamed product"
  );
}
