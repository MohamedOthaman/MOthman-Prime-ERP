import { applyRuntimeAttributes, getRuntimeInfo } from "./runtime";

export function bootstrapPlatformRuntime() {
  if (typeof window === "undefined") {
    return;
  }

  const runtime = getRuntimeInfo();
  window.__FOOD_CHOICE_RUNTIME__ = runtime;
  applyRuntimeAttributes(runtime);

  if (import.meta.env.DEV) {
    console.info(
      `[platform] runtime=${runtime.platform} native=${runtime.isNativeShell} bridge=${runtime.hasNativeBridge}`
    );
  }

  if (runtime.isNativeShell && !import.meta.env.VITE_APP_URL) {
    console.warn(
      "[platform] VITE_APP_URL is not set. Configure an explicit redirect URL for Supabase email/reset flows in native builds."
    );
  }

  window.dispatchEvent(
    new CustomEvent("food-choice:platform-ready", {
      detail: runtime,
    })
  );
}
