import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import type { Database } from "@/lib/database.types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * The signed-in user's profile, or null if signed out. This is the single
 * place page/action code should look up "who is this and what's their
 * platform role" — do not query auth.users or profiles directly elsewhere.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // maybeSingle: a signed-in user with no profile row is "no profile" (null), but a failed read is
  // an outage and must surface — otherwise every page would read it as "signed out" and bounce to /login.
  return unwrapRead(
    await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    "your profile",
  );
}
