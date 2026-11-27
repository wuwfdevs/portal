import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { countBy } from "@/lib/collections";
import { getDisplayNames } from "@/lib/profile-names";
import type { Database } from "@/lib/database.types";

/**
 * Staff-side reads for events, tables and seats (the query itself is read in queries.ts). Through the RLS-scoped server client, so
 * `private.has_audience_listening_access` decides what comes back. Flat reads put together here, because database.types.ts is
 * hand-written with empty Relationships (the same call queries.ts documents). A failed read throws rather than showing an empty list.
 */

export type AlEvent = Database["public"]["Tables"]["al_events"]["Row"];
export type AlTable = Database["public"]["Tables"]["al_tables"]["Row"];
export type AlSeat = Database["public"]["Tables"]["al_seats"]["Row"];
export type AlConsentText = Database["public"]["Tables"]["al_consent_texts"]["Row"];
export type AlOpeningText = Database["public"]["Tables"]["al_opening_texts"]["Row"];
export type AlConversation = Database["public"]["Tables"]["al_conversations"]["Row"];

export async function getOwnerName(ownerId: string | null): Promise<string | null> {
  if (!ownerId) return null;
  const names = await getDisplayNames([ownerId]);
  return names.get(ownerId) ?? null;
}

export interface EventListRow {
  event: AlEvent;
  queryTitle: string;
  tableCount: number;
  seatCount: number;
}

/** Events, soonest first. With `queryId`, one query's; otherwise every query's. */
export async function listEvents(options: { queryId?: string; listing?: "pending_review" } = {}): Promise<EventListRow[]> {
  const supabase = await createClient();
  let eventQuery = supabase.from("al_events").select("*").order("starts_at", { ascending: true });
  if (options.queryId) eventQuery = eventQuery.eq("query_id", options.queryId);
  if (options.listing) eventQuery = eventQuery.eq("listing_state", options.listing);
  const [eventResult, queryResult, tableResult, seatResult] = await Promise.all([
    eventQuery,
    supabase.from("al_queries").select("id, internal_title"),
    supabase.from("al_tables").select("event_id"),
    supabase.from("al_seats").select("event_id"),
  ]);
  const events = unwrapRead(eventResult, "the event list") ?? [];
  const titles = new Map((unwrapRead(queryResult, "the event list's queries") ?? []).map((q) => [q.id, q.internal_title]));
  const tableCounts = countBy(unwrapRead(tableResult, "the event list's tables") ?? [], (t) => t.event_id);
  const seatCounts = countBy(unwrapRead(seatResult, "the event list's seats") ?? [], (s) => s.event_id);
  return events.map((event) => ({
    event,
    queryTitle: titles.get(event.query_id) ?? "A deleted query",
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

/** The standard opening every table's recording starts with, newest version first. */
export async function listOpeningTexts(): Promise<AlOpeningText[]> {
  const supabase = await createClient();
  const result = await supabase.from("al_opening_texts").select("*").order("version", { ascending: false });
  return unwrapRead(result, "the standard opening") ?? [];
}

/** The consent wording, newest version first. */
export async function listConsentTexts(): Promise<AlConsentText[]> {
  const supabase = await createClient();
  const result = await supabase.from("al_consent_texts").select("*").order("version", { ascending: false });
  return unwrapRead(result, "the consent wording") ?? [];
}

/** An event's conversations, one per table that recorded. */
export async function listConversations(eventId: string): Promise<AlConversation[]> {
  const supabase = await createClient();
  const result = await supabase.from("al_conversations").select("*").eq("event_id", eventId);
  return unwrapRead(result, "the event's conversations") ?? [];
}
