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

export interface AuditLogFilters {
  entityType?: string;    // "grn" | "invoice" | "user" | "product" | "system" | ""
  fromDate?: string;      // ISO date string "YYYY-MM-DD"
  toDate?: string;        // ISO date string "YYYY-MM-DD"
  actionSearch?: string;  // partial match on action field
  performedBy?: string;   // exact match on performed_by UUID
}

export interface AuditLogPage {
  rows: AuditLogRow[];
  total: number;
  hasMore: boolean;
}

/**
 * Fetch paginated, filterable audit log rows for the AuditLogPage.
 * Returns rows newest-first, with total count and hasMore flag.
 */
export async function getAuditLogsByFilter(
  filters: AuditLogFilters = {},
  limit = 50,
  offset = 0
): Promise<AuditLogPage> {
  try {
    let query = supabase
      .from("audit_logs" as any)
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.entityType) {
      query = query.eq("entity_type", filters.entityType);
    }
    if (filters.fromDate) {
      query = query.gte("created_at", `${filters.fromDate}T00:00:00Z`);
    }
    if (filters.toDate) {
      query = query.lte("created_at", `${filters.toDate}T23:59:59Z`);
    }
    if (filters.performedBy) {
      query = query.eq("performed_by", filters.performedBy);
    }
    // Note: actionSearch is filtered client-side (no server ILIKE support via JS SDK without rpc)

    const { data, error, count } = await query;

    if (error) {
      console.warn("[audit] Failed to fetch logs:", error.message);
      return { rows: [], total: 0, hasMore: false };
    }

    let rows = (data ?? []) as AuditLogRow[];

    // Client-side action search filter
    if (filters.actionSearch) {
      const needle = filters.actionSearch.toLowerCase();
      rows = rows.filter(r => r.action.toLowerCase().includes(needle));
    }

    const total   = count ?? 0;
    const hasMore = offset + rows.length < total;

    return { rows, total, hasMore };
  } catch (err) {
    console.warn("[audit] Unexpected error:", err);
    return { rows: [], total: 0, hasMore: false };
  }
}
