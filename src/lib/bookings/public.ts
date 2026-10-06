import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { BkPublicFormConfig } from "@/lib/database.types";

/**
 * The only read the public route makes. Calls the security-definer
 * bk_public_form_config() (execute granted to anon and authenticated —
 * 20261006130000_bookings_public_intake.sql), so it works for a visitor with
 * no session at all through the ordinary cookie-based server client; there is
 * no participant identity here for a cookie to matter to. The shape is
 * lib/academic-partnerships/public.ts's (docs/bookings-design.md §6.3).
 */
export async function getPublicFormConfig(): Promise<BkPublicFormConfig | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bk_public_form_config");
  if (error) {
    console.error("bk_public_form_config failed", error);
    return null;
  }
  return data as BkPublicFormConfig;
}
