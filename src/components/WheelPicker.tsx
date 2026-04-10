import { useRef, useEffect, useCallback, useState } from "react";

interface WheelPickerProps {
  items: { label: string; value: number | string }[];
  selectedValue: number | string;
  onChange: (value: number | string) => void;
  height?: number;
  itemHeight?: number;
  label?: string;
}

export function WheelPicker({ 
  items, 
  selectedValue, 
  onChange, 
  height = 200, 
  itemHeight = 44,
  label 
}: WheelPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isUserScrolling = useRef(false);
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const centerOffset = (height - itemHeight) / 2;

  const getSelectedIndex = useCallback(() => {
    return items.findIndex(i => i.value === selectedValue);
  }, [items, selectedValue]);

  const scrollToIndex = useCallback((idx: number, smooth = false) => {
    if (!containerRef.current) return;
    const target = idx * itemHeight;
    if (smooth) {
      containerRef.current.scrollTo({ top: target, behavior: "smooth" });
    } else {
      containerRef.current.scrollTop = target;
    }
  }, [itemHeight]);

  // Initial scroll
  useEffect(() => {
    const idx = getSelectedIndex();
    if (idx < 0) return;

    const rafId = requestAnimationFrame(() => scrollToIndex(idx, false));
    return () => cancelAnimationFrame(rafId);
  }, [getSelectedIndex, scrollToIndex]);

  // Sync when value changes externally
  useEffect(() => {
    if (isUserScrolling.current) return;
    const idx = getSelectedIndex();
    if (idx >= 0) scrollToIndex(idx, true);
  }, [getSelectedIndex, scrollToIndex, selectedValue]);

  const settleToNearest = useCallback(() => {
    if (!containerRef.current) return;
    const scrollTop = containerRef.current.scrollTop;
    const idx = Math.round(scrollTop / itemHeight);
    const clamped = Math.max(0, Math.min(idx, items.length - 1));
    scrollToIndex(clamped, true);
    
    const item = items[clamped];
    if (item && item.value !== selectedValue) {
      onChange(item.value);
    }
  }, [items, itemHeight, selectedValue, onChange, scrollToIndex]);

  const handleScrollEnd = useCallback(() => {
    if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
    settleTimeoutRef.current = setTimeout(() => {
      isUserScrolling.current = false;
      settleToNearest();
    }, 60);
  }, [settleToNearest]);

  const handleScroll = useCallback(() => {
    isUserScrolling.current = true;
    handleScrollEnd();
  }, [handleScrollEnd]);

  return (
    <div className="flex flex-col items-center">
      {label && (
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 font-semibold">
          {label}
        </span>
      )}
      <div 
        className="relative overflow-hidden"
        style={{ height, width: "100%", perspective: "1000px" }}
      >
        {/* iOS-style selection indicator */}
        <div 
          className="absolute left-1 right-1 pointer-events-none z-20 rounded-lg"
          style={{ 
            top: centerOffset, 
            height: itemHeight,
            background: "hsla(var(--foreground) / 0.08)",
            borderTop: "0.5px solid hsla(var(--foreground) / 0.15)",
            borderBottom: "0.5px solid hsla(var(--foreground) / 0.15)",
          }}
        />
        
        {/* Top fade mask */}
        <div 
          className="absolute top-0 left-0 right-0 z-10 pointer-events-none"
          style={{ 
            height: centerOffset,
            background: "linear-gradient(to bottom, hsl(var(--background)), hsla(var(--background) / 0.7), transparent)",
          }}
        />
        {/* Bottom fade mask */}
        <div 
          className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none"
          style={{ 
            height: centerOffset,
            background: "linear-gradient(to top, hsl(var(--background)), hsla(var(--background) / 0.7), transparent)",
          }}
        />
        
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="h-full overflow-y-scroll wheel-picker"
          style={{ 
            scrollbarWidth: "none", 
            WebkitOverflowScrolling: "touch",
            scrollSnapType: "y mandatory",
            scrollPaddingTop: centerOffset,
            scrollPaddingBottom: centerOffset,
          }}
        >
          <div style={{ height: centerOffset, minHeight: centerOffset }} />
          {items.map((item, i) => {
            const isSelected = item.value === selectedValue;
            return (
              <div
                key={item.value}
                className="wheel-picker-item flex items-center justify-center select-none"
                style={{ 
                  height: itemHeight, 
                  minHeight: itemHeight,
                  scrollSnapAlign: "center",
                  fontSize: isSelected ? "20px" : "18px",
                  fontWeight: isSelected ? 600 : 400,
                  color: item 
                    ? isSelected 
                      ? "hsl(var(--foreground))" 
                      : "hsla(var(--muted-foreground) / 0.6)"
                    : "transparent",
                  fontFamily: "var(--font-mono)",
                  transition: "color 0.15s, font-weight 0.15s, font-size 0.15s",
                  letterSpacing: "0.02em",
                }}
                onClick={() => {
                  scrollToIndex(i, true);
                  onChange(item.value);
                }}
              >
                {item.label}
              </div>
            );
          })}
          <div style={{ height: centerOffset, minHeight: centerOffset }} />
        </div>
      </div>
    </div>
  );
}

// Number wheel picker
interface NumberWheelProps {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  label?: string;
}

export function NumberWheel({ value, onChange, min = 0, max = 999, label }: NumberWheelProps) {
  const items = [];
  for (let i = min; i <= max; i++) {
    items.push({ label: String(i), value: i });
  }
  return (
    <WheelPicker
      items={items}
      selectedValue={value}
      onChange={(v) => onChange(v as number)}
      label={label}
    />
  );
}

// Date wheel picker
interface DateWheelProps {
  value: string;
  onChange: (val: string) => void;
  label?: string;
}

export function DateWheel({ value, onChange, label }: DateWheelProps) {
  const parsed = value ? new Date(value) : new Date();
  const [year, setYear] = useState(parsed.getFullYear());
  const [month, setMonth] = useState(parsed.getMonth() + 1);
  const [day, setDay] = useState(parsed.getDate());

  useEffect(() => {
    const next = value ? new Date(value) : new Date();
    if (Number.isNaN(next.getTime())) return;
    setYear(next.getFullYear());
    setMonth(next.getMonth() + 1);
    setDay(next.getDate());
  }, [value]);

  const years = [];
  for (let y = 2020; y <= 2030; y++) {
    years.push({ label: String(y), value: y });
  }

  const months = [
    "Jan","Feb","Mar","Apr","May","Jun",
    "Jul","Aug","Sep","Oct","Nov","Dec"
  ].map((m, i) => ({ label: m, value: i + 1 }));

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({ label: String(d).padStart(2, "0"), value: d });
  }

  const emitChange = useCallback((y: number, m: number, d: number) => {
    const maxD = new Date(y, m, 0).getDate();
    const clampedD = Math.min(d, maxD);
    const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(clampedD).padStart(2, "0")}`;
    onChange(dateStr);
  }, [onChange]);

  return (
    <div className="flex flex-col">
      {label && (
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 font-semibold">
          {label}
        </span>
      )}
      <div className="grid grid-cols-3 gap-1">
        <WheelPicker
          items={days}
          selectedValue={Math.min(day, daysInMonth)}
          onChange={(v) => { setDay(v as number); emitChange(year, month, v as number); }}
          label="Day"
          height={180}
        />
        <WheelPicker
          items={months}
          selectedValue={month}
          onChange={(v) => { setMonth(v as number); emitChange(year, v as number, day); }}
          label="Month"
          height={180}
        />
        <WheelPicker
          items={years}
          selectedValue={year}
          onChange={(v) => { setYear(v as number); emitChange(v as number, month, day); }}
          label="Year"
          height={180}
        />
      </div>
    </div>
  );
}

// Day filter wheel for reports
interface DayFilterWheelProps {
  value: number;
  onChange: (val: number) => void;
  options: number[];
}

export function DayFilterWheel({ value, onChange, options }: DayFilterWheelProps) {
  const items = options.map(d => ({ label: `${d} days`, value: d }));
  return (
    <WheelPicker
      items={items}
      selectedValue={value}
      onChange={(v) => onChange(v as number)}
      height={160}
      label="Filter"
    />
  );
}
