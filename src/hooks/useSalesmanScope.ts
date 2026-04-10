/**
 * useSalesmanScope — resolves the current user's salesman record ID.
 *
 * Used to scope invoice and customer queries for the `salesman` and `sales` roles.
 * Matches by email: looks up salesmen.email === auth user email.
 *
 * Returns:
 *   salesmanId — string UUID if found, null if no match or role is not salesman/sales
 *   loading    — true while the query is running
 *
 * TODO (Phase K): Enforce this scoping at the DB layer via RLS policy:
 *   CREATE POLICY salesman_own_invoices ON sales_headers FOR SELECT
 *   USING (salesman_id = (SELECT id FROM salesmen WHERE email = (
 *     SELECT email FROM profiles WHERE id = auth.uid()
 *   )) OR get_user_role() NOT IN ('salesman', 'sales'));
 *
 * For now, UI-layer filtering via this hook is the enforcement mechanism.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/reports/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";

export interface SalesmanScope {
  salesmanId: string | null;
  loading: boolean;
}

export function useSalesmanScope(): SalesmanScope {
  const { user, role: authRole } = useAuth();
  const { role } = usePermissions();

  const [salesmanId, setSalesmanId] = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);

  const isSalesmanRole = role === "salesman" || role === "sales";

  useEffect(() => {
    if (!isSalesmanRole || !user?.email) {
      setSalesmanId(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function resolve() {
      try {
        const { data, error } = await (supabase as any)
          .from("salesmen")
          .select("id")
          .eq("email", user!.email)
          .maybeSingle();

        if (!cancelled) {
          if (error) {
            console.warn("[useSalesmanScope] Failed to resolve salesman:", error.message);
            setSalesmanId(null);
          } else {
            setSalesmanId((data as any)?.id ?? null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("[useSalesmanScope] Unexpected error:", err);
          setSalesmanId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void resolve();
    return () => { cancelled = true; };
  }, [isSalesmanRole, user?.email]);

  return { salesmanId, loading };
}
