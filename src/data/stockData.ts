export type StorageType = "Frozen" | "Chilled" | "Dry";
export type UnitType = "CTN" | "PCS" | "BAG" | "KG" | "TIN" | "PAIL" | "BTL" | "BLK" | "BOX";

export interface Batch {
  batchNo: string;
  qty: number;
  unit: UnitType | string;
  productionDate: string;
  expiryDate: string;
  daysLeft: number;
  receivedDate: string;
}

export interface Product {
  code: string;
  name: string;
  nameAr?: string;
  brand?: string;
  totalQty: { amount: number; unit: string }[];
  packaging: string;
  nearestExpiryDays: number;
  storageType: StorageType;
  batches: Batch[];
  barcodes?: string[];
  cartonHolds?: number;
}

export interface Brand {
  name: string;
  products: Product[];
}

export interface InvoiceItem {
  productCode: string;
  productName: string;
  qty: number;
  unit: string;
  batchNo: string;
  expiryDate: string;
  scannedQty?: number; // tracks how many have been scanned for verification
}

export type InvoiceStatus = "ready" | "done" | "edited" | "cancelled";

export interface Invoice {
  invoiceNo: string;
  date: string;
  time: string;
  customerName?: string;
  items: InvoiceItem[];
  type: "OUT";
  status: InvoiceStatus;
  deductionLog: { batchNo: string; qty: number; unit: string; expiryDate: string }[];
}

export interface MarketReturn {
  id: string;
  date: string;
  time: string;
  customerName: string;
  driverName: string;
  voucherNumber: string;
  items: {
    productCode: string;
    productName: string;
    qty: number;
    unit: string;
    expiryDate: string;
    batchNo: string;
  }[];
}

function calcDaysLeft(expiryDate: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDate);
  exp.setHours(0, 0, 0, 0);
  const diff = Math.floor((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

export function recalcDaysLeft(brands: Brand[]): Brand[] {
  return brands.map(brand => ({
    ...brand,
    products: brand.products.map(product => {
      const batches = product.batches.map(b => ({
        ...b,
        daysLeft: calcDaysLeft(b.expiryDate),
      }));
      const nearestExpiryDays = batches.length > 0
        ? Math.min(...batches.map(b => b.daysLeft))
        : 999;
      return { ...product, batches, nearestExpiryDays };
    }),
  }));
}

export const defaultStockData: Brand[] = [
  {
    name: "Monin",
    products: [
      {
        code: "MN001",
        name: "Monin Mango Syrup 700ml",
        totalQty: [
          { amount: 5, unit: "CTN" },
          { amount: 3, unit: "PCS" },
        ],
        packaging: "CTN / PCS",
        nearestExpiryDays: 45,
        storageType: "Dry",
        batches: [
          { batchNo: "MN-2024-001", qty: 3, unit: "CTN", productionDate: "2024-06-01", expiryDate: "2025-06-15", daysLeft: 0, receivedDate: "2024-12-01" },
          { batchNo: "MN-2024-002", qty: 2, unit: "CTN", productionDate: "2024-09-01", expiryDate: "2025-09-20", daysLeft: 0, receivedDate: "2025-01-10" },
          { batchNo: "MN-2024-003", qty: 3, unit: "PCS", productionDate: "2024-08-01", expiryDate: "2025-08-01", daysLeft: 0, receivedDate: "2025-01-15" },
        ],
        barcodes: ["8934561234567"],
      },
      {
        code: "MN002",
        name: "Monin Vanilla Syrup 700ml",
        totalQty: [{ amount: 8, unit: "CTN" }],
        packaging: "CTN",
        nearestExpiryDays: 120,
        storageType: "Dry",
        batches: [
          { batchNo: "MN-2024-010", qty: 5, unit: "CTN", productionDate: "2024-05-01", expiryDate: "2025-08-10", daysLeft: 0, receivedDate: "2024-11-20" },
          { batchNo: "MN-2024-011", qty: 3, unit: "CTN", productionDate: "2024-07-01", expiryDate: "2025-11-01", daysLeft: 0, receivedDate: "2025-01-05" },
        ],
        barcodes: ["8934561234568"],
      },
      {
        code: "MN003",
        name: "Monin Caramel Sauce 1.89L",
        totalQty: [{ amount: 2, unit: "BTL" }],
        packaging: "BTL",
        nearestExpiryDays: 30,
        storageType: "Chilled",
        batches: [
          { batchNo: "MN-2024-020", qty: 2, unit: "BTL", productionDate: "2024-04-01", expiryDate: "2025-05-01", daysLeft: 0, receivedDate: "2024-10-15" },
        ],
        barcodes: ["8934561234569"],
      },
    ],
  },
  {
    name: "Anchor",
    products: [
      {
        code: "AN001",
        name: "Anchor UHT Full Cream 1L",
        totalQty: [{ amount: 12, unit: "CTN" }],
        packaging: "CTN",
        nearestExpiryDays: 60,
        storageType: "Dry",
        batches: [
          { batchNo: "AN-2024-001", qty: 7, unit: "CTN", productionDate: "2024-06-01", expiryDate: "2025-07-01", daysLeft: 0, receivedDate: "2024-12-10" },
          { batchNo: "AN-2024-002", qty: 5, unit: "CTN", productionDate: "2024-09-01", expiryDate: "2025-10-15", daysLeft: 0, receivedDate: "2025-01-20" },
        ],
        barcodes: ["9415007012345"],
      },
      {
        code: "AN002",
        name: "Anchor Butter Unsalted 5kg",
        totalQty: [{ amount: 4, unit: "BLK" }],
        packaging: "BLK",
        nearestExpiryDays: 15,
        storageType: "Frozen",
        batches: [
          { batchNo: "AN-2024-010", qty: 2, unit: "BLK", productionDate: "2024-03-01", expiryDate: "2025-04-15", daysLeft: 0, receivedDate: "2024-09-01" },
          { batchNo: "AN-2024-011", qty: 2, unit: "BLK", productionDate: "2024-05-01", expiryDate: "2025-06-30", daysLeft: 0, receivedDate: "2024-11-15" },
        ],
        barcodes: ["9415007012346"],
      },
    ],
  },
  {
    name: "Callebaut",
    products: [
      {
        code: "CB001",
        name: "Callebaut Dark Choc 811 2.5kg",
        totalQty: [{ amount: 6, unit: "BAG" }],
        packaging: "BAG",
        nearestExpiryDays: 200,
        storageType: "Dry",
        batches: [
          { batchNo: "CB-2024-001", qty: 4, unit: "BAG", productionDate: "2024-05-01", expiryDate: "2025-12-01", daysLeft: 0, receivedDate: "2024-11-01" },
          { batchNo: "CB-2024-002", qty: 2, unit: "BAG", productionDate: "2024-08-01", expiryDate: "2026-03-15", daysLeft: 0, receivedDate: "2025-01-10" },
        ],
        barcodes: ["5410522123456"],
      },
      {
        code: "CB002",
        name: "Callebaut White Choc W2 2.5kg",
        totalQty: [{ amount: 3, unit: "BAG" }],
        packaging: "BAG",
        nearestExpiryDays: 180,
        storageType: "Chilled",
        batches: [
          { batchNo: "CB-2024-010", qty: 3, unit: "BAG", productionDate: "2024-06-01", expiryDate: "2025-11-15", daysLeft: 0, receivedDate: "2024-12-20" },
        ],
        barcodes: ["5410522123457"],
      },
    ],
  },
  {
    name: "Elle & Vire",
    products: [
      {
        code: "EV001",
        name: "Elle & Vire Whipping Cream 1L",
        totalQty: [
          { amount: 10, unit: "CTN" },
          { amount: 6, unit: "PCS" },
        ],
        packaging: "CTN / PCS",
        nearestExpiryDays: 8,
        storageType: "Frozen",
        batches: [
          { batchNo: "EV-2024-001", qty: 4, unit: "CTN", productionDate: "2024-02-01", expiryDate: "2025-04-08", daysLeft: 0, receivedDate: "2024-08-15" },
          { batchNo: "EV-2024-002", qty: 6, unit: "CTN", productionDate: "2024-06-01", expiryDate: "2025-06-20", daysLeft: 0, receivedDate: "2024-12-01" },
          { batchNo: "EV-2024-003", qty: 6, unit: "PCS", productionDate: "2024-07-01", expiryDate: "2025-07-10", daysLeft: 0, receivedDate: "2025-01-05" },
        ],
        barcodes: ["3451790012345"],
      },
    ],
  },
];
