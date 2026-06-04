export type RuntimePlatform = "web" | "capacitor" | "tauri";

export interface FoodChoiceRuntimeInfo {
  platform: RuntimePlatform;
  isNativeShell: boolean;
  hasNativeBridge: boolean;
}

export interface FoodChoiceBarcodeScanResult {
  value: string;
  format?: string;
}

export interface FoodChoiceNativeSaveFilePayload {
  fileName: string;
  mimeType: string;
  bytes: number[];
}

export interface FoodChoiceNativePrintPayload {
  title: string;
  html: string;
}

export interface FoodChoiceNativeBridge {
  scanBarcode?: () => Promise<FoodChoiceBarcodeScanResult | null>;
  saveFile?: (payload: FoodChoiceNativeSaveFilePayload) => Promise<void>;
  printHtml?: (payload: FoodChoiceNativePrintPayload) => Promise<void>;
}

declare global {
  interface Window {
    Capacitor?: {
      getPlatform?: () => string;
      isNativePlatform?: () => boolean;
    };
    __TAURI__?: Record<string, unknown>;
    /** Always injected inside a Tauri webview, regardless of `withGlobalTauri`. */
    __TAURI_INTERNALS__?: Record<string, unknown>;
    /** Forward-compatible Tauri detection flag set by the runtime. */
    isTauri?: boolean;
    __FOOD_CHOICE_NATIVE__?: FoodChoiceNativeBridge;
    __FOOD_CHOICE_RUNTIME__?: FoodChoiceRuntimeInfo;
  }
}

function isCapacitorNativePlatform(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const platform = window.Capacitor?.getPlatform?.();
  if (platform && platform !== "web") {
    return true;
  }

  return Boolean(window.Capacitor?.isNativePlatform?.());
}

/**
 * Detect the Tauri desktop runtime independently of the `withGlobalTauri`
 * config flag. Tauri always injects `__TAURI_INTERNALS__` (every plugin's
 * `invoke()` routes through it), whereas `window.__TAURI__` only exists when
 * `withGlobalTauri` is enabled — which we keep OFF for security hardening.
 * `window.isTauri` is checked as a forward-compatible secondary signal.
 */
export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return "__TAURI_INTERNALS__" in window || Boolean(window.isTauri);
}

export function getRuntimePlatform(): RuntimePlatform {
  if (typeof window === "undefined") {
    return "web";
  }

  if (isTauriRuntime()) {
    return "tauri";
  }

  if (isCapacitorNativePlatform()) {
    return "capacitor";
  }

  return "web";
}

export function getNativeBridge(): FoodChoiceNativeBridge | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.__FOOD_CHOICE_NATIVE__ ?? null;
}

export function getRuntimeInfo(): FoodChoiceRuntimeInfo {
  const platform = getRuntimePlatform();

  return {
    platform,
    isNativeShell: platform !== "web",
    hasNativeBridge: Boolean(getNativeBridge()),
  };
}

export function applyRuntimeAttributes(runtime: FoodChoiceRuntimeInfo) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.dataset.platform = runtime.platform;
  root.dataset.nativeShell = runtime.isNativeShell ? "true" : "false";
  root.classList.add(`platform-${runtime.platform}`);

  if (runtime.isNativeShell) {
    root.classList.add("platform-native");
  }
}
