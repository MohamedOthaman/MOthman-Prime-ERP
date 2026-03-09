import { createContext, useContext, useState, ReactNode } from "react";

type Lang = "en" | "ar";

const translations = {
  en: {
    stockOverview: "Stock Overview",
    items: "items",
    searchProduct: "Search product or code...",
    noProducts: "No products found",
    productManagement: "Product Management",
    add: "Add",
    addNewProduct: "Add New Product",
    editProduct: "Edit Product",
    brand: "Brand",
    productCode: "Product Code",
    productName: "Product Name",
    arabicName: "Arabic Name (Optional)",
    packaging: "Packaging",
    storageType: "Storage Type",
    cartonHolds: "Carton Holds",
    barcodes: "Barcodes",
    scan: "Scan",
    stop: "Stop",
    batches: "Batches",
    addBatch: "Add Batch",
    batchNo: "Batch No",
    unit: "Unit",
    quantity: "Quantity",
    productionDate: "Production Date",
    expiryDate: "Expiry Date",
    receivedDate: "Received Date",
    removeBatch: "Remove Batch",
    cancel: "Cancel",
    addProduct: "Add Product",
    saveChanges: "Save Changes",
    searchProducts: "Search products...",
    products: "products",
    product: "product",
    noBatches: 'No batches. Tap "Add Batch" to create one.',
    stock: "Stock",
    invoices: "Invoices",
    io: "IO",
    reports: "Reports",
    productsNav: "Products",
    frozen: "Frozen",
    chilled: "Chilled",
    dry: "Dry",
    select: "Select",
  },
  ar: {
    stockOverview: "نظرة عامة على المخزون",
    items: "عنصر",
    searchProduct: "ابحث عن منتج أو كود...",
    noProducts: "لا توجد منتجات",
    productManagement: "إدارة المنتجات",
    add: "إضافة",
    addNewProduct: "إضافة منتج جديد",
    editProduct: "تعديل المنتج",
    brand: "العلامة التجارية",
    productCode: "كود المنتج",
    productName: "اسم المنتج",
    arabicName: "الاسم بالعربي (اختياري)",
    packaging: "التعبئة",
    storageType: "نوع التخزين",
    cartonHolds: "حجم الكرتون",
    barcodes: "الباركود",
    scan: "مسح",
    stop: "إيقاف",
    batches: "الدفعات",
    addBatch: "إضافة دفعة",
    batchNo: "رقم الدفعة",
    unit: "الوحدة",
    quantity: "الكمية",
    productionDate: "تاريخ الإنتاج",
    expiryDate: "تاريخ الانتهاء",
    receivedDate: "تاريخ الاستلام",
    removeBatch: "حذف الدفعة",
    cancel: "إلغاء",
    addProduct: "إضافة المنتج",
    saveChanges: "حفظ التعديلات",
    searchProducts: "ابحث عن منتجات...",
    products: "منتجات",
    product: "منتج",
    noBatches: 'لا توجد دفعات. اضغط "إضافة دفعة" لإنشاء واحدة.',
    stock: "المخزون",
    invoices: "الفواتير",
    io: "استيراد/تصدير",
    reports: "التقارير",
    productsNav: "المنتجات",
    frozen: "مجمد",
    chilled: "مبرد",
    dry: "جاف",
    select: "اختر",
  },
};

interface LanguageContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: keyof typeof translations.en) => string;
  dir: "ltr" | "rtl";
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem("app-lang");
    return (saved === "ar" ? "ar" : "en") as Lang;
  });

  const t = (key: keyof typeof translations.en) => translations[lang][key] || key;
  const dir = lang === "ar" ? "rtl" : "ltr";

  const changeLang = (l: Lang) => {
    setLang(l);
    localStorage.setItem("app-lang", l);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang: changeLang, t, dir }}>
      <div dir={dir}>{children}</div>
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be inside LanguageProvider");
  return ctx;
}
