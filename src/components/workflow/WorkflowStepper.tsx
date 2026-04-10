/**
 * WorkflowStepper — visual step indicator showing the workflow stages.
 * Highlights the current stage and marks completed stages.
 */
import { Check } from "lucide-react";
import { WORKFLOW_STEPS, WORKFLOW_STATUSES, normalizeStatus, type GRNWorkflowStatus } from "@/config/workflowConfig";

interface WorkflowStepperProps {
  currentStatus: string;
}

export function WorkflowStepper({ currentStatus }: WorkflowStepperProps) {
  const normalized = normalizeStatus(currentStatus);
  const isRejected = normalized === "rejected";
  const currentStep = isRejected ? -1 : (WORKFLOW_STATUSES[normalized]?.step ?? 1);

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-1">
      {WORKFLOW_STEPS.map((stepStatus, index) => {
        const config = WORKFLOW_STATUSES[stepStatus];
        const stepNum = config.step;
        const isCompleted = !isRejected && stepNum < currentStep;
        const isCurrent = !isRejected && stepNum === currentStep;

        return (
          <div key={stepStatus} className="flex items-center gap-1">
            {/* Step circle */}
            <div
              className={`flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold shrink-0 ${
                isCompleted
                  ? "bg-emerald-500 text-white"
                  : isCurrent
                  ? `${config.dotColor} text-white`
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {isCompleted ? <Check className="w-3 h-3" /> : stepNum}
            </div>

            {/* Step label */}
            <span
              className={`text-[9px] font-medium whitespace-nowrap ${
                isCurrent
                  ? "text-foreground"
                  : isCompleted
                  ? "text-emerald-400"
                  : "text-muted-foreground/50"
              }`}
            >
              {config.shortLabel}
            </span>

            {/* Connector line */}
            {index < WORKFLOW_STEPS.length - 1 && (
              <div
                className={`w-3 h-px shrink-0 ${
                  isCompleted ? "bg-emerald-500/50" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}

      {/* Rejected indicator */}
      {isRejected && (
        <div className="flex items-center gap-1 ml-2">
          <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
            <span className="text-[9px] font-bold text-white">✕</span>
          </div>
          <span className="text-[9px] font-medium text-red-400">Rejected</span>
        </div>
      )}
    </div>
  );
}
