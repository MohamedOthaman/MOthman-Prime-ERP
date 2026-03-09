import { createContext, useContext, ReactNode } from "react";
import { useStock, MovementEntry } from "@/hooks/useStock";
import { createContext, useContext, ReactNode } from "react";
import { useStock, MovementEntry } from "@/hooks/useStock";
import { Brand, Product, Invoice, InvoiceItem, MarketReturn } from "@/data/stockData";

interface StockContextType {
  stock: Brand[];
  invoices: Invoice[];
  movements: MovementEntry[];
  returns: MarketReturn[];
  loading: boolean;
  findProduct: (code: string) => { brand: string; product: Brand["products"][0] } | null;
  findProductByBarcode: (barcode: string) => { brand: string; product: Brand["products"][0] } | null;
  addProduct: (brandName: string, product: Product) => Promise<void>;
  updateProduct: (productCode: string, updatedProduct: Product, newBrandName: string) => Promise<void>;
  deductFIFO: (productCode: string, qty: number, unit: string, invoiceNo: string) => Promise<any>;
  restoreStock: (productCode: string, qty: number, unit: string, batchNo: string, expiryDate: string, reason: string, refId: string, skipReload?: boolean) => Promise<void>;
  addInvoice: (invoice: Invoice) => Promise<void>;
  updateInvoice: (invoiceNo: string, updater: (inv: Invoice) => Invoice, newItems?: InvoiceItem[]) => Promise<void>;
  addReturn: (ret: MarketReturn) => Promise<void>;
  importProducts: (brands: Brand[]) => Promise<void>;
  resetStock: () => Promise<void>;
  setStock: React.Dispatch<React.SetStateAction<Brand[]>>;
  loadData: () => Promise<void>;
}
  importProducts: (brands: Brand[]) => Promise<void>;
  resetStock: () => Promise<void>;
  setStock: React.Dispatch<React.SetStateAction<Brand[]>>;
  loadData: () => Promise<void>;
}

const StockContext = createContext<StockContextType | null>(null);

export function StockProvider({ children }: { children: ReactNode }) {
  const stockHook = useStock();
  return <StockContext.Provider value={stockHook}>{children}</StockContext.Provider>;
}

export function useStockContext() {
  const ctx = useContext(StockContext);
  if (!ctx) throw new Error("useStockContext must be inside StockProvider");
  return ctx;
}
