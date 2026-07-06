/**
 * Audit Service — logs important actions to the audit_logs table.
 *
 * Usage:
 *   import { logAudit } from "@/services/auditService";
 *   await logAudit({ entityType: "grn", entityId: "...", action: "status_changed", ... });
 *
 * Fire-and-forget: audit logging should never block the user.
 * Errors are console-warned but not thrown.
 *
 * The live audit_logs columns are entity_table / old_data / new_data / meta /
 * performed_at; this service maps them to the app-facing AuditLogRow shape
 * (entity_type / old_value / new_value / metadata / created_at) so consumers
 * stay stable.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export interface AuditEntry {
  entityType: "grn" | "user" | "product" | "invoice" | "system";
  entityId?: string;
  action: string;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  metadata?: Record<string, any>;
}

type AuditLogDbRow = {
  id: string;
  entity_table: string;
  entity_id: string | null;
  action: string;
  old_data: Json | null;
  new_data: Json | null;
  performed_by: string | null;
  meta: Json | null;
  performed_at: string;
  description: string | null;
};

function toAppRow(row: AuditLogDbRow): AuditLogRow {
  return {
    id: row.id,
    entity_type: row.entity_table,
    entity_id: row.entity_id,
    action: row.action,
    old_value: (row.old_data as Record<string, any> | null) ?? null,
    new_value: (row.new_data as Record<string, any> | null) ?? null,
    performed_by: row.performed_by,
    metadata: (row.meta as Record<string, any> | null) ?? null,
    created_at: row.performed_at,
  };
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
      .from("audit_logs")
      .insert({
        entity_table: entry.entityType,
        entity_id: entry.entityId ?? null,
        action: entry.action,
        old_data: (entry.oldValue ?? null) as Json,
        new_data: (entry.newValue ?? null) as Json,
        performed_by: userId,
        meta: (entry.metadata ?? null) as Json,
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
    .from("audit_logs")
    .select("*")
    .eq("entity_table", entityType)
    .eq("entity_id", entityId)
    .order("performed_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[audit] Failed to fetch logs:", error.message);
    return [];
  }

  return ((data ?? []) as AuditLogDbRow[]).map(toAppRow);
}

/**
 * Fetch recent audit logs across all entities.
 */
export async function getRecentAuditLogs(limit = 20): Promise<AuditLogRow[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .order("performed_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[audit] Failed to fetch recent logs:", error.message);
    return [];
  }

  return ((data ?? []) as AuditLogDbRow[]).map(toAppRow);
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
      .from("audit_logs")
      .select("*", { count: "exact" })
      .order("performed_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.entityType) {
      query = query.eq("entity_table", filters.entityType);
    }
    if (filters.fromDate) {
      query = query.gte("performed_at", `${filters.fromDate}T00:00:00Z`);
    }
    if (filters.toDate) {
      query = query.lte("performed_at", `${filters.toDate}T23:59:59Z`);
    }
    if (filters.performedBy) {
      query = query.eq("performed_by", filters.performedBy);
    }
    if (filters.actionSearch) {
      query = query.ilike("action", `%${filters.actionSearch}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      console.warn("[audit] Failed to fetch logs:", error.message);
      return { rows: [], total: 0, hasMore: false };
    }

    const rows = ((data ?? []) as AuditLogDbRow[]).map(toAppRow);
    const total   = count ?? 0;
    const hasMore = offset + rows.length < total;

    return { rows, total, hasMore };
  } catch (err) {
    console.warn("[audit] Unexpected error:", err);
    return { rows: [], total: 0, hasMore: false };
  }
}
