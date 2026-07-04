import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronsUpDown,
  Loader2,
  Printer,
  Save,
  Trash2,
  Upload,
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
  type CustomerLookup,
  type FefoPreviewAllocation,
  type ProductLookup,
  type SalesInvoiceStatus,
  type SalesmanLookup,
} from "@/features/invoices/salesInvoiceService";
import { useOfflineSaveDraft } from "@/features/invoices/queries/useOfflineSaveDraft";
import { parsePdf } from "@/lib/pdfParser";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { validateInvoiceRows } from "@/features/upload-center/validation";
import { fireTrigger } from "@/lib/automation";
import InvoiceLookupSelect, { type InvoiceLookupOption } from "./InvoiceLookupSelect";
import InvoicePrintView, { type InvoicePrintData, type PrintLineItem } from "./InvoicePrintView";
import { parsePOLocalText } from "@/features/invoices/poLocalParser";

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
  isUnmatched?: boolean;
  suggestions?: ProductLookup[];
  originalName?: string;
  store?: string;
  batch?: string;
  expiry?: string;
  is_foc?: boolean;
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
  store: "MAIN",
  batch: "",
  expiry: "",
  is_foc: false,
};

const lineInputClass =
  "h-7 w-full rounded-sm border border-border bg-background px-1.5 text-[11.5px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60";

const fieldLabelClass =
  "shrink-0 text-[11px] font-medium text-foreground/80 whitespace-nowrap";

// Sales Master compact field styles (kept for items table header / misc usage)
const ML = "text-[10px] font-semibold text-foreground/55 whitespace-nowrap shrink-0";
const MF = "h-[24px] rounded-[2px] border border-border bg-background px-1.5 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const MR = "h-[24px] rounded-[2px] border border-border/50 bg-muted/40 px-1.5 text-[11px] text-foreground/70 select-none cursor-default";
const MD = "h-3.5 w-px bg-border/60 mx-1 shrink-0";

// Card-based grid field styles (new Sales Master layout)
const SL = "text-[11px] font-medium text-foreground/60 mb-0.5 block leading-tight";
const SF = "h-8 w-full rounded-[3px] border border-border bg-background px-2 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60";
const SR = "h-8 w-full rounded-[3px] border border-border/50 bg-muted/40 px-2 text-[12px] text-foreground/70 select-none cursor-default";

// Returns true when errorText contains known Gemini-flow keywords from the old service
function isStaleGeminiServiceError(errorText: string): boolean {
  const lower = errorText.toLowerCase();
  return (
    lower.includes("gemini api key") ||
    lower.includes("x-gemini-api-key") ||
    lower.includes("gemini_api_key") ||
    lower.includes("lovable_api_key")
  );
}

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
  if (line.is_foc) return 0;
  const subtotal = getLineSubtotal(line);
  const discountPct = parseDecimal(line.discount);
  return Math.max(0, subtotal - (subtotal * discountPct) / 100);
}

function normalizeLookupSearch(value: string) {
  return value.trim().toLowerCase();
}

function formatExpiryDate(value: string | null, noExpiryLabel = "No expiry") {
  if (!value) return noExpiryLabel;

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
  const location = useLocation();
  const { lang, t } = useLang();
  const isNew = !id;
  const printRef = useRef<HTMLDivElement>(null);
  const offlineSaveDraft = useOfflineSaveDraft();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [customers, setCustomers] = useState<CustomerLookup[]>([]);
  const [salesmen, setSalesmen] = useState<SalesmanLookup[]>([]);
  const [products, setProducts] = useState<ProductLookup[]>([]);

  const [extracting, setExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState("");
  const [serviceOnline, setServiceOnline] = useState<boolean | null>(null);
  // Extraction review state (PR-R1/PR-R2): warnings surfaced from validation +
  // match quality, and a review verdict so an AI-extracted invoice is never
  // treated as clean without the user confirming. Cleared on each new upload.
  const [extractionWarnings, setExtractionWarnings] = useState<string[]>([]);
  const [reviewStatus, setReviewStatus] = useState<"needs_review" | "reviewed" | null>(null);
  const [rawExtractedText, setRawExtractedText] = useState<string | null>(null);
  const [showRawText, setShowRawText] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const EXTRACT_SVC = import.meta.env.VITE_EXTRACTION_SERVICE_URL ?? "http://127.0.0.1:8000";

  const checkExtractionService = async (): Promise<boolean> => {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${EXTRACT_SVC}/health`, { signal: ctrl.signal });
      clearTimeout(timeout);
      const online = res.ok;
      setServiceOnline(online);
      return online;
    } catch {
      setServiceOnline(false);
      return false;
    }
  };

  const [headerId, setHeaderId] = useState<string | null>(id ?? null);
  const [invoiceNo, setInvoiceNo] = useState(createDraftInvoiceNo());
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [customerId, setCustomerId] = useState("");
  const [salesmanId, setSalesmanId] = useState("");
  const [notes, setNotes] = useState("");
  const [currency, setCurrency] = useState("KWD");
  const [exchangeRate, setExchangeRate] = useState("1.000000");
  const [customerChild, setCustomerChild] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split("T")[0]);
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0]);
  const [discountType, setDiscountType] = useState("Percentage");
  const [discountValue, setDiscountValue] = useState("0");
  const [poNumber, setPoNumber] = useState("");
  const [quotationNumber, setQuotationNumber] = useState("");
  const [status, setStatus] = useState<SalesInvoiceStatus>("draft");
  const [lines, setLines] = useState<InvoiceLineForm[]>([{ ...EMPTY_LINE }]);
  const isReadOnly = status !== "draft";

  // Added States to match Oracle Forms Screenshot exactly
  const [custCom1, setCustCom1] = useState("");
  const [custCom2, setCustCom2] = useState("");
  const [invoiceType, setInvoiceType] = useState("DF");
  const [focCode, setFocCode] = useState("DF");
  const [focName, setFocName] = useState("DEFAULT/عادي");

  const [customerMappings, setCustomerMappings] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!customerId) {
      setCustomerMappings({});
      return;
    }
    async function loadCustomerMappings() {
      try {
        const { data, error } = await supabase
           
          .from("customer_sku_mappings")
          .select("external_name, product_id")
          .eq("customer_id", customerId);
        if (!error && data) {
          const map: Record<string, string> = {};
          ((data || []) as Array<{ external_name: string; product_id: string }>).forEach((row) => {
            map[row.external_name.toLowerCase()] = row.product_id;
          });
          setCustomerMappings(map);
        }
      } catch (err) {
        console.error("Failed to load customer SKU mappings:", err);
      }
    }
    void loadCustomerMappings();
  }, [customerId]);

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
  const discountTotal = useMemo(() => lines.reduce((sum, line) => {
    if (line.is_foc) return sum;
    const subtotal = getLineSubtotal(line);
    const discPct = parseDecimal(line.discount);
    return sum + (subtotal * discPct) / 100;
  }, 0), [lines]);
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

            const unitPrice = line.unit_price ?? 0;
            const discountAmount = line.discount ?? 0;
            const subtotal = Number(quantity) * unitPrice;
            const discPct = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0;

            return {
              id: line.id,
              search: product ? formatProductLookup(product) : "",
              product_id: line.product_id,
              product_code: product?.item_code ?? "",
              product_barcode: product?.primary_barcode ?? "",
              product_name: product ? getProductLabel(product, lang) : "",
              unit: product?.uom ?? "",
              quantity,
              unit_price: String(unitPrice),
              discount: discPct > 0 ? discPct.toFixed(2) : "0",
              available_stock: availableStock,
              fefo_preview: fefoPreview,
              fefo_preview_open: false,
              product_picker_open: false,
              is_foc: unitPrice === 0 && Number(quantity) > 0,
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

  // ── Inject pre-extracted data arriving from UploadCenter navigation ──────────
  // Runs once after initial data load; checks location.state.rawExtraction.
  const didInjectFromNavState = useRef(false);
  useEffect(() => {
    if (didInjectFromNavState.current || !isNew || loading || products.length === 0) return;
    const state = location.state as {
      rawExtraction?: { header: Record<string, unknown>; items: unknown[] };
    } | null;
    if (!state?.rawExtraction?.items?.length) return;
    didInjectFromNavState.current = true;

    const { header: extractedHeader, items: extractedItems } = state.rawExtraction;
    const nf = <T,>(field: unknown, fallback: T): T => {
      if (field === undefined || field === null) return fallback;
      if (typeof field === "object" && field !== null && "value" in field)
        return ((field as { value: unknown }).value ?? fallback) as T;
      return field as T;
    };

    void (async () => {
      setExtracting(true);
      setExtractionProgress("Matching products from document...");
      try {
        // Populate header fields
        const invoiceNoVal = nf<string>(extractedHeader.invoiceNumber, "");
        const poNoVal = nf<string>(extractedHeader.poNumber, "");
        const dateVal = nf<string>(extractedHeader.date, "");
        const commentsVal = nf<string>(extractedHeader.comments, "");
        const currencyVal = nf<string>(extractedHeader.currency, "");
        const custNameVal = nf<string>(extractedHeader.customerName, "");
        if (invoiceNoVal) setInvoiceNo(invoiceNoVal);
        else if (poNoVal) setInvoiceNo(`PO-${poNoVal}`);
        if (dateVal) setInvoiceDate(dateVal.split("T")[0]);
        if (poNoVal) setPoNumber(poNoVal);
        if (commentsVal) setNotes(commentsVal);
        if (currencyVal) setCurrency(currencyVal);

        let injectedCustomerId = "";
        if (custNameVal) {
          const lcName = custNameVal.toLowerCase().trim();
          const matchedCust = customers.find(
            (c) =>
              c.name.toLowerCase().includes(lcName) ||
              lcName.includes(c.name.toLowerCase()) ||
              (c.code && c.code.toLowerCase() === lcName)
          );
          if (matchedCust) {
            setCustomerId(matchedCust.id);
            injectedCustomerId = matchedCust.id;
            if (matchedCust.salesman_id) setSalesmanId(matchedCust.salesman_id);
          }
        }

        // Load customer alias mappings for matched customer
        const localMappings: Record<string, string> = {};
        if (injectedCustomerId) {
          try {
            const { data } = await supabase
              .from("customer_sku_mappings")
              .select("external_name, product_id")
              .eq("customer_id", injectedCustomerId);
            if (data) {
              (data as Array<{ external_name: string; product_id: string }>).forEach(
                (row) => { localMappings[row.external_name.toLowerCase()] = row.product_id; }
              );
            }
          } catch { /* non-critical */ }
        }

        setExtractionProgress("Injecting Invoice Lines...");
        const mappedLines: InvoiceLineForm[] = [];
        let matchedCount = 0, ambiguousCount = 0, unmatchedCount = 0;

        for (const rawItem of extractedItems) {
          const item = rawItem as Record<string, unknown>;
          const extBarcode = nf<string>(item.barcode, "").trim();
          const extItemCode = nf<string>(item.itemCode, "").trim();
          const extItemName = nf<string>(item.itemName, "").trim();
          const extQty = nf<number>(item.qty, 1);
          const extPrice = nf<number>(item.unitPrice, 0);
          const extDisc = nf<number>(item.discount, 0);
          const extUnit = nf<string>(item.unit, "PCS");

          let matched: ProductLookup | null = null;
          if (extBarcode) matched = resolveProductByCodeOrBarcode(extBarcode, "barcode");
          if (!matched && extItemCode) matched = resolveProductByCodeOrBarcode(extItemCode, "code");
          if (!matched && extItemName) {
            const pid = localMappings[extItemName.toLowerCase()];
            if (pid) matched = productsById.get(pid) ?? null;
          }

          let suggestions: ProductLookup[] = [];
          if (!matched && extItemName) {
            const sims = products
              .map((p) => ({
                product: p,
                similarity: Math.max(
                  getStringSimilarity(extItemName, getProductLabel(p, lang)),
                  p.item_code ? getStringSimilarity(extItemName, p.item_code) : 0
                ),
              }))
              .sort((a, b) => b.similarity - a.similarity);
            suggestions = sims.filter((s) => s.similarity >= 0.45).slice(0, 5).map((s) => s.product);
            if (sims[0] && sims[0].similarity > 0.75) matched = sims[0].product;
          }

          if (matched && extItemName) matchedCount++;
          else if (!matched && extItemName && suggestions.length > 0) ambiguousCount++;
          else if (!matched && extItemName) unmatchedCount++;

          if (matched && extItemName) {
            try {
              if (injectedCustomerId) {
                await supabase.from("customer_sku_mappings").upsert(
                  { customer_id: injectedCustomerId, external_name: extItemName, product_id: matched.id },
                  { onConflict: "customer_id,external_name" }
                );
              }
              await supabase.from("auto_match_feedback").upsert(
                {
                  external_name: extItemName,
                  matched_product_id: matched.id,
                  usage_count: 1,
                  last_used: new Date().toISOString(),
                },
                { onConflict: "external_name,matched_product_id" }
              );
            } catch { /* non-critical */ }
          }

          const quantity = String(extQty > 0 ? extQty : 1);
          let availableStock: number | null = null;
          let fefoPreview: FefoPreviewAllocation[] = [];
          if (matched) {
            try {
              const inv = await loadLineInventoryPreview(matched.id, quantity);
              availableStock = inv.availableStock;
              fefoPreview = inv.fefoPreview;
            } catch { /* non-critical */ }
          }

          mappedLines.push({
            search: matched ? formatProductLookup(matched) : "",
            product_id: matched?.id ?? "",
            product_code: matched?.item_code ?? extItemCode,
            product_barcode: matched?.primary_barcode ?? extBarcode,
            product_name: matched ? getProductLabel(matched, lang) : extItemName,
            unit: matched?.uom ?? extUnit,
            quantity,
            unit_price: String(
              extPrice || (matched?.selling_price != null ? Number(matched.selling_price) : 0)
            ),
            discount: String(extDisc || 0),
            available_stock: availableStock,
            fefo_preview: fefoPreview,
            fefo_preview_open: false,
            product_picker_open: false,
            originalName: extItemName || undefined,
            suggestions: suggestions.length > 0 ? suggestions : undefined,
            is_foc: false,
            store: "MAIN",
            batch: fefoPreview[0]?.batch_no ?? "",
            expiry: fefoPreview[0]?.expiry_date ?? "",
          });
        }

        mappedLines.push({ ...EMPTY_LINE });
        setLines(mappedLines);
        toast.success(
          `${extractedItems.length} line(s) loaded — ✓ ${matchedCount} matched · ⚠ ${ambiguousCount} ambiguous · ✗ ${unmatchedCount} unmatched`
        );
      } finally {
        setExtracting(false);
        setExtractionProgress("");
      }
    })();
  }, [loading]);

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

      setLines((current) => {
        const updated = current.map((line, lineIndex) =>
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
        );
        if (index === updated.length - 1 && !isReadOnly) {
          updated.push({ ...EMPTY_LINE });
        }
        return updated;
      });

      await updateLineInventoryPreview(index, product.id, requestedQuantity);
    },
    [formatProductLookup, isReadOnly, lang, lines, updateLineInventoryPreview]
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

  /**
   * Product-code onChange handler.
   * If the typed value is an EXACT match in the product catalogue, the full product
   * (name, UOM, price, barcode) is applied immediately — no Enter or blur needed.
   * If no exact match exists yet the code field is simply updated so the user can
   * finish typing, then press Enter or blur to trigger a fuzzy/manual lookup.
   */
  const handleProductCodeChange = useCallback(
    (index: number, value: string) => {
      const normalized = normalizeLookupSearch(value);

      setLines((current) => {
        const currentLine = current[index];
        if (!currentLine) return current;

        // ── Empty → clear everything ──────────────────────────────────────────
        if (!normalized) {
          return current.map((line, i) =>
            i !== index
              ? line
              : {
                  ...line,
                  product_code: value,
                  product_id: "",
                  product_name: "",
                  unit: "",
                  search: "",
                  product_barcode: "",
                  available_stock: null,
                  fefo_preview: [],
                  fefo_preview_open: false,
                }
          );
        }

        // ── Exact match → apply product in one atomic update ─────────────────
        const matched = productByCode.get(normalized);
        if (matched) {
          const qty = currentLine.quantity || "1";
          const price =
            currentLine.unit_price ||
            String(matched.selling_price == null ? 0 : Number(matched.selling_price));

          const applied = {
            ...currentLine,
            product_code: matched.item_code ?? value,
            product_id: matched.id,
            product_barcode: matched.primary_barcode ?? "",
            product_name: getProductLabel(matched, lang),
            unit: matched.uom ?? "",
            search: formatProductLookup(matched),
            unit_price: price,
            quantity: qty,
            product_picker_open: false,
            fefo_preview_open: false,
          };

          const updated = current.map((line, i) => (i === index ? applied : line));
          if (index === updated.length - 1 && !isReadOnly) {
            return [...updated, { ...EMPTY_LINE }];
          }
          return updated;
        }

        // ── No match yet → just update the code, clear stale product fields ──
        const codeChanged = value.trim() !== currentLine.product_code;
        return current.map((line, i) =>
          i !== index
            ? line
            : codeChanged
            ? {
                ...line,
                product_code: value,
                product_id: "",
                product_name: "",
                unit: "",
                search: "",
                available_stock: null,
                fefo_preview: [],
                fefo_preview_open: false,
              }
            : { ...line, product_code: value }
        );
      });

      // ── After state update: kick off async FEFO preview if exact match ─────
      const matched = productByCode.get(normalized);
      if (matched) {
        const currentQty = lines[index]?.quantity || "1";
        void updateLineInventoryPreview(index, matched.id, currentQty);
      }
    },
    [formatProductLookup, isReadOnly, lang, lines, productByCode, updateLineInventoryPreview]
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
        // If product is already resolved (instant match), just advance focus.
        // Otherwise try a manual lookup (handles pasted codes, slow typists).
        const currentLine = lines[index];
        if (!currentLine?.product_id) {
          void resolveManualProductLookup(index, "code");
        }
        focusNextField(index, `[data-line-qty="{i}"]`);
        return;
      }

      if (field === "discount" && !isReadOnly) {
        if (isLastLine) {
          addLine();
        }
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
    [addLine, focusNextField, isReadOnly, lines, resolveManualProductLookup]
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

      const { headerId: savedHeaderId } = await offlineSaveDraft.mutateAsync({
        headerId,
        invoiceNo,
        invoiceDate,
        customerId,
        salesmanId,
        notes,
        totalAmount: grandTotal,
        lines: cleanedLines.map((line) => {
          const subtotal = parseDecimal(line.quantity) * parseDecimal(line.unit_price);
          const discPct = parseDecimal(line.discount);
          const discAmount = (subtotal * discPct) / 100;
          return {
            product_id: line.product_id,
            quantity: parseDecimal(line.quantity),
            unit_price: parseDecimal(line.unit_price),
            discount: discAmount,
          };
        }),
      });

      setHeaderId(savedHeaderId);
      setStatus("draft");

      // Save customer SKU mappings and match feedback
      try {
        const mappedLines = lines.filter((line) => line.originalName && line.product_id);
        if (mappedLines.length > 0 && customerId) {
          const { data: existing } = await supabase
             
            .from("customer_sku_mappings")
            .select("external_name")
            .eq("customer_id", customerId);

          const existingNames = new Set(
            ((existing || []) as Array<{ external_name: string }>).map((r) => r.external_name.toLowerCase())
          );
          const mappingsToInsert = mappedLines
            .filter((line) => !existingNames.has(line.originalName!.toLowerCase()))
            .map((line) => ({
              customer_id: customerId,
              external_name: line.originalName,
              product_id: line.product_id,
            }));

          if (mappingsToInsert.length > 0) {
             
            await supabase.from("customer_sku_mappings").insert(mappingsToInsert);
          }

          for (const line of mappedLines) {
            const { data: existingFb } = await supabase
               
              .from("auto_match_feedback")
              .select("id, usage_count")
              .eq("external_name", line.originalName)
              .eq("matched_product_id", line.product_id)
              .maybeSingle();

            if (existingFb) {
              await supabase
                 
                .from("auto_match_feedback")
                .update({
                  usage_count: (existingFb.usage_count || 0) + 1,
                  last_used: new Date().toISOString(),
                })
                .eq("id", existingFb.id);
            } else {
               
              await supabase.from("auto_match_feedback").insert({
                external_name: line.originalName,
                matched_product_id: line.product_id,
                usage_count: 1,
              });
            }
          }
        }
      } catch (mappingErr) {
        console.error("Failed to save auto match mappings:", mappingErr);
      }

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
      setStatus("ready");

      // Real producer for the invoice.posted automation trigger. Best-effort:
      // a failure here must never break posting, and emit() is a no-op when no
      // rules match, so this is safe even with automation unused.
      try {
        fireTrigger("invoice.posted", {
          invoiceId: targetHeaderId,
          total: grandTotal,
          currency,
          customerId,
          customerName: selectedCustomer?.name ?? "",
        });
      } catch (autoErr) {
        console.warn("[INVOICE] invoice.posted trigger failed (non-critical):", autoErr);
      }
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
        discount: (parseDecimal(line.quantity) * parseDecimal(line.unit_price) * parseDecimal(line.discount)) / 100,
        line_total: getLineTotal(line),
      })),
      total_amount: grandTotal,
    };
  }, [grandTotal, invoiceDate, invoiceNo, lines, notes, selectedCustomer, selectedSalesman]);

  const getStringSimilarity = useCallback((str1: string, str2: string): number => {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    if (s1 === s2) return 1.0;
    if (!s1 || !s2) return 0.0;

    const words1 = s1.split(/\s+/);
    const words2 = s2.split(/\s+/);
    let matches = 0;
    for (const w1 of words1) {
      if (words2.includes(w1)) matches++;
    }
    const wordOverlap = (2 * matches) / (words1.length + words2.length);

    const len = Math.max(s1.length, s2.length);
    const matrix = Array.from({ length: s1.length + 1 }, (_, i) => [i]);
    for (let j = 0; j <= s2.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= s1.length; i++) {
      for (let j = 1; j <= s2.length; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    const dist = matrix[s1.length][s2.length];
    const charSim = 1 - dist / len;

    return 0.4 * wordOverlap + 0.6 * charSim;
  }, []);

  const handleBarcodeScanned = useCallback(
    async (barcode: string) => {
      const matched = resolveProductByCodeOrBarcode(barcode, "barcode") || resolveProductByCodeOrBarcode(barcode, "code");
      if (!matched) {
        toast.error(`${t("barcodeNotFound", "Barcode not found")}: ${barcode}`);
        return;
      }

      toast.success(`${t("scanned", "Scanned")}: ${getProductLabel(matched, lang)}`);

      const existingLineIndex = lines.findIndex((line) => line.product_id === matched.id);

      if (existingLineIndex >= 0) {
        const currentQty = parseDecimal(lines[existingLineIndex].quantity);
        const nextQty = String(currentQty + 1);
        setLines((current) =>
          current.map((line, idx) =>
            idx === existingLineIndex ? { ...line, quantity: nextQty } : line
          )
        );
        await updateLineInventoryPreview(existingLineIndex, matched.id, nextQty);
      } else {
        let targetIndex = lines.findIndex((line) => !line.product_id);
        if (targetIndex < 0) {
          targetIndex = lines.length;
          setLines((current) => [...current, { ...EMPTY_LINE }]);
        }

        await applyProductToLine(targetIndex, matched, {
          code: matched.item_code ?? "",
          barcode: matched.primary_barcode ?? barcode,
        });

        setLines((current) =>
          current.map((line, idx) =>
            idx === targetIndex ? { ...line, quantity: "1" } : line
          )
        );
        await updateLineInventoryPreview(targetIndex, matched.id, "1");
      }
    },
    [applyProductToLine, lines, resolveProductByCodeOrBarcode, lang, t, updateLineInventoryPreview]
  );

  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Helper: handle both flat values and confidence-wrapped { value, confidence } objects
    const nf = <T,>(field: unknown, fallback: T): T => {
      if (field === undefined || field === null) return fallback;
      if (typeof field === "object" && field !== null && "value" in field)
        return ((field as { value: unknown }).value ?? fallback) as T;
      return field as T;
    };

    console.log("[UPLOAD] File:", file.name);
    console.log("[UPLOAD] Type:", file.type);
    console.log("[UPLOAD] Size:", file.size);

    setExtracting(true);
    setExtractionProgress("Uploading document...");
    setExtractionWarnings([]);
    setReviewStatus(null);
    setRawExtractedText(null);
    setShowRawText(false);

    // Hoisted so the catch block can record a failed document with its storage
    // path (No Lost Invoices). Null until the storage upload step assigns it.
    let storagePath: string | null = null;

    try {
      // ── Pre-flight: verify extraction service is reachable ─────────────────
      const svcReady = await checkExtractionService();
      if (!svcReady) {
        throw new Error(
          "Extraction service is offline.\n" +
          "Start it by running: services/extraction-service/start.bat\n" +
          "Then try uploading again."
        );
      }

      // ── Step 1: Upload to Supabase storage (non-blocking) ──────────────────
      storagePath = `invoices/${Date.now()}_${file.name}`;
      try {
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(storagePath, file);
        if (uploadError) {
          console.warn("[UPLOAD] Storage upload skipped:", uploadError.message);
        } else {
          console.log("[UPLOAD] Stored at:", storagePath);
        }
      } catch (err) {
        console.warn("[UPLOAD] Supabase storage error (non-critical):", err);
      }

      // ── Step 2: OCR Processing via extraction service ──────────────────────
      setExtractionProgress("OCR Processing...");

      // AI structuring is disabled — no API key header is sent.
      const headers: Record<string, string> = {};

      console.log("[PDF] OCR started for:", file.name, "size:", file.size);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("doc_type", "invoice");

      // 2-minute timeout — large scanned PDFs can take 60-90 seconds
      const abortController = new AbortController();
      const extractionTimeout = setTimeout(() => abortController.abort(), 120_000);

      let response: Response;
      try {
        response = await fetch(`${EXTRACT_SVC}/extract`, {
          method: "POST",
          headers,
          body: formData,
          signal: abortController.signal,
        });
      } catch (fetchErr) {
        clearTimeout(extractionTimeout);
        if (fetchErr instanceof Error && fetchErr.name === "AbortError") {
          throw new Error(
            "Extraction timed out after 2 minutes.\n" +
            "Try a smaller file, or check the service log for errors."
          );
        }
        throw new Error(
          "Could not reach the extraction service.\n" +
          "Make sure services/extraction-service/start.bat is running."
        );
      }
      clearTimeout(extractionTimeout);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error("[API] Error response:", errorText);

        // Guard: stale service still running old Gemini code → raw JSON leak prevention
        if (isStaleGeminiServiceError(errorText)) {
          throw new Error(
            "The extraction service is still using an old Gemini flow.\n" +
            "Stop and restart services/extraction-service/start.bat, then retry.",
          );
        }

        // Parse FastAPI detail without exposing raw JSON
        let detail = "";
        try {
          const parsed = JSON.parse(errorText);
          detail = parsed.detail || parsed.message || parsed.error || "";
        } catch { /* not JSON — fine */ }

        let userMsg = "Could not extract document.";
        if (response.status === 400) {
          userMsg = detail || "Unsupported file type or bad request.";
        } else if (response.status === 422) {
          userMsg = detail || "Invalid request format.";
        } else if (response.status === 500) {
          userMsg = detail || "Extraction service error — check the service log.";
        } else if (response.status === 503) {
          userMsg = detail || "Extraction service unavailable — it may be starting up.";
        } else {
          userMsg = detail || `Extraction failed (HTTP ${response.status}).`;
        }
        throw new Error(userMsg);
      }

      // ── Step 3: Parse document ─────────────────────────────────────────────
      setExtractionProgress("Parsing...");

      let result: Record<string, unknown>;
      try {
        result = await response.json();
      } catch {
        throw new Error("Extraction service returned a non-JSON response — check the service log.");
      }

      console.log("[API] OCR complete");
      console.log("[API] Source method:", result.source);
      console.log("[PDF] Text length:", result.text_length ?? "N/A");

      // ── New path: AI disabled → local text parsing ─────────────────────────
      if (result.ai_structuring_enabled === false) {
        // Guard: stale service body still mentioning Gemini
        const errStr = typeof result.error === "string" ? result.error : "";
        if (isStaleGeminiServiceError(errStr)) {
          throw new Error(
            "The extraction service is still using an old Gemini flow.\n" +
            "Stop and restart services/extraction-service/start.bat, then retry.",
          );
        }

        const rawText = typeof result.raw_text === "string" ? result.raw_text : "";
        if (!rawText) {
          throw new Error(
            "Extraction service returned no text content.\n" +
            "The document may be image-only with no OCR result — check the service log.",
          );
        }
        setRawExtractedText(rawText);

        // Log OCR document record (non-blocking)
        let ocrDocId: string | null = null;
        try {
          const { data: ocrDoc, error: ocrErr } = await supabase
            .from("ocr_documents")
            .insert({
              filename: file.name,
              storage_path: storagePath ?? `unsaved/${file.name}`,
              document_type: "invoice",
              status: "extracted",
              confidence: null,
              raw_data: { raw_text: rawText.substring(0, 2000) },
              metadata: {
                source: result.source,
                text_length: result.text_length ?? 0,
                confidence_known: false,
                ai_structuring_enabled: false,
              } as import("@/integrations/supabase/types").Json,
            })
            .select("id")
            .single();
          if (!ocrErr && ocrDoc) ocrDocId = (ocrDoc as { id: string }).id;
          else if (ocrErr) console.warn("[INVOICE] ocr_documents insert warning:", ocrErr.message);
        } catch (err) {
          console.warn("[INVOICE] Failed to register ocr_document:", err);
        }

        // ── Step 4: Local PO parsing ──────────────────────────────────────────
        setExtractionProgress("Matching Products...");
        const parsedPO = parsePOLocalText(rawText);

        // Populate header fields
        if (parsedPO.poNumber) {
          setPoNumber(parsedPO.poNumber);
          setInvoiceNo(`PO-${parsedPO.poNumber}`);
        }
        if (parsedPO.date) setInvoiceDate(parsedPO.date);
        if (parsedPO.comments) setNotes(parsedPO.comments);

        if (parsedPO.customerName || parsedPO.customerCode) {
          const lcSearch = (parsedPO.customerCode || parsedPO.customerName || "").toLowerCase().trim();
          const matchedCust = customers.find(
            (c) =>
              (c.code ?? "").toLowerCase() === lcSearch ||
              c.name.toLowerCase().includes(lcSearch) ||
              lcSearch.includes(c.name.toLowerCase()),
          );
          if (matchedCust) {
            setCustomerId(matchedCust.id);
            if (matchedCust.salesman_id) setSalesmanId(matchedCust.salesman_id);
          }
        }

        // ── Step 5: Build invoice lines ───────────────────────────────────────
        setExtractionProgress("Injecting Invoice Lines...");
        const mappedLines: InvoiceLineForm[] = [];
        let matchedCount = 0, ambiguousCount = 0, unmatchedCount = 0;

        for (const item of parsedPO.items) {
          const extBarcode = (item.barcode ?? "").trim();
          const extItemCode = item.itemCode.trim();
          const extItemName = item.itemName.trim();
          const extQty = item.qty;
          const extPrice = item.unitPrice ?? 0;
          const extUnit = item.unit;

          let matchedProduct: ProductLookup | null = null;
          if (extBarcode) matchedProduct = resolveProductByCodeOrBarcode(extBarcode, "barcode");
          if (!matchedProduct && extItemCode) matchedProduct = resolveProductByCodeOrBarcode(extItemCode, "code");
          if (!matchedProduct && extItemName && customerId) {
            const mappedId = customerMappings[extItemName.toLowerCase()];
            if (mappedId) matchedProduct = productsById.get(mappedId) ?? null;
          }

          let suggestions: ProductLookup[] = [];
          if (!matchedProduct && extItemName) {
            const sims = products.map((p) => {
              const label = getProductLabel(p, lang);
              return {
                product: p,
                similarity: Math.max(
                  getStringSimilarity(extItemName, label),
                  p.item_code ? getStringSimilarity(extItemName, p.item_code) : 0,
                ),
              };
            });
            sims.sort((a, b) => b.similarity - a.similarity);
            suggestions = sims.filter((s) => s.similarity >= 0.45).slice(0, 5).map((s) => s.product);
            if (sims[0] && sims[0].similarity > 0.75) {
              matchedProduct = sims[0].product;
              console.log(`[MATCH] item "${extItemName}": fuzzy ${(sims[0].similarity * 100).toFixed(0)}% → ${matchedProduct.item_code}`);
            }
          }

          if (matchedProduct) matchedCount++;
          else if (suggestions.length > 0) ambiguousCount++;
          else if (extItemName) unmatchedCount++;

          if (matchedProduct && extItemName) {
            try {
              if (customerId) {
                await supabase.from("customer_sku_mappings").upsert(
                  { customer_id: customerId, external_name: extItemName, product_id: matchedProduct.id },
                  { onConflict: "customer_id,external_name" },
                );
              }
              await supabase.from("auto_match_feedback").upsert(
                {
                  external_name: extItemName,
                  matched_product_id: matchedProduct.id,
                  usage_count: 1,
                  last_used: new Date().toISOString(),
                },
                { onConflict: "external_name,matched_product_id" },
              );
            } catch (e) {
              console.warn("[MATCH] Feedback save failed:", e);
            }
          }

          const quantity = String(extQty > 0 ? extQty : 1);
          const unitPrice = String(
            extPrice || (matchedProduct?.selling_price != null ? Number(matchedProduct.selling_price) : 0),
          );
          let availableStock: number | null = null;
          let fefoPreview: FefoPreviewAllocation[] = [];
          if (matchedProduct) {
            try {
              const inv = await loadLineInventoryPreview(matchedProduct.id, quantity);
              availableStock = inv.availableStock;
              fefoPreview = inv.fefoPreview;
            } catch (e) {
              console.error("[INVOICE] FEFO preview failed for", matchedProduct.item_code, e);
            }
          }

          mappedLines.push({
            search: matchedProduct ? formatProductLookup(matchedProduct) : "",
            product_id: matchedProduct?.id ?? "",
            product_code: matchedProduct?.item_code ?? extItemCode,
            product_barcode: matchedProduct?.primary_barcode ?? extBarcode,
            product_name: matchedProduct ? getProductLabel(matchedProduct, lang) : extItemName,
            unit: matchedProduct?.uom ?? extUnit,
            quantity,
            unit_price: unitPrice,
            discount: "0",
            available_stock: availableStock,
            fefo_preview: fefoPreview,
            fefo_preview_open: false,
            product_picker_open: false,
            originalName: extItemName || undefined,
            isUnmatched: !matchedProduct,
            suggestions: suggestions.length > 0 ? suggestions : undefined,
            is_foc: false,
            store: "MAIN",
            batch: fefoPreview[0]?.batch_no ?? "",
            expiry: fefoPreview[0]?.expiry_date ?? "",
          });
        }

        mappedLines.push({ ...EMPTY_LINE });
        console.log("[INVOICE] Rows injected:", mappedLines.length - 1, "(+1 empty)");
        setLines(mappedLines);
        setExtractionProgress("Completed");

        // Review verdict: local parsing always requires review
        const reviewReasons: string[] = [
          "Local text parsing (no AI structuring). Verify all fields and lines before posting.",
          ...parsedPO.warnings,
        ];
        if (unmatchedCount > 0) reviewReasons.push(`${unmatchedCount} line(s) could not be matched to a product.`);
        if (ambiguousCount > 0) reviewReasons.push(`${ambiguousCount} line(s) have ambiguous product matches — pick the correct one.`);

        setExtractionWarnings(reviewReasons);
        setReviewStatus("needs_review");

        if (ocrDocId) {
          try {
            await supabase.from("ocr_documents").update({ status: "needs_review" }).eq("id", ocrDocId);
          } catch (e) {
            console.warn("[INVOICE] ocr_documents status update failed:", e);
          }
        }

        const itemCount = parsedPO.items.length;
        if (itemCount > 0) {
          toast.warning(
            `${itemCount} line(s) parsed locally — ` +
            `${matchedCount} matched · ${ambiguousCount} ambiguous · ${unmatchedCount} unmatched — review required`,
          );
        } else {
          toast.warning("No items auto-extracted. Enter lines manually or check the raw text preview.");
        }
        return; // local-parse path complete
      }

      // ── Legacy AI-structured path (ai_structuring_enabled: true) ──────────
      // Kept as reference; not reached while AI structuring is disabled.
      if (!result.success || !result.data) {
        const errMsg = (result.error as string) || "Could not extract structured data from document.";
        if (isStaleGeminiServiceError(errMsg)) {
          throw new Error(
            "The extraction service is still using an old Gemini flow.\n" +
            "Stop and restart services/extraction-service/start.bat, then retry.",
          );
        }
        throw new Error(errMsg);
      }

      const extData = result.data as Record<string, unknown>;
      console.log("[API] Extraction raw response:", extData);

      const extractedItems: unknown[] = Array.isArray(extData.items) ? extData.items : [];
      const extractedHeader: Record<string, unknown> = (extData.header as Record<string, unknown>) ?? {};

      if (extractedItems.length === 0) {
        throw new Error("No products detected in the document. Check document quality or enter lines manually.");
      }

      console.log("[INVOICE] Extraction received:", extractedHeader);
      console.log("[INVOICE] Item count:", extractedItems.length);

      // ── PR-R1: validate the extracted lines (arithmetic / dates / signs) ───
      // Reuse the tested validateInvoiceRows. Discount here is a percentage, so
      // we only feed qty/unitPrice/total to the line-total check when there is
      // no discount (otherwise qty×price ≠ total legitimately).
      const validationRows = extractedItems.map((raw) => {
        const it = raw as Record<string, unknown>;
        const disc = nf<number>(it.discount, 0);
        const row: Record<string, unknown> = {
          itemName: nf<string>(it.itemName, ""),
          qty: nf<number>(it.qty, 0),
          unitPrice: nf<number>(it.unitPrice, 0),
        };
        if (!disc) row.total = nf<number>(it.total, 0);
        return row;
      });
      let validationWarnings: string[] = [];
      try {
        validationWarnings = validateInvoiceRows(validationRows).map((iss) => iss.message);
      } catch (vErr) {
        console.warn("[INVOICE] validation skipped:", vErr);
      }

      // ── PR-R2: confidence. The extraction service does NOT return a real
      // confidence score, so we do NOT fabricate one (was a hardcoded 0.85).
      // Store null and treat it as unknown → invoice must be reviewed.
      const extractionConfidence: number | null =
        typeof (result as Record<string, unknown>).confidence === "number"
          ? ((result as Record<string, unknown>).confidence as number)
          : null;

      // Log OCR document
      let ocrDocId: string | null = null;
      try {
        const { data: ocrDoc, error: ocrErr } = await supabase

          .from("ocr_documents")
          .insert({
            filename: file.name,
            storage_path: storagePath ?? `unsaved/${file.name}`,
            document_type: "invoice",
            status: "extracted",
            confidence: extractionConfidence,
            raw_data: extData as import("@/integrations/supabase/types").Json,
            metadata: {
              source: result.source,
              text_length: result.text_length ?? 0,
              confidence_known: extractionConfidence !== null,
              validation_warnings: validationWarnings.length,
            } as import("@/integrations/supabase/types").Json,
          })
          .select("id")
          .single();
        if (!ocrErr && ocrDoc) {
          ocrDocId = (ocrDoc as { id: string }).id;
        } else if (ocrErr) {
          console.warn("[INVOICE] ocr_documents insert warning:", ocrErr.message);
        }
      } catch (err) {
        console.warn("[INVOICE] Failed to register ocr_document:", err);
      }

      // ── Step 4: Populate header fields ────────────────────────────────────
      setExtractionProgress("Matching Products...");

      const invoiceNoVal = nf<string>(extractedHeader.invoiceNumber, "");
      const poNoVal = nf<string>(extractedHeader.poNumber, "");
      const dateVal = nf<string>(extractedHeader.date, "");
      const commentsVal = nf<string>(extractedHeader.comments, "");
      const currencyVal = nf<string>(extractedHeader.currency, "");
      const custNameVal = nf<string>(extractedHeader.customerName, "");

      if (invoiceNoVal) setInvoiceNo(invoiceNoVal);
      else if (poNoVal) setInvoiceNo(`PO-${poNoVal}`);

      if (dateVal) setInvoiceDate(dateVal.split("T")[0]);
      if (poNoVal) setPoNumber(poNoVal);
      if (commentsVal) setNotes(commentsVal);
      if (currencyVal) setCurrency(currencyVal);

      if (custNameVal) {
        const lcName = custNameVal.toLowerCase().trim();
        const matchedCust = customers.find(
          (c) =>
            c.name.toLowerCase().includes(lcName) ||
            lcName.includes(c.name.toLowerCase()) ||
            (c.code && c.code.toLowerCase() === lcName)
        );
        if (matchedCust) {
          setCustomerId(matchedCust.id);
          if (matchedCust.salesman_id) setSalesmanId(matchedCust.salesman_id);
        }
      }

      // ── Step 5: Match products + build invoice lines ───────────────────────
      setExtractionProgress("Injecting Invoice Lines...");

      const mappedLines: InvoiceLineForm[] = [];
      let matchedCount = 0;
      let ambiguousCount = 0;
      let unmatchedCount = 0;

      for (let i = 0; i < extractedItems.length; i++) {
        const item = extractedItems[i] as Record<string, unknown>;

        const extBarcode = nf<string>(item.barcode, "").trim();
        const extItemCode = nf<string>(item.itemCode, "").trim();
        const extItemName = nf<string>(item.itemName, "").trim();
        const extQty = nf<number>(item.qty, 1);
        const extPrice = nf<number>(item.unitPrice, 0);
        const extDisc = nf<number>(item.discount, 0);
        const extUnit = nf<string>(item.unit, "PCS");

        let matchedProduct: ProductLookup | null = null;

        // Priority 1: barcode
        if (extBarcode) {
          matchedProduct = resolveProductByCodeOrBarcode(extBarcode, "barcode");
          if (matchedProduct) console.log(`[MATCH] Row ${i + 1}: barcode → ${matchedProduct.item_code}`);
        }

        // Priority 2: item code
        if (!matchedProduct && extItemCode) {
          matchedProduct = resolveProductByCodeOrBarcode(extItemCode, "code");
          if (matchedProduct) console.log(`[MATCH] Row ${i + 1}: code → ${matchedProduct.item_code}`);
        }

        // Priority 3: customer alias mappings
        if (!matchedProduct && extItemName) {
          const mappedProductId = customerMappings[extItemName.toLowerCase()];
          if (mappedProductId) {
            matchedProduct = productsById.get(mappedProductId) ?? null;
            if (matchedProduct) console.log(`[MATCH] Row ${i + 1}: alias → ${matchedProduct.item_code}`);
          }
        }

        // Priority 4: fuzzy name match
        let suggestions: ProductLookup[] = [];
        if (!matchedProduct && extItemName) {
          const sims = products.map((p) => {
            const label = getProductLabel(p, lang);
            const nameSim = getStringSimilarity(extItemName, label);
            const codeSim = p.item_code ? getStringSimilarity(extItemName, p.item_code) : 0;
            return { product: p, similarity: Math.max(nameSim, codeSim) };
          });
          sims.sort((a, b) => b.similarity - a.similarity);
          suggestions = sims.filter((s) => s.similarity >= 0.45).slice(0, 5).map((s) => s.product);

          if (sims[0] && sims[0].similarity > 0.75) {
            matchedProduct = sims[0].product;
            console.log(`[MATCH] Row ${i + 1}: fuzzy ${(sims[0].similarity * 100).toFixed(0)}% → ${matchedProduct.item_code}`);
          } else if (sims[0]) {
            console.log(`[MATCH] Row ${i + 1}: best fuzzy ${(sims[0].similarity * 100).toFixed(0)}% — ambiguous`);
          }
        }

        // Tally match quality
        if (matchedProduct && extItemName) matchedCount++;
        else if (!matchedProduct && extItemName && suggestions.length > 0) ambiguousCount++;
        else if (!matchedProduct && extItemName) unmatchedCount++;

        // Persist successful match for next time
        if (matchedProduct && extItemName) {
          try {
            if (customerId) {
               
              await supabase.from("customer_sku_mappings").upsert(
                { customer_id: customerId, external_name: extItemName, product_id: matchedProduct.id },
                { onConflict: "customer_id,external_name" }
              );
            }
             
            await supabase.from("auto_match_feedback").upsert(
              {
                external_name: extItemName,
                matched_product_id: matchedProduct.id,
                usage_count: 1,
                last_used: new Date().toISOString(),
              },
              { onConflict: "external_name,matched_product_id" }
            );
          } catch (e) {
            console.warn("[MATCH] Feedback save failed:", e);
          }
        }

        const quantity = String(extQty > 0 ? extQty : 1);
        const unitPrice = String(extPrice || (matchedProduct?.selling_price != null ? Number(matchedProduct.selling_price) : 0));
        const discount = String(extDisc || 0);

        let availableStock: number | null = null;
        let fefoPreview: FefoPreviewAllocation[] = [];

        if (matchedProduct) {
          try {
            const inv = await loadLineInventoryPreview(matchedProduct.id, quantity);
            availableStock = inv.availableStock;
            fefoPreview = inv.fefoPreview;
          } catch (e) {
            console.error("[INVOICE] FEFO preview failed for", matchedProduct.item_code, e);
          }
        }

        mappedLines.push({
          search: matchedProduct ? formatProductLookup(matchedProduct) : "",
          product_id: matchedProduct?.id ?? "",
          product_code: matchedProduct?.item_code ?? extItemCode,
          product_barcode: matchedProduct?.primary_barcode ?? extBarcode,
          product_name: matchedProduct ? getProductLabel(matchedProduct, lang) : extItemName,
          unit: matchedProduct?.uom ?? extUnit,
          quantity,
          unit_price: unitPrice,
          discount,
          available_stock: availableStock,
          fefo_preview: fefoPreview,
          fefo_preview_open: false,
          product_picker_open: false,
          originalName: extItemName || undefined,
          suggestions: suggestions.length > 0 ? suggestions : undefined,
          is_foc: false,
          store: "MAIN",
          batch: fefoPreview[0]?.batch_no ?? "",
          expiry: fefoPreview[0]?.expiry_date ?? "",
        });
      }

      // Always append an empty row for keyboard entry
      mappedLines.push({ ...EMPTY_LINE });

      console.log("[INVOICE] Rows injected:", mappedLines.length - 1, "(+1 empty)");
      setLines(mappedLines);

      // ── Step 6: Review verdict (PR-R1 + PR-R2) ─────────────────────────────
      // An AI-extracted invoice is "Needs Review" — never silently clean — when
      // ANY of: validation warnings, unmatched/ambiguous product lines, or the
      // extraction confidence is unknown/low. The user must confirm before it is
      // treated as reviewed. Manual entry is unaffected (this only runs on upload).
      setExtractionProgress("Completed");

      const reviewReasons: string[] = [...validationWarnings];
      if (extractionConfidence === null) {
        reviewReasons.push("Extraction confidence is unknown — please verify every line.");
      } else if (extractionConfidence < 0.6) {
        reviewReasons.push(`Low extraction confidence (${Math.round(extractionConfidence * 100)}%) — verify carefully.`);
      }
      if (unmatchedCount > 0) {
        reviewReasons.push(`${unmatchedCount} line(s) could not be matched to a product.`);
      }
      if (ambiguousCount > 0) {
        reviewReasons.push(`${ambiguousCount} line(s) have ambiguous product matches — pick the correct one.`);
      }

      const needsReview = reviewReasons.length > 0;
      setExtractionWarnings(reviewReasons);
      setReviewStatus(needsReview ? "needs_review" : "reviewed");

      if (ocrDocId) {
        try {
          await supabase

            .from("ocr_documents")
            .update({ status: needsReview ? "needs_review" : "extracted" })
            .eq("id", ocrDocId);
        } catch (e) {
          console.warn("[INVOICE] ocr_documents status update failed:", e);
        }
      }

      if (needsReview) {
        toast.warning(
          `${extractedItems.length} line(s) extracted — needs review (${reviewReasons.length} item(s) to check)`
        );
      } else {
        toast.success(
          `${extractedItems.length} line(s) extracted — ✓ ${matchedCount} matched · ⚠ ${ambiguousCount} ambiguous · ✗ ${unmatchedCount} unmatched`
        );
      }

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to extract document.";
      console.error("[UPLOAD] Pipeline error:", err);
      // No Lost Invoices: persist a durable record of the FAILED attempt so the
      // upload is never silently lost. It surfaces in the Operations Dashboard
      // OCR pipeline panel (status "failed") and can be retried or entered
      // manually. Recording the failure must never itself throw.
      try {
        await supabase

          .from("ocr_documents")
          .insert({
            filename: file.name,
            storage_path: storagePath ?? `unsaved/${file.name}`,
            document_type: "invoice",
            status: "failed",
            metadata: { error: msg, stage: "extraction" },
          });
      } catch (recErr) {
        console.warn("[INVOICE] Failed to record failed ocr_document:", recErr);
      }
      toast.error(msg);
      setError(`${msg}\n${t("ocrFailedSaved", "This document has been saved — retry extraction or enter the invoice manually below. Nothing was lost.")}`);
    } finally {
      setExtracting(false);
      setExtractionProgress("");
    }
  };

  useEffect(() => {
    if (isReadOnly) return;

    let barcodeBuffer = "";
    let lastKeyTime = Date.now();

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const currentTime = Date.now();
      const diff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      const isScannerAction = diff < 50 || barcodeBuffer.length === 0;

      if (e.key === "Enter") {
        if (barcodeBuffer.length >= 4 && (Date.now() - lastKeyTime < 100 || barcodeBuffer.length > 8)) {
          const scannedCode = barcodeBuffer.trim();
          barcodeBuffer = "";
          e.preventDefault();
          e.stopPropagation();
          void handleBarcodeScanned(scannedCode);
        } else {
          barcodeBuffer = "";
        }
        return;
      }

      if (e.key.length === 1 && isScannerAction) {
        barcodeBuffer += e.key;
      } else {
        barcodeBuffer = e.key.length === 1 ? e.key : "";
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown, true);
    };
  }, [isReadOnly, handleBarcodeScanned]);

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
            <h1 className="text-lg font-bold tracking-tight text-foreground">{t("salesInvoiceEntry", "Sales Invoice Entry")}</h1>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6">
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">{error ?? t("salesInvoiceNotFound", "Sales invoice not found.")}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <InvoicePrintView ref={printRef} data={printData} />

      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-2 py-1.5 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="rounded-md p-1 transition-colors hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </button>

          <h1 className="text-sm font-bold tracking-tight text-foreground">{t("invoiceEntry", "Invoice Entry")}</h1>

          <div className="ml-auto flex items-center gap-2">
            <span
              className={cn(
                "rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                status !== "draft"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-700"
              )}
            >
              {status}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1340px] space-y-2 px-3 py-2">
        {error && (
          <div className="flex items-start gap-2 rounded-sm border border-destructive/30 bg-destructive/10 px-2 py-1.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
            <p className="text-xs text-destructive whitespace-pre-wrap">{error}</p>
          </div>
        )}

        {reviewStatus === "needs_review" && (
          <div className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-2.5 py-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span className="text-xs font-semibold text-amber-800">
                {t("invoiceNeedsReview", "Needs Review — verify before posting")}
              </span>
              <button
                type="button"
                onClick={() => setReviewStatus("reviewed")}
                className="ml-auto rounded-sm border border-amber-500/50 bg-amber-500/20 px-2 py-0.5 text-[10.5px] font-medium text-amber-800 hover:bg-amber-500/30"
              >
                {t("markReviewed", "I've reviewed these")}
              </button>
            </div>
            {extractionWarnings.length > 0 && (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-7 text-[11px] text-amber-800/90">
                {extractionWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {reviewStatus === "reviewed" && (
          <div className="flex items-center gap-2 rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px]">
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
            <span className="font-medium text-emerald-800">
              {t("invoiceReviewed", "Reviewed — extracted lines confirmed")}
            </span>
          </div>
        )}

        {serviceOnline === false && !extracting && (
          <div className="flex items-center gap-2 rounded-sm border border-amber-500/40 bg-amber-500/8 px-2.5 py-1 text-[10.5px]">
            <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
            <span className="text-amber-800 font-medium">Extraction service offline</span>
            <span className="text-amber-700/70">— run <code className="font-mono bg-amber-100 px-1 rounded-[2px]">services/extraction-service/start.bat</code> to enable PO / quotation upload</span>
          </div>
        )}

        {extracting && (
          <div className="flex items-center gap-2 rounded-sm border border-primary/30 bg-primary/5 px-3 py-1.5 text-[11px]">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {(["Uploading document...", "OCR Processing...", "Parsing...", "Matching Products...", "Injecting Invoice Lines...", "Completed"] as const).map((step, idx) => {
                const steps = ["Uploading document...", "OCR Processing...", "Parsing...", "Matching Products...", "Injecting Invoice Lines...", "Completed"];
                const currentIdx = steps.indexOf(extractionProgress);
                const isDone = currentIdx > idx;
                const isActive = currentIdx === idx;
                return (
                  <span
                    key={step}
                    className={cn(
                      "text-[9.5px] font-semibold px-1.5 py-0.5 rounded-sm whitespace-nowrap",
                      isDone && "text-emerald-700 bg-emerald-500/10",
                      isActive && "text-primary bg-primary/15 animate-pulse",
                      !isDone && !isActive && "text-foreground/30"
                    )}
                  >
                    {idx + 1}. {step.replace("...", "")}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Raw extracted text — collapsible preview for manual review */}
        {rawExtractedText && reviewStatus && (
          <div className="rounded-sm border border-border bg-muted/20">
            <button
              type="button"
              onClick={() => setShowRawText((v) => !v)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[10.5px] font-medium text-foreground/60 hover:bg-muted/40 transition-colors"
            >
              <ChevronDown className={cn("h-3 w-3 transition-transform shrink-0", showRawText && "rotate-180")} />
              <span>{showRawText ? "Hide" : "Show"} extracted raw text</span>
              <span className="ml-auto font-mono text-[9.5px] text-foreground/40">{rawExtractedText.length.toLocaleString()} chars</span>
            </button>
            {showRawText && (
              <pre className="max-h-52 overflow-y-auto border-t border-border/50 bg-muted/30 px-3 py-2 text-[9.5px] leading-relaxed font-mono text-foreground/70 whitespace-pre-wrap">
                {rawExtractedText}
              </pre>
            )}
          </div>
        )}

        {/* ── Document Header card ─────────────────────────────────────────────── */}
        <section className="rounded-md border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-2">
            <h2 className="text-[11px] font-bold text-foreground/60 uppercase tracking-[0.1em] select-none">
              {t("documentHeader", "Document Header")}
            </h2>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleUploadClick}
                disabled={isReadOnly || extracting}
                className="h-7 flex items-center gap-1.5 bg-primary/5 text-primary border-primary/25 hover:bg-primary/10 text-[10px] font-semibold rounded-sm px-2.5"
              >
                {extracting ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span className="truncate max-w-[120px]">{extractionProgress || t("extracting", "Extracting...")}</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-3 w-3" />
                    <span>{t("uploadPoQuotation", "Upload PO / Ref")}</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="p-3 space-y-3">
            {/* Row 1: Invoice No | Date | Payment | Type | COPY / Find Invoice */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <span className={SL}>Invoice No</span>
                <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)}
                  readOnly={isReadOnly} className={cn(SF, "font-mono")} />
              </div>
              <div>
                <span className={SL}>Date</span>
                <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)}
                  readOnly={isReadOnly} className={SF} />
              </div>
              <div>
                <span className={SL}>Payment</span>
                <input value="CREDIT" readOnly className={cn(SR, "text-center font-medium")} />
              </div>
              <div>
                <span className={SL}>Type</span>
                <input value={invoiceType} onChange={(e) => setInvoiceType(e.target.value)}
                  readOnly={isReadOnly} className={cn(SF, "font-mono text-center")} />
              </div>
              <div className="col-span-2 flex items-end gap-2">
                <Button type="button" variant="outline"
                  className="h-8 flex-1 text-[11px] font-bold rounded-[3px] border-border bg-background hover:bg-muted/60 tracking-wide"
                  onClick={() => toast.info("Copy action triggered")}>
                  COPY
                </Button>
                <Button type="button" variant="outline"
                  className="h-8 flex-1 text-[11px] font-bold rounded-[3px] border-border bg-background hover:bg-muted/60"
                  onClick={() => navigate("/invoice-list")}>
                  Find Invoice
                </Button>
              </div>
            </div>

            {/* Row 2: PO/Ref | Order Date | Delivery Date | Currency | Rate */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div>
                <span className={SL}>PO / Ref #</span>
                <input value={poNumber} onChange={(e) => setPoNumber(e.target.value)}
                  readOnly={isReadOnly} placeholder="PO / Ref No"
                  className={cn(SF, "font-mono")} />
              </div>
              <div>
                <span className={SL}>Order Date</span>
                <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)}
                  readOnly={isReadOnly} className={SF} />
              </div>
              <div>
                <span className={SL}>Delivery Date</span>
                <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)}
                  readOnly={isReadOnly} className={SF} />
              </div>
              <div>
                <span className={SL}>Currency</span>
                <input value={currency} onChange={(e) => setCurrency(e.target.value)}
                  readOnly={isReadOnly} className={cn(SF, "font-mono text-center")} />
              </div>
              <div>
                <span className={SL}>Rate</span>
                <input type="number" step="0.000001" value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  readOnly={isReadOnly} className={cn(SF, "font-mono text-right")} />
              </div>
            </div>
          </div>
        </section>

        {/* ── Customer & Sales card ──────────────────────────────────────────────── */}
        <section className="rounded-md border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-muted/50 px-3 py-2">
            <h2 className="text-[11px] font-bold text-foreground/60 uppercase tracking-[0.1em] select-none">
              {t("customerSales", "Customer & Sales")}
            </h2>
          </div>

          <div className="p-3 space-y-3">
            {/* Row 1: Code | Customer | Child | Cust. Comments */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-12 gap-3">
              <div className="lg:col-span-2">
                <span className={SL}>Code</span>
                <input value={selectedCustomer?.code ?? ""} readOnly
                  className={cn(SR, "font-mono")} placeholder="—" />
              </div>
              <div className="lg:col-span-5">
                <span className={SL}>{t("customer", "Customer")}</span>
                <InvoiceLookupSelect
                  value={customerId} options={customerOptions}
                  placeholder={t("selectCustomer", "Select customer")}
                  searchPlaceholder={t("searchByCodeOrName", "Search by code or name...")}
                  emptyText={t("noCustomerFound", "No customer found.")}
                  disabled={isReadOnly} onSelect={handleCustomerChange}
                  triggerClassName="h-8 text-[12px] px-2.5 rounded-[3px]"
                />
              </div>
              <div className="lg:col-span-2">
                <span className={SL}>{t("childAccount", "Child Account")}</span>
                <input value={customerChild} onChange={(e) => setCustomerChild(e.target.value)}
                  readOnly={isReadOnly} placeholder="—" className={SF} />
              </div>
              <div className="lg:col-span-3">
                <span className={SL}>{t("custComments", "Cust. Comments")}</span>
                <div className="flex gap-1.5">
                  <input value={custCom1} onChange={(e) => setCustCom1(e.target.value)}
                    readOnly={isReadOnly} className={cn(SF, "flex-1 min-w-0")} />
                  <input value={custCom2} onChange={(e) => setCustCom2(e.target.value)}
                    readOnly={isReadOnly} className={cn(SF, "w-16 shrink-0")} />
                </div>
              </div>
            </div>

            {/* Row 2: Salesman Code | Salesman | Invoice Notes */}
            <div className="grid grid-cols-2 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-2">
                <span className={SL}>{t("salesmanCode", "Salesman Code")}</span>
                <input value={selectedSalesman?.code ?? ""} readOnly
                  className={cn(SR, "font-mono text-center")} placeholder="—" />
              </div>
              <div className="sm:col-span-4">
                <span className={SL}>{t("salesman", "Salesman")}</span>
                <InvoiceLookupSelect
                  value={salesmanId} options={salesmanOptions}
                  placeholder={t("selectSalesman", "Select salesman")}
                  searchPlaceholder={t("searchSalesman", "Search salesman...")}
                  emptyText={t("noSalesmanFound", "No salesman found.")}
                  disabled={isReadOnly} onSelect={handleSalesmanSelect}
                  triggerClassName="h-8 text-[12px] px-2.5 rounded-[3px]"
                />
              </div>
              <div className="sm:col-span-6">
                <span className={SL}>{t("invoiceNotes", "Invoice Notes")}</span>
                <input value={notes} onChange={(e) => setNotes(e.target.value)}
                  readOnly={isReadOnly}
                  className={SF}
                  placeholder={t("invoiceNotesPlaceholder", "Invoice notes...")} />
              </div>
            </div>
          </div>
        </section>

        {/* ── Discount & FOC card ────────────────────────────────────────────────── */}
        <section className="rounded-md border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-muted/50 px-3 py-2">
            <h2 className="text-[11px] font-bold text-foreground/60 uppercase tracking-[0.1em] select-none">
              {t("discountFoc", "Discount & FOC")}
            </h2>
          </div>

          <div className="p-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <span className={SL}>{t("discType", "Disc. Type")}</span>
                <select value={discountType} onChange={(e) => setDiscountType(e.target.value)}
                  disabled={isReadOnly}
                  className={cn(SF, "cursor-pointer")}>
                  <option value="Percentage">Percentage</option>
                  <option value="Amount">Amount</option>
                </select>
              </div>
              <div>
                <span className={SL}>{t("discount", "Discount")}</span>
                <input type="number" step="0.001" value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  readOnly={isReadOnly}
                  className={cn(SF, "font-mono text-right")} />
              </div>
              <div>
                <span className={SL}>FOC</span>
                <input value={focCode} onChange={(e) => setFocCode(e.target.value)}
                  readOnly={isReadOnly} className={cn(SF, "font-mono text-center")} />
              </div>
              <div>
                <span className={SL}>FOC Name</span>
                <input value={focName} onChange={(e) => setFocName(e.target.value)}
                  readOnly={isReadOnly} className={SF} />
              </div>
            </div>
          </div>
        </section>

        {/* Sales Detail — dense ERP table */}
        <section className="rounded-sm border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border bg-muted px-2.5 py-[4px]">
            <span className="text-[10px] font-bold text-foreground/60 uppercase tracking-[0.12em] select-none">
              {t("salesDetail", "Sales Detail")}
            </span>
          </div>
          <div className="overflow-x-auto relative max-h-[480px]">
            <table className="w-full border-separate border-spacing-0 text-[11px] bg-background">
              <thead>
                <tr className="sticky top-0 z-10 bg-muted border-b-2 border-border text-[10px] font-bold uppercase tracking-wide text-foreground/70 select-none">
                  <th className="w-8 border-r border-border py-[5px] text-center">#</th>
                  <th className="w-28 border-r border-border px-2 py-[5px] text-left text-primary">{t("itemCode", "Item Code")}</th>
                  <th className="min-w-[190px] border-r border-border px-2 py-[5px] text-left">{t("itemName", "Item Name")}</th>
                  <th className="w-24 border-r border-border px-2 py-[5px] text-left">{t("store", "Store")}</th>
                  <th className="w-14 border-r border-border px-1 py-[5px] text-center">{t("uom", "UOM")}</th>
                  <th className="w-18 border-r border-border px-2 py-[5px] text-right">{t("qty", "Qty")}</th>
                  <th className="w-20 border-r border-border px-2 py-[5px] text-right">{t("unitPrice", "Unit Price")}</th>
                  <th className="w-16 border-r border-border px-2 py-[5px] text-right">{t("discPct", "Disc %")}</th>
                  <th className="w-24 border-r border-border px-2 py-[5px] text-right font-bold">{t("total", "Total")}</th>
                  <th className="w-32 border-r border-border px-2 py-[5px] text-left font-bold">{t("batch", "Batch")}</th>
                  <th className="w-28 border-r border-border px-2 py-[5px] text-left font-bold">{t("expiry", "Expiry")}</th>
                  <th className="w-12 border-r border-border px-1 py-[5px] text-center font-bold">{t("foc", "FOC")}</th>
                  <th className="w-14 px-1 py-[5px] text-center font-bold">{t("act", "Act")}</th>
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

                  const isMatched = !!line.product_id && !!line.originalName;
                  const isAmbiguous = !line.product_id && !!line.originalName && !!line.suggestions && line.suggestions.length > 0;
                  const isUnmatched = !line.product_id && !!line.originalName && (!line.suggestions || line.suggestions.length === 0);

                  return (
                    <Fragment key={line.id ?? `line-${index}`}>
                      <tr className={cn(
                        "align-middle transition-colors hover:bg-accent/25 focus-within:outline focus-within:outline-1 focus-within:outline-ring/40",
                        index % 2 === 0 ? "bg-background" : "bg-muted/8",
                        isMatched && "bg-emerald-500/5 hover:bg-emerald-500/10 border-l-2 border-l-emerald-500",
                        isAmbiguous && "bg-amber-500/5 hover:bg-amber-500/10 border-l-2 border-l-amber-500",
                        isUnmatched && "bg-rose-500/5 hover:bg-rose-500/10 border-l-2 border-l-rose-500"
                      )}>
                        <td className="border-b border-r border-border p-0">
                          <div className={cn(
                            "flex h-7 items-center justify-center font-mono text-[10px] font-semibold text-foreground/70",
                            isMatched && "bg-emerald-500/10 text-emerald-800 font-bold",
                            isAmbiguous && "bg-amber-500/15 text-amber-800 font-bold",
                            isUnmatched && "bg-rose-500/15 text-rose-800 font-bold"
                          )}>
                            {index + 1}
                          </div>
                        </td>

                        <td className="border-b border-r border-border p-0">
                          <input
                            value={line.product_code}
                            data-line-code={index}
                            onChange={(event) =>
                              handleProductCodeChange(index, event.target.value)
                            }
                            onBlur={() => {
                              // Fallback: resolve if user pasted a code or typed slowly
                              if (!line.product_id && line.product_code.trim()) {
                                void resolveManualProductLookup(index, "code");
                              }
                            }}
                            onKeyDown={(e) => handleLineKeyDown(e, index, "product_code")}
                            readOnly={isReadOnly}
                            placeholder="Code"
                            className={cn(
                              lineInputClass,
                              "font-mono border-0 focus:ring-0 focus:bg-accent/40 rounded-none h-7 px-2",
                              line.product_id && "text-foreground",
                              isAmbiguous && "bg-amber-500/5 text-amber-900",
                              isUnmatched && "bg-rose-500/5 text-rose-900"
                            )}
                          />
                        </td>

                        <td className="border-b border-r border-border p-0">
                          <Popover
                            open={line.product_picker_open && !isReadOnly}
                            onOpenChange={(open) => handleProductPickerOpenChange(index, open)}
                          >
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                disabled={isReadOnly}
                                data-line-product={index}
                                className={cn(
                                  "h-7 w-full justify-between rounded-none bg-transparent hover:bg-accent/30 px-2 text-[11.5px] font-normal border-0 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0",
                                  isMatched && "text-emerald-950 font-medium",
                                  isAmbiguous && "text-amber-950 font-medium",
                                  isUnmatched && "text-rose-950 font-medium"
                                )}
                              >
                                <span className="truncate text-left text-[11.5px] flex items-center gap-1.5 flex-1 min-w-0">
                                  {isMatched && <span className="text-emerald-600 font-bold shrink-0">✓</span>}
                                  {isAmbiguous && <span className="text-amber-600 font-bold shrink-0">⚠️</span>}
                                  {isUnmatched && <span className="text-rose-600 font-bold shrink-0">✗</span>}
                                  <span className="truncate">{line.product_name || t("selectItem", "Select item")}</span>
                                  {line.originalName && (
                                    <span className={cn(
                                      "text-[9px] px-1 py-0.2 rounded shrink-0 font-semibold",
                                      isMatched && "bg-emerald-100 text-emerald-700",
                                      isAmbiguous && "bg-amber-100 text-amber-700",
                                      isUnmatched && "bg-rose-100 text-rose-700"
                                    )}>
                                      {isMatched ? "Matched" : isAmbiguous ? "Unmatched (AI)" : "Not Found"}
                                    </span>
                                  )}
                                </span>
                                <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>

                            <PopoverContent className="w-[460px] p-0" align="start">
                              <Command shouldFilter>
                                <CommandInput placeholder={t("searchByItemCodeBarcodeOrName", "Search by item code, barcode, or name...")} />
                                <CommandList>
                                  <CommandEmpty>{t("noProductFound", "No product found.")}</CommandEmpty>
                                  
                                  {line.suggestions && line.suggestions.length > 0 && (
                                    <CommandGroup heading={t("aiSuggestions", "AI Suggestions (Choose one to match)")}>
                                      {line.suggestions.map((product) => (
                                        <CommandItem
                                          key={`ai-sug-${product.id}`}
                                          value={`${product.item_code} ${getProductLabel(product, lang)} ${product.primary_barcode}`}
                                          onSelect={() => {
                                            void applyProductToLine(index, product);
                                            setLines((current) =>
                                              current.map((l, idx) =>
                                                idx === index
                                                  ? { ...l, isUnmatched: false, suggestions: [] }
                                                  : l
                                              )
                                            );
                                          }}
                                          className="flex items-start justify-between gap-3 py-2 bg-amber-500/5 hover:bg-amber-500/10 border-b border-border/40 cursor-pointer"
                                        >
                                          <span className="min-w-0 flex-1">
                                            <span className="block truncate font-semibold text-amber-800">
                                              {product.item_code} - {getProductLabel(product, lang)}
                                            </span>
                                            <span className="block truncate text-[10px] text-muted-foreground">
                                              {product.primary_barcode} | {product.uom}
                                            </span>
                                          </span>
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  )}

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
                                          className="flex items-start justify-between gap-3 py-2 cursor-pointer"
                                        >
                                          <span className="min-w-0 flex-1">
                                            <span className="block truncate font-medium">
                                              {option.label}
                                            </span>
                                            <span className="block truncate text-[11px] text-muted-foreground">
                                              {option.meta ?? t("noBarcode", "No barcode")}
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
                        </td>

                        <td className="border-b border-r border-border p-0">
                          <select
                            value={line.store || "MAIN"}
                            onChange={(e) => setLineValue(index, "store", e.target.value)}
                            disabled={isReadOnly}
                            className="h-7 w-full border-0 bg-transparent px-2 text-[11px] focus:outline-none focus:bg-accent/40 rounded-none cursor-pointer"
                          >
                            <option value="MAIN">MAIN</option>
                            <option value="RETAIL STORE">RETAIL STORE</option>
                          </select>
                        </td>

                        <td className="border-b border-r border-border p-0">
                          <input
                            value={line.unit}
                            readOnly
                            className="h-7 w-full border-0 bg-transparent px-2 text-center font-medium text-[11px] select-none"
                            placeholder="-"
                          />
                        </td>

                        <td className="border-b border-r border-border p-0">
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={line.quantity}
                            data-line-qty={index}
                            onChange={(event) => handleQuantityChange(index, event.target.value)}
                            onKeyDown={(e) => handleLineKeyDown(e, index, "quantity")}
                            readOnly={isReadOnly}
                            className="h-7 w-full border-0 bg-transparent px-2 text-right font-mono text-[11px] focus:outline-none focus:bg-accent/40 rounded-none"
                          />
                        </td>

                        <td className="border-b border-r border-border p-0">
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={line.unit_price}
                            data-line-price={index}
                            onChange={(event) => setLineValue(index, "unit_price", event.target.value)}
                            onKeyDown={(e) => handleLineKeyDown(e, index, "unit_price")}
                            readOnly={isReadOnly || line.is_foc}
                            className={cn(
                              "h-7 w-full border-0 bg-transparent px-2 text-right font-mono text-[11px] focus:outline-none focus:bg-accent/40 rounded-none",
                              line.is_foc && "bg-muted/30 opacity-60 cursor-not-allowed"
                            )}
                          />
                        </td>

                        <td className="border-b border-r border-border p-0">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={line.discount}
                            data-line-discount={index}
                            onChange={(event) => setLineValue(index, "discount", event.target.value)}
                            onKeyDown={(e) => handleLineKeyDown(e, index, "discount")}
                            readOnly={isReadOnly || line.is_foc}
                            className={cn(
                              "h-7 w-full border-0 bg-transparent px-2 text-right font-mono text-[11px] focus:outline-none focus:bg-accent/40 rounded-none",
                              line.is_foc && "bg-muted/30 opacity-60 cursor-not-allowed"
                            )}
                          />
                        </td>

                        <td className="border-b border-r border-border p-0">
                          <div className="flex h-7 items-center justify-end bg-background/50 px-2 font-mono text-[11px] font-bold text-foreground">
                            {getLineTotal(line).toFixed(3)}
                          </div>
                        </td>

                        <td className="border-b border-r border-border p-0">
                          {line.fefo_preview && line.fefo_preview.length > 0 ? (
                            <select
                              value={line.batch || ""}
                              onChange={(e) => {
                                const selectedBatch = e.target.value;
                                const matchingAllocation = line.fefo_preview.find(b => b.batch_no === selectedBatch);
                                setLines(current => current.map((l, idx) => {
                                  if (idx !== index) return l;
                                  return {
                                    ...l,
                                    batch: selectedBatch,
                                    expiry: matchingAllocation?.expiry_date || l.expiry
                                  };
                                }));
                              }}
                              disabled={isReadOnly}
                              className="h-7 w-full border-0 bg-transparent px-2 text-[11px] font-mono focus:outline-none focus:bg-accent/40 rounded-none cursor-pointer"
                            >
                              <option value="">-- Batch --</option>
                              {line.fefo_preview.map((alloc) => (
                                <option key={alloc.batch_no || "no-batch"} value={alloc.batch_no || ""}>
                                  {alloc.batch_no || "No Batch"} ({alloc.available_quantity})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={line.batch || ""}
                              onChange={(e) => setLineValue(index, "batch", e.target.value)}
                              readOnly={isReadOnly}
                              placeholder="Batch"
                              className="h-7 w-full border-0 bg-transparent px-2 font-mono text-[11px] focus:outline-none focus:bg-accent/40 rounded-none"
                            />
                          )}
                        </td>

                        <td className="border-b border-r border-border p-0">
                          <input
                            type="date"
                            value={line.expiry ? line.expiry.split("T")[0] : ""}
                            onChange={(e) => setLineValue(index, "expiry", e.target.value)}
                            readOnly={isReadOnly}
                            className="h-7 w-full border-0 bg-transparent px-2 font-mono text-[11px] focus:outline-none focus:bg-accent/40 rounded-none"
                          />
                        </td>

                        <td className="border-b border-r border-border p-0 text-center">
                          <div className="flex h-7 items-center justify-center">
                            <input
                              type="checkbox"
                              checked={!!line.is_foc}
                              disabled={isReadOnly}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setLines(current => current.map((l, idx) => {
                                  if (idx !== index) return l;
                                  return {
                                    ...l,
                                    is_foc: checked,
                                    unit_price: checked ? "0" : l.unit_price,
                                    discount: checked ? "0" : l.discount
                                  };
                                }));
                              }}
                              className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary cursor-pointer"
                            />
                          </div>
                        </td>

                        <td className="border-b border-border p-0">
                          <div className="flex h-7 items-center justify-center gap-0.5 px-1 bg-background/50">
                            {!isReadOnly && line.product_id && (
                              <button
                                type="button"
                                onClick={() => clearLineProduct(index)}
                                title="Clear product"
                                className="inline-flex h-5 w-5 items-center justify-center rounded-sm border border-border text-[11px] text-muted-foreground hover:bg-accent"
                              >
                                ×
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => removeLine(index)}
                              disabled={isReadOnly}
                              title="Remove row"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-sm border border-border text-foreground/80 hover:bg-accent disabled:opacity-50"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {(line.product_id || exceedsStock || line.fefo_preview_open) && (
                        <tr>
                          <td colSpan={13} className="border-b border-border bg-muted/15 px-3 py-[3px]">
                            <div>
                              {/* Compact status row */}
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[10px]">
                                <span className={cn(
                                  "font-mono font-semibold",
                                  exceedsStock ? "text-destructive" : "text-foreground/70"
                                )}>
                                  AVAIL: {line.product_id ? availableStock.toFixed(3) : "—"}
                                  {line.unit ? ` ${line.unit}` : ""}
                                </span>

                                {compactAllocation && (
                                  <span className="font-mono text-primary/80 font-medium">
                                    FEFO:{" "}
                                    <span className="text-foreground font-bold">
                                      {compactAllocation.batch_no || "—"}
                                    </span>
                                    {" | "}EXP:{" "}
                                    <span className="text-foreground">
                                      {formatExpiryDate(compactAllocation.expiry_date, "No expiry")}
                                    </span>
                                    {" | "}QTY:{" "}
                                    <span className="text-foreground font-bold">
                                      {compactAllocation.allocated_qty.toFixed(3)}
                                      {line.unit ? ` ${line.unit}` : ""}
                                    </span>
                                  </span>
                                )}

                                {line.fefo_preview.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => toggleFefoPreview(index)}
                                    className="text-primary/70 underline hover:text-primary text-[10px]"
                                  >
                                    {line.fefo_preview_open
                                      ? "▲ Hide batches"
                                      : `▼ ${line.fefo_preview.length} batches`}
                                  </button>
                                )}

                                {hasPartialAllocation && (
                                  <span className="text-amber-600 font-medium">
                                    ⚠ FEFO covers {allocatedQty.toFixed(3)} / {requestedQty.toFixed(3)}
                                  </span>
                                )}

                                {showNoAllocationMessage && (
                                  <span className="text-muted-foreground/70 italic">No FEFO allocation available</span>
                                )}

                                {exceedsStock && (
                                  <span className="font-semibold text-destructive">
                                    ✗ Requested qty exceeds stock
                                  </span>
                                )}
                              </div>

                              {/* Multi-batch expansion */}
                              {line.fefo_preview.length > 1 && line.fefo_preview_open && (
                                <div className="mt-0.5 mb-0.5 space-y-px max-w-xl">
                                  {line.fefo_preview.map((allocation, allocationIndex) => (
                                    <div
                                      key={`${allocation.batch_no ?? "batch"}-${allocation.expiry_date ?? "no-expiry"}-${allocationIndex}`}
                                      className="flex items-center gap-3 rounded-[2px] border border-border/50 bg-background px-2 py-px text-[10px] font-mono"
                                    >
                                      <span className="w-28 font-bold text-foreground truncate">
                                        {allocation.batch_no || "No batch"}
                                      </span>
                                      <span className="text-muted-foreground">
                                        EXP: {formatExpiryDate(allocation.expiry_date, "—")}
                                      </span>
                                      <span className="ml-auto font-semibold text-foreground">
                                        {allocation.allocated_qty.toFixed(3)}
                                        {line.unit ? ` ${line.unit}` : ""}
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

        {/* Footer: totals + actions in one strip */}
        <section className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border bg-secondary/40 px-2 py-1.5">
          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-muted-foreground">
              {t("lines", "Lines")}: <span className="font-semibold text-foreground">{activeLineCount}</span>
            </span>
            <span className="text-muted-foreground">
              {t("subtotal", "Subtotal")}: <span className="font-semibold text-foreground">{subtotalAmount.toFixed(3)}</span>
            </span>
            <span className="text-muted-foreground">
              {t("disc", "Disc")}: <span className="font-semibold text-foreground">{discountTotal.toFixed(3)}</span>
            </span>
            <span className="rounded-sm border border-primary/30 bg-primary/10 px-2 py-0.5 text-[12px]">
              {t("grossTot", "Gross Tot")}: <span className="font-bold text-foreground">{grandTotal.toFixed(3)}</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex h-7 items-center gap-1 rounded-sm border border-border bg-background px-2.5 text-[11.5px] font-medium text-foreground hover:bg-secondary"
            >
              <Printer className="h-3 w-3" /> {t("print", "Print")}
            </button>
            <button
              type="button"
              onClick={saveDraft}
              disabled={isReadOnly || saving || posting}
              className="inline-flex h-7 items-center gap-1 rounded-sm border border-border bg-background px-2.5 text-[11.5px] font-medium text-foreground hover:bg-secondary disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {t("save", "Save")}
            </button>
            <button
              type="button"
              onClick={postInvoice}
              disabled={isReadOnly || saving || posting}
              className="inline-flex h-7 items-center gap-1 rounded-sm bg-primary px-2.5 text-[11.5px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {posting ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              {t("postInvoice", "Post Invoice")}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
