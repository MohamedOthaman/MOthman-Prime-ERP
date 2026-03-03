import { type Brand } from "@/data/stockData";
import { ProductRow } from "./ProductRow";

export function BrandSection({ brand }: { brand: Brand }) {
  return (
    <section className="mb-4">
      <div className="bg-brand-header border-l-2 border-brand-border px-3 py-2 rounded-t-md">
        <h2 className="text-sm font-bold tracking-wide text-foreground uppercase">
          {brand.name}
          <span className="ml-2 text-xs font-normal text-muted-foreground lowercase">
            {brand.products.length} product{brand.products.length !== 1 ? "s" : ""}
          </span>
        </h2>
      </div>
      <div className="bg-card rounded-b-md border border-border border-t-0">
        {brand.products.map((product) => (
          <ProductRow key={product.code} product={product} />
        ))}
      </div>
    </section>
  );
}
