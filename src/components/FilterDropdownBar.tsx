import { useMemo, useState } from "react";
import { Check, ChevronDown, RotateCcw, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface FilterDropdownGroup {
  key: string;
  label: string;
  options: string[];
  selectionMode?: "multi" | "single";
}

interface FilterDropdownBarProps {
  groups: FilterDropdownGroup[];
  selectedValues: Record<string, string[]>;
  onToggle: (groupKey: string, value: string, selectionMode?: "multi" | "single") => void;
  onClear: () => void;
}

export function FilterDropdownBar({
  groups,
  selectedValues,
  onToggle,
  onClear,
}: FilterDropdownBarProps) {
  const [queries, setQueries] = useState<Record<string, string>>({});

  const hasActiveFilters = useMemo(
    () => Object.values(selectedValues).some((values) => values.length > 0),
    [selectedValues]
  );

  return (
    <div className="rounded-md border border-border bg-card px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {groups.map((group) => {
          const selected = selectedValues[group.key] || [];
          const query = (queries[group.key] || "").trim().toLowerCase();
          const visibleOptions = group.options.filter((option) => option.toLowerCase().includes(query));

          return (
            <Popover key={group.key}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors",
                    selected.length > 0
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-secondary text-foreground hover:bg-secondary/80"
                  )}
                >
                  <span>{group.label}</span>
                  {selected.length > 0 && (
                      <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                        {selected.length}
                      </span>
                  )}
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-0">
                <div className="border-b border-border px-3 py-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">{group.label}</h3>
                    <span className="text-xs text-muted-foreground">{selected.length} selected</span>
                  </div>
                  {selected.length > 0 && (
                    <div className="mt-2 flex max-h-20 flex-wrap gap-1 overflow-y-auto">
                      {selected.map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => onToggle(group.key, value, group.selectionMode)}
                          className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground"
                        >
                          <span className="truncate">{value}</span>
                          <X className="h-3 w-3" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder={`Search ${group.label.toLowerCase()}...`}
                    value={queries[group.key] || ""}
                    onValueChange={(value) =>
                      setQueries((current) => ({ ...current, [group.key]: value }))
                    }
                  />
                  <CommandList className="max-h-64">
                    <CommandEmpty>No results found.</CommandEmpty>
                    {visibleOptions.map((option) => {
                      const active = selected.includes(option);
                      return (
                        <CommandItem
                          key={option}
                          value={option}
                          onSelect={() => onToggle(group.key, option, group.selectionMode)}
                          className="flex items-center justify-between gap-2 px-3 py-2"
                        >
                          <span
                            className={cn(
                              "truncate text-sm",
                              active ? "font-medium text-primary" : "text-foreground"
                            )}
                          >
                            {option}
                          </span>
                          <span
                            className={cn(
                              "inline-flex h-5 w-5 items-center justify-center rounded border",
                              active
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-transparent text-transparent"
                            )}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        </CommandItem>
                      );
                    })}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          );
        })}

        <button
          type="button"
          onClick={onClear}
          disabled={!hasActiveFilters}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-primary/20 bg-muted px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw className="h-3 w-3" />
          Clear Filters
        </button>
      </div>
    </div>
  );
}
