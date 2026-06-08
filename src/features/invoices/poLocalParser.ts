/**
 * Local rule-based PO / quotation text parser.
 *
 * Parses plain text (from pdfplumber or OCR) into structured header fields +
 * item rows, with no AI or external API dependency.
 *
 * Arabic/Persian digits are normalised to ASCII before any numeric parsing.
 * UOM variants like "CAR=24EA" are collapsed to the base unit ("CAR").
 * Dates are returned as YYYY-MM-DD strings; empty string when not detected.
 *
 * The parser is intentionally lenient: it records a warning for each field
 * it cannot detect, and returns a partial result rather than throwing.
 */

export interface LocalParsedPOItem {
  itemCode: string;
  barcode?: string;
  itemName: string;
  unit: string;
  qty: number;
  unitPrice?: number;
  total?: number;
}

export interface LocalParsedPO {
  poNumber: string;
  date: string;
  customerName: string;
  customerCode: string;
  comments: string;
  rawText: string;
  items: LocalParsedPOItem[];
  warnings: string[];
}

// ─── Digit normalisation ───────────────────────────────────────────────────────

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function normalizeDigits(s: string): string {
  let out = "";
  for (const ch of s) {
    const ai = AR_DIGITS.indexOf(ch);
    if (ai >= 0) { out += String(ai); continue; }
    const fi = FA_DIGITS.indexOf(ch);
    if (fi >= 0) { out += String(fi); continue; }
    out += ch;
  }
  return out;
}

// ─── Number / date helpers ─────────────────────────────────────────────────────

function parseNumber(s: string): number {
  if (!s) return 0;
  const n = parseFloat(normalizeDigits(s).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

const MONTH_NAMES = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

function normalizeDate(s: string): string {
  if (!s) return "";
  const c = normalizeDigits(s).trim();

  // YYYY-MM-DD already
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(c)) {
    const [y, m, d] = c.split("-");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // DD/MM/YYYY  DD-MM-YYYY  DD.MM.YYYY
  const dmy = c.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // "25 May 2024"  or  "25-May-2024"
  const text = c.match(/^(\d{1,2})[\s\-/]+([a-zA-Z]+)[\s\-/]+(\d{4})$/);
  if (text) {
    const [, d, mStr, y] = text;
    const mIdx = MONTH_NAMES.indexOf(mStr.toLowerCase().substring(0, 3));
    if (mIdx >= 0) return `${y}-${String(mIdx + 1).padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Fallback: extract first date-looking pattern from a longer string
  const embedded = c.match(/\b(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})\b/);
  if (embedded) return normalizeDate(embedded[1]);

  return "";
}

// ─── UOM normalisation ─────────────────────────────────────────────────────────

const KNOWN_UOMS = new Set([
  "CAR","CTN","BOX","PCS","KG","GM","LT","ML","PKT","DZ","PAL",
  "SET","ROL","MTR","TIN","BTL","BAG","TBL","SHT","EA","CAS","CASE",
]);

function extractUOM(s: string): string {
  if (!s) return "PCS";
  const up = s.toUpperCase().trim();

  // "CAR=24EA" → "CAR"
  const compound = up.match(/^([A-Z]{2,6})=\d+[A-Z]{1,4}$/);
  if (compound) return compound[1];

  if (KNOWN_UOMS.has(up)) return up;

  // Accept short alphabetic strings as-is
  if (/^[A-Z]{2,6}$/.test(up)) return up;

  return "PCS";
}

const UOM_TOKEN_RE = /^(CAR|CTN|BOX|PCS|KG|GM|LT|ML|PKT|DZ|PAL|SET|ROL|MTR|TIN|BTL|BAG|TBL|SHT|EA|CAS|CASE)$/i;

// ─── Header extraction ─────────────────────────────────────────────────────────

function extractHeaderFields(lines: string[]): {
  poNumber: string;
  date: string;
  customerName: string;
  customerCode: string;
  comments: string;
} {
  let poNumber = "", date = "", customerName = "", customerCode = "", comments = "";

  for (const raw of lines) {
    const line = normalizeDigits(raw).trim();
    if (!line) continue;

    // PO number
    if (!poNumber) {
      const m = line.match(
        /(?:p\.?\s*o\.?\s*(?:number|no\.?|#|\s*:)|\bpurchase\s+order\s*(?:no\.?|#)|\bرقم[^:]*:?\s*|رقم\s*أمر\s*الشراء\s*:?\s*)\s*:?\s*([A-Z0-9][A-Z0-9\-/]{1,30})/i,
      );
      if (m?.[1] && m[1].length >= 3) poNumber = m[1].trim();
    }

    // Date
    if (!date) {
      const m = line.match(/(?:date|dated|order date|تاريخ|تاریخ)\s*:?\s*(.+)/i);
      if (m?.[1]) {
        const d = normalizeDate(m[1].trim());
        if (d) date = d;
      }
      if (!date) {
        const m2 = line.match(/\b(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})\b/);
        if (m2) {
          const d = normalizeDate(m2[1]);
          if (d) date = d;
        }
      }
    }

    // Customer name — require colon after "customer"/"client" to avoid matching "Customer Code:" lines
    if (!customerName) {
      const m = line.match(
        /(?:(?:customer|client)\s*:|bill\s+to|sold\s+to|deliver(?:ed)?\s+to|العميل\s*:|عميل\s*:)\s*(.{2,60})/i,
      );
      if (m?.[1]) customerName = m[1].trim();
    }

    // Customer code
    if (!customerCode) {
      const m = line.match(
        /(?:customer\s*code|client\s*code|acct\.?|account\s*(?:no\.?|#)|كود\s*العميل)\s*:?\s*([A-Z0-9-]{2,20})/i,
      );
      if (m?.[1]) customerCode = m[1].trim();
    }

    // Comments / notes
    if (!comments) {
      const m = line.match(/(?:notes?|remarks?|comments?|ملاحظات)\s*:?\s*(.{2,})/i);
      if (m?.[1]) comments = m[1].trim();
    }
  }

  return { poNumber, date, customerName, customerCode, comments };
}

// ─── Table body parsing ────────────────────────────────────────────────────────

const TABLE_FOOTER_RE = /^(total|subtotal|grand\s+total|vat|tax|discount|page\s+\d|thank|مجموع|إجمالي|الإجمالي)/i;

const TABLE_HEADER_RE = /(qty|quantity|كمية|الكمية|كميه)/i;
const TABLE_HEADER_CONTEXT_RE = /(item|product|description|code|price|الوصف|كود|سعر)/i;

function parseItemRows(lines: string[]): LocalParsedPOItem[] {
  const items: LocalParsedPOItem[] = [];
  let inTable = false;

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li].trim();
    if (!raw) continue;
    const norm = normalizeDigits(raw);

    // Detect table header row
    if (!inTable) {
      if (TABLE_HEADER_RE.test(norm) && TABLE_HEADER_CONTEXT_RE.test(norm)) {
        inTable = true;
        continue;
      }
      // Separator line (dashes) also signals table start
      if (/^[-=]{8,}/.test(norm) && li > 0) {
        inTable = true;
        continue;
      }
      continue;
    }

    // Stop at footer
    if (TABLE_FOOTER_RE.test(norm)) break;
    if (/^[-=|]{4,}$/.test(norm)) continue;

    // ── Column-split approach: split by 2+ consecutive spaces ─────────────────
    // This correctly handles alphanumeric codes like "PROD001" which would be
    // corrupted if digits were stripped before text extraction.
    const cols = norm.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
    if (cols.length < 2) continue;

    // Find qty column: a positive integer (not a decimal/price)
    let qtyIdx = -1, qty = 0;
    for (let ci = 0; ci < cols.length; ci++) {
      const v = parseNumber(cols[ci]);
      if (Number.isInteger(v) && v > 0 && v < 100000) {
        // Skip first column if small and looks like a row number
        if (ci === 0 && v < 1000 && cols.length > 3) continue;
        qtyIdx = ci;
        qty = v;
        break;
      }
    }
    if (qty === 0) continue;

    // Columns before qty → code + description
    const beforeCols = cols.slice(0, qtyIdx);
    // Columns after qty → unit + prices
    const afterCols = cols.slice(qtyIdx + 1);

    let itemCode = "";
    let itemName = "";
    if (
      beforeCols.length > 0 &&
      /^[A-Z][A-Z0-9\-/]{1,19}$/i.test(beforeCols[0]) &&
      !/^(and|the|for|of|in|at|to|by|an|a)$/i.test(beforeCols[0])
    ) {
      itemCode = beforeCols[0];
      itemName = beforeCols.slice(1).join(" ");
    } else {
      itemName = beforeCols.join(" ");
    }

    // Parse unit and prices from afterCols
    let unit = "PCS";
    const priceNums: number[] = [];
    for (const col of afterCols) {
      // UOM: alphabetic-only token, or compound "CAR=24EA"
      if (/^[A-Z]{2,6}(=\d+[A-Z]{2,4})?$/i.test(col) && parseNumber(col) === 0) {
        unit = extractUOM(col);
      } else {
        const v = parseNumber(col);
        if (v > 0) priceNums.push(v);
      }
    }

    let unitPrice: number | undefined;
    let total: number | undefined;
    if (priceNums.length >= 2) {
      unitPrice = priceNums[0];
      total = priceNums[priceNums.length - 1];
    } else if (priceNums.length === 1) {
      unitPrice = priceNums[0];
    }

    const displayName = itemName.trim() || itemCode || `Item ${items.length + 1}`;
    if (!displayName) continue;

    const item: LocalParsedPOItem = { itemCode, itemName: displayName, unit, qty };
    if (unitPrice !== undefined && unitPrice > 0) item.unitPrice = unitPrice;
    if (total !== undefined && total > 0) item.total = total;
    items.push(item);
  }

  // Fallback: if no table header found, try heuristic parsing
  if (!inTable && items.length === 0) {
    return parseItemRowsHeuristic(lines);
  }

  return items;
}

// Fallback parser for documents without a detectable table header
function parseItemRowsHeuristic(lines: string[]): LocalParsedPOItem[] {
  const items: LocalParsedPOItem[] = [];
  const skipRe = /^(total|subtotal|vat|tax|discount|grand|page|date|customer|po|ref|purchase|order|invoice|from|to|notes?|remarks?|مجموع|إجمالي)/i;

  for (const raw of lines) {
    const norm = normalizeDigits(raw.trim());
    if (!norm || norm.length < 6) continue;
    if (skipRe.test(norm)) continue;

    const numRe = /\d[\d,]*(?:\.\d+)?/g;
    const nums: number[] = [];
    let nm: RegExpExecArray | null;
    while ((nm = numRe.exec(norm)) !== null) nums.push(parseNumber(nm[0]));
    if (nums.length < 2) continue;

    // Must have at least one integer (qty)
    const intNums = nums.filter((n) => Number.isInteger(n) && n > 0 && n < 100000);
    if (intNums.length === 0) continue;

    const textParts = norm
      .replace(/\d[\d,]*(?:\.\d+)?/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !/^[,.\-:|/\\]+$/.test(t));
    if (textParts.length === 0) continue;

    let unit = "PCS";
    const descParts: string[] = [];
    for (const t of textParts) {
      if (UOM_TOKEN_RE.test(t)) unit = t.toUpperCase();
      else descParts.push(t);
    }

    let itemCode = "", itemName = "";
    if (descParts.length > 0 && /^[A-Z][A-Z0-9\-/]{1,19}$/i.test(descParts[0])) {
      itemCode = descParts[0];
      itemName = descParts.slice(1).join(" ");
    } else {
      itemName = descParts.join(" ");
    }
    if (!itemName.trim() && !itemCode) continue;

    items.push({
      itemCode,
      itemName: itemName.trim() || itemCode,
      unit,
      qty: intNums[0],
      ...(nums.length >= 3 ? { unitPrice: nums[nums.length - 2], total: nums[nums.length - 1] } : {}),
    });
  }

  return items;
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function parsePOLocalText(text: string): LocalParsedPO {
  const warnings: string[] = [];
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const header = extractHeaderFields(lines.slice(0, Math.min(40, lines.length)));
  const items = parseItemRows(lines);

  if (!header.poNumber) warnings.push("PO number not detected in document.");
  if (!header.date) warnings.push("Order date not detected in document.");
  if (items.length === 0) {
    warnings.push(
      "No item rows found — table format may not be recognised. " +
      "Check the raw text preview and enter lines manually.",
    );
  }

  return {
    poNumber: header.poNumber,
    date: header.date,
    customerName: header.customerName,
    customerCode: header.customerCode,
    comments: header.comments,
    rawText: text,
    items,
    warnings,
  };
}
