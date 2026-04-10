export type ProductStorageType = "Frozen" | "Chilled" | "Dry";

interface StorageInput {
  category?: string | null;
  brand?: string | null;
  section?: string | null;
  name_en?: string | null;
  name_ar?: string | null;
  storage_type?: string | null;
}

const FROZEN_KEYWORDS = [
  "FROZEN",
  "ICE CREAM",
  "SORBET",
  "PUFF PASTRY",
  "CROISSANT",
  "FILO",
  "FILO",
  "DANISH",
];

const CHILLED_KEYWORDS = [
  "CHEESE",
  "YOGURT",
  "YOGHURT",
  "LABNEH",
  "LABAN",
  "CREAM",
  "MILK",
  "BUTTER",
  "MOZZARELLA",
  "MASCARPONE",
  "RICOTTA",
  "BURRATA",
];

export function inferStorageType(product: StorageInput): ProductStorageType {
  if (product.storage_type === "Frozen" || product.storage_type === "Chilled" || product.storage_type === "Dry") {
    return product.storage_type;
  }

  const combined = [
    product.category,
    product.brand,
    product.section,
    product.name_en,
    product.name_ar,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  if (FROZEN_KEYWORDS.some((keyword) => combined.includes(keyword))) {
    return "Frozen";
  }

  if (combined.includes("UHT")) {
    return "Dry";
  }

  if ((product.category || "").toUpperCase() === "DAIRY") {
    return "Chilled";
  }

  if (CHILLED_KEYWORDS.some((keyword) => combined.includes(keyword))) {
    return "Chilled";
  }

  return "Dry";
}
