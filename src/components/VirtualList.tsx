import { useEffect, useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export interface VirtualListProps<T> {
  items: T[];
  estimateSize: number;
  getItemKey?: (index: number, item: T) => string | number;
  renderItem: (item: T, index: number) => ReactNode;
  overscan?: number;
  className?: string;
  maxHeight?: number | string;
  /** Called when scroll reaches the last estimated row — useful for infinite-loading. */
  onEndReached?: () => void;
  /** How many rows from the end to trigger onEndReached. Defaults to 8. */
  endThreshold?: number;
}

export function VirtualList<T>(props: VirtualListProps<T>) {
  const {
    items,
    estimateSize,
    getItemKey,
    renderItem,
    overscan = 8,
    className,
    maxHeight = "70vh",
    onEndReached,
    endThreshold = 8,
  } = props;

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    getItemKey: getItemKey
      ? (index) => getItemKey(index, items[index])
      : undefined,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const lastIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;

  useEffect(() => {
    if (!onEndReached) return;
    if (items.length === 0) return;
    if (lastIndex >= items.length - endThreshold) {
      onEndReached();
    }
  }, [lastIndex, items.length, endThreshold, onEndReached]);

  return (
    <div
      ref={parentRef}
      className={className}
      style={{ overflow: "auto", maxHeight, contain: "strict" }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((vi) => (
          <div
            key={vi.key}
            data-index={vi.index}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${vi.start}px)`,
            }}
          >
            {renderItem(items[vi.index], vi.index)}
          </div>
        ))}
      </div>
    </div>
  );
}