import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { type Brand } from "@/data/stockData";
import { ProductRow } from "./ProductRow";

export function BrandSection({ brand }: { brand: Brand }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section className="mb-4">
      <button
        type="button"
        onClick={() => setCollapsed((current) => !current)}
        className="flex w-full items-center gap-2 rounded-t-md border-l-2 border-brand-border bg-brand-header px-3 py-2 text-left"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}

        <h2 className="text-sm font-bold tracking-wide text-foreground uppercase">
          {brand.name}
          <span className="ml-2 text-xs font-normal lowercase text-muted-foreground">
            {brand.products.length} product{brand.products.length !== 1 ? "s" : ""}
          </span>
        </h2>
      </button>

      {!collapsed ? (
        <div className="overflow-x-auto rounded-b-md border border-border border-t-0 bg-card">
          <div className="min-w-[820px]">
            {brand.products.map((product) => (
              <ProductRow key={product.code} product={product} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
