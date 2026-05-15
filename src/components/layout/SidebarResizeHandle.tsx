import { useCallback, useEffect, useRef } from "react";
import { useSidebarResize } from "@/components/layout/sidebarResizeContext";
import { useLang } from "@/contexts/LanguageContext";

/**
 * Thin draggable handle pinned to the right edge of the sidebar. Drag to
 * resize; release to persist. Below `SIDEBAR_COLLAPSE_THRESHOLD` the
 * sidebar auto-snaps to icon-only mode.
 */
export function SidebarResizeHandle() {
  const { setWidth, commitWidth } = useSidebarResize();
  const { dir } = useLang();
  const draggingRef = useRef(false);
  const isRtl = dir === "rtl";

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (!draggingRef.current) return;
      // LTR sidebar is at left:0 → width = clientX.
      // RTL sidebar is at right:0 → width = window width − clientX.
      const width = isRtl ? window.innerWidth - event.clientX : event.clientX;
      setWidth(width);
    },
    [setWidth, isRtl],
  );

  const stopDragging = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    commitWidth();
  }, [commitWidth]);

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [handlePointerMove, stopDragging]);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <button
      type="button"
      aria-label="Resize sidebar"
      onPointerDown={handlePointerDown}
      onDoubleClick={() => {
        // Double-click resets to default width.
        setWidth(248);
        commitWidth();
      }}
      className={
        "group absolute inset-y-0 z-30 w-1.5 cursor-ew-resize " +
        (isRtl ? "left-0 " : "right-0 ") +
        "after:absolute after:inset-y-0 after:w-px after:bg-border/40 " +
        (isRtl ? "after:left-0 " : "after:right-0 ") +
        "hover:after:bg-primary/50 hover:after:w-[2px] after:transition-all"
      }
    />
  );
}
