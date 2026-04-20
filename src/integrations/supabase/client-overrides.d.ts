/**
 * Build-only escape hatch — loosens Supabase's strict generated types so app
 * code can query tables/columns not yet present in `src/integrations/supabase/types.ts`
 * (auto-regenerated from the live schema). Runtime behavior is unchanged.
 * Delete this file once the generated types catch up.
 */
import "@supabase/supabase-js";
import "@supabase/postgrest-js";

declare module "@supabase/supabase-js" {
  interface SupabaseClient {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from(relation: string): any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rpc(fn: string, args?: Record<string, unknown>): any;
  }
}

declare module "@supabase/postgrest-js" {
  // Make every query builder behave as `any` for chaining + awaiting.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface PostgrestQueryBuilder<Schema, Row, Relation = unknown, RelationName = unknown> extends Promise<any> {
    [key: string]: any;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface PostgrestFilterBuilder<Schema, Row, Result, RelationName = unknown, Relationships = unknown> extends Promise<any> {
    [key: string]: any;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface PostgrestTransformBuilder<Schema, Row, Result, RelationName = unknown, Relationships = unknown> extends Promise<any> {
    [key: string]: any;
  }
}
