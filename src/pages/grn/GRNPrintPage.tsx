import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2, Printer } from "lucide-react";

interface HeaderRow {
  grn_no: string;
  grv_no: string | null;
  grn_date: string | null;
  transaction_date: string | null;
  po_no: string | null;
  lpo_no: string | null;
  supplier_code: string | null;
  supplier_name: string | null;
  airway_bill_no: string | null;
  manual_ref_no: string | null;
  manual_invoice_no: string | null;
  shipment_condition: string | null;
  shipment_by: string | null;
  bl_no: string | null;
  container_no: string | null;
  size: string | null;
  nos: number | null;
  gross_weight: number | null;
  net_weight: number | null;
  total_ctn: number | null;
  total_pallet: number | null;
  temp_type: string | null;
  temperature: number | null;
  branch: string | null;
  remarks: string | null;
  status: string;
}

interface LineRow {
  line_no: number;
  product_code: string | null;
  product_name: string;
  store: string | null;
  uom: string | null;
  po_quantity: number | null;
  shipped_quantity: number | null;
  short_excess_quantity: number | null;
  received_quantity: number | null;
  short_excess_reason: string | null;
  batch_no: string | null;
  production_date: string | null;
  expiry_date: string | null;
  po_no: string | null;
  arabic_label: string | null;
}

export default function GRNPrintPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [header, setHeader] = useState<HeaderRow | null>(null);
  const [lines, setLines] = useState<LineRow[]>([]);

  useEffect(() => {
    async function load() {
      if (!id) return;
      setLoading(true);
      const [headerResult, linesResult] = await Promise.all([
        supabase.from("receiving_headers" as any).select("*").eq("id", id).single(),
        supabase.from("receiving_lines" as any).select("*").eq("header_id", id).order("line_no"),
      ]);

      if (!headerResult.error && headerResult.data) setHeader(headerResult.data as HeaderRow);
      if (!linesResult.error && linesResult.data) setLines(linesResult.data as LineRow[]);
      setLoading(false);
    }

    void load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!header) {
    return (
      <div className="min-h-screen bg-background p-6 text-foreground">
        Unable to load GRN print view.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background print:bg-white print:text-black">
      <style>{`
        @media print {
          .print-hide { display: none !important; }
          body { background: white; }
        }
      `}</style>

      <div className="print-hide sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <button onClick={() => navigate(-1)} className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm text-foreground">
          <ArrowLeft className="mr-1 inline h-4 w-4" />
          Back
        </button>
        <button onClick={() => window.print()} className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
          <Printer className="mr-1 inline h-4 w-4" />
          Print
        </button>
      </div>

      <main className="mx-auto max-w-[1200px] p-6 print:max-w-none print:p-6">
        <div className="rounded-lg border border-border bg-card p-6 print:border-black print:bg-white">
          <div className="mb-6 border-b border-border pb-4 print:border-black">
            <h1 className="text-2xl font-bold text-foreground print:text-black">Food Choice ERP</h1>
            <p className="text-sm text-muted-foreground print:text-black">Goods Receipt Note / Receiving Checklist</p>
          </div>

          <div className="grid gap-3 md:grid-cols-4 print:text-black">
            <div><div className="text-[11px] uppercase text-muted-foreground print:text-black">GRN No</div><div className="font-semibold">{header.grn_no}</div></div>
            <div><div className="text-[11px] uppercase text-muted-foreground print:text-black">GRV No</div><div>{header.grv_no || "-"}</div></div>
            <div><div className="text-[11px] uppercase text-muted-foreground print:text-black">GRN Date</div><div>{header.grn_date || "-"}</div></div>
            <div><div className="text-[11px] uppercase text-muted-foreground print:text-black">Transaction Date</div><div>{header.transaction_date || "-"}</div></div>
            <div><div className="text-[11px] uppercase text-muted-foreground print:text-black">PO / LPO</div><div>{header.po_no || "-"} / {header.lpo_no || "-"}</div></div>
            <div><div className="text-[11px] uppercase text-muted-foreground print:text-black">Supplier</div><div>{header.supplier_code || "-"} {header.supplier_name || "-"}</div></div>
            <div><div className="text-[11px] uppercase text-muted-foreground print:text-black">Manual Invoice</div><div>{header.manual_invoice_no || "-"}</div></div>
            <div><div className="text-[11px] uppercase text-muted-foreground print:text-black">Manual Ref</div><div>{header.manual_ref_no || "-"}</div></div>
            <div><div className="text-[11px] uppercase text-muted-foreground print:text-black">Shipment</div><div>{header.shipment_by || "-"} / {header.shipment_condition || "-"}</div></div>
            <div><div className="text-[11px] uppercase text-muted-foreground print:text-black">BL / AWB</div><div>{header.bl_no || "-"} / {header.airway_bill_no || "-"}</div></div>
            <div><div className="text-[11px] uppercase text-muted-foreground print:text-black">Container</div><div>{header.container_no || "-"} / {header.size || "-"}</div></div>
            <div><div className="text-[11px] uppercase text-muted-foreground print:text-black">Branch</div><div>{header.branch || "-"}</div></div>
            <div><div className="text-[11px] uppercase text-muted-foreground print:text-black">Pallet / CTN</div><div>{header.total_pallet ?? "-"} / {header.total_ctn ?? "-"}</div></div>
            <div><div className="text-[11px] uppercase text-muted-foreground print:text-black">Weight</div><div>G {header.gross_weight ?? "-"} / N {header.net_weight ?? "-"}</div></div>
            <div><div className="text-[11px] uppercase text-muted-foreground print:text-black">Temp</div><div>{header.temp_type || "-"} / {header.temperature ?? "-"}</div></div>
            <div><div className="text-[11px] uppercase text-muted-foreground print:text-black">Status</div><div>{header.status}</div></div>
          </div>

          <div className="mt-6 overflow-hidden rounded border border-border print:border-black">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-muted/40 print:bg-white">
                  <th className="border-b border-border px-2 py-2 text-left print:border-black">#</th>
                  <th className="border-b border-border px-2 py-2 text-left print:border-black">Item</th>
                  <th className="border-b border-border px-2 py-2 text-left print:border-black">Store</th>
                  <th className="border-b border-border px-2 py-2 text-left print:border-black">UOM</th>
                  <th className="border-b border-border px-2 py-2 text-left print:border-black">PO</th>
                  <th className="border-b border-border px-2 py-2 text-left print:border-black">Shipped</th>
                  <th className="border-b border-border px-2 py-2 text-left print:border-black">Short/Excess</th>
                  <th className="border-b border-border px-2 py-2 text-left print:border-black">Received</th>
                  <th className="border-b border-border px-2 py-2 text-left print:border-black">Batch</th>
                  <th className="border-b border-border px-2 py-2 text-left print:border-black">Prod</th>
                  <th className="border-b border-border px-2 py-2 text-left print:border-black">Exp</th>
                  <th className="border-b border-border px-2 py-2 text-left print:border-black">Reason</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={`${line.line_no}-${line.product_code}`} className="align-top">
                    <td className="border-b border-border px-2 py-2 print:border-black">{line.line_no}</td>
                    <td className="border-b border-border px-2 py-2 print:border-black">
                      <div className="font-semibold">{line.product_code || "-"}</div>
                      <div>{line.product_name}</div>
                      <div className="text-[10px] text-muted-foreground print:text-black">{line.arabic_label || ""}</div>
                    </td>
                    <td className="border-b border-border px-2 py-2 print:border-black">{line.store || "-"}</td>
                    <td className="border-b border-border px-2 py-2 print:border-black">{line.uom || "-"}</td>
                    <td className="border-b border-border px-2 py-2 print:border-black">{line.po_quantity ?? "-"}</td>
                    <td className="border-b border-border px-2 py-2 print:border-black">{line.shipped_quantity ?? "-"}</td>
                    <td className="border-b border-border px-2 py-2 print:border-black">{line.short_excess_quantity ?? "-"}</td>
                    <td className="border-b border-border px-2 py-2 print:border-black">{line.received_quantity ?? "-"}</td>
                    <td className="border-b border-border px-2 py-2 print:border-black">{line.batch_no || "-"}</td>
                    <td className="border-b border-border px-2 py-2 print:border-black">{line.production_date || "-"}</td>
                    <td className="border-b border-border px-2 py-2 print:border-black">{line.expiry_date || "-"}</td>
                    <td className="border-b border-border px-2 py-2 print:border-black">{line.short_excess_reason || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-[11px] uppercase text-muted-foreground print:text-black">Remarks</div>
              <div className="mt-2 min-h-20 rounded border border-border p-3 text-sm print:border-black">{header.remarks || "-"}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-muted-foreground print:text-black">Signatures</div>
              <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                <div className="min-h-20 rounded border border-border p-3 print:border-black">Prepared By</div>
                <div className="min-h-20 rounded border border-border p-3 print:border-black">Checked By</div>
                <div className="min-h-20 rounded border border-border p-3 print:border-black">Warehouse</div>
                <div className="min-h-20 rounded border border-border p-3 print:border-black">Approved By</div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
