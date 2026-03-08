import { type StorageType } from "@/data/stockData";
import { Snowflake, Thermometer, Package } from "lucide-react";

const config: Record<StorageType, { icon: typeof Snowflake; bg: string; text: string; label: string }> = {
  Frozen: { icon: Snowflake, bg: "bg-storage-frozen-bg", text: "text-storage-frozen", label: "F" },
  Chilled: { icon: Thermometer, bg: "bg-storage-chilled-bg", text: "text-storage-chilled", label: "C" },
  Dry: { icon: Package, bg: "bg-storage-dry-bg", text: "text-storage-dry", label: "D" },
};

export function StorageBadge({ type }: { type: StorageType }) {
  const c = config[type] || config["Chilled"];
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold tracking-wide ${c.bg} ${c.text}`}>
      <Icon className="w-3 h-3" />
      {c.label}
    </span>
  );
}
