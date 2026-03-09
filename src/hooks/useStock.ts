import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Brand, Product, Invoice, InvoiceItem, MarketReturn, Batch, recalcDaysLeft } from "@/data/stockData";
import { useAuth } from "@/hooks/useAuth";

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
      // Load brands + products + batches
      const { data: brandsData } = await supabase.from("brands").select("*").order("name");
      const { data: productsData } = await supabase.from("products").select("*").order("name");
      const { data: batchesData } = await supabase.from("batches").select("*").order("expiry_date");

      const brands: Brand[] = (brandsData || []).map(b => {
        const prods = (productsData || []).filter(p => p.brand_id === b.id).map(p => {
          const batches: Batch[] = (batchesData || []).filter(bt => bt.product_id === p.id).map(bt => ({
            batchNo: bt.batch_no,
            qty: bt.qty,
            unit: bt.unit,
            productionDate: bt.production_date || "",
            expiryDate: bt.expiry_date,
            daysLeft: 0,
            receivedDate: bt.received_date || "",
          }));
          const totalQtyMap: Record<string, number> = {};
          batches.forEach(bt => { totalQtyMap[bt.unit] = (totalQtyMap[bt.unit] || 0) + bt.qty; });
          const product: Product = {
            code: p.code,
            name: p.name,
            brand: b.name,
            totalQty: Object.entries(totalQtyMap).map(([unit, amount]) => ({ amount, unit })),
            packaging: p.packaging || "",
            nearestExpiryDays: 999,
            storageType: (p.storage_type as any) || "Dry",
            batches,
            barcodes: p.barcodes || [],
            cartonHolds: p.carton_holds || undefined,
          };
          return product;
        });
        return { name: b.name, products: prods };
      });

      setStock(recalcDaysLeft(brands));

      // Load invoices
      const { data: invoicesData } = await supabase.from("invoices").select("*").order("created_at", { ascending: false });
      const { data: invoiceItemsData } = await supabase.from("invoice_items").select("*");

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

      // Load movements
      const { data: movementsData } = await supabase.from("movements").select("*").order("created_at", { ascending: false }).limit(200);
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

      // Load returns
      const { data: returnsData } = await supabase.from("market_returns").select("*").order("created_at", { ascending: false });
      const { data: returnItemsData } = await supabase.from("return_items").select("*");

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
        let { data: prod } = await supabase.from("products").select("id").eq("code", newProd.code).single();
        if (!prod) {
          const { data: created } = await supabase.from("products").insert({
            code: newProd.code, name: newProd.name, brand_id: brand.id,
            packaging: newProd.packaging, storage_type: newProd.storageType,
            barcodes: newProd.barcodes || [],
          }).select("id").single();
          prod = created;
        }
        if (!prod) continue;

        for (const newBatch of newProd.batches) {
          const { data: existBatch } = await supabase.from("batches")
            .select("id").eq("product_id", prod.id).eq("batch_no", newBatch.batchNo).single();
          if (existBatch) {
            await supabase.from("batches").update({ qty: newBatch.qty }).eq("id", existBatch.id);
          } else {
            await supabase.from("batches").insert({
              product_id: prod.id, batch_no: newBatch.batchNo, qty: newBatch.qty, unit: newBatch.unit,
              production_date: newBatch.productionDate || null, expiry_date: newBatch.expiryDate,
              received_date: newBatch.receivedDate || new Date().toISOString().split("T")[0],
            });
          }
        }
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
