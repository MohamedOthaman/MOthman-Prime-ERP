import { cn } from "@/lib/utils";

interface AppBrandProps {
  compact?: boolean;
  className?: string;
  showDeveloperCredit?: boolean;
}

export function AppBrand({
  compact = false,
  className,
  showDeveloperCredit = false,
}: AppBrandProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <img
        src="/food-choice-logo.png"
        alt="Food Choice ERP"
        className={cn(
          "w-auto shrink-0 object-contain rounded-xl",
          compact ? "h-9" : "h-20"
        )}
      />
      <div className="min-w-0">
        <p
          className={cn(
            "font-bold tracking-tight text-foreground",
            compact ? "text-sm" : "text-2xl"
          )}
        >
          Food Choice ERP
        </p>
        {compact ? null : (
          <p className="text-sm text-muted-foreground">Food Solutions Providers</p>
        )}
        {showDeveloperCredit ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Developed by Mohamed Othman
          </p>
        ) : null}
      </div>
    </div>
  );
}
