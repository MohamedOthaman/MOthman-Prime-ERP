import { cn } from "@/lib/utils";

export interface FilterChipGroup {
  key: string;
  label: string;
  options: string[];
  selectionMode?: "multi" | "single";
}

interface FilterChipGroupsProps {
  groups: FilterChipGroup[];
  selectedValues: Record<string, string[]>;
  onToggle: (groupKey: string, value: string, selectionMode?: "multi" | "single") => void;
}

export function FilterChipGroups({
  groups,
  selectedValues,
  onToggle,
}: FilterChipGroupsProps) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      {groups.map((group) => {
        if (group.options.length === 0) return null;

        return (
          <div key={group.key} className="flex flex-col gap-2 lg:flex-row lg:items-start">
            <div className="w-full shrink-0 text-sm font-semibold text-foreground lg:w-28">
              {group.label}
            </div>
            <div className="flex flex-wrap gap-2">
              {group.options.map((option) => {
                const active = (selectedValues[group.key] || []).includes(option);

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onToggle(group.key, option, group.selectionMode)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "border-green-600 bg-green-600 text-white"
                        : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                    )}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
