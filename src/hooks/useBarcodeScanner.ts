import { useRef, useCallback, useEffect } from "react";
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from "@zxing/library";
import { toast } from "sonner";

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
    try {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39, BarcodeFormat.QR_CODE, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
      ]);
      const reader = new BrowserMultiFormatReader(hints, 100);
      readerRef.current = reader;

      reader.decodeFromVideoDevice(undefined, videoRef.current!, (result, err) => {
        if (result) {
          const now = Date.now();
          const text = result.getText();
          if (now - lastScanRef.current >= 300 && !(text === lastBarcodeRef.current && now - lastScanRef.current < 1500)) {
            lastScanRef.current = now;
            lastBarcodeRef.current = text;
            onScan(text);
          }
        }
      });

      setTimeout(() => {
        if (videoRef.current?.srcObject) {
          streamRef.current = videoRef.current.srcObject as MediaStream;
        }
      }, 500);
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
