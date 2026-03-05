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
  height = 180, 
  itemHeight = 40,
  label 
}: WheelPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const visibleCount = Math.floor(height / itemHeight);
  const padding = Math.floor(visibleCount / 2);

  // Padded items for infinite-feel
  const paddedItems = [
    ...Array(padding).fill(null),
    ...items,
    ...Array(padding).fill(null),
  ];

  const scrollToValue = useCallback((val: number | string, smooth = false) => {
    const idx = items.findIndex(i => i.value === val);
    if (idx >= 0 && containerRef.current) {
      containerRef.current.scrollTo({
        top: idx * itemHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    }
  }, [items, itemHeight]);

  useEffect(() => {
    scrollToValue(selectedValue);
  }, []);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    isScrollingRef.current = true;

    timeoutRef.current = setTimeout(() => {
      if (!containerRef.current) return;
      const scrollTop = containerRef.current.scrollTop;
      const idx = Math.round(scrollTop / itemHeight);
      const clampedIdx = Math.max(0, Math.min(idx, items.length - 1));
      
      // Snap to position
      containerRef.current.scrollTo({
        top: clampedIdx * itemHeight,
        behavior: "smooth",
      });

      const item = items[clampedIdx];
      if (item && item.value !== selectedValue) {
        onChange(item.value);
      }
      isScrollingRef.current = false;
    }, 80);
  }, [items, itemHeight, selectedValue, onChange]);

  return (
    <div className="flex flex-col items-center">
      {label && (
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 font-semibold">
          {label}
        </span>
      )}
      <div 
        className="relative overflow-hidden rounded-lg bg-secondary border border-border"
        style={{ height, width: "100%" }}
      >
        {/* Selection highlight */}
        <div 
          className="absolute left-0 right-0 pointer-events-none z-10 border-y border-primary/40 bg-primary/10"
          style={{ 
            top: padding * itemHeight, 
            height: itemHeight 
          }}
        />
        {/* Top/bottom fade */}
        <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-secondary to-transparent z-10 pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-secondary to-transparent z-10 pointer-events-none" />
        
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="h-full overflow-y-scroll wheel-picker"
          style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
        >
          {paddedItems.map((item, i) => {
            const isSelected = item && item.value === selectedValue;
            return (
              <div
                key={i}
                className={`flex items-center justify-center font-mono text-sm transition-all wheel-picker-item ${
                  item 
                    ? isSelected 
                      ? "text-foreground font-bold scale-110" 
                      : "text-muted-foreground"
                    : ""
                }`}
                style={{ height: itemHeight, minHeight: itemHeight }}
              >
                {item ? item.label : ""}
              </div>
            );
          })}
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
  value: string; // YYYY-MM-DD
  onChange: (val: string) => void;
  label?: string;
}

export function DateWheel({ value, onChange, label }: DateWheelProps) {
  const parsed = value ? new Date(value) : new Date();
  const [year, setYear] = useState(parsed.getFullYear());
  const [month, setMonth] = useState(parsed.getMonth() + 1);
  const [day, setDay] = useState(parsed.getDate());

  const years = [];
  for (let y = 2020; y <= 2030; y++) {
    years.push({ label: String(y), value: y });
  }

  const months = [];
  for (let m = 1; m <= 12; m++) {
    months.push({ label: String(m).padStart(2, "0"), value: m });
  }

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
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 font-semibold">
          {label}
        </span>
      )}
      <div className="grid grid-cols-3 gap-2">
        <WheelPicker
          items={years}
          selectedValue={year}
          onChange={(v) => { setYear(v as number); emitChange(v as number, month, day); }}
          label="Year"
          height={160}
        />
        <WheelPicker
          items={months}
          selectedValue={month}
          onChange={(v) => { setMonth(v as number); emitChange(year, v as number, day); }}
          label="Month"
          height={160}
        />
        <WheelPicker
          items={days}
          selectedValue={Math.min(day, daysInMonth)}
          onChange={(v) => { setDay(v as number); emitChange(year, month, v as number); }}
          label="Day"
          height={160}
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
      height={120}
      label="Filter"
    />
  );
}
