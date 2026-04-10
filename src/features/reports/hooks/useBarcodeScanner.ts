import { useRef, useCallback, useEffect } from "react";
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from "@zxing/library";
import { toast } from "sonner";
import { getNativeBridge, getRuntimePlatform } from "@/platform/runtime";

export function useBarcodeScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastScanRef = useRef<number>(0);
  const lastBarcodeRef = useRef<string>("");

  const stopCamera = useCallback(() => {
    if (readerRef.current) { readerRef.current.reset(); readerRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startScanning = useCallback(async (onScan: (barcode: string) => void) => {
    stopCamera();

    const nativeBridge = getNativeBridge();
    if (nativeBridge?.scanBarcode) {
      try {
        const result = await nativeBridge.scanBarcode();
        if (result?.value) {
          onScan(result.value);
          return;
        }
      } catch (error) {
        console.error("Native barcode scan failed", error);
        if (getRuntimePlatform() !== "web") {
          toast.error("Native scanner unavailable, falling back to camera");
        }
      }
    }

    await new Promise(r => setTimeout(r, 200));
    const videoEl = videoRef.current;
    if (!videoEl) { toast.error("Camera element not ready"); return; }
    try {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39, BarcodeFormat.QR_CODE, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
      ]);
      const reader = new BrowserMultiFormatReader(hints, 80);
      readerRef.current = reader;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      videoEl.srcObject = stream;
      await videoEl.play();

      reader.decodeFromStream(stream, videoEl, (result, err) => {
        if (result) {
          const now = Date.now();
          const text = result.getText();
          if (now - lastScanRef.current >= 250 && !(text === lastBarcodeRef.current && now - lastScanRef.current < 1500)) {
            lastScanRef.current = now;
            lastBarcodeRef.current = text;
            onScan(text);
          }
        }
      });
    } catch { toast.error("Cannot access camera"); }
  }, [stopCamera]);

  const toggleTorch = useCallback(async (currentState: boolean): Promise<boolean> => {
    if (!streamRef.current) return currentState;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return currentState;
    try {
      await (track as any).applyConstraints({ advanced: [{ torch: !currentState } as any] });
      return !currentState;
    } catch {
      toast.error("Torch not supported");
      return currentState;
    }
  }, []);

  return { videoRef, startScanning, stopCamera, toggleTorch };
}
