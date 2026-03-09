import { useState } from "react";
import { Search, Package } from "lucide-react";
import { useStockContext } from "@/contexts/StockContext";
import { BrandSection } from "@/components/BrandSection";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLang } from "@/contexts/LanguageContext";

const Index = () => {
  const { stock } = useStockContext();
  const [search, setSearch] = useState("");
  const { t, lang } = useLang();

  const filtered = stock
    .map((brand) => ({
      ...brand,
      products: brand.products.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.code.toLowerCase().includes(search.toLowerCase()) ||
          (p.nameAr && p.nameAr.includes(search))
      ),
    }))
    .filter((brand) => brand.products.length > 0);

  const totalProducts = stock.reduce((a, b) => a + b.products.length, 0);

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground tracking-tight">{t("stockOverview")}</h1>
            <span className="ml-auto text-xs text-muted-foreground font-mono flex items-center gap-2">
              {totalProducts} {t("items")}
              <LanguageToggle />
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground rtl:left-auto rtl:right-3" />
            <input
              type="text"
              placeholder={t("searchProduct")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-secondary text-foreground text-sm rounded-md pl-9 pr-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground rtl:pl-3 rtl:pr-9"
            />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">{t("noProducts")}</p>
          </div>
        ) : (
          filtered.map((brand) => (
            <BrandSection key={brand.name} brand={brand} />
          ))
        )}
      </main>
    </div>
  );
};

export default Index;
