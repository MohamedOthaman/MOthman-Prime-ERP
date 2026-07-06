import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Brand, Product, Invoice, InvoiceItem, Batch, recalcDaysLeft } from "@/data/stockData";
import { useAuth } from "@/features/reports/hooks/useAuth";
import { inferStorageType } from "@/lib/productStorage";
import { getInventoryStockPageSnapshot } from "@/features/services/inventoryService";

export interface MovementEntry {
  id: string;
  date: string;
  time: string;
  type: "IN" | "OUT";
  productCode: string;
  productName: string;
  batchNo: string;
  qty: number;
  unit: string;
  invoiceNo?: string;
  returnId?: string;
}

function normalizeOpeningBatchQuantity(
  qty: number,
  unit: string,
  packSize?: number | null
) {
  if (!Number.isFinite(qty) || qty <= 0) {
    return { qty: 0, unit };
  }

  const normalizedUnit = (unit || "CTN").toUpperCase();
  const roundedQty = Number(qty.toFixed(3));
  const isFractional = Math.abs(roundedQty - Math.trunc(roundedQty)) > 0.0001;

  if (normalizedUnit === "CTN" && isFractional && packSize && packSize > 0) {
    return {
      qty: Number((roundedQty * packSize).toFixed(3)),
      unit: "PCS",
    };
  }

  return { qty: roundedQty, unit: normalizedUnit };
}

function resolveStockUnit(uom?: string | null, packaging?: string | null) {
  const normalizedUom = uom?.trim();
  if (normalizedUom) return normalizedUom;

  const packagingUnits = packaging
    ?.split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  return packagingUnits?.[0] || "UNIT";
}

function sanitizeBarcodes(values: string[] | undefined) {
  return Array.from(new Set((values || []).map((value) => value.trim()).filter(Boolean)));
}

async function syncImportedBarcodes(productId: string, barcodes: string[]) {
  const normalizedBarcodes = sanitizeBarcodes(barcodes);

  const { error: deleteError } = await supabase.from("product_barcodes").delete().eq("product_id", productId);
  if (deleteError && deleteError.code !== "PGRST205") throw deleteError;

  if (normalizedBarcodes.length === 0) return;

  const { error: insertError } = await supabase.from("product_barcodes").insert(
    normalizedBarcodes.map((barcode, index) => ({
      product_id: productId,
      barcode,
      is_primary: index === 0,
      source: "excel_import",
    }))
  );

  if (insertError) throw insertError;
}

/**
 * Canonical stock hook.
 *
 * Reads only canonical sources (products_overview / inventory views,
 * sales_headers + sales_lines, inventory_movements). Stock quantities are
 * NEVER written here — they change exclusively through posted documents
 * (GRN receiving, invoice posting, returns) so movements stay authoritative.
 * The legacy invoices/invoice_items/batches/movements/market_returns tables
 * this hook once used do not exist on the live database.
 */
export function useStock() {
  const { user } = useAuth();
  const [stock, setStock] = useState<Brand[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [movements, setMovements] = useState<MovementEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Load all data from canonical sources
  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const stockSnapshot = await getInventoryStockPageSnapshot();
      const batchesByProduct = new Map<string, typeof stockSnapshot.batches>();
      stockSnapshot.batches.forEach((batch) => {
        const current = batchesByProduct.get(batch.product_id) ?? [];
        current.push(batch);
        batchesByProduct.set(batch.product_id, current);
      });

      const grouped = new Map<string, Product[]>();

      stockSnapshot.products.forEach((p) => {
        const brandName = p.brand || p.category || "General";
        const sectionName = p.section || p.brand || p.category || "General";
        const storageType = inferStorageType({
          storage_type: p.storage_type,
          category: p.category,
          brand: p.brand,
          section: p.section,
          name_en: p.name_en || p.name || "",
          name_ar: p.name_ar,
        });
        const packSize = Number(p.carton_holds ?? 0) || null;
        const stockUnit = resolveStockUnit(p.uom, p.packaging);
        if (!grouped.has(brandName)) {
           grouped.set(brandName, []);
        }

        const batches: Batch[] = (batchesByProduct.get(p.product_id) ?? [])
          .filter((batch) => batch.remaining_quantity > 0)
          .sort((left, right) => {
            if (left.expiry_date === right.expiry_date) {
              return (left.batch_no || "").localeCompare(right.batch_no || "");
            }
            if (!left.expiry_date) return 1;
            if (!right.expiry_date) return -1;
            return left.expiry_date.localeCompare(right.expiry_date);
          })
          .map((bt) => {
          const normalized = normalizeOpeningBatchQuantity(
            Number(bt.remaining_quantity ?? 0),
            stockUnit,
            packSize
          );

          return {
            batchNo: bt.batch_no || bt.receiving_reference || "UNBATCHED",
            qty: normalized.qty,
            unit: normalized.unit,
            productionDate: bt.production_date || "",
            expiryDate: bt.expiry_date || "",
            daysLeft: 0,
            receivedDate: bt.first_received_date || bt.last_received_date || "",
            receivedQty: Number(bt.received_quantity ?? 0),
            issuedQty: Number(bt.issued_quantity ?? 0),
            remainingQty: Number(bt.remaining_quantity ?? 0),
            referenceNo: bt.receiving_reference || bt.grn_no || bt.receiving_invoice_no || "",
          };
        });

        const product: Product = {
          code: p.code || p.item_code || "",
          itemCode: p.item_code || p.code || "",
          name: p.name_en || p.name || "",
          nameAr: p.name_ar || "",
          brand: p.brand || p.category || "General",
          section: sectionName,
          category: p.category || "",
          totalQty: [{ amount: Number(p.available_quantity ?? 0), unit: stockUnit }],
          packaging: p.packaging || stockUnit,
          nearestExpiryDays: 999,
          storageType,
          batches,
          barcodes: p.all_barcodes || [],
          primaryBarcode: p.primary_barcode || p.all_barcodes?.[0] || undefined,
          cartonHolds: packSize || undefined,
          availableQuantity: Number(p.available_quantity ?? 0),
          stockUnit,
          batchCount: Number(p.batch_count ?? batches.length),
          nearestExpiryDate: p.nearest_expiry || undefined,
        };

        grouped.get(brandName)!.push(product);
      });

      const brands: Brand[] = Array.from(grouped.entries()).map(([name, products]) => ({
         name,
         products: products.sort((left, right) =>
           `${left.name} ${left.code}`.localeCompare(`${right.name} ${right.code}`)
         ),
      })).sort((a, b) => a.name.localeCompare(b.name));

      setStock(recalcDaysLeft(brands));

      // Product info lookup for movement rows (joined client-side).
      const productInfoById = new Map(
        stockSnapshot.products.map((p) => [
          p.product_id,
          { item_code: p.item_code ?? p.code ?? "", name: p.name ?? "", uom: p.uom ?? "" },
        ])
      );

      // Recent sales (last 90 days) — used for product movement-speed badges.
      const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const [salesResult, movementsResult] = await Promise.all([
        supabase
          .from("sales_headers")
          .select("id, invoice_no, invoice_date, status, created_at, sales_lines(quantity, products:product_id(item_code, name))")
          .gte("invoice_date", since)
          .neq("status", "cancelled")
          .order("invoice_date", { ascending: false })
          .limit(500),
        // No FK from inventory_movements.product_id exists on live, so a
        // PostgREST embed is rejected — product info is joined client-side
        // from the stock snapshot already loaded above.
        supabase
          .from("inventory_movements")
          .select("id, movement_type, qty_in, qty_out, product_id, batch_no, performed_at, reference_type, reference_id")
          .order("performed_at", { ascending: false })
          .limit(200),
      ]);

      if (!salesResult.error) {
        setInvoices(((salesResult.data ?? []) as any[]).map((inv): Invoice => {
          const items: InvoiceItem[] = ((inv.sales_lines ?? []) as any[]).map((line) => ({
            productCode: line.products?.item_code ?? "",
            productName: line.products?.name ?? "",
            qty: Number(line.quantity ?? 0),
            unit: "",
            batchNo: "",
            expiryDate: "",
          }));
          return {
            invoiceNo: inv.invoice_no ?? "",
            date: inv.invoice_date ?? "",
            time: inv.created_at?.split("T")[1]?.split(".")[0] ?? "",
            customerName: "",
            items,
            type: "OUT" as const,
            status: inv.status === "done" ? "done" : inv.status === "cancelled" ? "cancelled" : "ready",
            deductionLog: [],
          };
        }));
      }

      if (!movementsResult.error) {
        setMovements(((movementsResult.data ?? []) as any[]).map((m): MovementEntry => {
          const qtyIn = Number(m.qty_in ?? 0);
          const qtyOut = Number(m.qty_out ?? 0);
          const prod = productInfoById.get(m.product_id);
          return {
            id: m.id,
            date: m.performed_at?.split("T")[0] || "",
            time: m.performed_at?.split("T")[1]?.split(".")[0] || "",
            type: qtyIn > 0 ? "IN" : "OUT",
            productCode: prod?.item_code ?? "",
            productName: prod?.name ?? "",
            batchNo: m.batch_no ?? "",
            qty: qtyIn > 0 ? qtyIn : qtyOut,
            unit: prod?.uom ?? "",
            invoiceNo: m.reference_type === "INVOICE" ? (m.reference_id ?? undefined) : undefined,
            returnId: m.reference_type === "RETURN" ? (m.reference_id ?? undefined) : undefined,
          };
        }));
      }
    } catch (err) {
      console.error("Failed to load data:", err);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const findProduct = useCallback((code: string) => {
    for (const brand of stock) {
      const product = brand.products.find(p => p.code === code);
      if (product) return { brand: brand.name, product };
    }
    return null;
  }, [stock]);

  const findProductByBarcode = useCallback((barcode: string) => {
    for (const brand of stock) {
      const product = brand.products.find(p => p.barcodes?.includes(barcode));
      if (product) return { brand: brand.name, product };
    }
    return null;
  }, [stock]);

  /**
   * Create or update a product master record (master data only — batch
   * quantities are intentionally NOT written here; stock enters through GRN
   * receiving so every quantity has a movement behind it).
   */
  const addProduct = useCallback(async (brandName: string, product: Product) => {
    // Upsert brand
    let { data: brand } = await supabase.from("brands").select("id").eq("name", brandName).single();
    if (!brand) {
      const { data: newBrand } = await supabase.from("brands").insert({ name: brandName }).select("id").single();
      brand = newBrand;
    }
    if (!brand) return;

    const { data: existing } = await supabase.from("products").select("id").eq("code", product.code).single();
    if (existing) {
      await supabase.from("products").update({
        name: product.name, brand_id: brand.id, packaging: product.packaging,
        storage_type: product.storageType, barcodes: product.barcodes || [], carton_holds: product.cartonHolds,
        name_ar: product.nameAr || "",
      }).eq("id", existing.id);
      await syncImportedBarcodes(existing.id, product.barcodes || []);
    } else {
      const { data: newProd } = await supabase.from("products").insert({
        code: product.code, item_code: product.code, name: product.name, brand_id: brand.id, packaging: product.packaging,
        storage_type: product.storageType, barcodes: product.barcodes || [], carton_holds: product.cartonHolds,
        name_ar: product.nameAr || "",
      }).select("id").single();
      if (newProd) {
        await syncImportedBarcodes(newProd.id, product.barcodes || []);
      }
    }
    await loadData();
  }, [loadData]);

  const updateProduct = useCallback(async (productCode: string, updatedProduct: Product, newBrandName: string) => {
    // Get or create brand
    let { data: brand } = await supabase.from("brands").select("id").eq("name", newBrandName).single();
    if (!brand) {
      const { data: newBrand } = await supabase.from("brands").insert({ name: newBrandName }).select("id").single();
      brand = newBrand;
    }
    if (!brand) return;

    const { data: existing } = await supabase.from("products").select("id").eq("code", productCode).single();
    if (existing) {
      await supabase.from("products").update({
        code: updatedProduct.code, name: updatedProduct.name, brand_id: brand.id,
        packaging: updatedProduct.packaging, storage_type: updatedProduct.storageType,
        barcodes: updatedProduct.barcodes || [], carton_holds: updatedProduct.cartonHolds,
        name_ar: updatedProduct.nameAr || "",
      }).eq("id", existing.id);
      await syncImportedBarcodes(existing.id, updatedProduct.barcodes || []);
    }

    await loadData();
  }, [loadData]);

  /**
   * Import product master data (products + barcodes). Batch rows in the
   * import are ignored: opening stock must go through GRN receiving or the
   * dedicated import_food_choice_opening_stock RPC so quantities stay
   * movement-backed.
   */
  const importProducts = useCallback(async (newBrands: Brand[]) => {
    for (const newBrand of newBrands) {
      let { data: brand } = await supabase.from("brands").select("id").eq("name", newBrand.name).single();
      if (!brand) {
        const { data: created } = await supabase.from("brands").insert({ name: newBrand.name }).select("id").single();
        brand = created;
      }
      if (!brand) continue;

      for (const newProd of newBrand.products) {
        let { data: prod } = await supabase
          .from("products")
          .select("id")
          .or(`code.eq.${newProd.code},item_code.eq.${newProd.code}`)
          .maybeSingle();

        if (!prod) {
          const { data: created, error: createError } = await supabase
            .from("products")
            .insert({
              code: newProd.code,
              item_code: newProd.itemCode || newProd.code,
              name: newProd.name,
              name_en: newProd.name,
              name_ar: newProd.nameAr || null,
              brand_id: brand.id,
              category: newProd.category || null,
              packaging: newProd.packaging,
              uom: newProd.stockUnit || newProd.totalQty[0]?.unit || null,
              storage_type: newProd.storageType,
              carton_holds: newProd.cartonHolds ?? null,
              is_active: true,
            })
            .select("id")
            .single();

          if (createError) throw createError;
          prod = created;
        } else {
          const updatePayload = {
            code: newProd.code,
            item_code: newProd.itemCode || newProd.code,
            name: newProd.name,
            name_en: newProd.name,
            name_ar: newProd.nameAr || null,
            brand_id: brand.id,
            category: newProd.category || null,
            packaging: newProd.packaging,
            uom: newProd.stockUnit || newProd.totalQty[0]?.unit || null,
            storage_type: newProd.storageType,
            carton_holds: newProd.cartonHolds ?? null,
            is_active: true,
          };

          const primaryUpdate = await supabase.from("products").update(updatePayload).eq("id", prod.id);
          if (primaryUpdate.error) throw primaryUpdate.error;
        }
        if (!prod) continue;

        await syncImportedBarcodes(prod.id, newProd.barcodes || []);
      }
    }
    await loadData();
  }, [loadData]);

  return {
    stock, invoices, movements, loading,
    findProduct, findProductByBarcode, addProduct, updateProduct,
    importProducts, setStock, loadData,
  };
}
