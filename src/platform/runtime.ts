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

export function getRuntimePlatform(): RuntimePlatform {
  if (typeof window === "undefined") {
    return "web";
  }

  if (window.__TAURI__) {
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
