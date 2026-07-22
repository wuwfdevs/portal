import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Service-role Supabase client. Bypasses Row Level Security entirely.
 *
 * Only import this inside server actions / route handlers, and only for the
 * specific operations RLS cannot express — currently just
 * `auth.admin.inviteUserByEmail` when inviting a new user. Every other read
 * or write should go through lib/supabase/server.ts so RLS still applies.
 * The `server-only` import above makes accidentally bundling this into
 * client code a build error rather than a runtime leak.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }

  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
