import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Barcode,
  Image as ImageIcon,
  Loader2,
  PackageSearch,
  RefreshCcw,
  Search,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getProductImportValidationRows,
  summarizeProductImportValidation,
  type ProductImportValidationRow,
} from "@/features/products/productImportValidationService";
import { productImportValidationMetadata } from "@/features/products/importValidationMetadata";
import { cn } from "@/lib/utils";

type Filters = {
  itemCode: string;
  barcode: string;
  nameEn: string;
  nameAr: string;
  brand: string;
  category: string;
};

const EMPTY_FILTERS: Filters = {
  itemCode: "",
  barcode: "",
  nameEn: "",
  nameAr: "",
  brand: "",
  category: "",
};

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "warning";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        tone === "warning" ? "border-amber-200 bg-amber-50/60" : "border-border bg-secondary/40"
      )}
    >
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

export default function ProductImportValidationPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ProductImportValidationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const data = await getProductImportValidationRows();
      setRows(data);
    } catch (loadError: any) {
      setError(loadError?.message ?? "Failed to load product import validation data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const summary = summarizeProductImportValidation(rows);
  const hasImportedData = summary.totalProducts > 0;

  const filteredRows = rows.filter((row) => {
    const itemCodeMatch = !filters.itemCode || row.item_code.toLowerCase().includes(filters.itemCode.toLowerCase());
    const barcodeMatch =
      !filters.barcode ||
      row.all_barcodes.some((barcode) => barcode.toLowerCase().includes(filters.barcode.toLowerCase()));
    const nameEnMatch = !filters.nameEn || (row.name_en ?? "").toLowerCase().includes(filters.nameEn.toLowerCase());
    const nameArMatch = !filters.nameAr || (row.name_ar ?? "").includes(filters.nameAr);
    const brandMatch = !filters.brand || (row.brand ?? "").toLowerCase().includes(filters.brand.toLowerCase());
    const categoryMatch =
      !filters.category || (row.category ?? "").toLowerCase().includes(filters.category.toLowerCase());

    return itemCodeMatch && barcodeMatch && nameEnMatch && nameArMatch && brandMatch && categoryMatch;
  });

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/products")} className="gap-1 px-2">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <PackageSearch className="h-5 w-5 text-primary" />
                <h1 className="text-lg font-medium text-foreground">Product Import Validation</h1>
              </div>
              <p className="text-xs text-muted-foreground">
                Verify imported products, barcodes, prices, and missing master data before the next phase.
              </p>
            </div>

            <Button variant="outline" size="sm" onClick={load} className="gap-2">
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-4 space-y-4">
        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && !hasImportedData && (
          <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
              <div className="space-y-2">
                <h2 className="text-sm font-medium text-foreground">Import needed</h2>
                <p className="text-sm text-muted-foreground">
                  No imported product master data was detected yet. Apply the remote migrations, run the import,
                  then refresh this page.
                </p>
                <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                  <div className="rounded-md border border-border bg-background p-3">
                    Import-ready products: {productImportValidationMetadata.importReadyProducts}
                  </div>
                  <div className="rounded-md border border-border bg-background p-3">
                    Import-ready barcodes: {productImportValidationMetadata.importReadyBarcodes}
                  </div>
                  <div className="rounded-md border border-border bg-background p-3">
                    Import-ready prices: {productImportValidationMetadata.importReadyPrices}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {!loading && !error && hasImportedData && (
          <>
            <section className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
              <SummaryCard label="Total Products" value={summary.totalProducts} />
              <SummaryCard label="Total Barcodes" value={summary.totalBarcodes} />
              <SummaryCard label="Total Price Rows" value={summary.totalPriceRows} />
              <SummaryCard label="Top Brands" value={summary.topBrandsCount} />
              <SummaryCard label="Top Categories" value={summary.topCategoriesCount} />
              <SummaryCard label="Without Barcode" value={summary.productsWithoutBarcode} tone="warning" />
              <SummaryCard label="Without Price" value={summary.productsWithoutPrice} tone="warning" />
              <SummaryCard label="Without Arabic Name" value={summary.productsWithoutArabicName} tone="warning" />
            </section>

            <section className="grid gap-3 lg:grid-cols-[2fr,1fr]">
              <div className="rounded-lg border border-border bg-secondary/30 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Search className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-medium text-foreground">Search and filters</h2>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <Input
                    placeholder="Item code"
                    value={filters.itemCode}
                    onChange={(event) => setFilters((current) => ({ ...current, itemCode: event.target.value }))}
                  />
                  <Input
                    placeholder="Barcode"
                    value={filters.barcode}
                    onChange={(event) => setFilters((current) => ({ ...current, barcode: event.target.value }))}
                  />
                  <Input
                    placeholder="English name"
                    value={filters.nameEn}
                    onChange={(event) => setFilters((current) => ({ ...current, nameEn: event.target.value }))}
                  />
                  <Input
                    placeholder="Arabic name"
                    value={filters.nameAr}
                    onChange={(event) => setFilters((current) => ({ ...current, nameAr: event.target.value }))}
                  />
                  <Input
                    placeholder="Brand"
                    value={filters.brand}
                    onChange={(event) => setFilters((current) => ({ ...current, brand: event.target.value }))}
                  />
                  <Input
                    placeholder="Category"
                    value={filters.category}
                    onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-border bg-secondary/30 p-4">
                <h2 className="text-sm font-medium text-foreground">Review and issue panel</h2>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      Skipped review items
                    </span>
                    <span className="font-medium text-foreground">
                      {productImportValidationMetadata.skippedReviewItems}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Barcode className="h-4 w-4 text-amber-600" />
                      Barcode conflicts excluded
                    </span>
                    <span className="font-medium text-foreground">
                      {productImportValidationMetadata.barcodeConflictsExcluded}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Tag className="h-4 w-4" />
                      Missing internal code
                    </span>
                    <span className="font-medium text-foreground">{summary.productsWithoutInternalCode}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <ImageIcon className="h-4 w-4" />
                      Missing image path
                    </span>
                    <span className="font-medium text-foreground">{summary.productsWithoutImage}</span>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Prep reference: {new Date(productImportValidationMetadata.preparedAt).toLocaleString()}
                </p>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-background">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div>
                  <h2 className="text-sm font-medium text-foreground">Imported master rows</h2>
                  <p className="text-xs text-muted-foreground">{filteredRows.length} visible rows</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded border border-border bg-secondary/40 px-2 py-1">Code</span>
                  <span className="rounded border border-border bg-secondary/40 px-2 py-1">Barcode</span>
                  <span className="rounded border border-border bg-secondary/40 px-2 py-1">Price</span>
                  <span className="rounded border border-border bg-secondary/40 px-2 py-1">Arabic</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-secondary/40 text-left">
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 font-medium">Item Code</th>
                      <th className="px-3 py-2 font-medium">Internal Code</th>
                      <th className="px-3 py-2 font-medium">Name EN</th>
                      <th className="px-3 py-2 font-medium">Name AR</th>
                      <th className="px-3 py-2 font-medium">Brand</th>
                      <th className="px-3 py-2 font-medium">Category</th>
                      <th className="px-3 py-2 font-medium">Country</th>
                      <th className="px-3 py-2 font-medium">Primary Barcode</th>
                      <th className="px-3 py-2 font-medium">Selling Price</th>
                      <th className="px-3 py-2 font-medium">Cost Price</th>
                      <th className="px-3 py-2 font-medium">Image Path</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr key={row.id} className="border-b border-border/80 align-top">
                        <td className="px-3 py-2 font-mono text-xs text-foreground">{row.item_code}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.internal_code || "—"}</td>
                        <td className="px-3 py-2 text-foreground">{row.name_en || "—"}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground" dir="rtl">
                          {row.name_ar || "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{row.brand || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.category || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.country || "—"}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                          {row.primary_barcode || "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {row.selling_price == null ? "—" : row.selling_price.toFixed(3)}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {row.cost_price == null ? "—" : row.cost_price.toFixed(3)}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{row.image_path || "—"}</td>
                      </tr>
                    ))}

                    {filteredRows.length === 0 && (
                      <tr>
                        <td colSpan={11} className="px-3 py-10 text-center text-sm text-muted-foreground">
                          No rows matched the current filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
