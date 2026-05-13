import { ArrowDownToLine, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { UpdaterState } from "@/hooks/useAppUpdater";

interface UpdateBadgeProps {
  state: UpdaterState;
  onClick: () => void;
}

/**
 * Compact topbar badge that surfaces update state.
 * Shows nothing when idle/checking — only surfaces actionable states.
 */
export function UpdateBadge({ state, onClick }: UpdateBadgeProps) {
  if (state.status === "checking") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-60" disabled>
              <RefreshCw className="h-4 w-4 animate-spin" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Checking for updates…</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (state.status === "available") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 relative"
              onClick={onClick}
            >
              <ArrowDownToLine className="h-4 w-4 text-primary" />
              {/* Pulsing dot indicator */}
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary animate-pulse" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Update available: v{state.info.version} — click to install
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (state.status === "downloading") {
    const pct = state.progress.percent;
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
              <ArrowDownToLine className="h-4 w-4 animate-bounce text-primary" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Downloading update… {pct != null ? `${Math.round(pct)}%` : ""}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (state.status === "ready") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onClick}
            >
              <RefreshCw className="h-4 w-4 text-green-500" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Update installed — click to restart</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return null;
}
