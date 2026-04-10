import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Barcode, Check, ChevronRight, Keyboard, Package2, Plus, RotateCcw, X } from "lucide-react";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { DateWheel, NumberWheel } from "@/components/WheelPicker";
import { cn } from "@/lib/utils";
import { inferStorageType, type ProductStorageType } from "@/lib/productStorage";

interface ProductDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingProduct?: {
    id: string;
    item_code: string | null;
    name_ar: string | null;
    name_en: string | null;
    name: string | null;
    brand?: string | null;
    section?: string | null;
    primary_barcode: string | null;
    all_barcodes?: string[] | null;
    cost_price: number | null;
    selling_price: number | null;
    discount: number | null;
    category: string | null;
    packaging?: string | null;
    uom: string | null;
    pack_size?: string | null;
    carton_holds?: number | null;
    storage_type: string | null;
    is_active: boolean;
  } | null;
}

interface BatchForm {
  clientId: string;
  id?: string;
  batchNo: string;
  unit: string;
  productionDate: string;
  expiryDate: string;
  qty: number;
  receivedDate: string;
}

interface IntegerDrawerFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  placeholder?: string;
}

interface DecimalDrawerFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxWhole?: number;
}

interface EntryModeToggleProps {
  manual: boolean;
  onToggle: () => void;
}

const UOM_OPTIONS = ["CTN", "PCS", "BAG", "KG", "TIN", "PAIL", "BTL", "BLK", "BOX"];
const STORAGE_OPTIONS: ProductStorageType[] = ["Frozen", "Chilled", "Dry"];

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

function createBatchClientId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyBatch(unit = "CTN"): BatchForm {
  return {
    clientId: createBatchClientId(),
    batchNo: "",
    unit,
    productionDate: "",
    expiryDate: "",
    qty: 1,
    receivedDate: todayIso(),
  };
}

function parsePackaging(value?: string | null, fallback?: string | null) {
  const tokens = (value || "")
    .split("/")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  if (tokens.length > 0) return Array.from(new Set(tokens));
  return fallback ? [fallback.toUpperCase()] : ["CTN"];
}

function formatDecimalValue(whole: number, fraction: number) {
  return `${whole}.${String(fraction).padStart(3, "0")}`;
}

function parseDecimalValue(value: string) {
  const normalized = Number(value || 0);
  const safe = Number.isFinite(normalized) ? Math.max(0, normalized) : 0;
  const whole = Math.trunc(safe);
  const fraction = Math.round((safe - whole) * 1000);
  if (fraction >= 1000) {
    return { whole: whole + 1, fraction: 0 };
  }
  return { whole, fraction };
}

function IntegerDrawerField({
  label,
  value,
  onChange,
  min = 0,
  max = 999,
  placeholder = "Select value",
}: IntegerDrawerFieldProps) {
  const numericValue = Number(value || 0);
  const displayValue = value ? String(numericValue) : placeholder;

  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <Drawer>
        <DrawerTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "h-9 w-full justify-start border-border bg-secondary px-3 text-left text-[13px] font-normal",
              !value && "text-muted-foreground"
            )}
          >
            {displayValue}
          </Button>
        </DrawerTrigger>
        <DrawerContent className="px-4 pb-8">
          <div className="mt-4">
            <NumberWheel
              value={Number.isFinite(numericValue) ? numericValue : 0}
              onChange={(nextValue) => onChange(String(nextValue))}
              min={min}
              max={max}
              label={label}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function DecimalDrawerField({
  label,
  value,
  onChange,
  maxWhole = 999,
}: DecimalDrawerFieldProps) {
  const parsed = parseDecimalValue(value);
  const displayValue = value ? Number(value).toFixed(3) : "0.000";

  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <Drawer>
        <DrawerTrigger asChild>
          <Button
            variant="outline"
            className="h-9 w-full justify-start border-border bg-secondary px-3 text-left text-[13px] font-normal"
          >
            {displayValue}
          </Button>
        </DrawerTrigger>
        <DrawerContent className="px-4 pb-8">
          <div className="mt-4">
            <div className="grid grid-cols-2 gap-2">
              <NumberWheel
                value={parsed.whole}
                onChange={(whole) => onChange(formatDecimalValue(whole, parseDecimalValue(value).fraction))}
                min={0}
                max={maxWhole}
                label={`${label} Int`}
              />
              <NumberWheel
                value={parsed.fraction}
                onChange={(fraction) => onChange(formatDecimalValue(parseDecimalValue(value).whole, fraction))}
                min={0}
                max={999}
                label={`${label} Dec`}
              />
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function EntryModeToggle({ manual, onToggle }: EntryModeToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
      aria-label={manual ? "Switch to wheel input" : "Switch to manual input"}
      title={manual ? "Switch to wheel input" : "Switch to manual input"}
    >
      {manual ? <RotateCcw className="h-3.5 w-3.5" /> : <Keyboard className="h-3.5 w-3.5" />}
    </button>
  );
}

async function applyProductMetadataPatch(productId: string, patch: Record<string, unknown>) {
  const primary = await supabase.from("products" as any).update(patch).eq("id", productId);
  if (!primary.error) return;

  const missingSectionColumn =
    typeof patch.section !== "undefined" &&
    (primary.error.message.includes("section") || primary.error.code === "PGRST204");

  if (!missingSectionColumn) throw primary.error;

  const { section: _ignored, ...fallbackPatch } = patch;
  const fallback = await supabase.from("products" as any).update(fallbackPatch).eq("id", productId);
  if (fallback.error) throw fallback.error;
}

function isMissingRpcSignature(error: { code?: string; message?: string } | null, fnName: string) {
  if (!error) return false;
  return error.code === "PGRST202" && error.message?.includes(fnName);
}

function sanitizeBarcodes(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function isMissingRelation(error: { code?: string; message?: string } | null, relation: string) {
  if (!error) return false;
  return error.code === "PGRST205" || error.message?.includes(relation) || false;
}

async function syncProductBarcodes(productId: string, barcodes: string[], source: string) {
  const normalizedBarcodes = sanitizeBarcodes(barcodes);
  const { error: deleteError } = await supabase.from("product_barcodes" as any).delete().eq("product_id", productId);
  if (deleteError && deleteError.code !== "PGRST205") throw deleteError;

  if (normalizedBarcodes.length === 0) return;

  const { error: insertError } = await supabase.from("product_barcodes" as any).insert(
    normalizedBarcodes.map((barcode, index) => ({
      product_id: productId,
      barcode,
      is_primary: index === 0,
      source,
    }))
  );

  if (insertError) throw insertError;
}

async function syncProductPrice(
  productId: string,
  values: { costPrice: number; sellingPrice: number; discount: number; priceSource: string }
) {
  const existingPrice = await supabase
    .from("product_prices" as any)
    .select("id")
    .eq("product_id", productId)
    .maybeSingle();

  if (existingPrice.error && existingPrice.error.code !== "PGRST116") {
    throw existingPrice.error;
  }

  if (existingPrice.data?.id) {
    const { error } = await supabase
      .from("product_prices" as any)
      .update({
        cost_price: values.costPrice,
        selling_price: values.sellingPrice,
        discount: values.discount,
        price_source: values.priceSource,
      })
      .eq("product_id", productId);

    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("product_prices" as any).insert({
    product_id: productId,
    cost_price: values.costPrice,
    selling_price: values.sellingPrice,
    discount: values.discount,
    price_source: values.priceSource,
  });

  if (error) throw error;
}

async function createProductDirect(payload: {
  itemCode: string;
  nameAr: string | null;
  nameEn: string | null;
  category: string | null;
  uom: string;
  storageType: string | null;
  barcodes: string[];
  costPrice: number;
  sellingPrice: number;
  discount: number;
}) {
  const { data, error } = await supabase
    .from("products" as any)
    .insert({
      item_code: payload.itemCode,
      code: payload.itemCode,
      name_ar: payload.nameAr,
      name_en: payload.nameEn,
      name: payload.nameEn || payload.nameAr || payload.itemCode,
      category: payload.category,
      uom: payload.uom,
      storage_type: payload.storageType,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) throw error;

  await syncProductPrice(data.id, {
    costPrice: payload.costPrice,
    sellingPrice: payload.sellingPrice,
    discount: payload.discount,
    priceSource: "manual_direct",
  });
  await syncProductBarcodes(data.id, payload.barcodes, "manual_direct");
  return data.id as string;
}

async function updateProductDirect(
  productId: string,
  payload: {
    itemCode: string;
    nameAr: string | null;
    nameEn: string | null;
    category: string | null;
    uom: string;
    storageType: string | null;
    barcodes: string[];
    costPrice: number;
    sellingPrice: number;
    discount: number;
    isActive: boolean;
  }
) {
  const { error } = await supabase
    .from("products" as any)
    .update({
      item_code: payload.itemCode,
      code: payload.itemCode,
      name_ar: payload.nameAr,
      name_en: payload.nameEn,
      name: payload.nameEn || payload.nameAr || payload.itemCode,
      category: payload.category,
      uom: payload.uom,
      storage_type: payload.storageType,
      is_active: payload.isActive,
    })
    .eq("id", productId);

  if (error) throw error;

  await syncProductPrice(productId, {
    costPrice: payload.costPrice,
    sellingPrice: payload.sellingPrice,
    discount: payload.discount,
    priceSource: "manual_direct",
  });
  await syncProductBarcodes(productId, payload.barcodes, "manual_direct");
}

async function createProductWithCompatibility(payload: {
  itemCode: string;
  nameAr: string | null;
  nameEn: string | null;
  category: string | null;
  uom: string;
  storageType: string | null;
  barcodes: string[];
  costPrice: number;
  sellingPrice: number;
  discount: number;
}) {
  const newRpcPayload = {
    p_item_code: payload.itemCode,
    p_name_ar: payload.nameAr,
    p_name_en: payload.nameEn,
    p_category: payload.category,
    p_uom: payload.uom,
    p_storage_type: payload.storageType,
    p_barcodes: payload.barcodes,
    p_cost_price: payload.costPrice,
    p_selling_price: payload.sellingPrice,
    p_discount: payload.discount,
    p_barcode_source: "manual",
    p_price_source: "manual",
  };

  const newRpcResult = await supabase.rpc("create_product_full", newRpcPayload);
  if (!newRpcResult.error) return newRpcResult.data as string;
  if (!isMissingRpcSignature(newRpcResult.error, "create_product_full")) throw newRpcResult.error;

  const legacyRpcResult = await supabase.rpc("create_product_full", {
    p_item_code: payload.itemCode,
    p_name_ar: payload.nameAr,
    p_name_en: payload.nameEn,
    p_barcode: payload.barcodes[0] ?? null,
    p_barcode_source: "manual",
    p_cost_price: payload.costPrice,
    p_selling_price: payload.sellingPrice,
    p_discount: payload.discount,
    p_price_source: "manual",
  });

  if (!legacyRpcResult.error) {
    await syncProductBarcodes(legacyRpcResult.data as string, payload.barcodes, "manual");
    return legacyRpcResult.data as string;
  }
  if (!isMissingRpcSignature(legacyRpcResult.error, "create_product_full")) throw legacyRpcResult.error;

  return createProductDirect(payload);
}

async function updateProductWithCompatibility(
  productId: string,
  payload: {
    itemCode: string;
    nameAr: string | null;
    nameEn: string | null;
    category: string | null;
    uom: string;
    storageType: string | null;
    barcodes: string[];
    costPrice: number;
    sellingPrice: number;
    discount: number;
    isActive: boolean;
  }
) {
  const newRpcResult = await supabase.rpc("update_product_full", {
    p_product_id: productId,
    p_item_code: payload.itemCode,
    p_name_ar: payload.nameAr,
    p_name_en: payload.nameEn,
    p_category: payload.category,
    p_uom: payload.uom,
    p_storage_type: payload.storageType,
    p_barcodes: payload.barcodes,
    p_cost_price: payload.costPrice,
    p_selling_price: payload.sellingPrice,
    p_discount: payload.discount,
    p_is_active: payload.isActive,
  });

  if (!newRpcResult.error) return;
  if (!isMissingRpcSignature(newRpcResult.error, "update_product_full")) throw newRpcResult.error;

  const legacyRpcResult = await supabase.rpc("update_product_full", {
    p_product_id: productId,
    p_item_code: payload.itemCode,
    p_name_ar: payload.nameAr,
    p_name_en: payload.nameEn,
    p_barcode: payload.barcodes[0] ?? null,
    p_cost_price: payload.costPrice,
    p_selling_price: payload.sellingPrice,
    p_discount: payload.discount,
  });

  if (!legacyRpcResult.error) {
    await syncProductBarcodes(productId, payload.barcodes, "manual_update");
    return;
  }
  if (!isMissingRpcSignature(legacyRpcResult.error, "update_product_full")) throw legacyRpcResult.error;

  await updateProductDirect(productId, payload);
}

async function loadProductBatches(productId: string, fallbackUnit: string) {
  const primaryResult = await supabase
    .from("batches" as any)
    .select("id, batch_no, unit, production_date, expiry_date, qty, received_date")
    .eq("product_id", productId)
    .order("expiry_date", { ascending: true });

  if (!primaryResult.error) {
    return ((primaryResult.data || []) as any[]).map((row) => ({
      clientId: row.id || createBatchClientId(),
      id: row.id,
      batchNo: row.batch_no || "",
      unit: row.unit || fallbackUnit,
      productionDate: row.production_date || "",
      expiryDate: row.expiry_date || "",
      qty: Number(row.qty || 0),
      receivedDate: row.received_date || todayIso(),
    }));
  }

  if (!isMissingRelation(primaryResult.error, "batches")) {
    throw primaryResult.error;
  }

  const fallbackResult = await supabase
    .from("inventory_batches" as any)
    .select("id, product_id, batch_no, qty_available, qty_received, expiry_date, received_date")
    .eq("product_id", productId)
    .order("expiry_date", { ascending: true });

  if (fallbackResult.error) throw fallbackResult.error;

  return ((fallbackResult.data || []) as any[]).map((row) => ({
    clientId: row.id || createBatchClientId(),
    id: row.id,
    batchNo: row.batch_no || "",
    unit: fallbackUnit,
    productionDate: "",
    expiryDate: row.expiry_date || "",
    qty: Number(row.qty_available ?? row.qty_received ?? 0),
    receivedDate: row.received_date || todayIso(),
  }));
}

export default function ProductDialog({ open, onClose, onSaved, editingProduct }: ProductDialogProps) {
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [section, setSection] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [storageType, setStorageType] = useState<ProductStorageType>("Dry");
  const [cartonHolds, setCartonHolds] = useState("");
  const [weightHolds, setWeightHolds] = useState("");
  const [packagingUnits, setPackagingUnits] = useState<string[]>(["CTN"]);
  const [barcodes, setBarcodes] = useState<string[]>([]);
  const [newBarcode, setNewBarcode] = useState("");
  const [batches, setBatches] = useState<BatchForm[]>([]);
  const [batchEditorDraft, setBatchEditorDraft] = useState<BatchForm | null>(null);
  const [batchEditorIndex, setBatchEditorIndex] = useState<number | null>(null);
  const [batchQtyManualMode, setBatchQtyManualMode] = useState(false);
  const [costPrice, setCostPrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [discount, setDiscount] = useState("");
  const [discountManualMode, setDiscountManualMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const isEdit = !!editingProduct;
  const primaryUnit = useMemo(
    () => packagingUnits[0] || editingProduct?.uom || "CTN",
    [editingProduct?.uom, packagingUnits]
  );

  useEffect(() => {
    if (!open) return;
    const nextPackaging = parsePackaging(editingProduct?.packaging, editingProduct?.uom);

    if (editingProduct) {
      setBrand(editingProduct.brand || editingProduct.category || "");
      setCategory(editingProduct.category || "");
      setSection(editingProduct.section || editingProduct.brand || "");
      setItemCode(editingProduct.item_code || "");
      setNameAr(editingProduct.name_ar || "");
      setNameEn(editingProduct.name_en || editingProduct.name || "");
      setStorageType(
        (editingProduct.storage_type as ProductStorageType | null) ||
          inferStorageType({
            category: editingProduct.category,
            brand: editingProduct.brand,
            section: editingProduct.section,
            name_en: editingProduct.name_en || editingProduct.name,
            name_ar: editingProduct.name_ar,
          })
      );
      setCartonHolds(
        editingProduct.carton_holds != null
          ? String(editingProduct.carton_holds)
          : editingProduct.pack_size
            ? String(editingProduct.pack_size)
            : ""
      );
      setWeightHolds(editingProduct.pack_size ? String(editingProduct.pack_size) : "");
      setPackagingUnits(nextPackaging);
      setCostPrice(editingProduct.cost_price != null ? String(editingProduct.cost_price) : "");
      setSellingPrice(editingProduct.selling_price != null ? String(editingProduct.selling_price) : "");
      setDiscount(editingProduct.discount != null ? String(editingProduct.discount) : "");
      setBarcodes(editingProduct.all_barcodes || []);
    } else {
      setBrand("");
      setCategory("");
      setSection("");
      setItemCode("");
      setNameEn("");
      setNameAr("");
      setStorageType("Dry");
      setCartonHolds("");
      setWeightHolds("");
      setPackagingUnits(["CTN"]);
      setCostPrice("");
      setSellingPrice("");
      setDiscount("");
      setBarcodes([]);
      setBatches([]);
    }
    setBatchEditorDraft(null);
    setBatchEditorIndex(null);
    setBatchQtyManualMode(false);
    setDiscountManualMode(false);

    if (!editingProduct?.id) return;
    void (async () => {
      try {
        const loadedBatches = await loadProductBatches(editingProduct.id, nextPackaging[0] || "CTN");
        setBatches(loadedBatches);
      } catch {
        setBatches([]);
      }
    })();
  }, [open, editingProduct]);

  const addBarcodeToForm = () => {
    if (!newBarcode.trim()) return;
    if (barcodes.includes(newBarcode.trim())) {
      alert("Barcode already added");
      return;
    }
    setBarcodes((current) => [...current, newBarcode.trim()]);
    setNewBarcode("");
  };

  const togglePackagingUnit = (unit: string) => {
    setPackagingUnits((current) => {
      if (current.includes(unit)) {
        return current.length === 1 ? current : current.filter((item) => item !== unit);
      }
      return [...current, unit];
    });
  };

  const addBatch = () => {
    setBatchEditorDraft(emptyBatch(primaryUnit));
    setBatchEditorIndex(null);
    setBatchQtyManualMode(false);
  };

  const updateBatch = <K extends keyof BatchForm>(index: number, field: K, value: BatchForm[K]) => {
    setBatches((current) =>
      current.map((batch, batchIndex) => (batchIndex === index ? { ...batch, [field]: value } : batch))
    );
  };

  const removeBatch = (index: number) => {
    setBatches((current) => current.filter((_, batchIndex) => batchIndex !== index));
  };

  const openBatchEditor = (index: number) => {
    setBatchEditorDraft({ ...batches[index] });
    setBatchEditorIndex(index);
    setBatchQtyManualMode(false);
  };

  const updateBatchDraft = <K extends keyof BatchForm>(field: K, value: BatchForm[K]) => {
    setBatchEditorDraft((current) => (current ? { ...current, [field]: value } : current));
  };

  const closeBatchEditor = () => {
    setBatchEditorDraft(null);
    setBatchEditorIndex(null);
    setBatchQtyManualMode(false);
  };

  const commitBatchEditor = () => {
    if (!batchEditorDraft) return;

    setBatches((current) => {
      if (batchEditorIndex == null) {
        return [...current, batchEditorDraft];
      }

      return current.map((batch, index) => (index === batchEditorIndex ? batchEditorDraft : batch));
    });

    closeBatchEditor();
  };

  const removeBatchFromEditor = () => {
    if (batchEditorIndex == null) return;
    removeBatch(batchEditorIndex);
    closeBatchEditor();
  };

  async function persistBatches(productId: string) {
    const rows = batches.filter((batch) => batch.batchNo.trim() && batch.expiryDate);

    const primaryDelete = await supabase.from("batches" as any).delete().eq("product_id", productId);
    if (primaryDelete.error && !isMissingRelation(primaryDelete.error, "batches")) {
      throw primaryDelete.error;
    }

    if (!primaryDelete.error) {
      if (rows.length === 0) return;

      const { error: insertError } = await supabase.from("batches" as any).insert(
        rows.map((batch) => ({
          product_id: productId,
          batch_no: batch.batchNo.trim(),
          unit: batch.unit,
          production_date: batch.productionDate || null,
          expiry_date: batch.expiryDate,
          qty: Number(batch.qty || 0),
          received_date: batch.receivedDate || todayIso(),
        }))
      );

      if (insertError) throw insertError;
      return;
    }

    const fallbackDelete = await supabase
      .from("inventory_batches" as any)
      .delete()
      .eq("product_id", productId);

    if (fallbackDelete.error) throw fallbackDelete.error;

    if (rows.length === 0) return;

    const { error: fallbackInsertError } = await supabase.from("inventory_batches" as any).insert(
      rows.map((batch) => ({
        product_id: productId,
        batch_no: batch.batchNo.trim(),
        expiry_date: batch.expiryDate,
        qty_received: Number(batch.qty || 0),
        qty_available: Number(batch.qty || 0),
        received_date: batch.receivedDate || todayIso(),
      }))
    );

    if (fallbackInsertError) throw fallbackInsertError;
  }

  async function handleSave() {
    try {
      setSaving(true);
      if (!brand.trim()) throw new Error("Brand is required");
      if (!itemCode.trim()) throw new Error("Item code is required");
      if (!nameAr.trim() && !nameEn.trim()) throw new Error("Arabic or English name is required");
      if (barcodes.length === 0) throw new Error("At least one barcode is required");
      if (packagingUnits.length === 0) throw new Error("Select at least one packaging unit");

      const invalidBatch = batches.find(
        (batch) =>
          !batch.batchNo.trim() ||
          !batch.expiryDate ||
          Number(batch.qty || 0) <= 0 ||
          !packagingUnits.includes(batch.unit)
      );

      if (invalidBatch) {
        throw new Error("Each batch needs a batch number, valid unit, expiry date, and quantity greater than zero.");
      }

      const payload = {
        itemCode: itemCode.trim().toUpperCase(),
        nameAr: nameAr.trim() || null,
        nameEn: nameEn.trim() || null,
        category: category.trim() || null,
        uom: primaryUnit,
        storageType: storageType || null,
        barcodes: sanitizeBarcodes(barcodes),
        costPrice: Number(costPrice || 0),
        sellingPrice: Number(sellingPrice || 0),
        discount: Number(discount || 0),
      };

      let productId = editingProduct?.id || null;
      if (isEdit && editingProduct?.id) {
        await updateProductWithCompatibility(editingProduct.id, {
          ...payload,
          isActive: editingProduct.is_active,
        });
      } else {
        productId = await createProductWithCompatibility(payload);
      }

      if (!productId) throw new Error("Product save did not return an id.");

      await applyProductMetadataPatch(productId, {
        brand: brand.trim() || null,
        category: category.trim() || null,
        section: section.trim() || null,
        packaging: packagingUnits.join(" / "),
        carton_holds: cartonHolds ? Number(cartonHolds) : null,
        pack_size: weightHolds || cartonHolds || null,
        uom: primaryUnit,
        storage_type: storageType || null,
      });

      await persistBatches(productId);
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err?.message || "Failed to save product");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/40 p-2 sm:p-4">
      <div className="flex h-[min(84dvh,calc(100dvh-1rem))] w-[min(72rem,calc(100vw-1rem))] max-w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-3 sm:px-4">
          <h2 className="text-xl font-semibold">{isEdit ? "Edit Product" : "Add Product"}</h2>
          <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-secondary">
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {saving ? "Saving..." : isEdit ? "Update" : "Create"}
            </button>
            <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-secondary">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-2.5 overflow-x-hidden overflow-y-auto px-2 py-2.5 sm:px-3 md:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)]">
          <div className="min-w-0 space-y-2.5">
            <div className="rounded-xl border border-border bg-card p-2.5">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">Category</label>
                  <input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="e.g. Syrups" className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-[13px] outline-none focus:ring" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Section</label>
                  <input value={section} onChange={(event) => setSection(event.target.value)} placeholder="e.g. Beverage Exporters" className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-[13px] outline-none focus:ring" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Brand</label>
                  <input value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="e.g. MONIN" className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-[13px] outline-none focus:ring" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Product Code</label>
                  <input value={itemCode} onChange={(event) => setItemCode(event.target.value)} className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-[13px] font-mono uppercase outline-none focus:ring" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Product Name</label>
                  <input value={nameEn} onChange={(event) => setNameEn(event.target.value)} className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-[13px] outline-none focus:ring" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Arabic Name</label>
                  <input value={nameAr} onChange={(event) => setNameAr(event.target.value)} className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-[13px] outline-none focus:ring" dir="rtl" />
                </div>
                <div className="md:col-span-3">
                  <label className="mb-1 block text-sm font-medium">Packaging</label>
                  <div className="flex flex-wrap gap-2">
                    {UOM_OPTIONS.map((option) => {
                      const selected = packagingUnits.includes(option);
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => togglePackagingUnit(option)}
                          className={`rounded-md border px-4 py-1.5 text-xs font-semibold transition-colors ${
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-secondary text-muted-foreground hover:bg-secondary/80"
                          }`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Select every sellable or stock unit this product supports, such as carton and pieces together.</p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Storage Type</label>
                  <div className="flex gap-1">
                    {STORAGE_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setStorageType(option)}
                        className={`flex-1 rounded-md py-2 text-xs font-semibold transition-colors ${
                          storageType === option
                            ? "bg-primary text-primary-foreground"
                            : "border border-border bg-secondary text-muted-foreground hover:bg-secondary/80"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
                <IntegerDrawerField
                  label="Carton Holds"
                  value={cartonHolds}
                  onChange={setCartonHolds}
                  min={1}
                  max={999}
                  placeholder="Qty inside carton..."
                />
                <div>
                  <label className="mb-1 block text-sm font-medium">Weight Holds</label>
                  <input
                    value={weightHolds}
                    onChange={(event) => setWeightHolds(event.target.value)}
                    placeholder="e.g. 250 ml"
                    className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-[13px] outline-none focus:ring"
                  />
                </div>
                <DecimalDrawerField
                  label="Cost Price"
                  value={costPrice}
                  onChange={setCostPrice}
                />
                <DecimalDrawerField
                  label="Selling Price"
                  value={sellingPrice}
                  onChange={setSellingPrice}
                />
                <div>
                  <label className="mb-1 block text-sm font-medium">Discount</label>
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      {discountManualMode ? (
                        <div className="relative">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={discount}
                            onChange={(event) => setDiscount(event.target.value)}
                            className="w-full rounded-xl border border-border bg-secondary px-3 py-2 pr-8 text-[13px] outline-none focus:ring"
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-muted-foreground">
                            %
                          </span>
                        </div>
                      ) : (
                        <Drawer>
                          <DrawerTrigger asChild>
                            <Button
                              variant="outline"
                              className="h-10 w-full justify-start border-border bg-secondary px-3 text-left text-[13px] font-normal"
                            >
                              {discount ? `${Math.max(0, Math.round(Number(discount || 0)))} %` : "0 %"}
                            </Button>
                          </DrawerTrigger>
                          <DrawerContent className="px-4 pb-8">
                            <div className="mt-4">
                              <NumberWheel
                                value={Math.max(0, Math.round(Number(discount || 0)))}
                                onChange={(value) => setDiscount(String(value))}
                                min={0}
                                max={100}
                                label="Discount %"
                              />
                            </div>
                          </DrawerContent>
                        </Drawer>
                      )}
                    </div>
                    <EntryModeToggle
                      manual={discountManualMode}
                      onToggle={() => setDiscountManualMode((current) => !current)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="relative min-h-[20rem] min-w-0 overflow-hidden">
            <div
              className={cn(
                "absolute inset-0 flex min-w-0 flex-col gap-2.5 overflow-hidden transition-all duration-200 ease-out",
                batchEditorDraft ? "pointer-events-none -translate-x-3 opacity-0" : "translate-x-0 opacity-100"
              )}
            >
              <div className="rounded-xl border border-border bg-card p-2.5">
                <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold">
                  <Barcode className="h-4 w-4" /> Barcodes ({barcodes.length})
                </h3>
                <div className="mb-2 flex gap-2">
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    value={newBarcode}
                    onChange={(event) => setNewBarcode(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addBarcodeToForm();
                      }
                    }}
                    placeholder="Enter or scan barcode..."
                    className="flex-1 rounded-lg border border-border bg-secondary px-3 py-2 font-mono text-sm outline-none focus:ring"
                  />
                  <button
                    type="button"
                    onClick={() => barcodeInputRef.current?.focus()}
                    className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-secondary"
                  >
                    Scan
                  </button>
                  <button type="button" onClick={addBarcodeToForm} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Add</button>
                </div>
                {barcodes.length > 0 ? (
                  <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
                    {barcodes.map((barcode) => (
                      <span key={barcode} className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1.5 font-mono text-xs text-foreground">
                        {barcode}
                        <button type="button" onClick={() => setBarcodes((current) => current.filter((value) => value !== barcode))} className="rounded-full p-0.5 text-destructive hover:bg-destructive/10">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">At least one barcode is required to uniquely identify the product.</p>
                )}
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <div>
                    <h3 className="text-sm font-semibold">Batches</h3>
                    <p className="text-xs text-muted-foreground">
                      Capture batch number, production date, expiry date, quantity, and unit.
                    </p>
                  </div>
                  <button type="button" onClick={addBatch} className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    <Plus className="h-3 w-3" /> Add Batch
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                  {batches.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">No batches added yet.</div>
                  ) : (
                    batches.map((batch, index) => (
                      <button
                        key={batch.clientId}
                        type="button"
                        onClick={() => openBatchEditor(index)}
                        className="flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-muted/40 last:border-b-0"
                      >
                        <Package2 className="h-4 w-4 text-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-sm text-foreground">{batch.batchNo || "New Batch"}</p>
                          <p className="text-xs text-muted-foreground">
                            {batch.unit} | Qty {batch.qty} | Prod {batch.productionDate || "-"} | Exp {batch.expiryDate || "-"}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div
              className={cn(
                "absolute inset-0 min-w-0 overflow-hidden transition-all duration-200 ease-out",
                batchEditorDraft ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-4 opacity-0"
              )}
            >
              <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div>
                    <h3 className="text-sm font-semibold">{batchEditorIndex == null ? "Add Batch" : "Edit Batch"}</h3>
                    <p className="text-xs text-muted-foreground">Use wheel mode by default, or switch to manual typing when needed.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={closeBatchEditor}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={commitBatchEditor}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                    >
                      <Check className="h-3.5 w-3.5" /> Confirm
                    </button>
                  </div>
                </div>

                {batchEditorDraft && (
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Batch No</label>
                          <input
                            value={batchEditorDraft.batchNo}
                            onChange={(event) => updateBatchDraft("batchNo", event.target.value)}
                            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 font-mono text-sm uppercase outline-none focus:ring"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Packaging Unit</label>
                          <div className="flex flex-wrap gap-2">
                            {packagingUnits.map((unit) => (
                              <button
                                key={unit}
                                type="button"
                                onClick={() => updateBatchDraft("unit", unit)}
                                className={cn(
                                  "rounded-md border px-3 py-1.5 text-xs font-semibold",
                                  batchEditorDraft.unit === unit
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border bg-secondary text-muted-foreground"
                                )}
                              >
                                {unit}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Production Date</label>
                          <Drawer>
                            <DrawerTrigger asChild>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full justify-start border-border bg-secondary text-left text-[13px] font-normal",
                                  !batchEditorDraft.productionDate && "text-muted-foreground"
                                )}
                              >
                                {batchEditorDraft.productionDate || "Select date"}
                              </Button>
                            </DrawerTrigger>
                            <DrawerContent className="px-4 pb-8">
                              <div className="mt-4">
                                <DateWheel
                                  value={batchEditorDraft.productionDate || todayIso()}
                                  onChange={(value) => updateBatchDraft("productionDate", value)}
                                  label="Production Date"
                                />
                              </div>
                            </DrawerContent>
                          </Drawer>
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Expiry Date</label>
                          <Drawer>
                            <DrawerTrigger asChild>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full justify-start border-border bg-secondary text-left text-[13px] font-normal",
                                  !batchEditorDraft.expiryDate && "text-muted-foreground"
                                )}
                              >
                                {batchEditorDraft.expiryDate || "Select date"}
                              </Button>
                            </DrawerTrigger>
                            <DrawerContent className="px-4 pb-8">
                              <div className="mt-4">
                                <DateWheel
                                  value={batchEditorDraft.expiryDate || todayIso()}
                                  onChange={(value) => updateBatchDraft("expiryDate", value)}
                                  label="Expiry Date"
                                />
                              </div>
                            </DrawerContent>
                          </Drawer>
                        </div>
                      </div>

                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <label className="block text-xs font-medium text-muted-foreground">Qty</label>
                          <EntryModeToggle manual={batchQtyManualMode} onToggle={() => setBatchQtyManualMode((current) => !current)} />
                        </div>
                        {batchQtyManualMode ? (
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={batchEditorDraft.qty}
                            onChange={(event) => updateBatchDraft("qty", Number(event.target.value || 0))}
                            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-[13px] outline-none focus:ring"
                          />
                        ) : (
                          <Drawer>
                            <DrawerTrigger asChild>
                              <Button variant="outline" className="w-full justify-start border-border bg-secondary px-3 text-left text-[13px] font-normal">
                                {batchEditorDraft.qty}
                              </Button>
                            </DrawerTrigger>
                            <DrawerContent className="px-4 pb-8">
                              <div className="mt-4">
                                <NumberWheel
                                  value={Number(batchEditorDraft.qty || 0)}
                                  onChange={(value) => updateBatchDraft("qty", value)}
                                  min={0}
                                  max={999}
                                  label="Quantity"
                                />
                              </div>
                            </DrawerContent>
                          </Drawer>
                        )}
                      </div>

                      {batchEditorIndex != null && (
                        <button
                          type="button"
                          onClick={removeBatchFromEditor}
                          className="w-full rounded-lg bg-destructive/10 py-2 text-xs font-semibold text-destructive"
                        >
                          Remove Batch
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
