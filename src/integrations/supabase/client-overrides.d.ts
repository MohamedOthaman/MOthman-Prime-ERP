/**
 * Loosens the strictly-typed Supabase client so app code can query tables
 * and columns that exist in the database but are not yet reflected in the
 * auto-generated `src/integrations/supabase/types.ts` (regenerated from the
 * live schema by Lovable Cloud).
 *
 * Build-only escape hatch — runtime behavior is unchanged. Delete once
 * the generated types catch up to restore full type safety.
 */
import "@supabase/supabase-js";

declare module "@supabase/supabase-js" {
  interface SupabaseClient {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from(relation: string): any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rpc(fn: string, args?: Record<string, unknown>): any;
  }
}
