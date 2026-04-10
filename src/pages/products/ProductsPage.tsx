import { useDeferredValue, useEffect, useMemo, useState } from "react";
import ProductDialog from "./ProductDialog";
import { Package, Plus, Search, Edit3, Layers } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { StorageBadge } from "@/components/StorageBadge";
import { FilterDropdownBar, type FilterDropdownGroup } from "@/components/FilterDropdownBar";
import { ReportsMenu } from "@/components/ReportsMenu";
import { useLang } from "@/contexts/LanguageContext";
import { getProductDisplayName } from "@/lib/productDisplay";
import { getProductGroupLabel, type ProductGroupBy } from "@/lib/productOrganization";
import { inferStorageType } from "@/lib/productStorage";
import { exportExcel, exportPDF } from "@/lib/exportUtils";
import { getInventoryProductCatalog, type InventoryProductCatalogRow } from "@/features/services/inventoryService";

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
  const { lang } = useLang();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedFilters, setSelectedFilters] = useState<ProductFilterState>(EMPTY_FILTERS);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const groupBy: ProductGroupBy = "brand";
  const deferredSearch = useDeferredValue(search);

  async function loadProducts() {
    try {
      setLoading(true);
      const data = await getInventoryProductCatalog();
      setRows(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();
  }, []);

  const filterGroups = useMemo<FilterDropdownGroup[]>(() => {
    return [
      { key: "brand", label: "Brands", options: sortValues(rows.map((row) => row.brand)) },
      { key: "category", label: "Category", options: sortValues(rows.map((row) => row.category)) },
      { key: "storage", label: "Storage", options: sortValues(rows.map((row) => inferStorageType(row))) },
      { key: "section", label: "Section", options: sortValues(rows.map((row) => row.section)) },
    ];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();

    return rows.filter((row) => {
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
  }, [deferredSearch, lang, rows, selectedFilters]);

  const groupedRows = useMemo(() => {
    return Array.from(
      filteredRows.reduce((map, row) => {
        const key = getProductGroupLabel(row, groupBy);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(row);
        return map;
      }, new Map<string, ProductRow[]>())
    )
      .map(([name, products]) => ({ name, products }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [filteredRows, groupBy]);

  const exportRows = useMemo(
    () =>
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
        status: row.is_active ? "Active" : "Inactive",
      })),
    [filteredRows, lang]
  );

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

  const handleExportExcel = () => {
    void exportExcel({
      title: "Products Report",
      subtitle: `${filteredRows.length} filtered products`,
      filename: "products_filtered",
      sheetName: "Products",
      columns: [
        { header: "Code", key: "code", width: 14 },
        { header: "Product Name", key: "name", width: 30 },
        { header: "Brand", key: "brand", width: 18 },
        { header: "Category", key: "category", width: 18 },
        { header: "Section", key: "section", width: 18 },
        { header: "Storage", key: "storage", width: 12 },
        { header: "Packaging", key: "packaging", width: 14 },
        { header: "Barcode", key: "barcode", width: 18 },
        { header: "Price", key: "price", width: 12 },
        { header: "Discount %", key: "discount", width: 12 },
        { header: "Status", key: "status", width: 10 },
      ],
      rows: exportRows,
    });
  };

  const handleExportPdf = () => {
    exportPDF({
      title: "Products Report",
      subtitle: `${filteredRows.length} filtered products`,
      filename: "products_filtered",
      sheetName: "Products",
      columns: [
        { header: "Code", key: "code" },
        { header: "Product Name", key: "name" },
        { header: "Brand", key: "brand" },
        { header: "Category", key: "category" },
        { header: "Section", key: "section" },
        { header: "Storage", key: "storage" },
        { header: "Packaging", key: "packaging" },
        { header: "Barcode", key: "barcode" },
        { header: "Price", key: "price" },
        { header: "Discount %", key: "discount" },
        { header: "Status", key: "status" },
      ],
      rows: exportRows,
    });
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-11 z-40 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground">Products Master</h1>
          <span className="ml-auto flex items-center gap-2">
            <button
              onClick={() => {
                setEditingProduct(null);
                setDialogOpen(true);
              }}
              className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            >
              <Plus className="h-3 w-3" /> Add Product
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
              placeholder="Search by code, name, barcode, or category..."
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
            <ReportsMenu onExportExcel={handleExportExcel} onExportPdf={handleExportPdf} />
          </div>
        </div>

        <div className="text-left text-xs text-muted-foreground">{filteredRows.length} Products</div>

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>
        ) : filteredRows.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No products found</div>
        ) : (
          groupedRows.map((group) => (
            <section key={group.name} className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.name}
              </div>
              {group.products.map((row) => (
                <button
                  key={row.id}
                  onClick={() => {
                    setEditingProduct(row);
                    setDialogOpen(true);
                  }}
                  className="flex w-full items-center gap-2 border-b border-border/50 px-3 py-3 text-left transition-colors hover:bg-row-hover last:border-b-0"
                >
                  <span className="w-16 shrink-0 font-mono text-xs text-primary">{row.item_code || "-"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{getProductDisplayName(row, lang)}</p>
                    <p className="text-xs text-muted-foreground">
                      {[row.category || "Uncategorized", row.section || row.brand || "No section", row.uom || "No UOM"].join(" • ")}
                      {row.selling_price ? ` • ${row.selling_price.toFixed(3)} KWD` : " • No price"}
                    </p>
                  </div>
                  {!row.is_active && (
                    <span className="rounded bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-destructive">
                      Inactive
                    </span>
                  )}
                  <StorageBadge type={inferStorageType(row) as any} />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); navigate(`/products/${row.id}/trace`); }}
                    className="ml-1 p-1 rounded hover:bg-muted/50 transition shrink-0"
                    title="View batch trace"
                  >
                    <Layers className="h-3.5 w-3.5 text-violet-400/70" />
                  </button>
                  <Edit3 className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              ))}
            </section>
          ))
        )}
      </main>

      <ProductDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSaved={loadProducts} editingProduct={editingProduct} />
    </div>
  );
}
