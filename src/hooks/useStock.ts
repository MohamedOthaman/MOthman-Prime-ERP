import { useState, useEffect, useCallback } from "react";
import { Brand, Product, Invoice, defaultStockData, recalcDaysLeft } from "@/data/stockData";

const STOCK_KEY = "stock_data";
const INVOICE_KEY = "invoices_data";
const MOVEMENT_KEY = "movement_log";

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
}

function loadStock(): Brand[] {
  try {
    const saved = localStorage.getItem(STOCK_KEY);
    if (saved) return recalcDaysLeft(JSON.parse(saved));
  } catch {}
  return recalcDaysLeft(defaultStockData);
}

function loadInvoices(): Invoice[] {
  try {
    const saved = localStorage.getItem(INVOICE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return [];
}

function loadMovements(): MovementEntry[] {
  try {
    const saved = localStorage.getItem(MOVEMENT_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return [];
}

export function useStock() {
  const [stock, setStock] = useState<Brand[]>(loadStock);
  const [invoices, setInvoices] = useState<Invoice[]>(loadInvoices);
  const [movements, setMovements] = useState<MovementEntry[]>(loadMovements);

  useEffect(() => {
    localStorage.setItem(STOCK_KEY, JSON.stringify(stock));
  }, [stock]);

  useEffect(() => {
    localStorage.setItem(INVOICE_KEY, JSON.stringify(invoices));
  }, [invoices]);

  useEffect(() => {
    localStorage.setItem(MOVEMENT_KEY, JSON.stringify(movements));
  }, [movements]);

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

  const addProduct = useCallback((brandName: string, product: Product) => {
    setStock(prev => {
      const updated = [...prev];
      let brand = updated.find(b => b.name === brandName);
      if (!brand) {
        brand = { name: brandName, products: [] };
        updated.push(brand);
      }
      const existing = brand.products.findIndex(p => p.code === product.code);
      if (existing >= 0) {
        brand.products[existing] = product;
      } else {
        brand.products.push(product);
      }
      return recalcDaysLeft(updated);
    });
  }, []);

  const updateProduct = useCallback((productCode: string, updatedProduct: Product, newBrandName: string) => {
    setStock(prev => {
      let updated = prev.map(brand => ({
        ...brand,
        products: brand.products.filter(p => p.code !== productCode),
      })).filter(b => b.products.length > 0);
      
      let brand = updated.find(b => b.name === newBrandName);
      if (!brand) {
        brand = { name: newBrandName, products: [] };
        updated.push(brand);
      }
      brand.products.push(updatedProduct);
      return recalcDaysLeft(updated);
    });
  }, []);

  const deductFIFO = useCallback((productCode: string, qty: number, unit: string, invoiceNo: string) => {
    let remaining = qty;
    const deductionLog: { batchNo: string; qty: number; unit: string; expiryDate: string }[] = [];
    const movementEntries: MovementEntry[] = [];

    setStock(prev => {
      const updated = prev.map(brand => ({
        ...brand,
        products: brand.products.map(product => {
          if (product.code !== productCode) return product;

          const sortedBatches = [...product.batches]
            .filter(b => b.unit === unit)
            .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

          const otherBatches = product.batches.filter(b => b.unit !== unit);
          const updatedBatches = [];

          for (const batch of sortedBatches) {
            if (remaining <= 0) {
              updatedBatches.push(batch);
              continue;
            }
            const deduct = Math.min(batch.qty, remaining);
            remaining -= deduct;
            deductionLog.push({ batchNo: batch.batchNo, qty: deduct, unit: batch.unit, expiryDate: batch.expiryDate });
            movementEntries.push({
              id: crypto.randomUUID(),
              date: new Date().toISOString().split("T")[0],
              time: new Date().toLocaleTimeString(),
              type: "OUT",
              productCode,
              productName: product.name,
              batchNo: batch.batchNo,
              qty: deduct,
              unit: batch.unit,
              invoiceNo,
            });
            if (batch.qty - deduct > 0) {
              updatedBatches.push({ ...batch, qty: batch.qty - deduct });
            }
          }

          const allBatches = [...updatedBatches, ...otherBatches];
          const totalQtyMap: Record<string, number> = {};
          allBatches.forEach(b => {
            totalQtyMap[b.unit] = (totalQtyMap[b.unit] || 0) + b.qty;
          });
          const totalQty = Object.entries(totalQtyMap).map(([unit, amount]) => ({ amount, unit }));

          return {
            ...product,
            batches: allBatches,
            totalQty,
            nearestExpiryDays: allBatches.length > 0
              ? Math.min(...allBatches.map(b => b.daysLeft))
              : 999,
          };
        }),
      }));
      return updated;
    });

    setMovements(prev => [...movementEntries, ...prev]);

    return { deductionLog, movementEntries };
  }, []);

  const addInvoice = useCallback((invoice: Invoice) => {
    setInvoices(prev => [invoice, ...prev]);
  }, []);

  const importProducts = useCallback((newBrands: Brand[]) => {
    setStock(prev => {
      const merged = [...prev];
      for (const newBrand of newBrands) {
        const existingBrand = merged.find(b => b.name === newBrand.name);
        if (existingBrand) {
          for (const newProd of newBrand.products) {
            const existingProd = existingBrand.products.find(p => p.code === newProd.code);
            if (existingProd) {
              for (const newBatch of newProd.batches) {
                const existingBatch = existingProd.batches.find(b => b.batchNo === newBatch.batchNo);
                if (existingBatch) {
                  existingBatch.qty = newBatch.qty;
                } else {
                  existingProd.batches.push(newBatch);
                }
              }
              const totalQtyMap: Record<string, number> = {};
              existingProd.batches.forEach(b => {
                totalQtyMap[b.unit] = (totalQtyMap[b.unit] || 0) + b.qty;
              });
              existingProd.totalQty = Object.entries(totalQtyMap).map(([unit, amount]) => ({ amount, unit }));
            } else {
              existingBrand.products.push(newProd);
            }
          }
        } else {
          merged.push(newBrand);
        }
      }
      return recalcDaysLeft(merged);
    });
  }, []);

  const resetStock = useCallback(() => {
    setStock(recalcDaysLeft(defaultStockData));
    setInvoices([]);
    setMovements([]);
  }, []);

  return { stock, invoices, movements, findProduct, findProductByBarcode, addProduct, updateProduct, deductFIFO, addInvoice, importProducts, resetStock, setStock };
}
