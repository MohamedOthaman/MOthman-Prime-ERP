import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronsUpDown,
  Loader2,
  Plus,
  Printer,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useLang } from "@/contexts/LanguageContext";
import {
  fetchSalesInvoice,
  fetchSalesInvoiceLookups,
  getProductAvailableQty,
  getProductFefoPreview,
  getProductLabel,
  postSalesInvoice,
  saveSalesInvoiceDraft,
  type CustomerLookup,
  type FefoPreviewAllocation,
  type ProductLookup,
  type SalesInvoiceStatus,
  type SalesmanLookup,
} from "@/features/invoices/salesInvoiceService";
import InvoiceLookupSelect, { type InvoiceLookupOption } from "./InvoiceLookupSelect";
import InvoicePrintView, { type InvoicePrintData, type PrintLineItem } from "./InvoicePrintView";

interface InvoiceLineForm {
  id?: string;
  search: string;
  product_id: string;
  product_code: string;
  product_barcode: string;
  product_name: string;
  unit: string;
  quantity: string;
  unit_price: string;
  discount: string;
  available_stock: number | null;
  fefo_preview: FefoPreviewAllocation[];
  fefo_preview_open: boolean;
  product_picker_open: boolean;
}

const EMPTY_LINE: InvoiceLineForm = {
  search: "",
  product_id: "",
  product_code: "",
  product_barcode: "",
  product_name: "",
  unit: "",
  quantity: "",
  unit_price: "",
  discount: "0",
  available_stock: null,
  fefo_preview: [],
  fefo_preview_open: false,
  product_picker_open: false,
};

const lineInputClass =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60";

function createDraftInvoiceNo() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ];

  return `SI-${parts.join("")}`;
}

function parseDecimal(value: string) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isLineEmpty(line: InvoiceLineForm) {
  return (
    !line.search.trim() &&
    !line.product_id &&
    !line.product_code.trim() &&
    !line.product_barcode.trim() &&
    !line.product_name.trim() &&
    parseDecimal(line.quantity) <= 0 &&
    parseDecimal(line.unit_price) <= 0
  );
}

function getLineSubtotal(line: InvoiceLineForm) {
  return parseDecimal(line.quantity) * parseDecimal(line.unit_price);
}

function getLineTotal(line: InvoiceLineForm) {
  return Math.max(0, getLineSubtotal(line) - parseDecimal(line.discount));
}

function normalizeLookupSearch(value: string) {
  return value.trim().toLowerCase();
}

function formatExpiryDate(value: string | null) {
  if (!value) return "No expiry";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString("en-GB");
}

function useDebounce<T extends (...args: any[]) => any>(fn: T, delay: number): T {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  return useCallback(
    ((...args: any[]) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => fnRef.current(...args), delay);
    }) as unknown as T,
    [delay]
  );
}

export default function InvoiceEntryPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { lang } = useLang();
  const isNew = !id;
  const printRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [customers, setCustomers] = useState<CustomerLookup[]>([]);
  const [salesmen, setSalesmen] = useState<SalesmanLookup[]>([]);
  const [products, setProducts] = useState<ProductLookup[]>([]);

  const [headerId, setHeaderId] = useState<string | null>(id ?? null);
  const [invoiceNo, setInvoiceNo] = useState(createDraftInvoiceNo());
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [customerId, setCustomerId] = useState("");
  const [salesmanId, setSalesmanId] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<SalesInvoiceStatus>("draft");
  const [lines, setLines] = useState<InvoiceLineForm[]>([{ ...EMPTY_LINE }]);
  const isReadOnly = status === "posted";

  const selectedCustomer = useMemo(
    () => customers.find((item) => item.id === customerId) ?? null,
    [customerId, customers]
  );

  const selectedSalesman = useMemo(
    () => salesmen.find((item) => item.id === salesmanId) ?? null,
    [salesmanId, salesmen]
  );

  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const productByCode = useMemo(() => {
    const map = new Map<string, ProductLookup>();
    products.forEach((product) => {
      const code = normalizeLookupSearch(product.item_code ?? "");
      if (code) map.set(code, product);
    });
    return map;
  }, [products]);

  const productByBarcode = useMemo(() => {
    const map = new Map<string, ProductLookup>();
    products.forEach((product) => {
      const codes = [product.primary_barcode, ...(product.all_barcodes ?? [])];
      codes.forEach((barcode) => {
        const normalized = normalizeLookupSearch(barcode ?? "");
        if (normalized && !map.has(normalized)) {
          map.set(normalized, product);
        }
      });
    });
    return map;
  }, [products]);

  const customerOptions = useMemo<InvoiceLookupOption[]>(
    () =>
      customers.map((customer) => ({
        id: customer.id,
        label: `${customer.code} - ${customer.name}`,
        searchText: normalizeLookupSearch(
          `${customer.code} ${customer.name} ${customer.name_ar ?? ""}`
        ),
        meta: customer.name_ar ?? undefined,
      })),
    [customers]
  );

  const salesmanOptions = useMemo<InvoiceLookupOption[]>(
    () =>
      salesmen.map((salesman) => ({
        id: salesman.id,
        label: salesman.name,
        searchText: normalizeLookupSearch(
          `${salesman.code} ${salesman.name} ${salesman.name_ar ?? ""}`
        ),
        meta: salesman.code,
      })),
    [salesmen]
  );

  const formatProductLookup = useCallback(
    (product: ProductLookup) => `${product.item_code ?? ""} - ${getProductLabel(product, lang)}`.trim(),
    [lang]
  );

  const productOptions = useMemo<InvoiceLookupOption[]>(
    () =>
      products.map((product) => ({
        id: product.id,
        label: formatProductLookup(product),
        searchText: normalizeLookupSearch(
          `${product.item_code ?? ""} ${getProductLabel(product, lang)} ${product.primary_barcode ?? ""} ${(product.all_barcodes || []).join(" ")}`
        ),
        meta: [
          product.primary_barcode,
          product.uom,
          product.selling_price != null ? Number(product.selling_price).toFixed(3) : null,
        ]
          .filter(Boolean)
          .join(" | "),
      })),
    [formatProductLookup, lang, products]
  );

  const activeLineCount = useMemo(() => lines.filter((line) => !isLineEmpty(line)).length, [lines]);
  const subtotalAmount = useMemo(() => lines.reduce((sum, line) => sum + getLineSubtotal(line), 0), [lines]);
  const discountTotal = useMemo(() => lines.reduce((sum, line) => sum + parseDecimal(line.discount), 0), [lines]);
  const grandTotal = useMemo(() => lines.reduce((sum, line) => sum + getLineTotal(line), 0), [lines]);

  const loadLineInventoryPreview = async (productId: string, quantityValue: string) => {
    const requestedQty = parseDecimal(quantityValue);
    const [availableStock, fefoPreview] = await Promise.all([
      getProductAvailableQty(productId),
      getProductFefoPreview(productId, requestedQty),
    ]);

    return { availableStock, fefoPreview };
  };

  useEffect(() => {
    async function loadPage() {
      setLoading(true);
      setError(null);
      setNotFound(false);

      try {
        const lookupData = await fetchSalesInvoiceLookups();
        setCustomers(lookupData.customers);
        setSalesmen(lookupData.salesmen);
        setProducts(lookupData.products);

        if (isNew) {
          setLoading(false);
          return;
        }

        const invoice = await fetchSalesInvoice(id);
        const loadedLines = await Promise.all(
          invoice.lines.map(async (line) => {
            const product = lookupData.products.find((item) => item.id === line.product_id);
            const quantity = String(line.quantity ?? 0);
            const { availableStock, fefoPreview } = await loadLineInventoryPreview(
              line.product_id,
              quantity
            );

            return {
              id: line.id,
              search: product ? formatProductLookup(product) : "",
              product_id: line.product_id,
              product_code: product?.item_code ?? "",
              product_barcode: product?.primary_barcode ?? "",
              product_name: product ? getProductLabel(product, lang) : "",
              unit: product?.uom ?? "",
              quantity,
              unit_price: String(line.unit_price ?? 0),
              discount: String(line.discount ?? 0),
              available_stock: availableStock,
              fefo_preview: fefoPreview,
              fefo_preview_open: false,
              product_picker_open: false,
            } satisfies InvoiceLineForm;
          })
        );

        setHeaderId(invoice.header.id);
        setInvoiceNo(invoice.header.invoice_no ?? createDraftInvoiceNo());
        setInvoiceDate(invoice.header.invoice_date);
        setCustomerId(invoice.header.customer_id ?? "");
        setSalesmanId(invoice.header.salesman_id ?? "");
        setNotes(invoice.header.notes ?? "");
        setStatus(invoice.header.status ?? "draft");
        setLines(loadedLines.length > 0 ? loadedLines : [{ ...EMPTY_LINE }]);
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Failed to load sales invoice.";
        setError(message);
        if (!isNew) {
          setNotFound(true);
        }
      } finally {
        setLoading(false);
      }
    }

    void loadPage();
  }, [formatProductLookup, id, isNew, lang]);

  const setLineValue = useCallback(
    (
      index: number,
      field: keyof InvoiceLineForm,
      value: string | number | boolean | null | FefoPreviewAllocation[]
    ) => {
      setLines((current) =>
        current.map((line, lineIndex) =>
          lineIndex === index ? { ...line, [field]: value } : line
        )
      );
    },
    []
  );

  const clearLineProduct = useCallback((index: number) => {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...EMPTY_LINE,
              quantity: line.quantity,
              unit_price: line.unit_price,
              discount: line.discount,
              product_picker_open: false,
            }
          : line
      )
    );
  }, []);

  const updateLineInventoryPreview = useCallback(
    async (index: number, productId: string, quantityValue: string) => {
      try {
        const { availableStock, fefoPreview } = await loadLineInventoryPreview(
          productId,
          quantityValue
        );

        setLines((current) =>
          current.map((line, lineIndex) => {
            if (lineIndex !== index) return line;
            if (line.product_id !== productId || line.quantity !== quantityValue) return line;

            return {
              ...line,
              available_stock: availableStock,
              fefo_preview: fefoPreview,
              fefo_preview_open: fefoPreview.length > 1 ? line.fefo_preview_open : false,
            };
          })
        );
      } catch (previewError) {
        setError(
          previewError instanceof Error
            ? previewError.message
            : "Failed to load FEFO preview."
        );
      }
    },
    []
  );

  const debouncedUpdatePreview = useDebounce(updateLineInventoryPreview, 350);

  const applyProductToLine = useCallback(
    async (
      index: number,
      product: ProductLookup,
      overrides?: { code?: string; barcode?: string }
    ) => {
      const currentLines = lines;
      const requestedQuantity = currentLines[index]?.quantity || "1";
      const nextUnitPrice =
        currentLines[index]?.unit_price ||
        String(product.selling_price == null ? 0 : Number(product.selling_price));

      setLines((current) =>
        current.map((line, lineIndex) =>
          lineIndex === index
            ? {
                ...line,
                search: formatProductLookup(product),
                product_id: product.id,
                product_code: overrides?.code ?? product.item_code ?? "",
                product_barcode: overrides?.barcode ?? product.primary_barcode ?? "",
                product_name: getProductLabel(product, lang),
                unit: product.uom ?? "",
                quantity: requestedQuantity,
                unit_price: nextUnitPrice,
                product_picker_open: false,
                fefo_preview_open: false,
              }
            : line
        )
      );

      await updateLineInventoryPreview(index, product.id, requestedQuantity);
    },
    [formatProductLookup, lang, lines, updateLineInventoryPreview]
  );

  const resolveProductByCodeOrBarcode = useCallback(
    (value: string, mode: "code" | "barcode") => {
      const normalized = normalizeLookupSearch(value);
      if (!normalized) return null;

      return mode === "code"
        ? productByCode.get(normalized) ?? null
        : productByBarcode.get(normalized) ?? null;
    },
    [productByBarcode, productByCode]
  );

  const handleSalesmanSelect = useCallback((option: InvoiceLookupOption) => {
    setSalesmanId(option.id);
  }, []);

  const handleCustomerChange = useCallback(
    (option: InvoiceLookupOption) => {
      setCustomerId(option.id);
      const customer = customers.find((item) => item.id === option.id);
      if (customer) {
        setSalesmanId(customer.salesman_id || "");
      }
    },
    [customers]
  );

  const handleProductPickerOpenChange = useCallback((index: number, open: boolean) => {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, product_picker_open: open } : line
      )
    );
  }, []);

  const handleCodeOrBarcodeChange = useCallback(
    (index: number, field: "product_code" | "product_barcode", value: string) => {
      setLines((current) =>
        current.map((line, lineIndex) => {
          if (lineIndex !== index) return line;

          const nextLine = { ...line, [field]: value };
          if (!value.trim()) {
            return {
              ...nextLine,
              product_id: "",
              product_name: "",
              unit: "",
              search: "",
              available_stock: null,
              fefo_preview: [],
              fefo_preview_open: false,
            };
          }

          if (field === "product_code" && value.trim() !== line.product_code) {
            return {
              ...nextLine,
              product_id: "",
              product_name: "",
              unit: "",
              search: "",
              available_stock: null,
              fefo_preview: [],
              fefo_preview_open: false,
            };
          }

          if (field === "product_barcode" && value.trim() !== line.product_barcode) {
            return {
              ...nextLine,
              product_id: "",
              product_name: "",
              unit: "",
              search: "",
              available_stock: null,
              fefo_preview: [],
              fefo_preview_open: false,
            };
          }

          return nextLine;
        })
      );
    },
    []
  );

  const resolveManualProductLookup = useCallback(
    async (index: number, mode: "code" | "barcode") => {
      const line = lines[index];
      if (!line) return;

      const rawValue = mode === "code" ? line.product_code : line.product_barcode;
      const matchedProduct = resolveProductByCodeOrBarcode(rawValue, mode);

      if (!rawValue.trim()) return;

      if (!matchedProduct) {
        setError(
          mode === "code"
            ? `No product found for item code "${rawValue}".`
            : `No product found for barcode "${rawValue}".`
        );
        return;
      }

      setError(null);
      await applyProductToLine(index, matchedProduct, {
        code: matchedProduct.item_code ?? line.product_code,
        barcode: matchedProduct.primary_barcode ?? line.product_barcode,
      });
    },
    [applyProductToLine, lines, resolveProductByCodeOrBarcode]
  );

  const handleQuantityChange = useCallback(
    (index: number, value: string) => {
      setLineValue(index, "quantity", value);

      const currentLine = lines[index];
      if (!currentLine?.product_id) return;

      debouncedUpdatePreview(index, currentLine.product_id, value);
    },
    [debouncedUpdatePreview, lines, setLineValue]
  );

  const toggleFefoPreview = useCallback((index: number) => {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? { ...line, fefo_preview_open: !line.fefo_preview_open }
          : line
      )
    );
  }, []);

  const addLine = useCallback(() => {
    if (isReadOnly) return;
    setLines((current) => [...current, { ...EMPTY_LINE }]);
  }, [isReadOnly]);

  const removeLine = useCallback(
    (index: number) => {
      if (isReadOnly) return;
      setLines((current) => {
        const next = current.filter((_, lineIndex) => lineIndex !== index);
        return next.length > 0 ? next : [{ ...EMPTY_LINE }];
      });
    },
    [isReadOnly]
  );

  const focusNextField = useCallback((index: number, selector: string) => {
    window.setTimeout(() => {
      const element = document.querySelector(selector.replace("{i}", String(index))) as HTMLElement | null;
      element?.focus();
    }, 0);
  }, []);

  const handleLineKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>, index: number, field: string) => {
      if (e.key !== "Enter" || e.shiftKey) return;

      e.preventDefault();
      const isLastLine = index === lines.length - 1;

      if (field === "product_code") {
        void resolveManualProductLookup(index, "code");
        focusNextField(index, `[data-line-barcode="{i}"]`);
        return;
      }

      if (field === "product_barcode") {
        void resolveManualProductLookup(index, "barcode");
        focusNextField(index, `[data-line-qty="{i}"]`);
        return;
      }

      if (field === "discount" && isLastLine && !isReadOnly) {
        addLine();
        focusNextField(index + 1, `[data-line-code="{i}"]`);
        return;
      }

      const fieldOrder = ["quantity", "unit_price", "discount"];
      const currentFieldIndex = fieldOrder.indexOf(field);
      if (currentFieldIndex < fieldOrder.length - 1) {
        const nextField = fieldOrder[currentFieldIndex + 1];
        const selectorMap: Record<string, string> = {
          quantity: `[data-line-qty="{i}"]`,
          unit_price: `[data-line-price="{i}"]`,
          discount: `[data-line-discount="{i}"]`,
        };
        focusNextField(index, selectorMap[nextField]);
      }
    },
    [addLine, focusNextField, isReadOnly, lines.length, resolveManualProductLookup]
  );

  const validateLines = () => {
    const cleanedLines = lines.filter((line) => !isLineEmpty(line));

    if (cleanedLines.length === 0) {
      throw new Error("At least one line is required.");
    }

    cleanedLines.forEach((line, index) => {
      if (!line.product_id) {
        throw new Error(`Line ${index + 1}: select a product.`);
      }

      if (parseDecimal(line.quantity) <= 0) {
        throw new Error(`Line ${index + 1}: quantity must be greater than 0.`);
      }

      if (parseDecimal(line.unit_price) < 0) {
        throw new Error(`Line ${index + 1}: unit price must be zero or more.`);
      }
    });

    return cleanedLines;
  };

  const saveDraft = async () => {
    if (isReadOnly) {
      setError("Posted invoices are read-only.");
      return null;
    }

    if (!customerId) {
      setError("Customer is required.");
      return null;
    }

    if (!invoiceDate) {
      setError("Invoice date is required.");
      return null;
    }

    if (!invoiceNo.trim()) {
      setError("Invoice number is required.");
      return null;
    }

    try {
      const cleanedLines = validateLines();
      setSaving(true);
      setError(null);

      const savedHeaderId = await saveSalesInvoiceDraft({
        headerId,
        invoiceNo,
        invoiceDate,
        customerId,
        salesmanId,
        notes,
        totalAmount: grandTotal,
        lines: cleanedLines.map((line) => ({
          product_id: line.product_id,
          quantity: parseDecimal(line.quantity),
          unit_price: parseDecimal(line.unit_price),
          discount: parseDecimal(line.discount),
        })),
      });

      setHeaderId(savedHeaderId);
      setStatus("draft");

      if (isNew) {
        navigate(`/invoice-entry/${savedHeaderId}`, { replace: true });
      }

      return savedHeaderId;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save draft.");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const postInvoice = async () => {
    if (isReadOnly) return;

    try {
      const savedHeaderId = await saveDraft();
      const targetHeaderId = savedHeaderId || headerId || id;

      if (!targetHeaderId) {
        throw new Error("Save the invoice before posting.");
      }

      const activeLines = lines.filter((line) => !isLineEmpty(line));
      const overAllocatedLine = activeLines.find((line) => {
        if (line.available_stock == null) return false;
        return parseDecimal(line.quantity) > Number(line.available_stock ?? 0);
      });

      if (overAllocatedLine) {
        throw new Error(
          `Requested quantity exceeds available stock for ${overAllocatedLine.product_code || overAllocatedLine.product_name}.`
        );
      }

      setPosting(true);
      setError(null);
      await postSalesInvoice(targetHeaderId);
      setStatus("posted");
    } catch (postError) {
      setError(postError instanceof Error ? postError.message : "Failed to post invoice.");
    } finally {
      setPosting(false);
    }
  };

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const printData = useMemo<InvoicePrintData>(() => {
    const activeLines = lines.filter((line) => !isLineEmpty(line));
    return {
      invoice_no: invoiceNo,
      invoice_date: invoiceDate,
      customer_name: selectedCustomer?.name ?? "",
      customer_code: selectedCustomer?.code ?? "",
      salesman_name: selectedSalesman?.name ?? "",
      salesman_code: selectedSalesman?.code ?? "",
      notes,
      lines: activeLines.map((line, index): PrintLineItem => ({
        line_no: index + 1,
        item_code: line.product_code,
        product_name: line.product_name,
        quantity: parseDecimal(line.quantity),
        unit_price: parseDecimal(line.unit_price),
        discount: parseDecimal(line.discount),
        line_total: getLineTotal(line),
      })),
      total_amount: grandTotal,
    };
  }, [grandTotal, invoiceDate, invoiceNo, lines, notes, selectedCustomer, selectedSalesman]);

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
          <div className="mx-auto flex max-w-7xl items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/invoice-entry")}
              className="rounded-md p-1.5 transition-colors hover:bg-secondary"
            >
              <ArrowLeft className="h-5 w-5 text-foreground" />
            </button>
            <h1 className="text-lg font-bold tracking-tight text-foreground">Sales Invoice Entry</h1>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6">
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">{error ?? "Sales invoice not found."}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <InvoicePrintView ref={printRef} data={printData} />

      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="rounded-md p-1.5 transition-colors hover:bg-secondary"
          >
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>

          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight text-foreground">Sales Invoice Entry</h1>
            <p className="text-[11px] text-muted-foreground">
              Fast code-driven sales invoice entry with FEFO posting
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide",
                status === "posted"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-700"
              )}
            >
              {status}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <section className="rounded-lg border border-border bg-secondary p-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Invoice Header
            </h2>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>{selectedCustomer ? selectedCustomer.name : "No customer selected"}</span>
              <span>{selectedSalesman ? selectedSalesman.name : "No salesman selected"}</span>
              <span>{activeLineCount} lines</span>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr_1.3fr_1.1fr_0.8fr]">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Invoice No
              </label>
              <input
                value={invoiceNo}
                onChange={(event) => setInvoiceNo(event.target.value)}
                readOnly={isReadOnly}
                className={`${lineInputClass} font-mono`}
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Invoice Date
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(event) => setInvoiceDate(event.target.value)}
                readOnly={isReadOnly}
                className={lineInputClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Customer
              </label>
              <InvoiceLookupSelect
                value={customerId}
                options={customerOptions}
                placeholder="Select customer"
                searchPlaceholder="Search by code or name..."
                emptyText="No customer found."
                disabled={isReadOnly}
                onSelect={handleCustomerChange}
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Salesman
              </label>
              <InvoiceLookupSelect
                value={salesmanId}
                options={salesmanOptions}
                placeholder="Select salesman"
                searchPlaceholder="Search salesman..."
                emptyText="No salesman found."
                disabled={isReadOnly}
                onSelect={handleSalesmanSelect}
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Status
              </label>
              <input value={status} readOnly className={`${lineInputClass} capitalize`} />
            </div>
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              readOnly={isReadOnly}
              rows={2}
              className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
              placeholder="Invoice notes..."
            />
          </div>
        </section>

        <section className="rounded-lg border border-border bg-secondary p-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Invoice Lines
              </h2>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Enter by item code or barcode. Item details and FEFO preview update automatically.
              </p>
            </div>
            {!isReadOnly && (
              <button
                type="button"
                onClick={addLine}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Row
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1380px] border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="w-14 px-1.5 py-2">#</th>
                  <th className="w-28 px-1.5 py-2">Item Code</th>
                  <th className="w-36 px-1.5 py-2">Barcode</th>
                  <th className="px-1.5 py-2">Item Name</th>
                  <th className="w-24 px-1.5 py-2">Qty</th>
                  <th className="w-20 px-1.5 py-2">Unit</th>
                  <th className="w-28 px-1.5 py-2">Unit Price</th>
                  <th className="w-24 px-1.5 py-2">Discount</th>
                  <th className="w-28 px-1.5 py-2">Line Total</th>
                  <th className="w-28 px-1.5 py-2">Actions</th>
                </tr>
              </thead>

              <tbody>
                {lines.map((line, index) => {
                  const requestedQty = parseDecimal(line.quantity);
                  const availableStock = Number(line.available_stock ?? 0);
                  const allocatedQty = line.fefo_preview.reduce(
                    (sum, allocation) => sum + allocation.allocated_qty,
                    0
                  );
                  const compactAllocation =
                    line.fefo_preview.length === 1 ? line.fefo_preview[0] : null;
                  const exceedsStock =
                    line.product_id !== "" &&
                    line.available_stock != null &&
                    requestedQty > availableStock;
                  const hasPartialAllocation =
                    requestedQty > 0 && allocatedQty > 0 && allocatedQty < requestedQty;
                  const showNoAllocationMessage =
                    line.product_id &&
                    requestedQty > 0 &&
                    line.fefo_preview.length === 0 &&
                    availableStock <= 0;

                  return (
                    <Fragment key={line.id ?? `line-${index}`}>
                      <tr className="align-top">
                        <td className="px-1.5 py-1.5">
                          <div className="flex h-9 items-center rounded-md border border-border bg-background px-2.5 font-mono text-xs text-foreground">
                            {index + 1}
                          </div>
                        </td>

                        <td className="px-1.5 py-1.5">
                          <input
                            value={line.product_code}
                            data-line-code={index}
                            onChange={(event) =>
                              handleCodeOrBarcodeChange(index, "product_code", event.target.value)
                            }
                            onBlur={() => void resolveManualProductLookup(index, "code")}
                            onKeyDown={(e) => handleLineKeyDown(e, index, "product_code")}
                            readOnly={isReadOnly}
                            placeholder="Code"
                            className={`${lineInputClass} font-mono`}
                          />
                        </td>

                        <td className="px-1.5 py-1.5">
                          <input
                            value={line.product_barcode}
                            data-line-barcode={index}
                            onChange={(event) =>
                              handleCodeOrBarcodeChange(index, "product_barcode", event.target.value)
                            }
                            onBlur={() => void resolveManualProductLookup(index, "barcode")}
                            onKeyDown={(e) => handleLineKeyDown(e, index, "product_barcode")}
                            readOnly={isReadOnly}
                            placeholder="Barcode"
                            className={`${lineInputClass} font-mono`}
                          />
                        </td>

                        <td className="px-1.5 py-1.5">
                          <Popover
                            open={line.product_picker_open && !isReadOnly}
                            onOpenChange={(open) => handleProductPickerOpenChange(index, open)}
                          >
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={isReadOnly}
                                data-line-product={index}
                                className="h-9 w-full justify-between bg-background px-2.5 font-normal"
                              >
                                <span
                                  className={cn(
                                    "truncate text-left text-[13px]",
                                    !line.product_id && "text-muted-foreground"
                                  )}
                                >
                                  {line.product_name || "Select item"}
                                </span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>

                            <PopoverContent className="w-[460px] p-0" align="start">
                              <Command shouldFilter>
                                <CommandInput placeholder="Search by item code, barcode, or name..." />
                                <CommandList>
                                  <CommandEmpty>No product found.</CommandEmpty>
                                  <CommandGroup>
                                    {productOptions.map((option) => {
                                      const product = productsById.get(option.id);
                                      if (!product) return null;

                                      return (
                                        <CommandItem
                                          key={option.id}
                                          value={option.searchText}
                                          keywords={[
                                            option.label.toLowerCase(),
                                            option.searchText,
                                            option.meta?.toLowerCase() ?? "",
                                          ]}
                                          onSelect={() => void applyProductToLine(index, product)}
                                          className="flex items-start justify-between gap-3 py-2"
                                        >
                                          <span className="min-w-0 flex-1">
                                            <span className="block truncate font-medium">
                                              {option.label}
                                            </span>
                                            <span className="block truncate text-[11px] text-muted-foreground">
                                              {option.meta ?? "No barcode"}
                                            </span>
                                          </span>
                                        </CommandItem>
                                      );
                                    })}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>

                          <div className="mt-1 flex items-center justify-between gap-2">
                            <span className="truncate text-[11px] text-muted-foreground">
                              {line.search || "No item selected"}
                            </span>
                            {!isReadOnly && line.product_id && (
                              <button
                                type="button"
                                onClick={() => clearLineProduct(index)}
                                className="shrink-0 text-[11px] text-muted-foreground underline"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="px-1.5 py-1.5">
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={line.quantity}
                            data-line-qty={index}
                            onChange={(event) => handleQuantityChange(index, event.target.value)}
                            onKeyDown={(e) => handleLineKeyDown(e, index, "quantity")}
                            readOnly={isReadOnly}
                            className={lineInputClass}
                          />
                        </td>

                        <td className="px-1.5 py-1.5">
                          <input
                            value={line.unit}
                            readOnly
                            className={`${lineInputClass} text-center font-medium`}
                            placeholder="Unit"
                          />
                        </td>

                        <td className="px-1.5 py-1.5">
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={line.unit_price}
                            data-line-price={index}
                            onChange={(event) => setLineValue(index, "unit_price", event.target.value)}
                            onKeyDown={(e) => handleLineKeyDown(e, index, "unit_price")}
                            readOnly={isReadOnly}
                            className={lineInputClass}
                          />
                        </td>

                        <td className="px-1.5 py-1.5">
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={line.discount}
                            data-line-discount={index}
                            onChange={(event) => setLineValue(index, "discount", event.target.value)}
                            onKeyDown={(e) => handleLineKeyDown(e, index, "discount")}
                            readOnly={isReadOnly}
                            className={lineInputClass}
                          />
                        </td>

                        <td className="px-1.5 py-1.5">
                          <div className="flex h-9 items-center rounded-md border border-border bg-background px-2.5 text-sm font-semibold text-foreground">
                            {getLineTotal(line).toFixed(3)}
                          </div>
                        </td>

                        <td className="px-1.5 py-1.5">
                          <div className="flex h-9 items-center justify-center gap-1 rounded-md border border-border bg-background px-1.5">
                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={addLine}
                                className="inline-flex h-7 w-7 items-center justify-center rounded border border-border text-foreground transition-colors hover:bg-secondary"
                                title="Add row"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => removeLine(index)}
                              disabled={isReadOnly}
                              className="inline-flex h-7 w-7 items-center justify-center rounded border border-border text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
                              title="Remove row"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {(line.product_id || exceedsStock || line.fefo_preview_open) && (
                        <tr>
                          <td colSpan={10} className="px-1.5 pb-1.5">
                            <div className="rounded-md border border-border/70 bg-background px-3 py-2">
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                                <span className="text-muted-foreground">
                                  Available:{" "}
                                  <span
                                    className={cn(
                                      "font-medium",
                                      exceedsStock ? "text-destructive" : "text-foreground"
                                    )}
                                  >
                                    {line.product_id ? availableStock.toFixed(3) : "-"}
                                  </span>
                                </span>

                                {compactAllocation && (
                                  <span className="text-muted-foreground">
                                    FEFO:{" "}
                                    <span className="font-medium text-foreground">
                                      {compactAllocation.batch_no || "No batch"}
                                    </span>
                                    {" • "}
                                    {formatExpiryDate(compactAllocation.expiry_date)}
                                    {" • "}
                                    {compactAllocation.allocated_qty.toFixed(3)}
                                  </span>
                                )}

                                {line.fefo_preview.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => toggleFefoPreview(index)}
                                    className="text-primary underline"
                                  >
                                    {line.fefo_preview_open
                                      ? "Hide FEFO"
                                      : `Show FEFO (${line.fefo_preview.length} batches)`}
                                  </button>
                                )}

                                {hasPartialAllocation && (
                                  <span className="text-destructive">
                                    FEFO covers {allocatedQty.toFixed(3)} / {requestedQty.toFixed(3)}
                                  </span>
                                )}

                                {showNoAllocationMessage && (
                                  <span className="text-muted-foreground">
                                    No FEFO allocation preview available
                                  </span>
                                )}

                                {exceedsStock && (
                                  <span className="font-medium text-destructive">
                                    Requested quantity exceeds available stock
                                  </span>
                                )}
                              </div>

                              {line.fefo_preview.length > 1 && line.fefo_preview_open && (
                                <div className="mt-2 space-y-1">
                                  {line.fefo_preview.map((allocation, allocationIndex) => (
                                    <div
                                      key={`${allocation.batch_no ?? "batch"}-${allocation.expiry_date ?? "no-expiry"}-${allocationIndex}`}
                                      className="grid grid-cols-[1.2fr_1fr_0.7fr] gap-3 rounded border border-border/60 px-2 py-1.5 text-[11px]"
                                    >
                                      <span className="font-mono text-foreground">
                                        {allocation.batch_no || "No batch"}
                                      </span>
                                      <span className="text-muted-foreground">
                                        {formatExpiryDate(allocation.expiry_date)}
                                      </span>
                                      <span className="text-right font-medium text-foreground">
                                        {allocation.allocated_qty.toFixed(3)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-secondary p-3">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Totals
              </h2>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Posting deducts stock only after successful FEFO allocation.
              </p>
            </div>

            <div className="grid min-w-[320px] gap-2 sm:grid-cols-3">
              <div className="rounded-md border border-border bg-background px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Subtotal</p>
                <p className="text-base font-semibold text-foreground">{subtotalAmount.toFixed(3)}</p>
              </div>
              <div className="rounded-md border border-border bg-background px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Discount Total</p>
                <p className="text-base font-semibold text-foreground">{discountTotal.toFixed(3)}</p>
              </div>
              <div className="rounded-md border border-primary/25 bg-primary/5 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Grand Total</p>
                <p className="text-lg font-semibold text-foreground">{grandTotal.toFixed(3)}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-secondary"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>

          <button
            type="button"
            onClick={saveDraft}
            disabled={isReadOnly || saving || posting}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Draft
          </button>

          <button
            type="button"
            onClick={postInvoice}
            disabled={isReadOnly || saving || posting}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {posting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Post Invoice
          </button>
        </section>
      </main>
    </div>
  );
}
