import { useState, useMemo } from "react";
import { BarChart3, AlertTriangle, TrendingUp, History, Building2 } from "lucide-react";
import { useStockContext } from "@/contexts/StockContext";
import { ExpiryIndicator } from "@/components/ExpiryIndicator";
import { StorageBadge } from "@/components/StorageBadge";

type ReportTab = "expiry" | "forecast" | "movements" | "brands";

export default function Reports() {
  const { stock, movements } = useStockContext();
  const [tab, setTab] = useState<ReportTab>("expiry");
  const [expiryFilter, setExpiryFilter] = useState(30);

  const allBatches = useMemo(() => {
    const items: { brand: string; code: string; name: string; storageType: any; batchNo: string; qty: number; unit: string; expiryDate: string; daysLeft: number }[] = [];
    stock.forEach(brand => {
      brand.products.forEach(product => {
        product.batches.forEach(batch => {
          items.push({
            brand: brand.name,
            code: product.code,
            name: product.name,
            storageType: product.storageType,
            batchNo: batch.batchNo,
            qty: batch.qty,
            unit: batch.unit,
            expiryDate: batch.expiryDate,
            daysLeft: batch.daysLeft,
          });
        });
      });
    });
    return items;
  }, [stock]);

  const nearExpiry = useMemo(() => 
    allBatches.filter(b => b.daysLeft <= expiryFilter && b.daysLeft >= 0).sort((a, b) => a.daysLeft - b.daysLeft),
    [allBatches, expiryFilter]
  );

  const forecast = useMemo(() => {
    const months: { label: string; count: number; items: typeof allBatches }[] = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const start = new Date(now);
      start.setMonth(start.getMonth() + i);
      start.setDate(1);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      const label = start.toLocaleDateString("en", { month: "short", year: "numeric" });
      const items = allBatches.filter(b => {
        const exp = new Date(b.expiryDate);
        return exp >= start && exp < end;
      });
      months.push({ label, count: items.length, items });
    }
    return months;
  }, [allBatches]);

  const brandSummary = useMemo(() => 
    stock.map(brand => ({
      name: brand.name,
      products: brand.products.length,
      totalBatches: brand.products.reduce((a, p) => a + p.batches.length, 0),
      totalQty: brand.products.reduce((a, p) => a + p.batches.reduce((b, batch) => b + batch.qty, 0), 0),
      nearestExpiry: Math.min(...brand.products.map(p => p.nearestExpiryDays)),
    })),
    [stock]
  );

  const tabs: { key: ReportTab; icon: any; label: string }[] = [
    { key: "expiry", icon: AlertTriangle, label: "Near Expiry" },
    { key: "forecast", icon: TrendingUp, label: "Forecast" },
    { key: "movements", icon: History, label: "Movements" },
    { key: "brands", icon: Building2, label: "Brands" },
  ];

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground tracking-tight">Reports</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        <div className="flex gap-1 bg-secondary rounded-lg p-1 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap px-2 ${tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              <t.icon className="w-3.5 h-3.5 inline mr-1" />{t.label}
            </button>
          ))}
        </div>

        {tab === "expiry" && (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {[14, 30, 60, 90, 180].map(d => (
                <button
                  key={d}
                  onClick={() => setExpiryFilter(d)}
                  className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${expiryFilter === d ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
                >
                  {d}d
                </button>
              ))}
            </div>
            {nearExpiry.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">No items expiring within {expiryFilter} days</div>
            ) : (
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-brand-header border-b border-border text-xs font-semibold text-foreground uppercase tracking-wide">
                  {nearExpiry.length} items expiring within {expiryFilter} days
                </div>
                {nearExpiry.map((item, idx) => (
                  <div key={idx} className="px-3 py-2 border-b border-border/50 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-primary">{item.code}</span>
                        <StorageBadge type={item.storageType} />
                      </div>
                      <p className="text-sm text-foreground truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.batchNo} · {item.qty} {item.unit}</p>
                    </div>
                    <ExpiryIndicator days={item.daysLeft} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "forecast" && (
          <div className="space-y-3">
            {forecast.map(month => (
              <div key={month.label} className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-brand-header border-b border-border flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{month.label}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${month.count > 0 ? "bg-warning-bg text-warning" : "bg-secondary text-muted-foreground"}`}>
                    {month.count} expiring
                  </span>
                </div>
                {month.items.length > 0 && month.items.map((item, idx) => (
                  <div key={idx} className="px-3 py-1.5 border-b border-border/50 flex items-center gap-2 text-sm">
                    <span className="font-mono text-xs text-primary w-16">{item.code}</span>
                    <span className="flex-1 truncate text-foreground">{item.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{item.qty} {item.unit}</span>
                    <ExpiryIndicator days={item.daysLeft} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {tab === "movements" && (
          <div className="space-y-3">
            {movements.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">No movements recorded yet</div>
            ) : (
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-brand-header border-b border-border text-xs font-semibold text-foreground uppercase tracking-wide">
                  Batch Movement History
                </div>
                {movements.slice(0, 50).map(m => (
                  <div key={m.id} className="px-3 py-2 border-b border-border/50 flex items-center gap-2">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${m.type === "OUT" ? "bg-destructive/20 text-destructive" : "bg-success-bg text-success"}`}>
                      {m.type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{m.productName}</p>
                      <p className="text-xs text-muted-foreground font-mono">{m.batchNo} · {m.qty} {m.unit}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{m.date}</p>
                      {m.invoiceNo && <p className="text-xs text-primary font-mono">{m.invoiceNo}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "brands" && (
          <div className="space-y-3">
            {brandSummary.map(brand => (
              <div key={brand.name} className="bg-card border border-border rounded-lg p-4">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wide mb-2">{brand.name}</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-secondary rounded p-2">
                    <p className="text-muted-foreground">Products</p>
                    <p className="text-lg font-bold text-foreground font-mono">{brand.products}</p>
                  </div>
                  <div className="bg-secondary rounded p-2">
                    <p className="text-muted-foreground">Batches</p>
                    <p className="text-lg font-bold text-foreground font-mono">{brand.totalBatches}</p>
                  </div>
                  <div className="bg-secondary rounded p-2">
                    <p className="text-muted-foreground">Total Qty</p>
                    <p className="text-lg font-bold text-foreground font-mono">{brand.totalQty}</p>
                  </div>
                  <div className="bg-secondary rounded p-2">
                    <p className="text-muted-foreground">Nearest Expiry</p>
                    <p className="text-lg font-bold font-mono">
                      <ExpiryIndicator days={brand.nearestExpiry} />
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
