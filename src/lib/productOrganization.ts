import { inferStorageType } from "./productStorage";

export type ProductGroupBy = "brand" | "storage" | "category" | "section";

interface ProductOrganizationInput {
  brand?: string | null;
  category?: string | null;
  section?: string | null;
  storageType?: string | null;
  storage_type?: string | null;
}

export function getProductGroupLabel(
  product: ProductOrganizationInput,
  groupBy: ProductGroupBy
) {
  switch (groupBy) {
    case "storage":
      return inferStorageType({
        storage_type: product.storageType || product.storage_type,
        category: product.category,
        brand: product.brand,
        section: product.section,
      });
    case "category":
      return product.category || "Uncategorized";
    case "section":
      return product.section || product.brand || product.category || "General";
    case "brand":
    default:
      return product.brand || product.category || "General";
  }
}
