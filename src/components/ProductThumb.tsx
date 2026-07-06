import { useState } from "react";
import { Package } from "lucide-react";
import { resolveProductImageUrl } from "@/features/products/productImages";
import { cn } from "@/lib/utils";

interface ProductThumbProps {
  imagePath: string | null | undefined;
  alt?: string;
  /** Pixel size of the square thumb (default 40). */
  size?: number;
  className?: string;
}

/**
 * Small lazy product thumbnail with a placeholder fallback. Never blocks or
 * reflows list rendering: fixed square box, native lazy loading, and a
 * graceful downgrade to the placeholder on load errors (e.g. offline with an
 * uncached image).
 */
export function ProductThumb({ imagePath, alt = "", size = 40, className }: ProductThumbProps) {
  const [failed, setFailed] = useState(false);
  const url = failed ? null : resolveProductImageUrl(imagePath);

  return (
    <div
      style={{ width: size, height: size }}
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted/40",
        className
      )}
    >
      {url ? (
        <img
          src={url}
          alt={alt}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Package className="h-1/2 w-1/2 text-muted-foreground/40" />
      )}
    </div>
  );
}
