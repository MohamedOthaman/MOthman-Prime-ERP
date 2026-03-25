import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ClipboardList, Loader2, Plus, Search, ChevronRight } from "lucide-react";

interface SupplierOption {
  id: string;
  name: string;
}

interface ReceivingHeaderRow {
  id: string;
  grn_no: string;
  supplier_id: string | null;
  status: "draft" | "completed" | "cancelled";
  received_date: string;
  created_at: string;
}

export default function GRNListPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ReceivingHeaderRow[]>([]);
  const [suppliers, setSuppliers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);

      const [{ data, error }, suppliersResult] = await Promise.all([
        supabase
          .from("receiving_headers" as any)
          .select("id, grn_no, supplier_id, status, received_date, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("suppliers" as any)
          .select("id, name")
          .order("name"),
      ]);

      if (!error && data) {
        setRows(data as ReceivingHeaderRow[]);
      }

      if (!suppliersResult.error && suppliersResult.data) {
        const map: Record<string, string> = {};
        (suppliersResult.data as SupplierOption[]).forEach((supplier) => {
          map[supplier.id] = supplier.name;
        });
        setSuppliers(map);
      }

      setLoading(false);
    }

    void load();
  }, []);

  const filtered = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return rows;

    return rows.filter((row) => {
      const supplierName = row.supplier_id ? suppliers[row.supplier_id] ?? "" : "";
      return (
        row.grn_no.toLowerCase().includes(value) ||
        row.status.toLowerCase().includes(value) ||
        supplierName.toLowerCase().includes(value)
      );
    });
  }, [rows, search, suppliers]);

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-medium text-foreground">GRN</h1>

            <span className="ml-auto text-xs text-muted-foreground font-mono">
              {filtered.length} / {rows.length}
            </span>

            <button
              onClick={() => navigate("/grn/new")}
              className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-90"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by GRN no, supplier, or status..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-secondary text-sm rounded-md pl-9 pr-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-2">
        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No GRNs found</p>
          </div>
        )}

        {!loading &&
          filtered.map((row) => (
            <button
              key={row.id}
              onClick={() => navigate(`/grn/${row.id}`)}
              className="w-full text-left bg-secondary rounded-lg border border-border p-4 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-foreground truncate">
                      {row.grn_no}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs text-muted-foreground">
                      {row.received_date}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {row.supplier_id ? suppliers[row.supplier_id] ?? row.supplier_id : "No supplier"}
                    </span>
                    <span className="text-xs bg-background border border-border rounded px-1.5 py-0.5 text-muted-foreground capitalize">
                      {row.status}
                    </span>
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </button>
          ))}
      </main>
    </div>
  );
}
