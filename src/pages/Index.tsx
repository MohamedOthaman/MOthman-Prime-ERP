import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Search, Package } from "lucide-react";
import { useStockContext } from "@/contexts/StockContext";
import { BrandSection } from "@/components/BrandSection";
import { FilterDropdownBar, type FilterDropdownGroup } from "@/components/FilterDropdownBar";
import { ReportsMenu } from "@/components/ReportsMenu";
import { useLang } from "@/contexts/LanguageContext";
import { getProductDisplayName } from "@/lib/productDisplay";
import { getProductGroupLabel, type ProductGroupBy } from "@/lib/productOrganization";
import { exportExcel, exportPDF } from "@/lib/exportUtils";
import {
  getInventoryExpiryAlerts,
  getInventoryOperationalBatches,
  type InventoryExpiryAlertBucket,
  type InventoryOperationalBatchRow,
} from "@/features/services/warehouseInventoryService";

type StockFilterKey = "brand" | "category" | "storage" | "section";
type StockFilterState = Record<StockFilterKey, string[]>;

const EMPTY_FILTERS: StockFilterState = {
  brand: [],
  category: [],
  storage: [],
  section: [],
};

function sortValues(values: (string | null | undefined)[]) {
  return Array.from(new Set(values.map((value) => (value || "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

const Index = () => {
  const { stock } = useStockContext();
  const [search, setSearch] = useState("");
  const [selectedFilters, setSelectedFilters] = useState<StockFilterState>(EMPTY_FILTERS);
  const [operationalBatches, setOperationalBatches] = useState<InventoryOperationalBatchRow[]>([]);
  const [expiryAlerts, setExpiryAlerts] = useState<InventoryExpiryAlertBucket[]>([]);
  const [operationalLoading, setOperationalLoading] = useState(true);
  const [operationalError, setOperationalError] = useState<string | null>(null);
  const { t, lang } = useLang();
  const groupBy: ProductGroupBy = "brand";
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    async function loadOperationalInventory() {
      setOperationalLoading(true);
      setOperationalError(null);

      try {
        const [batchRows, expiryBuckets] = await Promise.all([
          getInventoryOperationalBatches(),
          getInventoryExpiryAlerts(),
        ]);

        setOperationalBatches(batchRows);
        setExpiryAlerts(expiryBuckets);
      } catch (loadError) {
        setOperationalError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load warehouse inventory visibility."
        );
      } finally {
        setOperationalLoading(false);
      }
    }

    void loadOperationalInventory();
  }, []);

  const flatProducts = useMemo(
    () => stock.flatMap((brand) => brand.products.map((product) => ({ ...product, brand: product.brand || brand.name }))),
    [stock]
  );

  const filterGroups = useMemo<FilterDropdownGroup[]>(
    () => [
      { key: "brand", label: "Brands", options: sortValues(flatProducts.map((product) => product.brand)) },
      { key: "category", label: "Category", options: sortValues(flatProducts.map((product) => product.category)) },
      { key: "storage", label: "Storage", options: sortValues(flatProducts.map((product) => product.storageType)) },
      { key: "section", label: "Section", options: sortValues(flatProducts.map((product) => product.section)) },
    ],
    [flatProducts]
  );

  const filteredProducts = useMemo(() => {
    const s = deferredSearch.toLowerCase().trim();

    return flatProducts.filter((product) => {
      const displayName = getProductDisplayName(
        { name_en: product.name, name_ar: product.nameAr, name: product.name, item_code: product.code },
        lang
      ).toLowerCase();

      const matchesSearch =
        !s ||
        displayName.includes(s) ||
        product.name.toLowerCase().includes(s) ||
        product.code.toLowerCase().includes(s) ||
        (product.nameAr && product.nameAr.includes(deferredSearch)) ||
        (product.category && product.category.toLowerCase().includes(s)) ||
        (product.section && product.section.toLowerCase().includes(s)) ||
        (product.brand && product.brand.toLowerCase().includes(s)) ||
        (product.barcodes || []).some((barcode) => barcode.toLowerCase().includes(s));

      const matchesBrand =
        selectedFilters.brand.length === 0 || selectedFilters.brand.includes(product.brand || "");
      const matchesCategory =
        selectedFilters.category.length === 0 || selectedFilters.category.includes(product.category || "");
      const matchesStorage =
        selectedFilters.storage.length === 0 || selectedFilters.storage.includes(product.storageType);
      const matchesSection =
        selectedFilters.section.length === 0 || selectedFilters.section.includes(product.section || "");

      return matchesSearch && matchesBrand && matchesCategory && matchesStorage && matchesSection;
    });
  }, [deferredSearch, flatProducts, lang, selectedFilters]);

  const grouped = useMemo(
    () =>
      Array.from(
        filteredProducts.reduce((map, product) => {
          const key = getProductGroupLabel(product, groupBy);
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(product);
          return map;
        }, new Map<string, typeof filteredProducts>())
      )
        .map(([name, products]) => ({ name, products }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [filteredProducts, groupBy]
  );

  const filteredBatchRows = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    return operationalBatches.filter((row) => {
      const matchesSearch =
        !query ||
        (row.name_en || row.name || "").toLowerCase().includes(query) ||
        (row.item_code || "").toLowerCase().includes(query) ||
        (row.code || "").toLowerCase().includes(query) ||
        (row.batch_no || "").toLowerCase().includes(query) ||
        (row.grn_no || "").toLowerCase().includes(query);

      const matchesBrand =
        selectedFilters.brand.length === 0 ||
        selectedFilters.brand.includes(row.brand || "");
      const matchesCategory =
        selectedFilters.category.length === 0 ||
        selectedFilters.category.includes(row.category || "");
      const matchesStorage =
        selectedFilters.storage.length === 0 ||
        selectedFilters.storage.includes(row.storage_type || "");
      const matchesSection =
        selectedFilters.section.length === 0 ||
        selectedFilters.section.includes(row.section || "");

      return (
        matchesSearch &&
        matchesBrand &&
        matchesCategory &&
        matchesStorage &&
        matchesSection
      );
    });
  }, [deferredSearch, operationalBatches, selectedFilters]);

  const alertMap = useMemo(
    () => new Map(expiryAlerts.map((alert) => [alert.threshold_days, alert])),
    [expiryAlerts]
  );

  const exportRows = useMemo(
    () =>
      filteredProducts.map((product) => ({
        code: product.code,
        itemCode: product.itemCode || "",
        name: getProductDisplayName(
          { name_en: product.name, name_ar: product.nameAr, name: product.name, item_code: product.code },
          lang
        ),
        nameAr: product.nameAr || "",
        brand: product.brand || "",
        category: product.category || "",
        section: product.section || "",
        storage: product.storageType,
        barcode: product.primaryBarcode || product.barcodes?.[0] || "",
        packaging: product.packaging,
        qty: product.totalQty.map((item) => `${item.amount} ${item.unit}`).join(", "),
        unit: product.stockUnit || product.totalQty[0]?.unit || "",
        batchCount: product.batchCount ?? product.batches.length,
        nearestExpiry: product.nearestExpiryDate || "",
        status: (product.stockStatus || "out_of_stock").replace(/_/g, " "),
      })),
    [filteredProducts, lang]
  );

  const totalProducts = filteredProducts.length;

  const handleToggleFilter = (
    groupKey: string,
    value: string,
    selectionMode: "multi" | "single" = "multi"
  ) => {
    const filterKey = groupKey as keyof StockFilterState;
    setSelectedFilters((current) => {
      const currentValues = current[filterKey];
      if (selectionMode === "single") {
        return { ...current, [filterKey]: currentValues.includes(value) ? [] : [value] };
      }

      return {
        ...current,
        [filterKey]: currentValues.includes(value)
          ? currentValues.filter((item) => item !== value)
          : [...currentValues, value],
      };
    });
  };

  const handleClearFilters = () => {
    setSelectedFilters(EMPTY_FILTERS);
  };

  const handleExportExcel = () => {
    void exportExcel({
      title: "Stock Report",
      subtitle: `${filteredProducts.length} filtered products`,
      filename: "stock_filtered",
      sheetName: "Stock",
      columns: [
        { header: "Code", key: "code", width: 14 },
        { header: "Item Code", key: "itemCode", width: 14 },
        { header: "Product Name", key: "name", width: 30 },
        { header: "Arabic Name", key: "nameAr", width: 26 },
        { header: "Brand", key: "brand", width: 18 },
        { header: "Category", key: "category", width: 18 },
        { header: "Section", key: "section", width: 18 },
        { header: "Storage", key: "storage", width: 12 },
        { header: "Barcode", key: "barcode", width: 16 },
        { header: "Packaging", key: "packaging", width: 14 },
        { header: "Qty", key: "qty", width: 18 },
        { header: "Unit", key: "unit", width: 10 },
        { header: "Batch Count", key: "batchCount", width: 12 },
        { header: "Nearest Expiry", key: "nearestExpiry", width: 14 },
        { header: "Status", key: "status", width: 14 },
      ],
      rows: exportRows,
    });
  };

  const handleExportPdf = () => {
    exportPDF({
      title: "Stock Report",
      subtitle: `${filteredProducts.length} filtered products`,
      filename: "stock_filtered",
      sheetName: "Stock",
      columns: [
        { header: "Code", key: "code" },
        { header: "Item Code", key: "itemCode" },
        { header: "Product Name", key: "name" },
        { header: "Arabic Name", key: "nameAr" },
        { header: "Brand", key: "brand" },
        { header: "Category", key: "category" },
        { header: "Section", key: "section" },
        { header: "Storage", key: "storage" },
        { header: "Barcode", key: "barcode" },
        { header: "Packaging", key: "packaging" },
        { header: "Qty", key: "qty" },
        { header: "Unit", key: "unit" },
        { header: "Batch Count", key: "batchCount" },
        { header: "Nearest Expiry", key: "nearestExpiry" },
        { header: "Status", key: "status" },
      ],
      rows: exportRows,
    });
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur">
        <div className="max-w-5xl mx-auto">
          <div className="mb-2 flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold tracking-tight text-foreground">{t("stockOverview")}</h1>
            <span className="ml-auto flex items-center gap-2 font-mono text-xs text-muted-foreground">
              {totalProducts} {t("items")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1 md:max-w-[300px]">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground rtl:left-auto rtl:right-3" />
              <input
                type="text"
                placeholder={t("searchProduct")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-secondary py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring rtl:pl-3 rtl:pr-8"
              />
            </div>

            <div className="min-w-[280px] flex-[2]">
              <FilterDropdownBar
                groups={filterGroups}
                selectedValues={selectedFilters}
                onToggle={handleToggleFilter}
                onClear={handleClearFilters}
              />
            </div>

            <div className="ml-auto shrink-0">
              <ReportsMenu onExportExcel={handleExportExcel} onExportPdf={handleExportPdf} />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto space-y-3 px-4 py-3">
        <section className="grid gap-3 md:grid-cols-3">
          {[7, 14, 30].map((threshold) => {
            const alert = alertMap.get(threshold as 7 | 14 | 30);

            return (
              <div
                key={threshold}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Expiry {threshold}D
                </div>
                <div className="mt-2 text-2xl font-semibold text-foreground">
                  {alert?.batch_count ?? 0}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {(alert?.product_count ?? 0)} products |{" "}
                  {(alert?.total_quantity ?? 0).toFixed(3)} qty
                </p>
              </div>
            );
          })}
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border bg-muted/30 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Batch Visibility
                </h2>
                <p className="text-xs text-muted-foreground">
                  FEFO-sorted warehouse batches with expiry and operational status.
                </p>
              </div>
              <div className="text-xs text-muted-foreground">
                {filteredBatchRows.length} visible batches
              </div>
            </div>
          </div>

          {operationalError ? (
            <div className="px-4 py-3 text-sm text-destructive">
              {operationalError}
            </div>
          ) : operationalLoading ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              Loading warehouse visibility...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1120px] w-full text-left text-sm">
                <thead className="bg-secondary/50 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">FEFO</th>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Batch</th>
                    <th className="px-3 py-2">Expiry</th>
                    <th className="px-3 py-2">Days</th>
                    <th className="px-3 py-2">Available</th>
                    <th className="px-3 py-2">Reserved</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBatchRows.slice(0, 60).map((row) => (
                    <tr key={`${row.product_id}-${row.batch_no}-${row.expiry_date}`} className="border-t border-border/70">
                      <td className="px-3 py-2 font-mono text-xs text-primary">
                        {row.fefo_rank}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">
                          {row.name_en || row.name || row.item_code || row.code}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {row.item_code || row.code || "-"} | {row.brand || row.category || "General"}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-foreground">
                        {row.batch_no || "-"}
                      </td>
                      <td className="px-3 py-2 text-xs text-foreground">
                        {row.expiry_date || "-"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-foreground">
                        {row.days_to_expiry == null ? "-" : row.days_to_expiry}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-foreground">
                        {row.available_quantity.toFixed(3)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {row.reserved_quantity.toFixed(3)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                            row.status === "expired"
                              ? "border-red-500/25 bg-red-500/10 text-red-500"
                              : row.status === "near_expiry"
                              ? "border-amber-500/25 bg-amber-500/10 text-amber-500"
                              : "border-emerald-500/25 bg-emerald-500/10 text-emerald-500"
                          }`}
                        >
                          {row.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {row.receiving_reference || row.grn_no || row.receiving_invoice_no || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {grouped.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <Package className="mx-auto mb-3 h-10 w-10 opacity-40" />
            <p className="text-sm">{t("noProducts")}</p>
          </div>
        ) : (
          grouped.map((brand) => (
            <BrandSection key={brand.name} brand={brand} />
          ))
        )}
      </main>
    </div>
  );
};

export default Index;
