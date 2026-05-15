import { createContext, useContext } from "react";

export interface SidebarResizeContextValue {
  /** Current expanded width in px (clamped to MIN..MAX). */
  width: number;
  /** True when below the collapse threshold (icon-only mode). */
  isCollapsed: boolean;
  /** Update the live width while dragging. */
  setWidth: (px: number) => void;
  /** Persist current width (called on drag end). */
  commitWidth: () => void;
}

export const SidebarResizeContext = createContext<SidebarResizeContextValue | null>(null);

export function useSidebarResize(): SidebarResizeContextValue {
  const ctx = useContext(SidebarResizeContext);
  if (!ctx) {
    throw new Error("useSidebarResize must be used within PersistedSidebarProvider");
  }
  return ctx;
}
