import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Secret-key Supabase client. Bypasses Row Level Security entirely.
 *
 * Only import this inside server actions / route handlers, and only for
 * operations RLS genuinely cannot express because there is no signed-in
 * user for it to apply against:
 *   - `auth.admin.inviteUserByEmail` when inviting a new user.
 *   - Verified external webhook handlers, e.g.
 *     src/app/api/transcription/webhook/route.ts — a third-party callback
 *     carries no Supabase session, so RLS-as-authenticated-user isn't an
 *     option. Always verify the webhook's shared secret/signature *before*
 *     touching this client; the secret check is what stands in for RLS here.
 * Every other read or write should go through lib/supabase/server.ts so RLS
 * still applies. The `server-only` import above makes accidentally bundling
 * this into client code a build error rather than a runtime leak.
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
