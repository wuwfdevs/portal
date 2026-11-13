import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getEvent, listTables } from "@/lib/audience-listening/campaign-queries";
import { getConversationForTable } from "@/lib/audience-listening/conversation-queries";
import { readSiteOrigin } from "@/lib/audience-listening/event-times";
import { AFTER_LINK_STATUS_TEXT, afterLinkStatus, issueAfterLink } from "@/lib/audience-listening/after-link";
import { facilitatorLinkEmailText } from "@/lib/audience-listening/notify-text";
import { sendFacilitatorLink } from "@/lib/audience-listening/notify";
import { getStationProfile } from "@/lib/station";
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
  const origin = readSiteOrigin(process.env.WEBSITE_ORIGIN);
  if (!origin.ok) return { ok: false, error: origin.problem };

  const [event, tables, conversation] = await Promise.all([getEvent(eventId), listTables(eventId), getConversationForTable(tableId)]);
  const table = tables.find((t) => t.id === tableId);
  if (!event || !table) return { ok: false, error: "That table no longer exists." };

  const status = afterLinkStatus(table, conversation);
  if (status === "no_email" || status === "no_conversation" || status === "conversation_sent") return { ok: false, error: AFTER_LINK_STATUS_TEXT[status] };
  if (!table.facilitator_email) return { ok: false, error: AFTER_LINK_STATUS_TEXT.no_email };

  const link = issueAfterLink(origin.origin, new Date(event.ends_at), now);
  if (!link) return { ok: false, error: "This event ended more than thirty days ago, so its conversations are no longer kept and a link would open nothing." };

  const supabase = await createClient();
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
