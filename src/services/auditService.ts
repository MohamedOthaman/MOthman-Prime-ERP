/**
 * Audit Service — logs important actions to the audit_logs table.
 *
 * Usage:
 *   import { logAudit } from "@/services/auditService";
 *   await logAudit({ entityType: "grn", entityId: "...", action: "status_changed", ... });
 *
 * Fire-and-forget: audit logging should never block the user.
 * Errors are console-warned but not thrown.
 */

import { supabase } from "@/integrations/supabase/client";

export interface AuditEntry {
  entityType: "grn" | "user" | "product" | "invoice" | "system";
  entityId?: string;
  action: string;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Insert an audit log entry. Fire-and-forget.
 * The performed_by field is auto-populated from the current session.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? null;

    const { error } = await supabase
      .from("audit_logs" as any)
      .insert({
        entity_type: entry.entityType,
        entity_id: entry.entityId ?? null,
        action: entry.action,
        old_value: entry.oldValue ?? null,
        new_value: entry.newValue ?? null,
        performed_by: userId,
        metadata: entry.metadata ?? null,
      });

    if (error) {
      console.warn("[audit] Failed to log:", error.message, entry);
    }
  } catch (err) {
    console.warn("[audit] Unexpected error:", err);
  }
}

/**
 * Fetch audit logs for a specific entity.
 * Returns newest-first, up to `limit` entries.
 */
export async function getAuditLogs(
  entityType: string,
  entityId: string,
  limit = 50
): Promise<AuditLogRow[]> {
  const { data, error } = await supabase
    .from("audit_logs" as any)
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[audit] Failed to fetch logs:", error.message);
    return [];
  }

  return (data ?? []) as AuditLogRow[];
}

/**
 * Fetch recent audit logs across all entities.
 */
export async function getRecentAuditLogs(limit = 20): Promise<AuditLogRow[]> {
  const { data, error } = await supabase
    .from("audit_logs" as any)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[audit] Failed to fetch recent logs:", error.message);
    return [];
  }

  return (data ?? []) as AuditLogRow[];
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuditLogRow {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  old_value: Record<string, any> | null;
  new_value: Record<string, any> | null;
  performed_by: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}
