import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Secret-key Supabase client. Bypasses Row Level Security entirely.
 *
 * Only import this inside server actions / route handlers, and only for the
 * specific operations RLS cannot express — currently just
 * `auth.admin.inviteUserByEmail` when inviting a new user. Every other read
 * or write should go through lib/supabase/server.ts so RLS still applies.
 * The `server-only` import above makes accidentally bundling this into
 * client code a build error rather than a runtime leak.
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY is not set");
  }

  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
