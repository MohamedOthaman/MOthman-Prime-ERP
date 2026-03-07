import { useState, useMemo } from "react";
import { BarChart3, AlertTriangle, TrendingUp, History, Building2, Settings, FileText, RotateCcw } from "lucide-react";
import { useStockContext } from "@/contexts/StockContext";
import { ExpiryIndicator } from "@/components/ExpiryIndicator";
import { StorageBadge } from "@/components/StorageBadge";
import { WheelPicker, NumberWheel } from "@/components/WheelPicker";
import { getMovingThreshold, setMovingThreshold } from "@/components/MovingBadge";

type ReportTab = "expiry" | "forecast" | "movements" | "brands" | "invoices" | "settings";
type InvoiceSubTab = "ready" | "done" | "cancelled" | "returns";

export default function Reports() {
  const { stock, movements, invoices, returns } = useStockContext();
  const [tab, setTab] = useState<ReportTab>("expiry");
  const [invoiceSubTab, setInvoiceSubTab] = useState<InvoiceSubTab>("done");
  const [expiryFilter, setExpiryFilter] = useState(30);
  const [threshold, setThresholdState] = useState(getMovingThreshold());
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);

  const expiryOptions = [7, 14, 30, 60, 90, 120, 180, 365].map(d => ({ label: `${d} days`, value: d }));

  const allBatches = useMemo(() => {
    const items: { brand: string; code: string; name: string; storageType: any; batchNo: string; qty: number; unit: string; expiryDate: string; daysLeft: number }[] = [];
    stock.forEach(brand => {
      brand.products.forEach(product => {
        product.batches.forEach(batch => {
          items.push({ brand: brand.name, code: product.code, name: product.name, storageType: product.storageType, batchNo: batch.batchNo, qty: batch.qty, unit: batch.unit, expiryDate: batch.expiryDate, daysLeft: batch.daysLeft });
        });
      });
    });
    return items;
  }, [stock]);

  const nearExpiry = useMemo(() =>
    allBatches.filter(b => b.daysLeft <= expiryFilter).sort((a, b) => a.daysLeft - b.daysLeft),
    [allBatches, expiryFilter]
  );

  const forecast = useMemo(() => {
    const months: { label: string; count: number; items: typeof allBatches }[] = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const start = new Date(now); start.setMonth(start.getMonth() + i); start.setDate(1);
      const end = new Date(start); end.setMonth(end.getMonth() + 1);
      const label = start.toLocaleDateString("en", { month: "short", year: "numeric" });
      const items = allBatches.filter(b => { const exp = new Date(b.expiryDate); return exp >= start && exp < end; });
      months.push({ label, count: items.length, items });
    }
    return months;
  }, [allBatches]);

  const brandSummary = useMemo(() =>
    stock.map(brand => ({
      name: brand.name, products: brand.products.length,
      totalBatches: brand.products.reduce((a, p) => a + p.batches.length, 0),
      totalQty: brand.products.reduce((a, p) => a + p.batches.reduce((b, batch) => b + batch.qty, 0), 0),
      nearestExpiry: Math.min(...brand.products.map(p => p.nearestExpiryDays)),
    })),
    [stock]
  );

  const filteredInvoices = useMemo(() => {
    if (invoiceSubTab === "returns") return [];
    return invoices.filter(i => {
      if (invoiceSubTab === "ready") return i.status === "ready";
      if (invoiceSubTab === "done") return i.status === "done" || i.status === "edited";
      if (invoiceSubTab === "cancelled") return i.status === "cancelled";
      return false;
    });
  }, [invoices, invoiceSubTab]);

  const tabs: { key: ReportTab; icon: any; label: string }[] = [
    { key: "expiry", icon: AlertTriangle, label: "Expiry" },
    { key: "forecast", icon: TrendingUp, label: "Forecast" },
    { key: "movements", icon: History, label: "Moves" },
    { key: "brands", icon: Building2, label: "Brands" },
    { key: "invoices", icon: FileText, label: "Inv/Ret" },
    { key: "settings", icon: Settings, label: "Settings" },
  ];

  const invoiceSubTabs: { key: InvoiceSubTab; label: string; count: number }[] = [
    { key: "ready", label: "Ready", count: invoices.filter(i => i.status === "ready").length },
    { key: "done", label: "Done", count: invoices.filter(i => i.status === "done" || i.status === "edited").length },
    { key: "cancelled", label: "Cancelled", count: invoices.filter(i => i.status === "cancelled").length },
    { key: "returns", label: "Returns", count: returns.length },
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
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap px-2 ${tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
              <t.icon className="w-3.5 h-3.5 inline mr-1" />{t.label}
            </button>
          ))}
        </div>

        {tab === "expiry" && (
          <div className="space-y-3">
            <div className="bg-card border border-border rounded-lg p-3">
              <button onClick={() => setShowExpiryPicker(!showExpiryPicker)}
                className="w-full text-left text-sm font-semibold text-foreground flex items-center justify-between">
                <span>Filter: {expiryFilter} days</span>
                <span className="text-xs text-muted-foreground">{showExpiryPicker ? "Close" : "Change"}</span>
              </button>
              {showExpiryPicker && (
                <div className="mt-3">
                  <WheelPicker items={expiryOptions} selectedValue={expiryFilter} onChange={(v) => setExpiryFilter(v as number)} height={140} />
                </div>
              )}
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
                  <div className="bg-secondary rounded p-2"><p className="text-muted-foreground">Products</p><p className="text-lg font-bold text-foreground font-mono">{brand.products}</p></div>
                  <div className="bg-secondary rounded p-2"><p className="text-muted-foreground">Batches</p><p className="text-lg font-bold text-foreground font-mono">{brand.totalBatches}</p></div>
                  <div className="bg-secondary rounded p-2"><p className="text-muted-foreground">Total Qty</p><p className="text-lg font-bold text-foreground font-mono">{brand.totalQty}</p></div>
                  <div className="bg-secondary rounded p-2"><p className="text-muted-foreground">Nearest Expiry</p><p className="text-lg font-bold font-mono"><ExpiryIndicator days={brand.nearestExpiry} /></p></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "invoices" && (
          <div className="space-y-3">
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              {invoiceSubTabs.map(st => (
                <button key={st.key} onClick={() => setInvoiceSubTab(st.key)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${invoiceSubTab === st.key ? "bg-card text-foreground" : "text-muted-foreground"}`}>
                  {st.label} {st.count > 0 && <span className="ml-1 bg-primary/20 text-primary px-1 rounded text-[10px]">{st.count}</span>}
                </button>
              ))}
            </div>

            {invoiceSubTab !== "returns" && (
              filteredInvoices.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">No {invoiceSubTab} invoices</div>
              ) : (
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  {filteredInvoices.map(inv => (
                    <div key={inv.invoiceNo} className="px-3 py-2.5 border-b border-border/50 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-sm text-primary font-bold">{inv.invoiceNo}</p>
                        <p className="text-xs text-muted-foreground">{inv.customerName || "—"} · {inv.date}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        inv.status === "done" ? "bg-success/20 text-success" :
                        inv.status === "edited" ? "bg-warning/20 text-warning" :
                        inv.status === "cancelled" ? "bg-destructive/20 text-destructive" :
                        "bg-primary/20 text-primary"
                      }`}>{inv.status}</span>
                      <span className="font-mono text-xs text-muted-foreground">{inv.items.length} items</span>
                    </div>
                  ))}
                </div>
              )
            )}

            {invoiceSubTab === "returns" && (
              returns.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">No returns recorded</div>
              ) : (
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  {returns.map(ret => (
                    <div key={ret.id} className="px-3 py-2.5 border-b border-border/50">
                      <div className="flex items-center gap-2">
                        <RotateCcw className="w-3.5 h-3.5 text-storage-chilled shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground font-semibold">{ret.customerName || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">{ret.driverName && `Driver: ${ret.driverName} · `}{ret.date} · {ret.voucherNumber || "No voucher"}</p>
                        </div>
                        <span className="font-mono text-xs text-muted-foreground">{ret.items.length} items</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}

        {tab === "settings" && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-foreground mb-1">Moving Speed Threshold</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Products selling ≥ threshold units in 30 days = ⚡Fast, otherwise 🐢Slow
              </p>
              <NumberWheel value={threshold} onChange={(v) => { setThresholdState(v); setMovingThreshold(v); }} min={1} max={200} label="Units/Month" />
              <p className="text-center text-sm font-mono text-foreground mt-2">Current: {threshold} units/month</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
