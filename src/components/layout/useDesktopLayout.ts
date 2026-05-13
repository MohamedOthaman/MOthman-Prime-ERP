import { useEffect, useState } from "react";
import { getRuntimePlatform } from "@/platform/runtime";

const DESKTOP_BREAKPOINT_PX = 1024;

/**
 * Returns true when the app should render its desktop chrome (Sidebar +
 * wider content area) — either we're inside a Tauri shell, or the viewport
 * is wide enough that the BottomNav-only mobile layout would feel cramped.
 */
export function useDesktopLayout(): boolean {
  const isTauri = getRuntimePlatform() === "tauri";

  const [isWide, setIsWide] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT_PX}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT_PX}px)`);
    const handler = (e: MediaQueryListEvent) => setIsWide(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", handler);
      else mq.removeListener(handler);
    };
  }, []);

  return isTauri || isWide;
}