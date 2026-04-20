/**
 * Loosens the strictly-typed Supabase client so app code can query tables
 * and columns that exist in the database but are not yet reflected in the
 * auto-generated `src/integrations/supabase/types.ts` (which is regenerated
 * from the live schema by Lovable Cloud).
 *
 * This is a build-only escape hatch — runtime behavior is unchanged. Once
 * the schema/types catch up, this file can be deleted to restore full
 * type-safety.
 */
import "@supabase/supabase-js";

declare module "@/integrations/supabase/client" {
  // Re-declare `supabase` as `any`, overriding the generic-typed export.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const supabase: any;
}
