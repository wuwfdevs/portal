import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AFTER_LINK_STATUS_TEXT, afterLinkStatus, issueAfterLink } from "@/lib/audience-listening/after-link";
import { facilitatorLinkEmailText } from "@/lib/audience-listening/notify-text";
import { sendFacilitatorLink } from "@/lib/audience-listening/notify";
import { getStationProfile } from "@/lib/station";
import { resolveWebsiteOrigin } from "@/lib/station-links";
import { STATION_TIME_ZONE } from "@/lib/station-time";

export type SendAfterLinkResult =
  | { ok: true }
  /** `url` is set when the link was made but the email did not go: staff may pass it to the facilitator themselves. */
  | { ok: false; error: string; url?: string };

function expiresOn(date: Date): string {
  return date.toLocaleDateString("en-US", { timeZone: STATION_TIME_ZONE, month: "long", day: "numeric" });
}

/**
 * Makes a new after-page link for one table and emails it to its facilitator. Making a link replaces the last one, so an earlier email
 * stops working: that is also how staff recover from a link sent to the wrong place. Only the hash is stored; the token exists in the
 * email and, if the email fails, in the response to the staff member who asked. Nothing is logged.
 */
export async function sendAfterLink(eventId: string, tableId: string, now: Date = new Date()): Promise<SendAfterLinkResult> {
  return sendAfterLinkWith(await createClient(), eventId, tableId, now);
}

/** The same, through the given client: a staff member's own (RLS) or, for the scheduled route, the service client. */
export async function sendAfterLinkWith(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  tableId: string,
  now: Date = new Date(),
): Promise<SendAfterLinkResult> {
  const origin = await resolveWebsiteOrigin(supabase);
  if (!origin.ok) return { ok: false, error: origin.problem };

  const [eventResult, tableResult, conversationResult] = await Promise.all([
    supabase.from("al_events").select("*").eq("id", eventId).maybeSingle(),
    supabase.from("al_tables").select("*").eq("id", tableId).eq("event_id", eventId).maybeSingle(),
    supabase.from("al_conversations").select("*").eq("table_id", tableId).maybeSingle(),
  ]);
  if (eventResult.error || tableResult.error || conversationResult.error) {
    console.error("Listening: could not read a table for its link:", eventResult.error?.code ?? tableResult.error?.code ?? conversationResult.error?.code);
    return { ok: false, error: "Could not read the table, so nothing was sent. Try again." };
  }
  const event = eventResult.data;
  const table = tableResult.data;
  const conversation = conversationResult.data;
  if (!event || !table) return { ok: false, error: "That table no longer exists." };

  const status = afterLinkStatus(table, conversation);
  if (status === "no_email" || status === "no_conversation" || status === "conversation_sent") return { ok: false, error: AFTER_LINK_STATUS_TEXT[status] };
  if (!table.facilitator_email) return { ok: false, error: AFTER_LINK_STATUS_TEXT.no_email };

  const link = issueAfterLink(origin.origin, new Date(event.ends_at), now);
  if (!link) return { ok: false, error: "This event ended more than thirty days ago, so its conversations are no longer kept and a link would open nothing." };

  const stored = await supabase
    .from("al_tables")
    .update({ after_token_hash: link.hash, after_token_expires_at: link.expiresAt.toISOString() })
    .eq("id", table.id)
    .eq("event_id", eventId)
    .select("id");
  if (stored.error || !stored.data || stored.data.length === 0) {
    console.error("Listening: could not store a facilitator's link:", stored.error?.code);
    return { ok: false, error: "Could not save the link, so nothing was sent. Try again." };
  }

  const station = await getStationProfile();
  const message = facilitatorLinkEmailText({
    stationName: station.shortName,
    firstName: table.facilitator_first_name,
    eventTitle: event.title,
    tableNumber: table.number,
    url: link.url,
    expiresOn: expiresOn(link.expiresAt),
  });
  const sent = await sendFacilitatorLink(table.facilitator_email, message);
  if (!sent.ok) {
    return { ok: false, error: `The email did not go (${sent.error}). The link below works; give it to the facilitator yourself.`, url: link.url };
  }

  const marked = await supabase.from("al_tables").update({ after_link_sent_at: now.toISOString() }).eq("id", table.id).eq("event_id", eventId).select("id");
  if (marked.error) console.error("Listening: sent a facilitator's link but could not record it:", marked.error.code);
  return { ok: true };
}
