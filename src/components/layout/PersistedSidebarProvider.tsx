import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import {
  SIDEBAR_COLLAPSE_THRESHOLD,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_ICON,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN_EXPANDED,
  loadSidebarWidth,
  readSidebarWidthSync,
  saveSidebarWidth,
} from "@/contexts/SidebarPersistence";
import {
  SidebarResizeContext,
  type SidebarResizeContextValue,
} from "@/components/layout/sidebarResizeContext";

function clampToCollapsedOrExpanded(raw: number): number {
  if (raw < SIDEBAR_COLLAPSE_THRESHOLD) return SIDEBAR_WIDTH_ICON;
  if (raw < SIDEBAR_WIDTH_MIN_EXPANDED) return SIDEBAR_WIDTH_MIN_EXPANDED;
  if (raw > SIDEBAR_WIDTH_MAX) return SIDEBAR_WIDTH_MAX;
  return raw;
}

function initialWidth(): number {
  const stored = readSidebarWidthSync();
  return clampToCollapsedOrExpanded(stored ?? SIDEBAR_WIDTH_DEFAULT);
}

interface PersistedSidebarProviderProps {
  children: ReactNode;
}

/**
 * Drives ShadCN `SidebarProvider` from a single source of truth: a width in
 * pixels. Below `SIDEBAR_COLLAPSE_THRESHOLD` the primitive switches to
 * icon-only mode; above it, the stored width is the live `--sidebar-width`.
 */
export function PersistedSidebarProvider({ children }: PersistedSidebarProviderProps) {
  const [width, setWidthState] = useState<number>(initialWidth);
  const lastExpandedRef = useRef<number>(
    width >= SIDEBAR_COLLAPSE_THRESHOLD ? width : SIDEBAR_WIDTH_DEFAULT,
  );

  // Pull a possibly-fresher value from Tauri after first paint.
  useEffect(() => {
    let cancelled = false;
    void loadSidebarWidth().then((value) => {
      if (cancelled || value === null) return;
      const next = clampToCollapsedOrExpanded(value);
      setWidthState((current) => (current === next ? current : next));
      if (next >= SIDEBAR_COLLAPSE_THRESHOLD) lastExpandedRef.current = next;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const isCollapsed = width < SIDEBAR_COLLAPSE_THRESHOLD;
  const expandedWidth = isCollapsed ? lastExpandedRef.current : width;

  const setWidth = useCallback((px: number) => {
    const next = clampToCollapsedOrExpanded(px);
    if (next >= SIDEBAR_COLLAPSE_THRESHOLD) lastExpandedRef.current = next;
    setWidthState(next);
  }, []);

  const commitWidth = useCallback(() => {
    setWidthState((current) => {
      saveSidebarWidth(current);
      return current;
    });
  }, []);

  // Keyboard shortcut (Ctrl+B) still toggles between icon-only and last expanded width.
  const handleOpenChange = useCallback((open: boolean) => {
    if (open) {
      const restore = lastExpandedRef.current || SIDEBAR_WIDTH_DEFAULT;
      setWidthState(restore);
      saveSidebarWidth(restore);
    } else {
      setWidthState(SIDEBAR_WIDTH_ICON);
      saveSidebarWidth(SIDEBAR_WIDTH_ICON);
    }
  }, []);

  const contextValue = useMemo<SidebarResizeContextValue>(
    () => ({ width: expandedWidth, isCollapsed, setWidth, commitWidth }),
    [expandedWidth, isCollapsed, setWidth, commitWidth],
  );

  const inlineStyle = {
    "--sidebar-width": `${expandedWidth}px`,
    "--sidebar-width-icon": `${SIDEBAR_WIDTH_ICON}px`,
  } as React.CSSProperties;

  return (
    <SidebarResizeContext.Provider value={contextValue}>
      <SidebarProvider
        open={!isCollapsed}
        onOpenChange={handleOpenChange}
        style={inlineStyle}
        // Override the primitive's default `flex` so we can lay TopBar above the sidebar+content row.
        className="block min-h-svh w-full"
      >
        {children}
      </SidebarProvider>
    </SidebarResizeContext.Provider>
  );
}
