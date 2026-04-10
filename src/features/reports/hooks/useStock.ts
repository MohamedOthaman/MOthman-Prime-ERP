import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Brand, Product, Invoice, InvoiceItem, MarketReturn, Batch, recalcDaysLeft } from "@/data/stockData";
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

function isMissingRelation(error: { code?: string; message?: string } | null, relation: string) {
  if (!error) return false;
  return error.code === "PGRST205" || error.message?.includes(relation) || false;
}

function sanitizeBarcodes(values: string[] | undefined) {
  return Array.from(new Set((values || []).map((value) => value.trim()).filter(Boolean)));
}

async function syncImportedBarcodes(productId: string, barcodes: string[]) {
  const normalizedBarcodes = sanitizeBarcodes(barcodes);

  const { error: deleteError } = await supabase.from("product_barcodes" as any).delete().eq("product_id", productId);
  if (deleteError && deleteError.code !== "PGRST205") throw deleteError;

  if (normalizedBarcodes.length === 0) return;

  const { error: insertError } = await supabase.from("product_barcodes" as any).insert(
    normalizedBarcodes.map((barcode, index) => ({
      product_id: productId,
      barcode,
      is_primary: index === 0,
      source: "excel_import",
    }))
  );

  if (insertError) throw insertError;
}

async function replaceImportedBatches(productId: string, batches: Batch[]) {
  const validRows = batches.filter((batch) => batch.batchNo.trim() && Number(batch.qty || 0) > 0);

  const primaryDelete = await supabase.from("batches" as any).delete().eq("product_id", productId);
  if (primaryDelete.error && !isMissingRelation(primaryDelete.error, "batches")) {
    throw primaryDelete.error;
  }

  if (!primaryDelete.error) {
    if (validRows.length === 0) return;

    const { error: insertError } = await supabase.from("batches" as any).insert(
      validRows.map((batch) => ({
        product_id: productId,
        batch_no: batch.batchNo.trim(),
        unit: batch.unit,
        production_date: batch.productionDate || null,
        expiry_date: batch.expiryDate || null,
        qty: Number(batch.qty || 0),
        received_date: batch.receivedDate || new Date().toISOString().split("T")[0],
      }))
    );

    if (insertError) throw insertError;
    return;
  }

  const fallbackDelete = await supabase.from("inventory_batches" as any).delete().eq("product_id", productId);
  if (fallbackDelete.error) throw fallbackDelete.error;

  if (validRows.length === 0) return;

  const { error: fallbackInsertError } = await supabase.from("inventory_batches" as any).insert(
    validRows.map((batch) => ({
      product_id: productId,
      batch_no: batch.batchNo.trim(),
      expiry_date: batch.expiryDate || null,
      qty_received: Number(batch.qty || 0),
      qty_available: Number(batch.qty || 0),
      received_date: batch.receivedDate || new Date().toISOString().split("T")[0],
    }))
  );

  if (fallbackInsertError) throw fallbackInsertError;
}

export function useStock() {
  const { user } = useAuth();
  const [stock, setStock] = useState<Brand[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [movements, setMovements] = useState<MovementEntry[]>([]);
  const [returns, setReturns] = useState<MarketReturn[]>([]);
  const [loading, setLoading] = useState(true);

  // Load all data from database
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

      const [
        { data: invoicesData },
        { data: invoiceItemsData },
        { data: movementsData },
        { data: returnsData },
        { data: returnItemsData },
      ] = await Promise.all([
        supabase.from("invoices").select("*").order("created_at", { ascending: false }),
        supabase.from("invoice_items").select("*"),
        supabase.from("movements").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("market_returns").select("*").order("created_at", { ascending: false }),
        supabase.from("return_items").select("*"),
      ]);

      const invs: Invoice[] = (invoicesData || []).map(inv => {
        const items: InvoiceItem[] = (invoiceItemsData || [])
          .filter(it => it.invoice_id === inv.id)
          .map(it => ({
            productCode: it.product_code,
            productName: it.product_name,
            qty: it.qty,
            unit: it.unit,
            batchNo: it.batch_no || "",
            expiryDate: it.expiry_date || "",
          }));
        return {
          invoiceNo: inv.invoice_no,
          date: inv.date,
          time: inv.time || "",
          customerName: inv.customer_name || "",
          items,
          type: "OUT" as const,
          status: inv.status as any,
          deductionLog: items.map(it => ({ batchNo: it.batchNo, qty: it.qty, unit: it.unit, expiryDate: it.expiryDate })),
        };
      });
      setInvoices(invs);

      setMovements((movementsData || []).map(m => ({
        id: m.id,
        date: m.created_at?.split("T")[0] || "",
        time: m.created_at?.split("T")[1]?.split(".")[0] || "",
        type: m.type as "IN" | "OUT",
        productCode: m.product_code,
        productName: m.product_name,
        batchNo: m.batch_no,
        qty: m.qty,
        unit: m.unit,
        invoiceNo: m.invoice_no || undefined,
        returnId: m.return_id || undefined,
      })));

      setReturns((returnsData || []).map(r => ({
        id: r.id,
        date: r.created_at?.split("T")[0] || "",
        time: r.created_at?.split("T")[1]?.split(".")[0] || "",
        customerName: r.customer_name || "",
        driverName: r.driver_name || "",
        voucherNumber: r.voucher_number || "",
        items: (returnItemsData || []).filter(ri => ri.return_id === r.id).map(ri => ({
          productCode: ri.product_code,
          productName: ri.product_name,
          qty: ri.qty,
          unit: ri.unit,
          expiryDate: ri.expiry_date || "",
          batchNo: ri.batch_no || "",
        })),
      })));
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

  const addProduct = useCallback(async (brandName: string, product: Product) => {
    // Upsert brand
    let { data: brand } = await supabase.from("brands").select("id").eq("name", brandName).single();
    if (!brand) {
      const { data: newBrand } = await supabase.from("brands").insert({ name: brandName }).select("id").single();
      brand = newBrand;
    }
    if (!brand) return;

    // Upsert product
    const { data: existing } = await supabase.from("products").select("id").eq("code", product.code).single();
    if (existing) {
      await supabase.from("products").update({
        name: product.name, brand_id: brand.id, packaging: product.packaging,
        storage_type: product.storageType, barcodes: product.barcodes || [], carton_holds: product.cartonHolds,
        name_ar: product.nameAr || "",
      }).eq("id", existing.id);

      // Replace batches
      await supabase.from("batches").delete().eq("product_id", existing.id);
      if (product.batches.length > 0) {
        await supabase.from("batches").insert(product.batches.map(b => ({
          product_id: existing.id, batch_no: b.batchNo, qty: b.qty, unit: b.unit,
          production_date: b.productionDate || null, expiry_date: b.expiryDate, received_date: b.receivedDate || new Date().toISOString().split("T")[0],
        })));
      }
    } else {
      const { data: newProd } = await supabase.from("products").insert({
        code: product.code, name: product.name, brand_id: brand.id, packaging: product.packaging,
        storage_type: product.storageType, barcodes: product.barcodes || [], carton_holds: product.cartonHolds,
        name_ar: product.nameAr || "",
      }).select("id").single();
      if (newProd && product.batches.length > 0) {
        await supabase.from("batches").insert(product.batches.map(b => ({
          product_id: newProd.id, batch_no: b.batchNo, qty: b.qty, unit: b.unit,
          production_date: b.productionDate || null, expiry_date: b.expiryDate, received_date: b.receivedDate || new Date().toISOString().split("T")[0],
        })));
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

      await supabase.from("batches").delete().eq("product_id", existing.id);
      if (updatedProduct.batches.length > 0) {
        await supabase.from("batches").insert(updatedProduct.batches.map(b => ({
          product_id: existing.id, batch_no: b.batchNo, qty: b.qty, unit: b.unit,
          production_date: b.productionDate || null, expiry_date: b.expiryDate, received_date: b.receivedDate || new Date().toISOString().split("T")[0],
        })));
      }
    }

    // Clean up empty brands
    const { data: allBrands } = await supabase.from("brands").select("id, name");
    if (allBrands) {
      for (const b of allBrands) {
        const { count } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("brand_id", b.id);
        if (count === 0) await supabase.from("brands").delete().eq("id", b.id);
      }
    }
    await loadData();
  }, [loadData]);

  const deductFIFO = useCallback(async (productCode: string, qty: number, unit: string, invoiceNo: string) => {
    let remaining = qty;
    const deductionLog: { batchNo: string; qty: number; unit: string; expiryDate: string }[] = [];
    const movementEntries: MovementEntry[] = [];

    // Find product ID and batches
    const { data: prod } = await supabase.from("products").select("id, name").eq("code", productCode).single();
    if (!prod) return { deductionLog, movementEntries };

    const { data: batches } = await supabase.from("batches")
      .select("*").eq("product_id", prod.id).eq("unit", unit)
      .order("expiry_date", { ascending: true });

    for (const batch of (batches || [])) {
      if (remaining <= 0) break;
      const deduct = Math.min(batch.qty, remaining);
      remaining -= deduct;

      deductionLog.push({ batchNo: batch.batch_no, qty: deduct, unit: batch.unit, expiryDate: batch.expiry_date });

      const newQty = batch.qty - deduct;
      if (newQty <= 0) {
        await supabase.from("batches").delete().eq("id", batch.id);
      } else {
        await supabase.from("batches").update({ qty: newQty }).eq("id", batch.id);
      }

      // Record movement
      await supabase.from("movements").insert({
        type: "OUT", product_code: productCode, product_name: prod.name,
        batch_no: batch.batch_no, qty: deduct, unit: batch.unit, invoice_no: invoiceNo,
        created_by: user?.id,
      });

      movementEntries.push({
        id: crypto.randomUUID(), date: new Date().toISOString().split("T")[0],
        time: new Date().toLocaleTimeString(), type: "OUT", productCode,
        productName: prod.name, batchNo: batch.batch_no, qty: deduct, unit: batch.unit, invoiceNo,
      });
    }

    return { deductionLog, movementEntries };
  }, [user]);

  const restoreStock = useCallback(async (
    productCode: string,
    qty: number,
    unit: string,
    batchNo: string,
    expiryDate: string,
    reason: string,
    refId: string,
    skipReload?: boolean
  ) => {
    if (!productCode) return;
    const { data: prod } = await supabase.from("products").select("id, name").eq("code", productCode).single();
    if (!prod) return;

    // Check if batch exists
    const { data: existing } = await supabase
      .from("batches")
      .select("id, qty")
      .eq("product_id", prod.id)
      .eq("batch_no", batchNo)
      .single();

    if (existing) {
      await supabase.from("batches").update({ qty: existing.qty + qty }).eq("id", existing.id);
    } else {
      await supabase.from("batches").insert({
        product_id: prod.id,
        batch_no: batchNo,
        qty,
        unit,
        expiry_date: expiryDate,
        received_date: new Date().toISOString().split("T")[0],
      });
    }

    await supabase.from("movements").insert({
      type: "IN",
      product_code: productCode,
      product_name: prod.name,
      batch_no: batchNo,
      qty,
      unit,
      return_id: refId,
      created_by: user?.id,
    });

    if (!skipReload) {
      await loadData();
    }
  }, [user, loadData]);

  const addInvoice = useCallback(async (invoice: Invoice) => {
    const { data: inv } = await supabase.from("invoices").insert({
      invoice_no: invoice.invoiceNo, customer_name: invoice.customerName,
      date: invoice.date, time: invoice.time, type: invoice.type,
      status: invoice.status, created_by: user?.id,
    }).select("id").single();

    if (inv && invoice.items.length > 0) {
      await supabase.from("invoice_items").insert(invoice.items.map(it => ({
        invoice_id: inv.id, product_code: it.productCode, product_name: it.productName,
        qty: it.qty, unit: it.unit, batch_no: it.batchNo, expiry_date: it.expiryDate || null,
      })));
    }
    await loadData();
  }, [user, loadData]);

  const updateInvoice = useCallback(async (
    invoiceNo: string,
    updater: (inv: Invoice) => Invoice,
    newItems?: InvoiceItem[]
  ) => {
    const inv = invoices.find(i => i.invoiceNo === invoiceNo);
    if (!inv) return;

    const updated = updater(inv);

    const { data: dbInv, error: dbInvErr } = await supabase
      .from("invoices")
      .select("id")
      .eq("invoice_no", invoiceNo)
      .single();

    if (dbInvErr || !dbInv) {
      console.error("Failed to find invoice in DB:", dbInvErr);
      return;
    }

    const { error: updErr } = await supabase
      .from("invoices")
      .update({
        status: updated.status,
        customer_name: updated.customerName || null,
        date: updated.date,
        time: updated.time || "",
        type: updated.type,
      })
      .eq("id", dbInv.id);

    if (updErr) {
      console.error("Failed to update invoice:", updErr);
      return;
    }

    if (newItems) {
      const { error: delErr } = await supabase.from("invoice_items").delete().eq("invoice_id", dbInv.id);
      if (delErr) {
        console.error("Failed to delete old invoice items:", delErr);
        return;
      }

      if (newItems.length > 0) {
        const { error: insErr } = await supabase.from("invoice_items").insert(
          newItems.map(it => ({
            invoice_id: dbInv.id,
            product_code: it.productCode,
            product_name: it.productName,
            qty: it.qty,
            unit: it.unit,
            batch_no: it.batchNo || "",
            expiry_date: it.expiryDate || null,
          }))
        );
        if (insErr) {
          console.error("Failed to insert updated invoice items:", insErr);
          return;
        }
      }
    }

    await loadData();
  }, [invoices, loadData]);

  const addReturn = useCallback(async (ret: MarketReturn) => {
    const { data: newRet } = await supabase.from("market_returns").insert({
      customer_name: ret.customerName, driver_name: ret.driverName,
      voucher_number: ret.voucherNumber, created_by: user?.id,
    }).select("id").single();

    if (newRet && ret.items.length > 0) {
      await supabase.from("return_items").insert(ret.items.map(it => ({
        return_id: newRet.id, product_code: it.productCode, product_name: it.productName,
        qty: it.qty, unit: it.unit, expiry_date: it.expiryDate || null, batch_no: it.batchNo,
      })));
    }
    await loadData();
  }, [user, loadData]);

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
          .from("products" as any)
          .select("id")
          .or(`code.eq.${newProd.code},item_code.eq.${newProd.code}`)
          .maybeSingle();

        if (!prod) {
          const { data: created, error: createError } = await supabase
            .from("products" as any)
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

          const primaryUpdate = await supabase.from("products" as any).update(updatePayload).eq("id", prod.id);
          if (primaryUpdate.error) throw primaryUpdate.error;
        }
        if (!prod) continue;

        await syncImportedBarcodes(prod.id, newProd.barcodes || []);
        await replaceImportedBatches(prod.id, newProd.batches);
      }
    }
    await loadData();
  }, [loadData]);

  const resetStock = useCallback(async () => {
    // Clear all data
    await supabase.from("invoice_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("invoices").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("return_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("market_returns").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("movements").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("batches").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("products").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("brands").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await loadData();
  }, [loadData]);

  return {
    stock, invoices, movements, returns, loading,
    findProduct, findProductByBarcode, addProduct, updateProduct,
    deductFIFO, restoreStock, addInvoice, updateInvoice, addReturn,
    importProducts, resetStock, setStock, loadData,
  };
}
