/**
 * WorkflowActions — renders the available transition buttons for the current status.
 * Buttons are dynamically determined by the workflow config + user's permissions.
 */
import { Loader2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { getAvailableTransitions, getStatusConfig, type GRNWorkflowStatus } from "@/config/workflowConfig";

interface WorkflowActionsProps {
  currentStatus: string;
  saving: boolean;
  onTransition: (targetStatus: GRNWorkflowStatus) => void;
}

export function WorkflowActions({ currentStatus, saving, onTransition }: WorkflowActionsProps) {
  const { tier, role } = usePermissions();
  const statusConfig = getStatusConfig(currentStatus);
  const transitions = getAvailableTransitions(currentStatus, tier, role);

  if (transitions.length === 0) {
    return (
      <span className="text-[10px] text-muted-foreground italic">
        {statusConfig.stockEligible
          ? "✓ Posted to stock"
          : statusConfig.step === -1
          ? "✕ Rejected"
          : "No actions available for your role"}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {transitions.map((rule) => (
        <button
          key={`${rule.from}-${rule.to}`}
          type="button"
          onClick={() => onTransition(rule.to)}
          disabled={saving}
          className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold disabled:opacity-50 transition ${
            rule.danger
              ? "border border-red-500/25 bg-red-500/10 text-red-400 hover:bg-red-500/20"
              : rule.to === "approved"
              ? "bg-primary text-primary-foreground hover:opacity-90"
              : `border ${getStatusConfig(rule.to).badgeClass} hover:opacity-80`
          }`}
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {rule.actionLabel}
        </button>
      ))}
    </div>
  );
}
