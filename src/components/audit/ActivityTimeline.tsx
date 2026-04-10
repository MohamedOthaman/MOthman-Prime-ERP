/**
 * ActivityTimeline — displays audit log entries as a vertical timeline.
 * Used in GRNDetailsPage and potentially other entity detail pages.
 */
import { useEffect, useState } from "react";
import { Clock, User, ArrowRight } from "lucide-react";
import { getAuditLogs, type AuditLogRow } from "@/services/auditService";
import { getStatusConfig } from "@/config/workflowConfig";

interface ActivityTimelineProps {
  entityType: string;
  entityId: string;
  /** Refresh counter — increment to re-fetch */
  refreshKey?: number;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const day = date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

function getActionLabel(action: string): string {
  switch (action) {
    case "created": return "Created";
    case "status_changed": return "Status Changed";
    case "approved": return "Approved";
    case "rejected": return "Rejected";
    case "updated": return "Updated";
    case "role_changed": return "Role Changed";
    case "activated": return "Activated";
    case "deactivated": return "Deactivated";
    case "password_reset": return "Password Reset";
    default: return action.replace(/_/g, " ");
  }
}

function getActionColor(action: string): string {
  if (action === "approved") return "bg-emerald-500";
  if (action === "rejected") return "bg-red-500";
  if (action === "created") return "bg-blue-500";
  if (action === "deactivated") return "bg-red-400";
  if (action === "activated") return "bg-emerald-400";
  return "bg-muted-foreground";
}

export function ActivityTimeline({ entityType, entityId, refreshKey = 0 }: ActivityTimelineProps) {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!entityId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    getAuditLogs(entityType, entityId, 30).then((data) => {
      setLogs(data);
      setLoading(false);
    });
  }, [entityType, entityId, refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
        <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        Loading activity...
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
        <Clock className="w-3.5 h-3.5" />
        No activity recorded yet
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {logs.map((log, index) => {
        const oldStatus = log.old_value?.status;
        const newStatus = log.new_value?.status;

        return (
          <div key={log.id} className="flex gap-3 group">
            {/* Timeline line + dot */}
            <div className="flex flex-col items-center">
              <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${getActionColor(log.action)}`} />
              {index < logs.length - 1 && (
                <div className="w-px flex-1 bg-border group-hover:bg-muted-foreground/30 transition" />
              )}
            </div>

            {/* Content */}
            <div className="pb-3 min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-foreground">
                  {getActionLabel(log.action)}
                </span>
                {oldStatus && newStatus && (
                  <span className="inline-flex items-center gap-1 text-[10px]">
                    <span className={`rounded px-1 py-0.5 border ${getStatusConfig(oldStatus).badgeClass}`}>
                      {getStatusConfig(oldStatus).shortLabel}
                    </span>
                    <ArrowRight className="w-2.5 h-2.5 text-muted-foreground" />
                    <span className={`rounded px-1 py-0.5 border ${getStatusConfig(newStatus).badgeClass}`}>
                      {getStatusConfig(newStatus).shortLabel}
                    </span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-muted-foreground">
                  {formatTime(log.created_at)}
                </span>
                {log.performed_by && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <User className="w-2.5 h-2.5" />
                    {log.metadata?.user_name || log.metadata?.user_email || log.performed_by.slice(0, 8)}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
