import { supabase } from "@/integrations/supabase/client";

export interface ProductImportValidationRow {
  id: string;
  item_code: string;
  internal_code: string | null;
  name_en: string | null;
  name_ar: string | null;
  brand: string | null;
  category: string | null;
  country: string | null;
  image_path: string | null;
  primary_barcode: string | null;
  all_barcodes: string[];
  selling_price: number | null;
  cost_price: number | null;
}

export interface ProductImportValidationSummary {
  totalProducts: number;
  totalBarcodes: number;
  totalPriceRows: number;
  productsWithoutBarcode: number;
  productsWithoutPrice: number;
  productsWithoutArabicName: number;
  productsWithoutInternalCode: number;
  productsWithoutImage: number;
  topBrandsCount: number;
  topCategoriesCount: number;
}

export async function getProductImportValidationRows() {
  const { data, error } = await supabase
    .from("products" as any)
    .select(`
      id,
      item_code,
      internal_code,
      name_en,
      name_ar,
      brand,
      category,
      country,
      image_path,
      product_barcodes (
        barcode,
        is_primary
      ),
      product_prices (
        cost_price,
        selling_price
      )
    `)
    .order("item_code", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row: any) => {
    const barcodeRows = Array.isArray(row.product_barcodes) ? row.product_barcodes : [];
    const primaryBarcode =
      barcodeRows.find((barcode: any) => barcode?.is_primary)?.barcode ??
      barcodeRows[0]?.barcode ??
      null;
    const priceRow = Array.isArray(row.product_prices) ? row.product_prices[0] : null;

    return {
      id: row.id,
      item_code: row.item_code ?? "",
      internal_code: row.internal_code ?? null,
      name_en: row.name_en ?? row.name ?? null,
      name_ar: row.name_ar ?? null,
      brand: row.brand ?? null,
      category: row.category ?? null,
      country: row.country ?? null,
      image_path: row.image_path ?? null,
      primary_barcode: primaryBarcode,
      all_barcodes: barcodeRows.map((barcode: any) => barcode.barcode).filter(Boolean),
      selling_price: priceRow?.selling_price == null ? null : Number(priceRow.selling_price),
      cost_price: priceRow?.cost_price == null ? null : Number(priceRow.cost_price),
    } satisfies ProductImportValidationRow;
  });
}

export function summarizeProductImportValidation(rows: ProductImportValidationRow[]): ProductImportValidationSummary {
  const uniqueBrands = new Set(
    rows.map((row) => (row.brand ?? "").trim()).filter(Boolean)
  );
  const uniqueCategories = new Set(
    rows.map((row) => (row.category ?? "").trim()).filter(Boolean)
  );

  return {
    totalProducts: rows.length,
    totalBarcodes: rows.reduce((sum, row) => sum + row.all_barcodes.length, 0),
    totalPriceRows: rows.reduce((sum, row) => sum + (row.selling_price != null || row.cost_price != null ? 1 : 0), 0),
    productsWithoutBarcode: rows.filter((row) => row.all_barcodes.length === 0).length,
    productsWithoutPrice: rows.filter((row) => row.selling_price == null && row.cost_price == null).length,
    productsWithoutArabicName: rows.filter((row) => !row.name_ar).length,
    productsWithoutInternalCode: rows.filter((row) => !row.internal_code).length,
    productsWithoutImage: rows.filter((row) => !row.image_path).length,
    topBrandsCount: uniqueBrands.size,
    topCategoriesCount: uniqueCategories.size,
  };
}
