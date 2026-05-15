import { cn } from "@/lib/utils";
import { useLang } from "@/contexts/LanguageContext";

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
  const { t } = useLang();

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <img
        src="/food-choice-logo.png"
        alt={t("brandName", "Food Choice ERP")}
        className={cn(
          "w-auto shrink-0 object-contain",
          compact ? "h-9" : "h-20",
        )}
      />

      <div className="min-w-0">
        <p
          className={cn(
            "font-bold tracking-tight text-foreground leading-tight",
            compact ? "text-sm" : "text-2xl",
          )}
        >
          {t("brandName", "Food Choice ERP")}
        </p>
        {compact ? null : (
          <p className="text-sm text-muted-foreground">
            {t("brandTagline", "Food Solutions Providers")}
          </p>
        )}
        {showDeveloperCredit ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("developedBy", "Developed by Mohamed Othman")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
