/**
 * AlertsPanel — derived notification alerts for dashboards.
 * Queries real data to show pending approvals, rejected items, and system alerts.
 * No separate notification table needed — all derived from existing data.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Package,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface AlertItem {
  id: string;
  type: "warning" | "danger" | "info" | "success";
  title: string;
  description: string;
  path?: string;
  count?: number;
}

export function AlertsPanel() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAlerts() {
      setLoading(true);
      const derivedAlerts: AlertItem[] = [];

      try {
        // 1. Pending GRN approvals (municipality_pending or inspected)
        const { data: pendingGRNs, error: grnErr } = await supabase
          .from("receiving_headers" as any)
          .select("id, status")
          .in("status", ["municipality_pending", "inspected", "received"])
          .limit(100);

        if (!grnErr && pendingGRNs) {
          const muniCount = pendingGRNs.filter((r: any) => r.status === "municipality_pending").length;
          const inspectedCount = pendingGRNs.filter((r: any) => r.status === "inspected").length;
          const receivedCount = pendingGRNs.filter((r: any) => r.status === "received").length;

          if (muniCount > 0) {
            derivedAlerts.push({
              id: "grn-muni-pending",
              type: "warning",
              title: "Municipality Approval Pending",
              description: `${muniCount} GRN(s) waiting for municipality/health approval`,
              path: "/grn",
              count: muniCount,
            });
          }

          if (inspectedCount > 0) {
            derivedAlerts.push({
              id: "grn-inspected",
              type: "info",
              title: "QC Inspected — Ready to Submit",
              description: `${inspectedCount} GRN(s) inspected, ready for municipality submission`,
              path: "/grn",
              count: inspectedCount,
            });
          }

          if (receivedCount > 0) {
            derivedAlerts.push({
              id: "grn-received",
              type: "info",
              title: "Received — Awaiting Inspection",
              description: `${receivedCount} GRN(s) received, awaiting QC inspection`,
              path: "/grn",
              count: receivedCount,
            });
          }
        }

        // 2. Rejected GRNs (recent)
        const { data: rejectedGRNs, error: rejErr } = await supabase
          .from("receiving_headers" as any)
          .select("id")
          .eq("status", "rejected")
          .limit(100);

        if (!rejErr && rejectedGRNs && rejectedGRNs.length > 0) {
          derivedAlerts.push({
            id: "grn-rejected",
            type: "danger",
            title: "Rejected GRNs",
            description: `${rejectedGRNs.length} GRN(s) have been rejected`,
            path: "/grn",
            count: rejectedGRNs.length,
          });
        }

        // 3. Inactive users
        const { data: inactiveUsers, error: userErr } = await supabase
          .from("profiles")
          .select("id")
          .eq("is_active", false);

        if (!userErr && inactiveUsers && inactiveUsers.length > 0) {
          derivedAlerts.push({
            id: "users-inactive",
            type: "warning",
            title: "Inactive User Accounts",
            description: `${inactiveUsers.length} user account(s) are disabled`,
            path: "/admin/users",
            count: inactiveUsers.length,
          });
        }

        // 4. Low stock placeholder
        derivedAlerts.push({
          id: "stock-low-placeholder",
          type: "info",
          title: "Low Stock Monitoring",
          description: "Low stock alerts will be available after threshold configuration",
        });

      } catch (err) {
        console.warn("[alerts] Failed to load alerts:", err);
      }

      // If no real alerts, show "all clear"
      if (derivedAlerts.length === 0) {
        derivedAlerts.push({
          id: "all-clear",
          type: "success",
          title: "All Clear",
          description: "No pending alerts at this time",
        });
      }

      setAlerts(derivedAlerts);
      setLoading(false);
    }

    void loadAlerts();
  }, []);

  const iconMap = {
    warning: AlertTriangle,
    danger: XCircle,
    info: Clock,
    success: CheckCircle2,
  };

  const colorMap = {
    warning: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    danger: "text-red-400 bg-red-500/10 border-red-500/20",
    info: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    success: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Alerts</h2>
        </div>
        <div className="flex justify-center py-4">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="w-4 h-4 text-amber-400" />
        <h2 className="text-sm font-semibold text-foreground">Alerts</h2>
        {alerts.filter((a) => a.type === "warning" || a.type === "danger").length > 0 && (
          <span className="ml-auto inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">
            {alerts.filter((a) => a.type === "warning" || a.type === "danger").length}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {alerts.map((alert) => {
          const Icon = iconMap[alert.type];
          const colors = colorMap[alert.type];

          return (
            <button
              key={alert.id}
              type="button"
              onClick={() => alert.path && navigate(alert.path)}
              disabled={!alert.path}
              className={`w-full text-left flex items-start gap-3 rounded-lg border px-3 py-2.5 transition ${colors} ${
                alert.path ? "hover:opacity-80 cursor-pointer" : "cursor-default"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">{alert.title}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{alert.description}</p>
              </div>
              {alert.count != null && (
                <span className="text-xs font-mono font-bold text-foreground shrink-0">
                  {alert.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
