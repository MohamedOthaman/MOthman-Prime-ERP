import { useDeferredValue, useMemo, useState } from "react";
import ProductDialog from "./ProductDialog";
import { Package, Plus, Search, Edit3, Layers, CloudOff, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { StorageBadge } from "@/components/StorageBadge";
import { ProductThumb } from "@/components/ProductThumb";
import { FilterDropdownBar, type FilterDropdownGroup } from "@/components/FilterDropdownBar";
import { ReportsMenu } from "@/components/ReportsMenu";
import { VirtualList } from "@/components/VirtualList";
import { useLang } from "@/contexts/LanguageContext";
import { getProductDisplayName } from "@/lib/productDisplay";
import { inferStorageType } from "@/lib/productStorage";
import { useLocalFirstProducts } from "@/features/products/useLocalFirstProducts";
import type { InventoryProductCatalogRow } from "@/features/services/inventoryService";

export type ProductRow = InventoryProductCatalogRow;

type ProductFilterKey = "brand" | "category" | "storage" | "section";
type ProductFilterState = Record<ProductFilterKey, string[]>;

const EMPTY_FILTERS: ProductFilterState = {
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

export default function ProductsPage() {
  const { lang, t } = useLang();
  const navigate = useNavigate();
  const { rows, source, loading, refreshing, error, refresh } = useLocalFirstProducts();
  const [search, setSearch] = useState("");
  const [selectedFilters, setSelectedFilters] = useState<ProductFilterState>(EMPTY_FILTERS);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const deferredSearch = useDeferredValue(search);

  const filterGroups = useMemo<FilterDropdownGroup[]>(() => {
    return [
      { key: "brand", label: t("brands", "Brands"), options: sortValues(rows.map((row) => row.brand)) },
      { key: "category", label: t("category", "Category"), options: sortValues(rows.map((row) => row.category)) },
      { key: "storage", label: t("storage", "Storage"), options: sortValues(rows.map((row) => inferStorageType(row))) },
      { key: "section", label: t("section", "Section"), options: sortValues(rows.map((row) => row.section)) },
    ];
  }, [rows, t]);

  const filteredRows = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();

    const matched = rows.filter((row) => {
      const displayName = getProductDisplayName(row, lang).toLowerCase();
      const rowBrand = row.brand || "";
      const rowCategory = row.category || "";
      const rowSection = row.section || "";
      const rowStorage = inferStorageType(row);
      const allBarcodesStr = (row.all_barcodes || []).join(" ").toLowerCase();

      const matchesSearch =
        !q ||
        (row.item_code || "").toLowerCase().includes(q) ||
        displayName.includes(q) ||
        (row.name_ar || "").toLowerCase().includes(q) ||
        (row.name_en || "").toLowerCase().includes(q) ||
        (row.name || "").toLowerCase().includes(q) ||
        (row.primary_barcode || "").toLowerCase().includes(q) ||
        rowCategory.toLowerCase().includes(q) ||
        rowSection.toLowerCase().includes(q) ||
        rowBrand.toLowerCase().includes(q) ||
        allBarcodesStr.includes(q);

      const matchesBrand = selectedFilters.brand.length === 0 || selectedFilters.brand.includes(rowBrand);
      const matchesCategory =
        selectedFilters.category.length === 0 || selectedFilters.category.includes(rowCategory);
      const matchesStorage =
        selectedFilters.storage.length === 0 || selectedFilters.storage.includes(rowStorage);
      const matchesSection =
        selectedFilters.section.length === 0 || selectedFilters.section.includes(rowSection);

      return matchesSearch && matchesBrand && matchesCategory && matchesStorage && matchesSection;
    });

    // Brand then name keeps the old grouped feel in a flat, virtualizable list.
    return matched.sort((left, right) =>
      `${left.brand || ""} ${getProductDisplayName(left, lang)}`.localeCompare(
        `${right.brand || ""} ${getProductDisplayName(right, lang)}`
      )
    );
  }, [deferredSearch, lang, rows, selectedFilters]);

  const buildExportRows = () =>
    filteredRows.map((row) => ({
      code: row.item_code || "-",
      name: getProductDisplayName(row, lang),
      brand: row.brand || "",
      category: row.category || "",
      section: row.section || "",
      storage: inferStorageType(row),
      packaging: row.packaging || row.uom || "",
      barcode: row.primary_barcode || "",
      price: row.selling_price != null ? row.selling_price.toFixed(3) : "",
      discount: row.discount != null ? row.discount.toFixed(3) : "",
      status: row.is_active ? t("active", "Active") : t("inactive", "Inactive"),
    }));

  const exportColumns = () => [
    { header: t("colCode", "Code"), key: "code", width: 14 },
    { header: t("colProductName", "Product Name"), key: "name", width: 30 },
    { header: t("brands", "Brand"), key: "brand", width: 18 },
    { header: t("category", "Category"), key: "category", width: 18 },
    { header: t("section", "Section"), key: "section", width: 18 },
    { header: t("storage", "Storage"), key: "storage", width: 12 },
    { header: t("colPackaging", "Packaging"), key: "packaging", width: 14 },
    { header: t("colBarcode", "Barcode"), key: "barcode", width: 18 },
    { header: t("colPrice", "Price"), key: "price", width: 12 },
    { header: t("colDiscount", "Discount %"), key: "discount", width: 12 },
    { header: t("colStatus", "Status"), key: "status", width: 10 },
  ];

  // exceljs / jspdf are heavy — load them only when the user actually exports.
  const handleExportExcel = async () => {
    const { exportExcel } = await import("@/lib/exportUtils");
    void exportExcel({
      title: t("productsReport", "Products Report"),
      subtitle: `${filteredRows.length} ${t("filteredProducts", "filtered products")}`,
      filename: "products_filtered",
      sheetName: t("pageTitleProducts", "Products"),
      columns: exportColumns(),
      rows: buildExportRows(),
    });
  };

  const handleExportPdf = async () => {
    const { exportPDF } = await import("@/lib/exportUtils");
    exportPDF({
      title: t("productsReport", "Products Report"),
      subtitle: `${filteredRows.length} ${t("filteredProducts", "filtered products")}`,
      filename: "products_filtered",
      sheetName: t("pageTitleProducts", "Products"),
      columns: exportColumns().map(({ header, key }) => ({ header, key })),
      rows: buildExportRows(),
    });
  };

  const handleToggleFilter = (
    groupKey: string,
    value: string,
    selectionMode: "multi" | "single" = "multi"
  ) => {
    const filterKey = groupKey as keyof ProductFilterState;
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

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-11 z-40 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground">{t("pageTitleProducts", "Products")}</h1>
          {error && source === "local" && (
            <span
              className="flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500"
              title={t("offlineShowingLocal", "Cloud unreachable — showing local data")}
            >
              <CloudOff className="h-3 w-3" /> {t("offlineData", "Offline data")}
            </span>
          )}
          {refreshing && (
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
          <span className="ml-auto flex items-center gap-2">
            <button
              onClick={() => {
                setEditingProduct(null);
                setDialogOpen(true);
              }}
              className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            >
              <Plus className="h-3 w-3" /> {t("addProduct", "Add Product")}
            </button>
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-3 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 md:max-w-[360px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={t("searchProductsPlaceholder", "Search by code, name, barcode, or category...")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 w-full rounded-md border border-border bg-secondary pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
            <ReportsMenu onExportExcel={() => void handleExportExcel()} onExportPdf={() => void handleExportPdf()} />
          </div>
        </div>

        <div className="text-left text-xs text-muted-foreground">
          {filteredRows.length} {t("pageTitleProducts", "Products")}
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">{t("loading", "Loading...")}</div>
        ) : filteredRows.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {rows.length === 0 && error
              ? t("noLocalProductsOffline", "Cloud unreachable and no local product data yet")
              : t("noProductsFound", "No products found")}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <VirtualList
              items={filteredRows}
              estimateSize={62}
              maxHeight="calc(100vh - 250px)"
              getItemKey={(_, row) => row.id}
              renderItem={(row) => (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setEditingProduct(row);
                    setDialogOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setEditingProduct(row);
                      setDialogOpen(true);
                    }
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 border-b border-border/50 px-3 py-2 text-left transition-colors hover:bg-row-hover"
                >
                  <ProductThumb imagePath={row.image_path} alt={row.name || row.item_code || ""} size={40} />
                  <span className="w-16 shrink-0 font-mono text-xs text-primary">{row.item_code || "-"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{getProductDisplayName(row, lang)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[
                        row.brand || t("uncategorized", "Uncategorized"),
                        row.category || row.section || t("noSection", "No section"),
                        row.uom || t("noUom", "No UOM"),
                      ].join(" • ")}
                      {row.selling_price ? ` • ${row.selling_price.toFixed(3)} KWD` : ` • ${t("noPrice", "No price")}`}
                    </p>
                  </div>
                  {!row.is_active && (
                    <span className="rounded bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-destructive">
                      {t("inactive", "Inactive")}
                    </span>
                  )}
                  <StorageBadge type={inferStorageType(row) as any} />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); navigate(`/products/${row.id}/trace`); }}
                    className="ml-1 shrink-0 rounded p-1 transition hover:bg-muted/50"
                    title={t("viewBatchTrace", "View batch trace")}
                  >
                    <Layers className="h-3.5 w-3.5 text-violet-400/70" />
                  </button>
                  <Edit3 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </div>
              )}
            />
          </div>
        )}
      </main>

      <ProductDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={() => void refresh()}
        editingProduct={editingProduct}
      />
    </div>
  );
}
