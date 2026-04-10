import { Eye, X, ArrowLeft } from "lucide-react";
import { usePreviewMode } from "@/contexts/PreviewModeContext";
import { useNavigate } from "react-router-dom";

/**
 * Sticky banner rendered below the TopBar whenever preview mode is active.
 * Gives the admin a constant, obvious signal that they are seeing another role's view,
 * and provides a one-click exit back to their real dashboard.
 */
export function PreviewModeBanner() {
  const { isPreviewMode, previewRole, exitPreview } = usePreviewMode();
  const navigate = useNavigate();

  if (!isPreviewMode) return null;

  const roleLabel = (previewRole ?? "").replace(/_/g, " ").toUpperCase();

  return (
    <div className="sticky top-11 z-50 w-full bg-amber-500 text-amber-950">
      <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-3">
        <Eye className="w-3.5 h-3.5 shrink-0" />

        <p className="text-[12px] font-semibold flex-1 min-w-0 truncate">
          Previewing as{" "}
          <span className="font-mono font-bold">{roleLabel}</span>
          <span className="font-normal opacity-70 ml-2 hidden sm:inline">
            — Your actual permissions are unchanged
          </span>
        </p>

        <button
          onClick={() => navigate("/admin/preview-as")}
          className="flex items-center gap-1 text-[11px] font-semibold bg-amber-950/15 hover:bg-amber-950/25 px-2.5 py-1 rounded-md transition shrink-0"
        >
          <ArrowLeft className="w-3 h-3" />
          Switch Role
        </button>

        <button
          onClick={() => {
            exitPreview();
            navigate("/");
          }}
          className="flex items-center gap-1 text-[11px] font-semibold bg-amber-950/20 hover:bg-amber-950/35 px-2.5 py-1 rounded-md transition shrink-0"
        >
          <X className="w-3 h-3" />
          Exit Preview
        </button>
      </div>
    </div>
  );
}
