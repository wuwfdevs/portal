import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ApPublicFormConfig } from "@/lib/database.types";

/**
 * The only read the public route makes. Calls the security-definer
 * ap_public_form_config() (grant execute to anon, authenticated — see
 * 20260803140000_academic_partnerships.sql), so it works for a visitor with
 * no session at all through the ordinary cookie-based server client — there
 * is no participant identity here for a cookie to matter to, unlike Audience
 * Listening's public flow. See docs/academic-partnerships-design.md §3.
 */
export async function getPublicFormConfig(): Promise<ApPublicFormConfig | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ap_public_form_config");
  if (error) {
    console.error("ap_public_form_config failed", error);
    return null;
  }
  return data as ApPublicFormConfig;
}
