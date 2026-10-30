"use server";

import { createClient } from "@/lib/supabase/server";
import { assertUnderwritingAccess } from "@/lib/underwriting/access";

export interface DadLibraryCut {
  cut: string;
  title: string;
  group: string | null;
}

/**
 * The copy form's "Existing DAD spot" search: DAD library cuts matching a
 * cut number or title, through log_search_dad_cuts() — Underwriting staff
 * have no RLS access to Log's content library, so the read goes through
 * that security-definer boundary. Non-redirecting, called from the client
 * as the staffer types.
 */
export async function searchDadCuts(
  query: string,
): Promise<{ ok: true; cuts: DadLibraryCut[] } | { ok: false; error: string }> {
  await assertUnderwritingAccess();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("log_search_dad_cuts", { p_query: query });
  if (error) {
    console.error("Could not search the DAD library", error);
    return { ok: false, error: "Could not search the DAD library." };
  }
  if (!data || "error" in data) return { ok: false, error: "Could not search the DAD library." };
  return { ok: true, cuts: data.cuts };
}
