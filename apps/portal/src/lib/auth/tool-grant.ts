import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import type { Profile } from "@/lib/auth/session";
import type { Tool } from "@/lib/tools";

/**
 * What a user's current (non-revoked) grant for a tool says about their role:
 * `role` is `tool_access.tool_role` (the single role most tools read) and
 * `roles` is `tool_roles` (the list stacking tools read; the table's trigger
 * keeps `role` equal to its first element). Both are empty when there is no
 * grant. Every tool's `access.ts` reads this instead of repeating the query.
 *
 * A failed read throws: a grant that cannot be read must not quietly mean
 * "no role", which would look like a revoked permission rather than an outage.
 */
export async function lookupToolGrant(
  profile: Pick<Profile, "id">,
  tool: Pick<Tool, "id">,
): Promise<{ role: string | null; roles: string[] }> {
  const supabase = await createClient();
  const grant = unwrapRead(
    await supabase
      .from("tool_access")
      .select("tool_role, tool_roles")
      .eq("user_id", profile.id)
      .eq("tool_id", tool.id)
      .is("revoked_at", null)
      .maybeSingle(),
    "your tool access",
  );
  return { role: grant?.tool_role ?? null, roles: grant?.tool_roles ?? [] };
}
