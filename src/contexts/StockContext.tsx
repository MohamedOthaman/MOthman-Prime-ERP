import { createContext, useContext, ReactNode } from "react";
import { useStock, MovementEntry } from "@/hooks/useStock";
import { Brand, Product, Invoice, MarketReturn } from "@/data/stockData";

interface StockContextType {
  stock: Brand[];
  invoices: Invoice[];
  movements: MovementEntry[];
  returns: MarketReturn[];
  findProduct: (code: string) => { brand: string; product: Brand["products"][0] } | null;
  findProductByBarcode: (barcode: string) => { brand: string; product: Brand["products"][0] } | null;
  addProduct: (brandName: string, product: Product) => void;
  updateProduct: (productCode: string, updatedProduct: Product, newBrandName: string) => void;
  deductFIFO: (productCode: string, qty: number, unit: string, invoiceNo: string) => any;
  restoreStock: (productCode: string, qty: number, unit: string, batchNo: string, expiryDate: string, reason: string, refId: string) => void;
  addInvoice: (invoice: Invoice) => void;
  updateInvoice: (invoiceNo: string, updater: (inv: Invoice) => Invoice) => void;
  addReturn: (ret: MarketReturn) => void;
  importProducts: (brands: Brand[]) => void;
  resetStock: () => void;
  setStock: React.Dispatch<React.SetStateAction<Brand[]>>;
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
