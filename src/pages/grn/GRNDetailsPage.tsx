import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  History,
  Loader2,
  Plus,
  Printer,
  Save,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getInventoryProductCatalog,
  type InventoryProductCatalogRow,
} from "@/features/services/inventoryService";
import {
  type GRNWorkflowStatus,
  isEditable as workflowIsEditable,
  normalizeStatus,
} from "@/config/workflowConfig";
import { StatusBadge } from "@/components/workflow/StatusBadge";
import { WorkflowStepper } from "@/components/workflow/WorkflowStepper";
import { WorkflowActions } from "@/components/workflow/WorkflowActions";
import { logAudit } from "@/services/auditService";
import { useAuth } from "@/features/reports/hooks/useAuth";
import { ActivityTimeline } from "@/components/audit/ActivityTimeline";

type GRNStatus = GRNWorkflowStatus;

interface SupplierOption {
  id: string;
  name: string;
  code?: string | null;
}

interface ProductLookup {
  id: string;
  itemCode: string;
  name: string;
  nameAr: string;
  uom: string;
  barcodes: string[];
}

interface HeaderFormState {
  grn_no: string;
  grv_no: string;
  grn_date: string;
  transaction_date: string;
  po_no: string;
  lpo_no: string;
  supplier_id: string;
  supplier_code: string;
  supplier_name: string;
  airway_bill_no: string;
  manual_ref_no: string;
  manual_invoice_no: string;
  shipment_condition: string;
  shipment_by: string;
  bl_no: string;
  container_no: string;
  size: string;
  nos: string;
  gross_weight: string;
  net_weight: string;
  total_ctn: string;
  total_pallet: string;
  temp_type: string;
  temperature: string;
  branch: string;
  remarks: string;
  status: GRNStatus | string;
}

interface GRNLineForm {
  id?: string;
  product_id: string;
  item_code: string;
  item_name: string;
  store: string;
  uom: string;
  po_quantity: string;
  shipped_quantity: string;
  short_excess_quantity: string;
  received_quantity: string;
  short_excess_reason: string;
  expiry_date: string;
  production_date: string;
  batch_no: string;
  po_no: string;
  arabic_label: string;
  barcode: string;
}

const todayIso = () => new Date().toISOString().split("T")[0];

const EMPTY_HEADER: HeaderFormState = {
  grn_no: "",
  grv_no: "",
  grn_date: todayIso(),
  transaction_date: todayIso(),
  po_no: "",
  lpo_no: "",
  supplier_id: "",
  supplier_code: "",
  supplier_name: "",
  airway_bill_no: "",
  manual_ref_no: "",
  manual_invoice_no: "",
  shipment_condition: "",
  shipment_by: "",
  bl_no: "",
  container_no: "",
  size: "",
  nos: "",
  gross_weight: "",
  net_weight: "",
  total_ctn: "",
  total_pallet: "",
  temp_type: "",
  temperature: "",
  branch: "",
  remarks: "",
  status: "draft" as GRNStatus,
};

const EMPTY_LINE: GRNLineForm = {
  product_id: "",
  item_code: "",
  item_name: "",
  store: "",
  uom: "PCS",
  po_quantity: "",
  shipped_quantity: "",
  short_excess_quantity: "",
  received_quantity: "",
  short_excess_reason: "",
  expiry_date: "",
  production_date: "",
  batch_no: "",
  po_no: "",
  arabic_label: "",
  barcode: "",
};

const headerLabelClass = "text-[10px] leading-none text-muted-foreground";
const headerInputClass =
  "mt-0.5 h-7 w-full rounded border border-border bg-secondary px-2 text-[12px] text-foreground";
const headerTextAreaClass =
  "mt-0.5 w-full rounded border border-border bg-secondary px-2 py-1.5 text-[12px] text-foreground";
const gridInputClass =
  "h-7 rounded border border-border bg-secondary px-1.5 text-[11px] text-foreground";
const gridReadOnlyClass =
  "h-7 rounded border border-border bg-muted px-1.5 text-[11px] font-semibold text-foreground";

function toNumber(value: string) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOptionalNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function computeShortExcess(receivedQuantity: string, shippedQuantity: string) {
  const variance = toNumber(receivedQuantity) - toNumber(shippedQuantity);
  if (Math.abs(variance) < 0.0001) return "0";
  return variance.toFixed(3).replace(/\.?0+$/, "");
}

function isLineEmpty(line: GRNLineForm) {
  return ![
    line.item_code,
    line.item_name,
    line.store,
    line.po_quantity,
    line.shipped_quantity,
    line.received_quantity,
    line.batch_no,
    line.expiry_date,
    line.production_date,
    line.po_no,
    line.barcode,
  ]
    .join("")
    .trim();
}

function normalizeLine(line: GRNLineForm, lineNo: number, headerId: string) {
  const shortExcess = computeShortExcess(
    line.received_quantity,
    line.shipped_quantity
  );

  return {
    header_id: headerId,
    line_no: lineNo,
    product_id: line.product_id || null,
    product_code: line.item_code.trim() || null,
    product_name: line.item_name.trim() || "",
    store: line.store.trim() || null,
    unit: line.uom.trim() || "PCS",
    uom: line.uom.trim() || "PCS",
    po_quantity: toNumber(line.po_quantity),
    shipped_quantity: toNumber(line.shipped_quantity),
    short_excess_quantity: toNumber(shortExcess),
    quantity: toNumber(line.received_quantity),
    received_quantity: toNumber(line.received_quantity),
    short_excess_reason: line.short_excess_reason.trim() || null,
    expiry_date: line.expiry_date || null,
    production_date: line.production_date || null,
    batch_no: line.batch_no.trim() || null,
    po_no: line.po_no.trim() || null,
    arabic_label: line.arabic_label.trim() || null,
    barcode: line.barcode.trim() || null,
    notes: line.short_excess_reason.trim() || null,
    remarks: line.short_excess_reason.trim() || null,
  };
}

function resolveProductMatch(rawValue: string, products: ProductLookup[]) {
  const value = rawValue.trim().toLowerCase();
  if (!value) return null;

  return (
    products.find((product) => product.itemCode.toLowerCase() === value) ||
    products.find((product) =>
      product.barcodes.some((barcode) => barcode.toLowerCase() === value)
    ) ||
    products.find((product) => product.name.toLowerCase() === value) ||
    products.find((product) => product.nameAr.toLowerCase() === value) ||
    null
  );
}

function HeaderField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`${headerLabelClass} ${className}`.trim()}>
      {label}
      {children}
    </label>
  );
}

function POHelperStrip({
  poLookup,
  warehouseTo,
  onPoLookupChange,
  onWarehouseToChange,
  onApplyPoLookup,
  onFindGrvs,
}: {
  poLookup: string;
  warehouseTo: string;
  onPoLookupChange: (value: string) => void;
  onWarehouseToChange: (value: string) => void;
  onApplyPoLookup: () => void;
  onFindGrvs: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-2 py-1">
          <span className="text-[10px] font-semibold text-muted-foreground">
            Enter The PO No :
          </span>
          <input
            value={poLookup}
            onChange={(event) => onPoLookupChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onApplyPoLookup();
              }
            }}
            className="h-6 w-28 rounded border border-border bg-background px-2 text-[11px] text-foreground"
          />
          <button
            type="button"
            onClick={onApplyPoLookup}
            className="inline-flex h-6 items-center rounded-full border border-border bg-background px-2 text-[10px] font-semibold text-foreground"
          >
            Get It
          </button>
        </div>

        <div className="flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1">
          <span className="text-[10px] font-semibold text-cyan-200">
            Warehouse To
          </span>
          <input
            value={warehouseTo}
            onChange={(event) => onWarehouseToChange(event.target.value)}
            className="h-6 w-24 rounded border border-border bg-background px-2 text-[11px] text-foreground"
          />
          <button
            type="button"
            className="inline-flex h-6 items-center rounded-full border border-border bg-background px-2 text-[10px] font-semibold text-foreground"
          >
            Make Transfer
          </button>
        </div>

        <button
          type="button"
          onClick={onFindGrvs}
          className="ml-auto inline-flex h-6 items-center rounded-md border border-border bg-secondary px-2.5 text-[10px] font-semibold text-foreground"
        >
          Find GRV&apos;s
        </button>
      </div>
    </section>
  );
}

function OperationalHeaderSection({
  header,
  isReadOnly,
  lineCount,
  totals,
  suppliers,
  onFieldChange,
  onApplySupplier,
}: {
  header: HeaderFormState;
  isReadOnly: boolean;
  lineCount: number;
  totals: { po: number; shipped: number; received: number };
  suppliers: SupplierOption[];
  onFieldChange: (field: keyof HeaderFormState, value: string) => void;
  onApplySupplier: (supplierId: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <div className="border-b border-border bg-muted/30 px-3 py-1.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Operational Header
          </h2>
          <div className="text-[11px] text-muted-foreground">
            {lineCount} line{lineCount === 1 ? "" : "s"} | PO{" "}
            {totals.po.toFixed(3)} | Shipped {totals.shipped.toFixed(3)} |
            Received {totals.received.toFixed(3)}
          </div>
        </div>
      </div>

      <div className="grid gap-1.5 p-2 md:grid-cols-5 xl:grid-cols-10">
        <HeaderField label="GRN No">
          <input
            value={header.grn_no}
            onChange={(event) =>
              onFieldChange("grn_no", event.target.value.toUpperCase())
            }
            disabled={isReadOnly}
            className={headerInputClass}
          />
        </HeaderField>
        <HeaderField label="GRV No">
          <input
            value={header.grv_no}
            onChange={(event) =>
              onFieldChange("grv_no", event.target.value.toUpperCase())
            }
            disabled={isReadOnly}
            className={headerInputClass}
          />
        </HeaderField>
        <HeaderField label="GRN Date">
          <input
            type="date"
            value={header.grn_date}
            onChange={(event) => onFieldChange("grn_date", event.target.value)}
            disabled={isReadOnly}
            className={headerInputClass}
          />
        </HeaderField>
        <HeaderField label="Transaction Date">
          <input
            type="date"
            value={header.transaction_date}
            onChange={(event) =>
              onFieldChange("transaction_date", event.target.value)
            }
            disabled={isReadOnly}
            className={headerInputClass}
          />
        </HeaderField>
        <HeaderField label="PO No">
          <input
            value={header.po_no}
            onChange={(event) => onFieldChange("po_no", event.target.value)}
            disabled={isReadOnly}
            className={headerInputClass}
          />
        </HeaderField>
        <HeaderField label="LPO">
          <input
            value={header.lpo_no}
            onChange={(event) => onFieldChange("lpo_no", event.target.value)}
            disabled={isReadOnly}
            className={headerInputClass}
          />
        </HeaderField>
        <HeaderField label="Supplier">
          <select
            value={header.supplier_id}
            onChange={(event) => onApplySupplier(event.target.value)}
            disabled={isReadOnly}
            className={headerInputClass}
          >
            <option value="">Select supplier</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </HeaderField>
        <HeaderField label="Supplier Code">
          <input
            value={header.supplier_code}
            onChange={(event) =>
              onFieldChange("supplier_code", event.target.value)
            }
            disabled={isReadOnly}
            className={headerInputClass}
          />
        </HeaderField>
        <HeaderField label="Supplier Name" className="md:col-span-2 xl:col-span-2">
          <input
            value={header.supplier_name}
            onChange={(event) =>
              onFieldChange("supplier_name", event.target.value)
            }
            disabled={isReadOnly}
            className={headerInputClass}
          />
        </HeaderField>
        <HeaderField label="Airway Bill No">
          <input
            value={header.airway_bill_no}
            onChange={(event) =>
              onFieldChange("airway_bill_no", event.target.value)
            }
            disabled={isReadOnly}
            className={headerInputClass}
          />
        </HeaderField>
        <HeaderField label="Manual Ref No">
          <input
            value={header.manual_ref_no}
            onChange={(event) =>
              onFieldChange("manual_ref_no", event.target.value)
            }
            disabled={isReadOnly}
            className={headerInputClass}
          />
        </HeaderField>
        <HeaderField label="Manual Invoice No">
          <input
            value={header.manual_invoice_no}
            onChange={(event) =>
              onFieldChange("manual_invoice_no", event.target.value)
            }
            disabled={isReadOnly}
            className={headerInputClass}
          />
        </HeaderField>
        <HeaderField label="Shipment Condition">
          <input
            value={header.shipment_condition}
            onChange={(event) =>
              onFieldChange("shipment_condition", event.target.value)
            }
            disabled={isReadOnly}
            className={headerInputClass}
          />
        </HeaderField>
        <HeaderField label="Shipment By">
          <input
            value={header.shipment_by}
            onChange={(event) =>
              onFieldChange("shipment_by", event.target.value)
            }
            disabled={isReadOnly}
            className={headerInputClass}
          />
        </HeaderField>
        <HeaderField label="BL No">
          <input
            value={header.bl_no}
            onChange={(event) => onFieldChange("bl_no", event.target.value)}
            disabled={isReadOnly}
            className={headerInputClass}
          />
        </HeaderField>
        <HeaderField label="Container No">
          <input
            value={header.container_no}
            onChange={(event) =>
              onFieldChange("container_no", event.target.value)
            }
            disabled={isReadOnly}
            className={headerInputClass}
          />
        </HeaderField>
        <HeaderField label="Size">
          <input
            value={header.size}
            onChange={(event) => onFieldChange("size", event.target.value)}
            disabled={isReadOnly}
            className={headerInputClass}
          />
        </HeaderField>
        <HeaderField label="Nos">
          <input
            value={header.nos}
            onChange={(event) => onFieldChange("nos", event.target.value)}
            disabled={isReadOnly}
            className={headerInputClass}
          />
        </HeaderField>
        <HeaderField label="Gross Weight">
          <input
            value={header.gross_weight}
            onChange={(event) =>
              onFieldChange("gross_weight", event.target.value)
            }
            disabled={isReadOnly}
            className={headerInputClass}
          />
        </HeaderField>
        <HeaderField label="Net Weight">
          <input
            value={header.net_weight}
            onChange={(event) =>
              onFieldChange("net_weight", event.target.value)
            }
            disabled={isReadOnly}
            className={headerInputClass}
          />
        </HeaderField>
        <HeaderField label="Total CTN">
          <input
            value={header.total_ctn}
            onChange={(event) =>
              onFieldChange("total_ctn", event.target.value)
            }
            disabled={isReadOnly}
            className={headerInputClass}
          />
        </HeaderField>
        <HeaderField label="Total Pallet">
          <input
            value={header.total_pallet}
            onChange={(event) =>
              onFieldChange("total_pallet", event.target.value)
            }
            disabled={isReadOnly}
            className={headerInputClass}
          />
        </HeaderField>
        <HeaderField label="Temp Type">
          <input
            value={header.temp_type}
            onChange={(event) =>
              onFieldChange("temp_type", event.target.value)
            }
            disabled={isReadOnly}
            className={headerInputClass}
          />
        </HeaderField>
        <HeaderField label="Temperature">
          <input
            value={header.temperature}
            onChange={(event) =>
              onFieldChange("temperature", event.target.value)
            }
            disabled={isReadOnly}
            className={headerInputClass}
          />
        </HeaderField>
        <HeaderField label="Branch">
          <input
            value={header.branch}
            onChange={(event) => onFieldChange("branch", event.target.value)}
            disabled={isReadOnly}
            className={headerInputClass}
          />
        </HeaderField>
        <HeaderField label="Remarks" className="md:col-span-5 xl:col-span-5">
          <textarea
            value={header.remarks}
            onChange={(event) => onFieldChange("remarks", event.target.value)}
            disabled={isReadOnly}
            rows={1}
            className={headerTextAreaClass}
          />
        </HeaderField>
      </div>
    </section>
  );
}

function TransactionGridSection({
  lines,
  isReadOnly,
  productSuggestions,
  onAddLine,
  onRemoveLine,
  onSetLineValue,
  onHandleProductLookup,
}: {
  lines: GRNLineForm[];
  isReadOnly: boolean;
  productSuggestions: ProductLookup[];
  onAddLine: () => void;
  onRemoveLine: (index: number) => void;
  onSetLineValue: (
    index: number,
    field: keyof GRNLineForm,
    value: string
  ) => void;
  onHandleProductLookup: (index: number, rawValue: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-1.5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Transaction Grid
        </h2>
        <button
          type="button"
          onClick={onAddLine}
          disabled={isReadOnly}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-secondary px-2.5 text-[11px] font-semibold text-foreground disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Row
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1460px] text-left text-[10px]">
          <thead className="bg-secondary/50 text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
            <tr>
              <th className="px-1.5 py-1.5">#</th>
              <th className="px-1.5 py-1.5">Item Code / Barcode</th>
              <th className="px-1.5 py-1.5">Item Name</th>
              <th className="px-1.5 py-1.5">Store</th>
              <th className="px-1.5 py-1.5">UOM</th>
              <th className="px-1.5 py-1.5">PO Qty</th>
              <th className="px-1.5 py-1.5">Shipped</th>
              <th className="px-1.5 py-1.5">Short/Excess</th>
              <th className="px-1.5 py-1.5">Received</th>
              <th className="px-1.5 py-1.5">Reason</th>
              <th className="px-1.5 py-1.5">Expiry</th>
              <th className="px-1.5 py-1.5">Production</th>
              <th className="px-1.5 py-1.5">Batch No</th>
              <th className="px-1.5 py-1.5">PO No</th>
              <th className="px-1.5 py-1.5">Arabic Label</th>
              <th className="px-1.5 py-1.5">Remove</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr
                key={line.id ?? `line-${index}`}
                className="border-t border-border/70 align-top"
              >
                <td className="px-1.5 py-1 font-mono text-[10px] text-muted-foreground">
                  {index + 1}
                </td>
                <td className="px-1.5 py-1">
                  <input
                    list="grn-product-codes"
                    value={line.item_code || line.barcode}
                    onChange={(event) =>
                      onSetLineValue(index, "item_code", event.target.value)
                    }
                    onBlur={(event) =>
                      onHandleProductLookup(index, event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        onHandleProductLookup(index, event.currentTarget.value);
                      }
                    }}
                    disabled={isReadOnly}
                    className={`${gridInputClass} w-[150px]`}
                  />
                  <div className="mt-0.5 text-[9px] text-muted-foreground">
                    {line.barcode || ""}
                  </div>
                </td>
                <td className="px-1.5 py-1">
                  <input
                    list="grn-product-names"
                    value={line.item_name}
                    onChange={(event) =>
                      onSetLineValue(index, "item_name", event.target.value)
                    }
                    onBlur={(event) =>
                      onHandleProductLookup(index, event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        onHandleProductLookup(index, event.currentTarget.value);
                      }
                    }}
                    disabled={isReadOnly}
                    className={`${gridInputClass} w-[180px]`}
                  />
                </td>
                <td className="px-1.5 py-1">
                  <input
                    value={line.store}
                    onChange={(event) =>
                      onSetLineValue(index, "store", event.target.value)
                    }
                    disabled={isReadOnly}
                    className={`${gridInputClass} w-[84px]`}
                  />
                </td>
                <td className="px-1.5 py-1">
                  <input
                    value={line.uom}
                    onChange={(event) =>
                      onSetLineValue(
                        index,
                        "uom",
                        event.target.value.toUpperCase()
                      )
                    }
                    disabled={isReadOnly}
                    className={`${gridInputClass} w-[58px]`}
                  />
                </td>
                <td className="px-1.5 py-1">
                  <input
                    value={line.po_quantity}
                    onChange={(event) =>
                      onSetLineValue(index, "po_quantity", event.target.value)
                    }
                    disabled={isReadOnly}
                    className={`${gridInputClass} w-[72px]`}
                  />
                </td>
                <td className="px-1.5 py-1">
                  <input
                    value={line.shipped_quantity}
                    onChange={(event) =>
                      onSetLineValue(
                        index,
                        "shipped_quantity",
                        event.target.value
                      )
                    }
                    disabled={isReadOnly}
                    className={`${gridInputClass} w-[72px]`}
                  />
                </td>
                <td className="px-1.5 py-1">
                  <input
                    value={computeShortExcess(
                      line.received_quantity,
                      line.shipped_quantity
                    )}
                    readOnly
                    className={`${gridReadOnlyClass} w-[72px]`}
                  />
                </td>
                <td className="px-1.5 py-1">
                  <input
                    value={line.received_quantity}
                    onChange={(event) =>
                      onSetLineValue(
                        index,
                        "received_quantity",
                        event.target.value
                      )
                    }
                    disabled={isReadOnly}
                    className={`${gridInputClass} w-[72px]`}
                  />
                </td>
                <td className="px-1.5 py-1">
                  <input
                    value={line.short_excess_reason}
                    onChange={(event) =>
                      onSetLineValue(
                        index,
                        "short_excess_reason",
                        event.target.value
                      )
                    }
                    disabled={isReadOnly}
                    className={`${gridInputClass} w-[130px]`}
                  />
                </td>
                <td className="px-1.5 py-1">
                  <input
                    type="date"
                    value={line.expiry_date}
                    onChange={(event) =>
                      onSetLineValue(index, "expiry_date", event.target.value)
                    }
                    disabled={isReadOnly}
                    className={`${gridInputClass} w-[118px]`}
                  />
                </td>
                <td className="px-1.5 py-1">
                  <input
                    type="date"
                    value={line.production_date}
                    onChange={(event) =>
                      onSetLineValue(
                        index,
                        "production_date",
                        event.target.value
                      )
                    }
                    disabled={isReadOnly}
                    className={`${gridInputClass} w-[118px]`}
                  />
                </td>
                <td className="px-1.5 py-1">
                  <input
                    value={line.batch_no}
                    onChange={(event) =>
                      onSetLineValue(
                        index,
                        "batch_no",
                        event.target.value.toUpperCase()
                      )
                    }
                    disabled={isReadOnly}
                    className={`${gridInputClass} w-[96px]`}
                  />
                </td>
                <td className="px-1.5 py-1">
                  <input
                    value={line.po_no}
                    onChange={(event) =>
                      onSetLineValue(index, "po_no", event.target.value)
                    }
                    disabled={isReadOnly}
                    className={`${gridInputClass} w-[90px]`}
                  />
                </td>
                <td className="px-1.5 py-1">
                  <input
                    value={line.arabic_label}
                    onChange={(event) =>
                      onSetLineValue(
                        index,
                        "arabic_label",
                        event.target.value
                      )
                    }
                    disabled={isReadOnly}
                    className={`${gridInputClass} w-[130px]`}
                  />
                </td>
                <td className="px-1.5 py-1">
                  <button
                    type="button"
                    onClick={() => onRemoveLine(index)}
                    disabled={isReadOnly}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <datalist id="grn-product-codes">
        {productSuggestions.map((product) => (
          <option key={`${product.id}-code`} value={product.itemCode}>
            {product.name}
          </option>
        ))}
        {productSuggestions.flatMap((product) =>
          product.barcodes.slice(0, 2).map((barcode) => (
            <option key={`${product.id}-${barcode}`} value={barcode}>
              {product.itemCode} {product.name}
            </option>
          ))
        )}
      </datalist>

      <datalist id="grn-product-names">
        {productSuggestions.map((product) => (
          <option key={`${product.id}-name`} value={product.name}>
            {product.itemCode}
          </option>
        ))}
      </datalist>
    </section>
  );
}

function ActivitySection({
  headerId,
  activityRefreshKey,
}: {
  headerId: string | null;
  activityRefreshKey: number;
}) {
  if (!headerId) return null;

  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5">
        <History className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Activity / History
        </h2>
      </div>
      <div className="px-3 py-2">
        <ActivityTimeline
          entityType="grn"
          entityId={headerId}
          refreshKey={activityRefreshKey}
        />
      </div>
    </section>
  );
}

function InfoStrip() {
  return (
    <section className="rounded-md border border-border bg-card px-3 py-1.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
        <span>Draft - Received - Inspected - Municipality - Approved</span>
        <span>
          Only <strong className="text-emerald-400">Approved</strong> enters
          stock
        </span>
        <span>Municipality approval required before stock entry</span>
        <span>Batch + expiry validated before approval</span>
      </div>
    </section>
  );
}

export default function GRNDetailsPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [headerId, setHeaderId] = useState<string | null>(id ?? null);
  const [header, setHeader] = useState<HeaderFormState>(EMPTY_HEADER);
  const [lines, setLines] = useState<GRNLineForm[]>([{ ...EMPTY_LINE }]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [products, setProducts] = useState<ProductLookup[]>([]);
  const [poLookup, setPoLookup] = useState("");
  const [warehouseTo, setWarehouseTo] = useState("");
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);

  const isReadOnly = !workflowIsEditable(header.status);

  useEffect(() => {
    async function loadPage() {
      setLoading(true);
      setError(null);
      setNotFound(false);

      try {
        const suppliersWithCode = await supabase
          .from("suppliers" as any)
          .select("id, name, code")
          .order("name");

        const suppliersFallback = suppliersWithCode.error
          ? await supabase
              .from("suppliers" as any)
              .select("id, name")
              .order("name")
          : suppliersWithCode;

        const [suppliersResult, productCatalog] = await Promise.all([
          Promise.resolve(suppliersFallback),
          getInventoryProductCatalog({ includeInactive: true }),
        ]);

        if (suppliersResult.error) {
          setError(`Failed to load suppliers: ${suppliersResult.error.message}`);
        } else {
          setSuppliers(
            ((suppliersResult.data ?? []) as SupplierOption[]).sort((left, right) =>
              left.name.localeCompare(right.name)
            )
          );
        }

        setProducts(
          productCatalog.map((product: InventoryProductCatalogRow) => ({
            id: product.id,
            itemCode: product.item_code || product.code || "",
            name: product.name_en || product.name || "",
            nameAr: product.name_ar || "",
            uom: product.uom || product.packaging || "PCS",
            barcodes:
              product.all_barcodes ||
              (product.primary_barcode ? [product.primary_barcode] : []),
          }))
        );

        if (isNew) {
          setLoading(false);
          return;
        }

        const [headerResult, linesResult] = await Promise.all([
          supabase
            .from("receiving_headers" as any)
            .select("*")
            .eq("id", id)
            .single(),
          supabase
            .from("receiving_lines" as any)
            .select("*")
            .eq("header_id", id)
            .order("line_no"),
        ]);

        if (headerResult.error || !headerResult.data) {
          setNotFound(true);
          setError("GRN not found.");
          setLoading(false);
          return;
        }

        if (linesResult.error) {
          setError(
            (current) =>
              current ?? `Failed to load lines: ${linesResult.error.message}`
          );
        }

        const dbHeader = headerResult.data as Record<string, any>;
        const dbLines = (linesResult.data ?? []) as Record<string, any>[];

        setHeaderId(dbHeader.id);
        setHeader({
          grn_no: dbHeader.grn_no ?? "",
          grv_no: dbHeader.grv_no ?? "",
          grn_date: dbHeader.grn_date ?? dbHeader.arrival_date ?? todayIso(),
          transaction_date:
            dbHeader.transaction_date ?? dbHeader.arrival_date ?? todayIso(),
          po_no: dbHeader.po_no ?? "",
          lpo_no: dbHeader.lpo_no ?? "",
          supplier_id: dbHeader.supplier_id ?? "",
          supplier_code: dbHeader.supplier_code ?? "",
          supplier_name: dbHeader.supplier_name ?? "",
          airway_bill_no: dbHeader.airway_bill_no ?? "",
          manual_ref_no: dbHeader.manual_ref_no ?? dbHeader.reference_no ?? "",
          manual_invoice_no:
            dbHeader.manual_invoice_no ?? dbHeader.invoice_no ?? "",
          shipment_condition: dbHeader.shipment_condition ?? "",
          shipment_by: dbHeader.shipment_by ?? "",
          bl_no: dbHeader.bl_no ?? "",
          container_no: dbHeader.container_no ?? "",
          size: dbHeader.size ?? "",
          nos: dbHeader.nos != null ? String(dbHeader.nos) : "",
          gross_weight:
            dbHeader.gross_weight != null ? String(dbHeader.gross_weight) : "",
          net_weight:
            dbHeader.net_weight != null ? String(dbHeader.net_weight) : "",
          total_ctn:
            dbHeader.total_ctn != null ? String(dbHeader.total_ctn) : "",
          total_pallet:
            dbHeader.total_pallet != null ? String(dbHeader.total_pallet) : "",
          temp_type: dbHeader.temp_type ?? "",
          temperature:
            dbHeader.temperature != null ? String(dbHeader.temperature) : "",
          branch: dbHeader.branch ?? "",
          remarks: dbHeader.remarks ?? dbHeader.notes ?? "",
          status: normalizeStatus(dbHeader.status ?? "draft"),
        });

        setLines(
          dbLines.length > 0
            ? dbLines.map((line) => ({
                id: line.id,
                product_id: line.product_id ?? "",
                item_code: line.product_code ?? "",
                item_name: line.product_name ?? "",
                store: line.store ?? "",
                uom: line.uom ?? line.unit ?? "PCS",
                po_quantity:
                  line.po_quantity != null ? String(line.po_quantity) : "",
                shipped_quantity:
                  line.shipped_quantity != null
                    ? String(line.shipped_quantity)
                    : "",
                short_excess_quantity:
                  line.short_excess_quantity != null
                    ? String(line.short_excess_quantity)
                    : computeShortExcess(
                        String(
                          line.received_quantity ??
                            line.quantity ??
                            line.qty ??
                            ""
                        ),
                        String(line.shipped_quantity ?? "")
                      ),
                received_quantity:
                  line.received_quantity != null
                    ? String(line.received_quantity)
                    : String(line.quantity ?? line.qty ?? ""),
                short_excess_reason:
                  line.short_excess_reason ?? line.notes ?? line.remarks ?? "",
                expiry_date: line.expiry_date ?? "",
                production_date: line.production_date ?? "",
                batch_no: line.batch_no ?? "",
                po_no: line.po_no ?? "",
                arabic_label: line.arabic_label ?? "",
                barcode: line.barcode ?? "",
              }))
            : [{ ...EMPTY_LINE }]
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load GRN page."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadPage();
  }, [id, isNew]);

  const lineCount = useMemo(
    () => lines.filter((line) => !isLineEmpty(line)).length,
    [lines]
  );

  const totals = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        acc.received += toNumber(line.received_quantity);
        acc.shipped += toNumber(line.shipped_quantity);
        acc.po += toNumber(line.po_quantity);
        return acc;
      },
      { po: 0, shipped: 0, received: 0 }
    );
  }, [lines]);

  const productSuggestions = useMemo(() => products.slice(0, 600), [products]);

  const setHeaderValue = (field: keyof HeaderFormState, value: string) => {
    setHeader((current) => ({ ...current, [field]: value }));
  };

  const applySupplier = (supplierId: string) => {
    const supplier = suppliers.find((option) => option.id === supplierId);
    setHeader((current) => ({
      ...current,
      supplier_id: supplierId,
      supplier_code: supplier?.code || current.supplier_code,
      supplier_name: supplier?.name || current.supplier_name,
    }));
  };

  const setLineValue = (
    index: number,
    field: keyof GRNLineForm,
    value: string
  ) => {
    setLines((current) =>
      current.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        const nextLine = { ...line, [field]: value };
        if (field === "received_quantity" || field === "shipped_quantity") {
          nextLine.short_excess_quantity = computeShortExcess(
            field === "received_quantity" ? value : nextLine.received_quantity,
            field === "shipped_quantity" ? value : nextLine.shipped_quantity
          );
        }
        return nextLine;
      })
    );
  };

  const applyProductToLine = (
    index: number,
    product: ProductLookup,
    sourceValue?: string
  ) => {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              product_id: product.id,
              item_code: product.itemCode,
              item_name: product.name,
              arabic_label: product.nameAr,
              barcode:
                product.barcodes.find(
                  (barcode) =>
                    barcode.toLowerCase() ===
                    (sourceValue || "").trim().toLowerCase()
                ) ||
                product.barcodes[0] ||
                line.barcode,
              uom: line.uom || product.uom || "PCS",
            }
          : line
      )
    );
  };

  const handleProductLookup = (index: number, rawValue: string) => {
    const match = resolveProductMatch(rawValue, products);
    if (match) {
      applyProductToLine(index, match, rawValue);
    }
  };

  const applyPoLookup = () => {
    const nextPo = poLookup.trim();
    if (!nextPo) return;

    setHeader((current) => ({
      ...current,
      po_no: nextPo,
      lpo_no: current.lpo_no || nextPo,
    }));

    setLines((current) =>
      current.map((line) => ({
        ...line,
        po_no: line.po_no || nextPo,
      }))
    );
  };

  const addLine = () => {
    if (isReadOnly) return;
    setLines((current) => [...current, { ...EMPTY_LINE, po_no: header.po_no }]);
  };

  const removeLine = (index: number) => {
    if (isReadOnly) return;
    setLines((current) => {
      const nextLines = current.filter((_, lineIndex) => lineIndex !== index);
      return nextLines.length > 0
        ? nextLines
        : [{ ...EMPTY_LINE, po_no: header.po_no }];
    });
  };

  const validateBeforeSave = (targetStatus: GRNStatus) => {
    if (!header.grn_no.trim()) return "GRN No is required.";
    if (!header.grn_date) return "GRN date is required.";
    if (!header.transaction_date) return "Transaction date is required.";

    const activeLines = lines.filter((line) => !isLineEmpty(line));

    if (targetStatus !== "draft" && activeLines.length === 0) {
      return "At least one receiving line is required.";
    }

    for (let index = 0; index < activeLines.length; index += 1) {
      const line = activeLines[index];
      const lineNo = index + 1;

      if (!line.product_id) return `Line ${lineNo}: product is required.`;
      if (toNumber(line.received_quantity) <= 0) {
        return `Line ${lineNo}: received quantity must be greater than 0.`;
      }

      if (targetStatus === "approved") {
        if (!line.batch_no.trim()) {
          return `Line ${lineNo}: batch no is required before posting.`;
        }
        if (!line.expiry_date) {
          return `Line ${lineNo}: expiry date is required before posting.`;
        }
        if (
          toNumber(line.short_excess_quantity) !== 0 &&
          !line.short_excess_reason.trim()
        ) {
          return `Line ${lineNo}: short/excess reason is required.`;
        }
      }
    }

    if (
      targetStatus === "approved" &&
      header.temp_type.trim() &&
      !header.temperature.trim()
    ) {
      return "Temperature is required when temp type is entered.";
    }

    return null;
  };

  const persistGRN = async (targetStatus: GRNStatus) => {
    if (isReadOnly) {
      setError("Approved or rejected GRNs are read-only.");
      return;
    }

    const validationError = validateBeforeSave(targetStatus);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);

    const activeLines = lines.filter((line) => !isLineEmpty(line));
    let currentHeaderId = headerId;

    try {
      const headerPayload = {
        grn_no: header.grn_no.trim().toUpperCase(),
        grv_no: header.grv_no.trim() || null,
        grn_date: header.grn_date || null,
        transaction_date: header.transaction_date || null,
        po_no: header.po_no.trim() || null,
        lpo_no: header.lpo_no.trim() || null,
        supplier_id: header.supplier_id || null,
        supplier_code: header.supplier_code.trim() || null,
        supplier_name: header.supplier_name.trim() || null,
        airway_bill_no: header.airway_bill_no.trim() || null,
        manual_ref_no: header.manual_ref_no.trim() || null,
        manual_invoice_no: header.manual_invoice_no.trim() || null,
        shipment_condition: header.shipment_condition.trim() || null,
        shipment_by: header.shipment_by.trim() || null,
        bl_no: header.bl_no.trim() || null,
        container_no: header.container_no.trim() || null,
        size: header.size.trim() || null,
        nos: toOptionalNumber(header.nos),
        gross_weight: toOptionalNumber(header.gross_weight),
        net_weight: toOptionalNumber(header.net_weight),
        total_ctn: toOptionalNumber(header.total_ctn),
        total_pallet: toOptionalNumber(header.total_pallet),
        temp_type: header.temp_type.trim() || null,
        temperature: toOptionalNumber(header.temperature),
        branch: header.branch.trim() || null,
        remarks: header.remarks.trim() || null,
        notes: header.remarks.trim() || null,
        invoice_no: header.manual_invoice_no.trim() || null,
        reference_no: header.manual_ref_no.trim() || null,
        arrival_date: header.grn_date || null,
      };

      if (!currentHeaderId) {
        const insertHeader = await supabase
          .from("receiving_headers" as any)
          .insert({
            ...headerPayload,
            status: "draft",
          })
          .select("id")
          .single();

        if (insertHeader.error || !insertHeader.data) {
          throw new Error(insertHeader.error?.message ?? "Failed to create GRN.");
        }

        currentHeaderId = insertHeader.data.id as string;
        setHeaderId(currentHeaderId);
      } else {
        const updateHeader = await supabase
          .from("receiving_headers" as any)
          .update(headerPayload)
          .eq("id", currentHeaderId);

        if (updateHeader.error) {
          throw new Error(`Failed to save header: ${updateHeader.error.message}`);
        }
      }

      const deleteLines = await supabase
        .from("receiving_lines" as any)
        .delete()
        .eq("header_id", currentHeaderId);

      if (deleteLines.error) {
        throw new Error(`Failed to replace lines: ${deleteLines.error.message}`);
      }

      if (activeLines.length > 0) {
        const insertLines = await supabase
          .from("receiving_lines" as any)
          .insert(
            activeLines.map((line, index) =>
              normalizeLine(line, index + 1, currentHeaderId!)
            )
          );

        if (insertLines.error) {
          throw new Error(
            `Failed to save receiving lines: ${insertLines.error.message}`
          );
        }
      }

      const previousStatus = header.status;
      const finalizeHeader = await supabase
        .from("receiving_headers" as any)
        .update({ status: targetStatus })
        .eq("id", currentHeaderId);

      if (finalizeHeader.error) {
        throw new Error(
          `Failed to update status: ${finalizeHeader.error.message}`
        );
      }

      setHeader((current) => ({ ...current, status: targetStatus }));

      if (isNew) {
        void logAudit({
          entityType: "grn",
          entityId: currentHeaderId!,
          action: "created",
          newValue: { status: "draft", grn_no: header.grn_no },
          metadata: { grn_no: header.grn_no, user_email: user?.email },
        });
      }

      if (previousStatus !== targetStatus) {
        void logAudit({
          entityType: "grn",
          entityId: currentHeaderId!,
          action:
            targetStatus === "approved"
              ? "approved"
              : targetStatus === "rejected"
                ? "rejected"
                : "status_changed",
          oldValue: { status: previousStatus },
          newValue: { status: targetStatus },
          metadata: { grn_no: header.grn_no, user_email: user?.email },
        });
      }

      setActivityRefreshKey((current) => current + 1);

      if (isNew) {
        navigate(`/grn/${currentHeaderId}`, { replace: true });
      }
    } catch (persistError) {
      setError(
        persistError instanceof Error
          ? persistError.message
          : "Failed to save GRN."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <button
              onClick={() => navigate("/grn")}
              className="rounded-md p-1.5 transition-colors hover:bg-secondary"
            >
              <ArrowLeft className="h-5 w-5 text-foreground" />
            </button>
            <h1 className="text-lg font-bold tracking-tight text-foreground">
              GRN Details
            </h1>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">
              {error ?? "GRN not found."}
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center gap-2">
          <button
            onClick={() => navigate("/grn")}
            className="rounded-md p-1.5 transition-colors hover:bg-secondary"
          >
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-foreground">
                {isNew ? "New GRN / GRV" : header.grn_no || "GRN Details"}
              </h1>
              <StatusBadge status={header.status} />
            </div>
            <WorkflowStepper currentStatus={header.status} />
          </div>

          <div className="ml-auto flex items-center gap-2">
            {headerId ? (
              <button
                type="button"
                onClick={() => navigate(`/grn/${headerId}/print`)}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-secondary px-2.5 text-[11px] font-semibold text-foreground"
              >
                <Printer className="h-3.5 w-3.5" />
                Print
              </button>
            ) : null}

            {!isReadOnly ? (
              <button
                type="button"
                onClick={() =>
                  void persistGRN(
                    normalizeStatus(header.status) === "draft"
                      ? "draft"
                      : normalizeStatus(header.status)
                  )
                }
                disabled={saving || isReadOnly}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-secondary px-2.5 text-[11px] font-semibold text-foreground disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save
              </button>
            ) : null}

            <WorkflowActions
              currentStatus={header.status}
              saving={saving}
              onTransition={(targetStatus) =>
                void persistGRN(targetStatus as GRNWorkflowStatus)
              }
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] space-y-1.5 px-2.5 py-2">
        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : null}

        <POHelperStrip
          poLookup={poLookup}
          warehouseTo={warehouseTo}
          onPoLookupChange={setPoLookup}
          onWarehouseToChange={setWarehouseTo}
          onApplyPoLookup={applyPoLookup}
          onFindGrvs={() => navigate("/grn")}
        />

        <OperationalHeaderSection
          header={header}
          isReadOnly={isReadOnly}
          lineCount={lineCount}
          totals={totals}
          suppliers={suppliers}
          onFieldChange={setHeaderValue}
          onApplySupplier={applySupplier}
        />

        <TransactionGridSection
          lines={lines}
          isReadOnly={isReadOnly}
          productSuggestions={productSuggestions}
          onAddLine={addLine}
          onRemoveLine={removeLine}
          onSetLineValue={setLineValue}
          onHandleProductLookup={handleProductLookup}
        />

        <ActivitySection
          headerId={headerId}
          activityRefreshKey={activityRefreshKey}
        />

        <InfoStrip />
      </main>
    </div>
  );
}
