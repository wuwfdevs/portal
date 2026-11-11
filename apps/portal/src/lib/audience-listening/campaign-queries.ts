import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { countBy } from "@/lib/collections";
import { getDisplayNames } from "@/lib/profile-names";
import type { Database } from "@/lib/database.types";

/**
 * Staff-side reads for campaigns, events, tables and seats. Through the RLS-scoped server client, so
 * `private.has_audience_listening_access` decides what comes back. Flat reads put together here, because database.types.ts is
 * hand-written with empty Relationships (the same call queries.ts documents). A failed read throws rather than showing an empty list.
 */

export type AlCampaign = Database["public"]["Tables"]["al_campaigns"]["Row"];
export type AlCampaignPrompt = Database["public"]["Tables"]["al_campaign_prompts"]["Row"];
export type AlCampaignTag = Database["public"]["Tables"]["al_campaign_tags"]["Row"];
export type AlEvent = Database["public"]["Tables"]["al_events"]["Row"];
export type AlTable = Database["public"]["Tables"]["al_tables"]["Row"];
export type AlSeat = Database["public"]["Tables"]["al_seats"]["Row"];

export interface CampaignListRow {
  campaign: AlCampaign;
  eventCount: number;
  pendingReviewCount: number;
}

export async function listCampaigns(): Promise<CampaignListRow[]> {
  const supabase = await createClient();
  const [campaignResult, eventResult] = await Promise.all([
    supabase.from("al_campaigns").select("*").order("created_at", { ascending: false }),
    supabase.from("al_events").select("campaign_id, listing_state"),
  ]);
  const campaigns = unwrapRead(campaignResult, "the campaign list") ?? [];
  const events = unwrapRead(eventResult, "the campaign list's events") ?? [];
  const eventCounts = countBy(events, (e) => e.campaign_id);
  const pendingCounts = countBy(
    events.filter((e) => e.listing_state === "pending_review"),
    (e) => e.campaign_id,
  );
  return campaigns.map((campaign) => ({
    campaign,
    eventCount: eventCounts.get(campaign.id) ?? 0,
    pendingReviewCount: pendingCounts.get(campaign.id) ?? 0,
  }));
}

export async function getCampaign(id: string): Promise<AlCampaign | null> {
  const supabase = await createClient();
  const result = await supabase.from("al_campaigns").select("*").eq("id", id).maybeSingle();
  return unwrapRead(result, "the campaign");
}

export async function listPrompts(campaignId: string): Promise<AlCampaignPrompt[]> {
  const supabase = await createClient();
  const result = await supabase
    .from("al_campaign_prompts")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  return unwrapRead(result, "the campaign's prompts") ?? [];
}

export async function listTags(campaignId: string): Promise<AlCampaignTag[]> {
  const supabase = await createClient();
  const result = await supabase
    .from("al_campaign_tags")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  return unwrapRead(result, "the campaign's tags") ?? [];
}

export async function countPrompts(campaignId: string): Promise<number> {
  const supabase = await createClient();
  const result = await supabase.from("al_campaign_prompts").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId);
  unwrapRead(result, "the campaign's prompt count");
  return result.count ?? 0;
}

/** Queries a campaign could link to: any query that no other campaign already uses, plus the one it has. */
export async function listLinkableQueries(currentQueryId: string | null): Promise<{ id: string; title: string }[]> {
  const supabase = await createClient();
  const [queryResult, linkedResult] = await Promise.all([
    supabase.from("al_queries").select("id, internal_title").order("created_at", { ascending: false }),
    supabase.from("al_campaigns").select("query_id").not("query_id", "is", null),
  ]);
  const queries = unwrapRead(queryResult, "the queries to link") ?? [];
  const linked = new Set((unwrapRead(linkedResult, "the linked queries") ?? []).map((row) => row.query_id));
  return queries.filter((q) => q.id === currentQueryId || !linked.has(q.id)).map((q) => ({ id: q.id, title: q.internal_title }));
}

export async function getOwnerName(ownerId: string | null): Promise<string | null> {
  if (!ownerId) return null;
  const names = await getDisplayNames([ownerId]);
  return names.get(ownerId) ?? null;
}

export interface EventListRow {
  event: AlEvent;
  campaignTitle: string;
  tableCount: number;
  seatCount: number;
}

/** Events, soonest first. With `campaignId`, one campaign's; otherwise every campaign's. */
export async function listEvents(options: { campaignId?: string; listing?: "pending_review" } = {}): Promise<EventListRow[]> {
  const supabase = await createClient();
  let eventQuery = supabase.from("al_events").select("*").order("starts_at", { ascending: true });
  if (options.campaignId) eventQuery = eventQuery.eq("campaign_id", options.campaignId);
  if (options.listing) eventQuery = eventQuery.eq("listing_state", options.listing);
  const [eventResult, campaignResult, tableResult, seatResult] = await Promise.all([
    eventQuery,
    supabase.from("al_campaigns").select("id, title"),
    supabase.from("al_tables").select("event_id"),
    supabase.from("al_seats").select("event_id"),
  ]);
  const events = unwrapRead(eventResult, "the event list") ?? [];
  const titles = new Map((unwrapRead(campaignResult, "the event list's campaigns") ?? []).map((c) => [c.id, c.title]));
  const tableCounts = countBy(unwrapRead(tableResult, "the event list's tables") ?? [], (t) => t.event_id);
  const seatCounts = countBy(unwrapRead(seatResult, "the event list's seats") ?? [], (s) => s.event_id);
  return events.map((event) => ({
    event,
    campaignTitle: titles.get(event.campaign_id) ?? "A deleted campaign",
    tableCount: tableCounts.get(event.id) ?? 0,
    seatCount: seatCounts.get(event.id) ?? 0,
  }));
}

export async function getEvent(id: string): Promise<AlEvent | null> {
  const supabase = await createClient();
  const result = await supabase.from("al_events").select("*").eq("id", id).maybeSingle();
  return unwrapRead(result, "the event");
}

export async function listTables(eventId: string): Promise<AlTable[]> {
  const supabase = await createClient();
  const result = await supabase.from("al_tables").select("*").eq("event_id", eventId).order("number", { ascending: true });
  return unwrapRead(result, "the event's tables") ?? [];
}

export async function listSeats(eventId: string): Promise<AlSeat[]> {
  const supabase = await createClient();
  const result = await supabase.from("al_seats").select("*").eq("event_id", eventId).order("created_at", { ascending: true });
  return unwrapRead(result, "the event's seats") ?? [];
}

/** Events a coordinator has to decide on, for the section's navigation. Left off, not failed, if the table is missing. */
export async function countEventsPendingReview(): Promise<number | null> {
  try {
    const supabase = await createClient();
    const result = await supabase.from("al_events").select("id", { count: "exact", head: true }).eq("listing_state", "pending_review");
    unwrapRead(result, "the events waiting for review");
    return result.count ?? 0;
  } catch (error) {
    console.error("Audience Listening: could not count the events waiting for review:", error);
    return null;
  }
}
