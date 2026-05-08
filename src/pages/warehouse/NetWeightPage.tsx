import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  Camera,
  CameraOff,
  ChevronRight,
  Download,
  FileUp,
  Layers,
  Loader2,
  PackageCheck,
  Plus,
  SkipForward,
  Star,
  Truck,
  Weight,
  X,
  SendHorizonal,
} from "lucide-react";
import { toast } from "sonner";
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from "@zxing/library";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { parsePdf } from "@/lib/pdfParser";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CartonEntry {
  id: string;
  netWeight: number;
  productionDate: string;
  expiryDate: string;
  batchNo: string;
  barcode: string;
  isSample: boolean;
  palletIndex: number;
  seqInPallet: number;
  recordedAt: string;
}

interface PackingListBatch {
  batchNo: string;
  cartonCount: number;
  totalWeight: number;
  productionDate: string;
  expiryDate: string;
}

type Phase = "landing" | "receiving-choice" | "scanning" | "report";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function fmtDate(d: string): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-GB");
  } catch {
    return d;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function NetWeightPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("landing");

  // Packing list
  const [plBatches, setPlBatches] = useState<PackingListBatch[]>([]);
  const [plProgress, setPlProgress] = useState<string | null>(null);
  const [plError, setPlError] = useState<string | null>(null);
  const [plParsed, setPlParsed] = useState(false);
  const plFileRef = useRef<HTMLInputElement>(null);

  // Carton data
  const [cartons, setCartons] = useState<CartonEntry[]>([]);
  const [palletCount, setPalletCount] = useState(1);
  const [activePallet, setActivePallet] = useState(0);
  const seenBatches = useRef(new Set<string>());

  // Entry form fields
  const [fWeight, setFWeight] = useState("");
  const [fProd, setFProd] = useState("");
  const [fExp, setFExp] = useState("");
  const [fBatch, setFBatch] = useState("");
  const [fBarcode, setFBarcode] = useState("");
  const [stickyDates, setStickyDates] = useState(false);
  const [stickyBatch, setStickyBatch] = useState(false);

  // Camera
  const [cameraOpen, setCameraOpen] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraErr, setCameraErr] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastBarcodeRef = useRef<string>("");
  const lastBarcodeTimeRef = useRef(0);

  // Export state
  const [exporting, setExporting] = useState(false);

  // ── Camera ──────────────────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    try { readerRef.current?.reset(); } catch { /* ignore */ }
    readerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      const vid = videoRef.current;
      if (!vid) return;
      vid.srcObject = stream;
      await vid.play();
      setCameraReady(true);

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
        BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
        BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
      ]);
      const reader = new BrowserMultiFormatReader(hints, 150);
      readerRef.current = reader;
      reader.decodeFromStream(stream, vid, (result) => {
        if (!result) return;
        const text = result.getText();
        const now = Date.now();
        if (text === lastBarcodeRef.current && now - lastBarcodeTimeRef.current < 1500) return;
        lastBarcodeRef.current = text;
        lastBarcodeTimeRef.current = now;
        setFBarcode(text);
        toast.info(`Barcode: ${text}`, { duration: 1500 });
      });
    } catch {
      setCameraErr("Cannot access camera. Check browser permissions.");
    }
  }, [stopCamera]);

  const toggleCamera = () => {
    if (cameraOpen) {
      stopCamera();
      setCameraOpen(false);
    } else {
      setCameraOpen(true);
      void startCamera();
    }
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      await (track as any).applyConstraints({ advanced: [{ torch: !torchOn } as any] });
      setTorchOn((prev) => !prev);
    } catch {
      toast.error("Torch not supported on this device");
    }
  };

  useEffect(() => {
    if (phase === "scanning" && cameraOpen) void startCamera();
    return () => { if (phase === "scanning") stopCamera(); };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Packing list ────────────────────────────────────────────────────────────

  const handlePlFile = async (file: File) => {
    setPlError(null);
    setPlProgress("Reading file…");
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "xlsx" || ext === "xls") {
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const header = (rows[0] ?? []).map((h: any) => String(h ?? "").toLowerCase());

        const batchCol = header.findIndex((h) => h.includes("batch") || h.includes("lot"));
        const qtyCol   = header.findIndex((h) => h.includes("carton") || h.includes("qty") || h.includes("count") || h.includes("pcs"));
        const wtCol    = header.findIndex((h) => h.includes("weight") || h.includes("wt"));
        const prodCol  = header.findIndex((h) => h.includes("prod") || h.includes("mfg") || h.includes("manufacture"));
        const expCol   = header.findIndex((h) => h.includes("exp") || h.includes("best"));

        const batches: PackingListBatch[] = [];
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.every((c: any) => c == null || c === "")) continue;
          batches.push({
            batchNo:        batchCol >= 0 ? String(row[batchCol] ?? "").trim() : "",
            cartonCount:    qtyCol   >= 0 ? Number(row[qtyCol])  || 0 : 0,
            totalWeight:    wtCol    >= 0 ? Number(row[wtCol])   || 0 : 0,
            productionDate: prodCol  >= 0 ? String(row[prodCol] ?? "").trim() : "",
            expiryDate:     expCol   >= 0 ? String(row[expCol]  ?? "").trim() : "",
          });
        }
        setPlBatches(batches.filter((b) => b.batchNo || b.cartonCount));
        setPlParsed(true);
        setPlProgress(null);
        toast.success(`${batches.length} batch(es) read from Excel`);
      } catch {
        setPlError("Failed to read Excel file.");
        setPlProgress(null);
      }
      return;
    }

    // PDF or image — use AI parser
    try {
      const result = await parsePdf(file, "packing_list", (msg) => setPlProgress(msg));
      if (result.error) { setPlError(result.error); setPlProgress(null); return; }
      const items = result.items ?? [];
      const batches: PackingListBatch[] = items.map((item) => ({
        batchNo:        item.batchNo        ?? "",
        cartonCount:    item.qty            ?? 0,
        totalWeight:    0,
        productionDate: item.productionDate ?? "",
        expiryDate:     item.expiryDate     ?? "",
      }));
      setPlBatches(batches);
      setPlParsed(true);
      setPlProgress(null);
      toast.success(`${batches.length} batch(es) extracted from file`);
    } catch {
      setPlError("Failed to process file.");
      setPlProgress(null);
    }
  };

  // ── Carton entry ────────────────────────────────────────────────────────────

  const addCarton = useCallback(() => {
    const wt = parseFloat(fWeight.replace(",", "."));
    if (!fWeight || isNaN(wt) || wt <= 0) {
      toast.error("Enter a valid net weight");
      return;
    }

    const bKey = fBatch.trim().toUpperCase();
    const isFirstOfBatch = bKey.length > 0 && !seenBatches.current.has(bKey);
    if (bKey) seenBatches.current.add(bKey);

    setCartons((prev) => {
      const palletCartons = prev.filter((c) => c.palletIndex === activePallet);
      const entry: CartonEntry = {
        id: uid(),
        netWeight:      wt,
        productionDate: fProd,
        expiryDate:     fExp,
        batchNo:        fBatch.trim(),
        barcode:        fBarcode.trim(),
        isSample:       isFirstOfBatch,
        palletIndex:    activePallet,
        seqInPallet:    palletCartons.length + 1,
        recordedAt:     new Date().toISOString(),
      };
      if (isFirstOfBatch) {
        toast.success(`★ Sample — Pallet ${activePallet + 1}, Position ${entry.seqInPallet}`, { duration: 4000 });
      }
      return [...prev, entry];
    });

    setFWeight("");
    setFBarcode("");
    if (!stickyDates) { setFProd(""); setFExp(""); }
    if (!stickyBatch)  setFBatch("");
  }, [fWeight, fProd, fExp, fBatch, fBarcode, activePallet, stickyDates, stickyBatch]);

  const removeCarton = (id: string) => {
    setCartons((prev) => prev.filter((c) => c.id !== id));
  };

  const nextPallet = () => {
    const newIdx = palletCount;
    setPalletCount((p) => p + 1);
    setActivePallet(newIdx);
    toast.info(`Pallet ${newIdx + 1} started`);
  };

  // ── Summaries ───────────────────────────────────────────────────────────────

  const palletSummaries = useMemo(() =>
    Array.from({ length: palletCount }, (_, i) => {
      const pc = cartons.filter((c) => c.palletIndex === i);
      return {
        index:       i,
        cartonCount: pc.length,
        totalWeight: pc.reduce((s, c) => s + c.netWeight, 0),
        batches:     [...new Set(pc.map((c) => c.batchNo).filter(Boolean))],
        expiryDates: [...new Set(pc.map((c) => c.expiryDate).filter(Boolean))],
        samples:     pc.filter((c) => c.isSample),
      };
    }),
  [cartons, palletCount]);

  const grandTotal = useMemo(() => ({
    cartons: cartons.length,
    weight:  cartons.reduce((s, c) => s + c.netWeight, 0),
    samples: cartons.filter((c) => c.isSample).length,
  }), [cartons]);

  const activeCartons = useMemo(
    () => cartons.filter((c) => c.palletIndex === activePallet),
    [cartons, activePallet],
  );

  const activeSummary = palletSummaries[activePallet];

  // ── Export ──────────────────────────────────────────────────────────────────

  const exportExcelReport = async () => {
    if (cartons.length === 0) { toast.info("No cartons recorded"); return; }
    setExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = "MOthman Prime ERP";
      wb.created = new Date();

      // Sheet 1 — All cartons
      const ws = wb.addWorksheet("All Cartons");
      const COL = 8;
      ws.addRow(["Net Weight Receiving Report"]);
      ws.mergeCells(1, 1, 1, COL);
      const titleCell = ws.getRow(1).getCell(1);
      titleCell.font = { bold: true, size: 14 };
      titleCell.alignment = { vertical: "middle" };
      ws.getRow(1).height = 26;

      ws.addRow([`Generated: ${new Date().toLocaleString()}`]);
      ws.mergeCells(2, 1, 2, COL);
      ws.getRow(2).getCell(1).font = { size: 9, color: { argb: "FF888888" } };
      ws.addRow([]);

      const hdrRow = ws.addRow(["#", "Pallet", "Seq", "Net Weight (kg)", "Prod. Date", "Expiry Date", "Batch / Lot", "Barcode"]);
      hdrRow.height = 20;
      hdrRow.eachCell((cell) => {
        cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1a1a2e" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      });

      cartons.forEach((c, i) => {
        const row = ws.addRow([
          i + 1,
          `Pallet ${c.palletIndex + 1}`,
          c.seqInPallet,
          c.netWeight,
          c.productionDate || "—",
          c.expiryDate     || "—",
          c.batchNo        || "—",
          c.barcode        || "—",
        ]);
        row.height = 18;

        const wCell = row.getCell(4);
        wCell.numFmt = "0.000";
        wCell.alignment = { horizontal: "right" };

        // Comment on weight cell with all carton details
        const noteLines = [
          ...(c.isSample ? [{ font: { bold: true }, text: "★ SAMPLE CARTON\n" }] : []),
          { text: `Prod:    ${c.productionDate || "—"}\n` },
          { text: `Expiry:  ${c.expiryDate     || "—"}\n` },
          { text: `Batch:   ${c.batchNo        || "—"}\n` },
          { text: `Barcode: ${c.barcode        || "—"}` },
        ];
        (wCell as any).note = { texts: noteLines };

        if (c.isSample) {
          wCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CD" } };
          wCell.font = { bold: true };
        } else if (i % 2 === 1) {
          row.eachCell((cell) => {
            if (!(cell.fill as any)?.fgColor?.argb || (cell.fill as any).fgColor.argb === "FF000000") return;
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
          });
        }
      });

      // Total row
      const totRow = ws.addRow(["", "", "TOTAL", grandTotal.weight, "", "", `${grandTotal.cartons} cartons`, ""]);
      totRow.getCell(3).font = { bold: true };
      totRow.getCell(4).font = { bold: true };
      totRow.getCell(4).numFmt = "0.000";
      totRow.getCell(7).font = { italic: true, color: { argb: "FF666666" }, size: 9 };

      [5, 12, 6, 16, 14, 14, 18, 20].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

      // Sheet 2 — Pallet summary
      const ws2 = wb.addWorksheet("Pallet Summary");
      const hdr2 = ws2.addRow(["Pallet", "Cartons", "Total Weight (kg)", "Batches", "Expiry Dates", "Samples (position)"]);
      hdr2.eachCell((cell) => {
        cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1a1a2e" } };
      });
      palletSummaries.forEach((p) => {
        ws2.addRow([
          `Pallet ${p.index + 1}`,
          p.cartonCount,
          p.totalWeight,
          p.batches.join(", ")      || "—",
          p.expiryDates.map(fmtDate).join(", ") || "—",
          p.samples.map((s) => `#${s.seqInPallet}`).join(", ") || "—",
        ]);
      });
      const totRow2 = ws2.addRow(["GRAND TOTAL", grandTotal.cartons, grandTotal.weight, "", "", ""]);
      totRow2.getCell(1).font = { bold: true };
      totRow2.getCell(2).font = { bold: true };
      totRow2.getCell(3).font = { bold: true };
      totRow2.getCell(3).numFmt = "0.000";
      [14, 10, 18, 28, 22, 22].forEach((w, i) => { ws2.getColumn(i + 1).width = w; });

      // Sheet 3 — Samples
      const ws3 = wb.addWorksheet("Sample Cartons");
      const hdr3 = ws3.addRow(["Pallet", "Position", "Batch / Lot", "Prod. Date", "Expiry Date", "Net Weight (kg)", "Barcode"]);
      hdr3.eachCell((cell) => {
        cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92400E" } };
      });
      cartons.filter((c) => c.isSample).forEach((c) => {
        ws3.addRow([
          `Pallet ${c.palletIndex + 1}`,
          c.seqInPallet,
          c.batchNo        || "—",
          c.productionDate || "—",
          c.expiryDate     || "—",
          c.netWeight,
          c.barcode        || "—",
        ]);
      });
      [14, 10, 18, 14, 14, 16, 20].forEach((w, i) => { ws3.getColumn(i + 1).width = w; });

      const buf = await wb.xlsx.writeBuffer();
      saveAs(
        new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `net-weight-${new Date().toISOString().split("T")[0]}.xlsx`,
      );
      toast.success("Excel report exported");
    } catch (err) {
      console.error(err);
      toast.error("Excel export failed");
    }
    setExporting(false);
  };

  const exportPdfReport = () => {
    if (cartons.length === 0) { toast.info("No cartons recorded"); return; }
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.text("Net Weight Receiving Report", 14, 15);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    doc.text(
      `Generated: ${new Date().toLocaleString()}  |  ${grandTotal.cartons} cartons  |  ${grandTotal.weight.toFixed(3)} kg total`,
      14, 21,
    );

    autoTable(doc, {
      startY: 27,
      head: [["#", "Pallet", "Net Wt (kg)", "Prod Date", "Expiry Date", "Batch / Lot", "Barcode", "★"]],
      body: cartons.map((c, i) => [
        i + 1,
        `P${c.palletIndex + 1}`,
        c.netWeight.toFixed(3),
        fmtDate(c.productionDate),
        fmtDate(c.expiryDate),
        c.batchNo  || "—",
        c.barcode  || "—",
        c.isSample ? "★" : "",
      ]),
      theme: "grid",
      headStyles:         { fillColor: [26, 26, 46], textColor: [255, 255, 255], fontSize: 7, fontStyle: "bold" },
      bodyStyles:         { fontSize: 6.5, cellPadding: 1.5 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      styles:             { lineColor: [220, 220, 220], lineWidth: 0.3 },
      columnStyles:       { 7: { halign: "center", fontStyle: "bold" } },
      margin: { left: 10, right: 10 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text("Pallet Summary", 14, finalY);

    autoTable(doc, {
      startY: finalY + 4,
      head: [["Pallet", "Cartons", "Total Weight (kg)", "Batches", "Samples"]],
      body: palletSummaries.map((p) => [
        `Pallet ${p.index + 1}`,
        p.cartonCount,
        p.totalWeight.toFixed(3),
        p.batches.join(", ") || "—",
        p.samples.map((s) => `#${s.seqInPallet}`).join(", ") || "—",
      ]),
      theme: "grid",
      headStyles:   { fillColor: [26, 26, 46], textColor: [255, 255, 255], fontSize: 7, fontStyle: "bold" },
      bodyStyles:   { fontSize: 7, cellPadding: 2 },
      margin:       { left: 10, right: 10 },
    });

    doc.save(`net-weight-${new Date().toISOString().split("T")[0]}.pdf`);
    toast.success("PDF exported");
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Landing ──────────────────────────────────────────────────────────────────
  if (phase === "landing") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 py-3">
          <div className="flex items-center gap-3 max-w-lg mx-auto">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="h-9 w-9 rounded-md border border-border bg-card flex items-center justify-center"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <Weight className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">Net Weight Tracking</h1>
            </div>
          </div>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4 max-w-sm mx-auto w-full">
          <div className="text-center mb-4">
            <Weight className="h-14 w-14 text-primary mx-auto mb-3 opacity-60" />
            <h2 className="text-xl font-bold">Select Mode</h2>
            <p className="text-sm text-muted-foreground mt-1">Meats &amp; Cheeses — Net Weight Recording</p>
          </div>

          {/* Receiving Shipments */}
          <button
            type="button"
            onClick={() => setPhase("receiving-choice")}
            className="w-full flex items-center gap-4 rounded-xl border-2 border-primary bg-primary/5 p-5 text-left hover:bg-primary/10 active:scale-[0.98] transition-all"
          >
            <div className="h-12 w-12 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <Truck className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-foreground">Receiving Shipments</div>
              <div className="text-xs text-muted-foreground mt-0.5">Record inbound carton weights &amp; batches per pallet</div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
          </button>

          {/* Dispatch — stub, coming soon */}
          <button
            type="button"
            disabled
            className="w-full flex items-center gap-4 rounded-xl border border-dashed border-border bg-card p-5 text-left opacity-40 cursor-not-allowed"
          >
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center shrink-0">
              <SendHorizonal className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-foreground">Dispatch / Order Prep</div>
              <div className="text-xs text-muted-foreground mt-0.5">Coming soon</div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // ── Receiving choice ─────────────────────────────────────────────────────────
  if (phase === "receiving-choice") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 py-3">
          <div className="flex items-center gap-3 max-w-lg mx-auto">
            <button
              type="button"
              onClick={() => setPhase("landing")}
              className="h-9 w-9 rounded-md border border-border bg-card flex items-center justify-center"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <Truck className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Receiving Shipments</h1>
          </div>
        </header>

        <div className="flex-1 p-4 max-w-lg mx-auto w-full flex flex-col gap-4 pt-6">
          {/* Upload packing list */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-semibold flex items-center gap-2 mb-1">
              <FileUp className="h-4 w-4 text-primary" />
              Upload Packing List
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              Upload the shipment packing list (PDF, Excel, or image). Batch info will be extracted and the
              first carton of each batch will be automatically flagged as a sample.
            </p>

            {plError && (
              <div className="mb-3 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                {plError}
              </div>
            )}

            {plProgress && (
              <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                {plProgress}
              </div>
            )}

            {plParsed && plBatches.length > 0 && (
              <div className="mb-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
                <div className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-2">
                  {plBatches.length} batch(es) found
                </div>
                <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                  {plBatches.map((b, i) => (
                    <div key={i} className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{b.batchNo || `Batch ${i + 1}`}</span>
                      {b.cartonCount > 0 && <span>{b.cartonCount} cartons</span>}
                      {b.totalWeight > 0 && <span>{b.totalWeight.toFixed(1)} kg</span>}
                      {b.productionDate && <span>Prod: {b.productionDate}</span>}
                      {b.expiryDate && <span>Exp: {b.expiryDate}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <input
              ref={plFileRef}
              type="file"
              accept=".pdf,.xlsx,.xls,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handlePlFile(f); e.target.value = ""; }}
            />
            <button
              type="button"
              onClick={() => plFileRef.current?.click()}
              disabled={!!plProgress}
              className="w-full rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 py-8 text-sm font-medium text-primary hover:bg-primary/10 active:scale-[0.99] transition disabled:opacity-50"
            >
              <FileUp className="h-7 w-7 mx-auto mb-1.5 opacity-70" />
              {plParsed ? "Upload Different File" : "Choose File (PDF / Excel / Image)"}
            </button>

            {plParsed && (
              <button
                type="button"
                onClick={() => setPhase("scanning")}
                className="mt-3 w-full rounded-lg bg-primary text-primary-foreground py-3 text-sm font-semibold hover:bg-primary/90 active:scale-[0.99] transition flex items-center justify-center gap-2"
              >
                Start Recording Weights
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Skip */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-semibold flex items-center gap-2 mb-1">
              <SkipForward className="h-4 w-4 text-muted-foreground" />
              Skip — Start Now
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              Start recording immediately. Sample detection still works — the first carton
              of each batch encountered will be marked as sample.
            </p>
            <button
              type="button"
              onClick={() => setPhase("scanning")}
              className="w-full rounded-lg border border-border bg-secondary py-3 text-sm font-medium hover:bg-secondary/80 active:scale-[0.99] transition"
            >
              Skip &amp; Start Recording
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Report ────────────────────────────────────────────────────────────────────
  if (phase === "report") {
    return (
      <div className="min-h-screen bg-background pb-16">
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-3 py-3">
          <div className="flex items-center gap-2 max-w-5xl mx-auto">
            <button
              type="button"
              onClick={() => setPhase("scanning")}
              className="h-9 w-9 rounded-md border border-border bg-card flex items-center justify-center shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <BarChart3 className="h-5 w-5 text-primary shrink-0" />
              <h1 className="text-base font-semibold truncate">Shipment Report</h1>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void exportExcelReport()}
                disabled={exporting}
                className="flex items-center gap-1.5 rounded-md bg-emerald-600 text-white px-3 py-2 text-sm font-medium hover:bg-emerald-700 active:scale-[0.97] disabled:opacity-50 transition"
              >
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span className="hidden sm:inline">Excel</span>
              </button>
              <button
                type="button"
                onClick={exportPdfReport}
                className="flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 active:scale-[0.97] transition"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">PDF</span>
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto p-4 flex flex-col gap-4">
          {/* Grand totals */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total Cartons",   value: grandTotal.cartons,                      color: "text-foreground" },
              { label: "Total Net Weight", value: `${grandTotal.weight.toFixed(3)} kg`,   color: "text-primary" },
              { label: "Pallets",          value: palletCount,                             color: "text-foreground" },
              { label: "Samples Taken",    value: grandTotal.samples,                      color: "text-amber-500" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-card p-4">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{s.label}</div>
                <div className={`mt-1 text-2xl font-bold ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </section>

          {/* Pallet summary */}
          <section className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <h2 className="font-semibold text-sm">Pallet Summary</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="bg-secondary/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Pallet</th>
                    <th className="px-3 py-2 text-right">Cartons</th>
                    <th className="px-3 py-2 text-right">Net Weight</th>
                    <th className="px-3 py-2 text-left">Batches</th>
                    <th className="px-3 py-2 text-left">Expiry Dates</th>
                    <th className="px-3 py-2 text-left">Samples</th>
                  </tr>
                </thead>
                <tbody>
                  {palletSummaries.map((p) => (
                    <tr key={p.index} className="border-t border-border/60">
                      <td className="px-3 py-2 font-medium">Pallet {p.index + 1}</td>
                      <td className="px-3 py-2 text-right font-mono">{p.cartonCount}</td>
                      <td className="px-3 py-2 text-right font-mono text-primary">{p.totalWeight.toFixed(3)} kg</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{p.batches.join(", ") || "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{p.expiryDates.map(fmtDate).join(", ") || "—"}</td>
                      <td className="px-3 py-2 text-xs text-amber-500">{p.samples.map((s) => `#${s.seqInPallet}`).join(", ") || "—"}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border bg-muted/20">
                    <td className="px-3 py-2 font-bold text-sm">TOTAL</td>
                    <td className="px-3 py-2 text-right font-bold font-mono">{grandTotal.cartons}</td>
                    <td className="px-3 py-2 text-right font-bold font-mono text-primary">{grandTotal.weight.toFixed(3)} kg</td>
                    <td colSpan={3} />
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Sample cartons */}
          {grandTotal.samples > 0 && (
            <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
              <div className="px-4 py-3 border-b border-amber-500/20 bg-amber-500/10">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                  Sample Cartons
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Pallet</th>
                      <th className="px-3 py-2 text-left">Pos.</th>
                      <th className="px-3 py-2 text-left">Batch / Lot</th>
                      <th className="px-3 py-2 text-left">Prod. Date</th>
                      <th className="px-3 py-2 text-left">Expiry</th>
                      <th className="px-3 py-2 text-right">Net Wt</th>
                      <th className="px-3 py-2 text-left">Barcode</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cartons.filter((c) => c.isSample).map((c) => (
                      <tr key={c.id} className="border-t border-amber-500/10">
                        <td className="px-3 py-2 font-medium text-amber-600 dark:text-amber-400">P{c.palletIndex + 1}</td>
                        <td className="px-3 py-2 font-mono">#{c.seqInPallet}</td>
                        <td className="px-3 py-2">{c.batchNo || "—"}</td>
                        <td className="px-3 py-2 text-xs">{fmtDate(c.productionDate)}</td>
                        <td className="px-3 py-2 text-xs">{fmtDate(c.expiryDate)}</td>
                        <td className="px-3 py-2 text-right font-mono">{c.netWeight.toFixed(3)} kg</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{c.barcode || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* All cartons */}
          <section className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <h2 className="font-semibold text-sm">All Cartons ({grandTotal.cartons})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="bg-secondary/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Pallet</th>
                    <th className="px-3 py-2 text-right">Net Wt</th>
                    <th className="px-3 py-2 text-left">Prod</th>
                    <th className="px-3 py-2 text-left">Expiry</th>
                    <th className="px-3 py-2 text-left">Batch</th>
                    <th className="px-3 py-2 text-left">Barcode</th>
                  </tr>
                </thead>
                <tbody>
                  {cartons.map((c, i) => (
                    <tr
                      key={c.id}
                      className={`border-t border-border/40 ${c.isSample ? "bg-amber-500/10" : i % 2 === 1 ? "bg-muted/15" : ""}`}
                    >
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-1.5 text-xs">
                        P{c.palletIndex + 1}
                        {c.isSample && <Star className="h-3 w-3 inline ml-1 text-amber-500 fill-amber-500" />}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-sm font-medium">{c.netWeight.toFixed(3)}</td>
                      <td className="px-3 py-1.5 text-xs">{fmtDate(c.productionDate)}</td>
                      <td className="px-3 py-1.5 text-xs">{fmtDate(c.expiryDate)}</td>
                      <td className="px-3 py-1.5 text-xs">{c.batchNo || "—"}</td>
                      <td className="px-3 py-1.5 text-xs font-mono text-muted-foreground">{c.barcode || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    );
  }

  // ── Scanning ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col bg-background" style={{ height: "100dvh", overflow: "hidden" }}>

      {/* ── Header ── */}
      <header className="shrink-0 border-b border-border bg-background/95 backdrop-blur z-20">
        {/* Top row */}
        <div className="flex items-center gap-2 px-2 py-2">
          <button
            type="button"
            onClick={() => setPhase("receiving-choice")}
            className="h-9 w-9 rounded-md border border-border bg-card flex items-center justify-center shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-1 text-sm font-semibold shrink-0">
            <Weight className="h-4 w-4 text-primary" />
            <span className="hidden xs:inline">Net Weight</span>
          </div>

          {/* Pallet tabs — scrollable */}
          <div className="flex-1 overflow-x-auto min-w-0">
            <div className="flex gap-1 w-max px-1">
              {Array.from({ length: palletCount }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActivePallet(i)}
                  className={`h-7 min-w-[28px] px-2.5 rounded text-xs font-semibold transition ${
                    activePallet === i
                      ? "bg-primary text-primary-foreground shadow"
                      : "bg-secondary text-foreground hover:bg-secondary/70"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>

          {/* Right actions */}
          <div className="flex gap-1 shrink-0">
            <button
              type="button"
              onClick={toggleCamera}
              className="h-8 w-8 rounded-md border border-border bg-card flex items-center justify-center"
              title={cameraOpen ? "Hide camera" : "Show camera"}
            >
              {cameraOpen ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
            </button>
            {cartons.length > 0 && (
              <button
                type="button"
                onClick={() => setPhase("report")}
                className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Report</span>
              </button>
            )}
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border/40 bg-muted/20 text-xs text-muted-foreground overflow-x-auto whitespace-nowrap">
          <span className="font-medium text-foreground">P{activePallet + 1}:</span>
          <span>{activeSummary?.cartonCount ?? 0} cartons</span>
          {(activeSummary?.totalWeight ?? 0) > 0 && (
            <span className="text-primary font-medium">{activeSummary.totalWeight.toFixed(3)} kg</span>
          )}
          {(activeSummary?.samples.length ?? 0) > 0 && (
            <span className="text-amber-500">★ {activeSummary.samples.length} sample(s)</span>
          )}
          <span className="ml-auto text-muted-foreground/70">
            Total: {grandTotal.cartons} ctns | {grandTotal.weight.toFixed(3)} kg
          </span>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">

        {/* Camera panel */}
        {cameraOpen && (
          <div className="shrink-0 h-[42vw] max-h-56 min-h-[140px] lg:h-auto lg:max-h-none lg:w-[38%] bg-black relative border-b lg:border-b-0 lg:border-r border-border">
            {cameraErr ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white/60 p-4">
                <CameraOff className="h-8 w-8 opacity-40" />
                <span className="text-center text-xs">{cameraErr}</span>
                <button
                  type="button"
                  onClick={() => void startCamera()}
                  className="mt-1 rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white"
                >
                  Retry
                </button>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  muted
                  autoPlay
                />
                {!cameraReady && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                  </div>
                )}
                {/* Targeting frame overlay */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-48 h-20 border-2 border-primary/70 rounded-lg" />
                </div>
                {/* Torch */}
                <button
                  type="button"
                  onClick={() => void toggleTorch()}
                  className="absolute bottom-2 right-2 h-8 w-8 rounded-full bg-black/50 flex items-center justify-center text-white/70 hover:text-white active:scale-95 transition"
                >
                  <span className="text-sm">{torchOn ? "🔦" : "💡"}</span>
                </button>
              </>
            )}
            <div className="absolute bottom-0 left-0 right-0 text-center text-[10px] text-white/30 pb-0.5 pointer-events-none">
              Barcode auto-detected
            </div>
          </div>
        )}

        {/* Right: form + table */}
        <div className="flex-1 min-h-0 flex flex-col">

          {/* Entry form */}
          <div className="shrink-0 border-b border-border bg-card px-3 pt-3 pb-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {/* Net weight — most important, bigger */}
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs text-muted-foreground mb-1">Net Weight (kg) *</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  inputMode="decimal"
                  value={fWeight}
                  onChange={(e) => setFWeight(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addCarton(); }}
                  placeholder="0.000"
                  className="h-11 w-full rounded-md border-2 border-primary bg-background px-3 text-lg font-bold text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  autoComplete="off"
                />
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Prod. Date</label>
                <input
                  type="date"
                  value={fProd}
                  onChange={(e) => setFProd(e.target.value)}
                  className="h-11 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Expiry Date</label>
                <input
                  type="date"
                  value={fExp}
                  onChange={(e) => setFExp(e.target.value)}
                  className="h-11 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Batch / Lot</label>
                <input
                  type="text"
                  value={fBatch}
                  onChange={(e) => setFBatch(e.target.value)}
                  placeholder="e.g. L240115"
                  className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Carton Barcode</label>
                <input
                  type="text"
                  value={fBarcode}
                  onChange={(e) => setFBarcode(e.target.value)}
                  placeholder="Scan or type"
                  className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Bottom action bar */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addCarton}
                className="flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition"
              >
                <Plus className="h-4 w-4" />
                Add Carton
              </button>

              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={stickyDates}
                  onChange={(e) => setStickyDates(e.target.checked)}
                  className="rounded"
                />
                Keep dates
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={stickyBatch}
                  onChange={(e) => setStickyBatch(e.target.checked)}
                  className="rounded"
                />
                Keep batch
              </label>

              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {activeSummary?.cartonCount ?? 0} ctns
                  {(activeSummary?.totalWeight ?? 0) > 0 && (
                    <> · <span className="text-primary font-medium">{activeSummary.totalWeight.toFixed(3)} kg</span></>
                  )}
                </span>
                <button
                  type="button"
                  onClick={nextPallet}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary/70 active:scale-[0.97] transition"
                >
                  <Layers className="h-3.5 w-3.5" />
                  Next Pallet
                </button>
              </div>
            </div>
          </div>

          {/* Scrollable table */}
          <div className="flex-1 min-h-0 overflow-auto">
            {activeCartons.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground min-h-[100px]">
                <PackageCheck className="h-8 w-8 opacity-25" />
                <p className="text-sm">Pallet {activePallet + 1} is empty</p>
                <p className="text-xs opacity-50">Fill the form above and press "Add Carton"</p>
              </div>
            ) : (
              <table className="w-full text-sm min-w-[480px]">
                <thead className="sticky top-0 bg-secondary/90 backdrop-blur text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left w-10">#</th>
                    <th className="px-3 py-2 text-right">Net Wt</th>
                    <th className="px-3 py-2 text-left">Prod</th>
                    <th className="px-3 py-2 text-left">Expiry</th>
                    <th className="px-3 py-2 text-left">Batch</th>
                    <th className="px-3 py-2 text-left hidden sm:table-cell">Barcode</th>
                    <th className="px-2 py-2 text-center w-8">★</th>
                    <th className="px-2 py-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {activeCartons.map((c, i) => (
                    <tr
                      key={c.id}
                      className={`border-t border-border/40 ${
                        c.isSample ? "bg-amber-500/10" : i % 2 === 1 ? "bg-muted/15" : ""
                      }`}
                    >
                      <td className="px-3 py-2 text-xs text-muted-foreground">{c.seqInPallet}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-base leading-tight">
                        {c.netWeight.toFixed(3)}
                      </td>
                      <td className="px-3 py-2 text-xs">{fmtDate(c.productionDate)}</td>
                      <td className="px-3 py-2 text-xs">{fmtDate(c.expiryDate)}</td>
                      <td className="px-3 py-2 text-xs">{c.batchNo || "—"}</td>
                      <td className="px-3 py-2 text-xs font-mono text-muted-foreground hidden sm:table-cell">
                        {c.barcode || "—"}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {c.isSample && <Star className="h-4 w-4 text-amber-500 fill-amber-500 mx-auto" />}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => removeCarton(c.id)}
                          className="h-7 w-7 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center transition"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}

                  {/* Pallet total */}
                  <tr className="border-t-2 border-border bg-muted/20">
                    <td className="px-3 py-2 text-xs text-muted-foreground font-bold">TOT</td>
                    <td className="px-3 py-2 text-right font-bold font-mono text-primary">
                      {activeSummary?.totalWeight.toFixed(3)}
                    </td>
                    <td colSpan={6} className="px-3 py-2 text-xs text-muted-foreground">
                      {activeSummary?.cartonCount} carton{activeSummary?.cartonCount !== 1 ? "s" : ""}
                      {(activeSummary?.samples.length ?? 0) > 0 && (
                        <span className="ml-2 text-amber-500">★ {activeSummary.samples.length} sample(s)</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
