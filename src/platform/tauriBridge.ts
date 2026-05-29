/**
 * Tauri-side wire-up for the `window.__FOOD_CHOICE_NATIVE__` bridge.
 *
 * Tauri 2's WebView2 / WebKit already supports the standard web APIs the
 * app relies on (camera via MediaDevices for ZXing, `window.print()`,
 * download via Blob URLs). This module only wires the *optional* native
 * accelerators: a system save-file dialog for exports and a delegated
 * print path for print previews.
 */

import { isTauriRuntime } from "@/platform/runtime";
import type {
  FoodChoiceNativeBridge,
  FoodChoiceNativeSaveFilePayload,
  FoodChoiceNativePrintPayload,
} from "@/platform/runtime";

async function saveFile(payload: FoodChoiceNativeSaveFilePayload): Promise<void> {
  const [{ save }, { writeFile }] = await Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/plugin-fs"),
  ]);

  const filePath = await save({
    defaultPath: payload.fileName,
    filters: payload.mimeType
      ? [{ name: payload.fileName, extensions: [payload.fileName.split(".").pop() ?? "*"] }]
      : undefined,
  });

  if (!filePath) return; // user cancelled

  await writeFile(filePath, new Uint8Array(payload.bytes));
}

async function printHtml(payload: FoodChoiceNativePrintPayload): Promise<void> {
  // Render via a hidden iframe and call print(). This gives Tauri users
  // the same OS print dialog that browsers expose, without requiring any
  // additional Rust plumbing.
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(`<!doctype html><html><head><title>${payload.title}</title></head><body>${payload.html}</body></html>`);
  doc.close();

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      // Small delay so the print dialog can grab the contents before removal.
      window.setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }
  };
}

export function initTauriBridge(): void {
  if (typeof window === "undefined") return;
  if (!isTauriRuntime()) return;

  // Merge — don't clobber any earlier wires (e.g. dev-tooling stubs).
  const existing: FoodChoiceNativeBridge | undefined = window.__FOOD_CHOICE_NATIVE__;
  window.__FOOD_CHOICE_NATIVE__ = {
    ...existing,
    saveFile,
    printHtml,
  };
}