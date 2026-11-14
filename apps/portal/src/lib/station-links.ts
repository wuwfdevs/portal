import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { readSiteOrigin } from "@/lib/audience-listening/event-times";
import { parseNotifyAddress } from "@/lib/audience-listening/notify-text";

// Where Audience Listening points its links and sends its reminders. Both used to be environment variables; they are station settings
// now (Administration > Station), and the variable is only a fallback for a deployment that already has it. Pure choosing, then a
// loader that takes whatever client the caller has: a staff member's (RLS) or the service client a scheduled run uses.

/** The setting if it has anything in it, else the environment's value. */
export function chooseSetting(setting: string | null | undefined, env: string | undefined): string | undefined {
  const fromSetting = setting?.trim();
  if (fromSetting) return fromSetting;
  const fromEnv = env?.trim();
  return fromEnv || undefined;
}

type Client = Pick<SupabaseClient<Database>, "from">;

async function readSettings(client: Client): Promise<{ website_origin: string | null; listening_notify_email: string | null }> {
  const { data, error } = await client.from("station_settings").select("website_origin, listening_notify_email").eq("id", true).maybeSingle();
  if (error) {
    // Unreadable settings must not hide a working environment variable: fall back, and say so in the server log.
    console.error("Could not read the station's website address and mailbox:", error.code);
    return { website_origin: null, listening_notify_email: null };
  }
  return data ?? { website_origin: null, listening_notify_email: null };
}

/** The website's origin for a link, or the reason there is none. */
export async function resolveWebsiteOrigin(client: Client, env: string | undefined = process.env.WEBSITE_ORIGIN) {
  const { website_origin } = await readSettings(client);
  return readSiteOrigin(chooseSetting(website_origin, env));
}

/** The shared mailbox for reminders, or null when none is set. */
export async function resolveNotifyAddress(client: Client, env: string | undefined = process.env.AUDIENCE_LISTENING_NOTIFY_EMAIL) {
  const { listening_notify_email } = await readSettings(client);
  return parseNotifyAddress(chooseSetting(listening_notify_email, env));
}
