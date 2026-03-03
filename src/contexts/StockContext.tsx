import { createContext, useContext, ReactNode } from "react";
import { useStock, MovementEntry } from "@/hooks/useStock";
import { Brand, Product, Invoice } from "@/data/stockData";

interface StockContextType {
  stock: Brand[];
  invoices: Invoice[];
  movements: MovementEntry[];
  findProduct: (code: string) => { brand: string; product: Brand["products"][0] } | null;
  findProductByBarcode: (barcode: string) => { brand: string; product: Brand["products"][0] } | null;
  addProduct: (brandName: string, product: Product) => void;
  updateProduct: (productCode: string, updatedProduct: Product, newBrandName: string) => void;
  deductFIFO: (productCode: string, qty: number, unit: string, invoiceNo: string) => any;
  addInvoice: (invoice: Invoice) => void;
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
