"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkboxField, field, optionalField, optionalInt, UUID_RE } from "@/lib/form-fields";
import { deleteOrFail, failIfError, failWith } from "@/lib/editorial/action-result";
import { logAuditEvent } from "@/lib/audit";
import { assertAudienceListeningContext, assertAudienceListeningCoordinator } from "@/lib/audience-listening/access";
import { generatePublicId } from "@/lib/audience-listening/public-id";
import { readSiteOrigin, stationInputToUTC } from "@/lib/audience-listening/event-times";
import { eventSpanProblem } from "@/lib/audience-listening/campaigns";
import { getCampaign, getEvent, listTables } from "@/lib/audience-listening/campaign-queries";
import {
  EVENT_ACTION_TARGET,
  LISTING_ACTION_TARGET,
  MAX_TABLES,
  availableEventActions,
  availableListingActions,
  eventIsDeletable,
  isOrganizerKind,
  missingListingChecks,
  nextTableNumber,
  tableIsRemovable,
  validateEventInput,
  type EventAction,
  type ListingAction,
} from "@/lib/audience-listening/events";
import { issueTableLink, type IssuedLink } from "@/lib/audience-listening/table-links";

const EVENTS_PATH = "/audience-listening/events";

function eventPath(id: string): string {
  return `${EVENTS_PATH}/${id}`;
}

interface ParsedEvent {
  title: string;
  startsAtISO: string;
  endsAtISO: string;
  placeName: string;
  address: string | null;
  city: string | null;
  visibility: "private" | "public";
  seats: number | null;
  organizerKind: "wuwf" | "partner" | "person";
  organizerLabel: string | null;
  journalist: boolean;
}

/** Reads and checks the event form; fails back to `path` with the first problem, including the campaign's span. */
async function parseEventForm(formData: FormData, campaignId: string, path: string): Promise<ParsedEvent> {
  const startsAt = stationInputToUTC(field(formData, "starts_at"));
  const endsAt = stationInputToUTC(field(formData, "ends_at"));
  const visibility = field(formData, "visibility") === "public" ? "public" : "private";
  const input = {
    title: field(formData, "title"),
    startsAt,
    endsAt,
    placeName: field(formData, "place_name"),
    address: optionalField(formData, "address"),
    visibility,
    // A private event has no seat count: it is shared by the organizer, not found by strangers.
    seats: visibility === "public" ? optionalInt(formData, "seats") : null,
  };
  const problem = validateEventInput(input);
  if (problem) failWith(path, problem);

  const campaign = await getCampaign(campaignId);
  if (!campaign) failWith(path, "That campaign no longer exists.");
  const spanProblem = eventSpanProblem(startsAt!, { opensAt: campaign.opens_at, closesAt: campaign.closes_at });
  if (spanProblem) failWith(path, `${spanProblem} Change the event's date, or the campaign's dates.`);

  const organizerKind = field(formData, "organizer_kind");
  return {
    title: input.title,
    startsAtISO: startsAt!,
    endsAtISO: endsAt!,
    placeName: input.placeName,
    address: input.address,
    city: optionalField(formData, "city"),
    visibility,
    seats: input.seats,
    organizerKind: isOrganizerKind(organizerKind) ? organizerKind : "wuwf",
    organizerLabel: optionalField(formData, "organizer_label"),
    journalist: checkboxField(formData, "wuwf_journalist_joining"),
  };
}

export async function createEvent(formData: FormData): Promise<void> {
  const { profile } = await assertAudienceListeningContext();
  const campaignId = field(formData, "campaign_id");
  const newPath = `${EVENTS_PATH}/new?campaign=${encodeURIComponent(campaignId)}`;
  if (!UUID_RE.test(campaignId)) failWith(`${EVENTS_PATH}/new`, "Choose the campaign this event belongs to.");
  const parsed = await parseEventForm(formData, campaignId, newPath);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("al_events")
    .insert({
      public_id: generatePublicId(),
      campaign_id: campaignId,
      title: parsed.title,
      starts_at: parsed.startsAtISO,
      ends_at: parsed.endsAtISO,
      place_name: parsed.placeName,
      address: parsed.address,
      city: parsed.city,
      visibility: parsed.visibility,
      seats: parsed.seats,
      organizer_kind: parsed.organizerKind,
      organizer_label: parsed.organizerLabel,
      wuwf_journalist_joining: parsed.journalist,
      created_by: profile.id,
    })
    .select("id")
    .single();
  failIfError(error, newPath, "Could not create the event");
  if (!data) failWith(newPath, "Could not create the event — no row was created.");

  await logAuditEvent({ actorId: profile.id, action: "al.event.created", targetType: "al_event", targetId: data.id, metadata: { title: parsed.title } });
  redirect(eventPath(data.id));
}

export async function updateEvent(formData: FormData): Promise<void> {
  const { profile } = await assertAudienceListeningContext();
  const id = field(formData, "event_id");
  const path = eventPath(id);
  const event = await getEvent(id);
  if (!event) failWith(EVENTS_PATH, "That event no longer exists.");
  const parsed = await parseEventForm(formData, event.campaign_id, `${path}?edit=1`);

  const supabase = await createClient();
  const { error } = await supabase
    .from("al_events")
    .update({
      title: parsed.title,
      starts_at: parsed.startsAtISO,
      ends_at: parsed.endsAtISO,
      place_name: parsed.placeName,
      address: parsed.address,
      city: parsed.city,
      visibility: parsed.visibility,
      seats: parsed.seats,
      organizer_kind: parsed.organizerKind,
      organizer_label: parsed.organizerLabel,
      wuwf_journalist_joining: parsed.journalist,
      internal_notes: optionalField(formData, "internal_notes"),
    })
    .eq("id", id);
  failIfError(error, `${path}?edit=1`, "Could not save the event");

  // The database sends a listed event back to review when someone other than a coordinator changes what the public sees.
  const after = await getEvent(id);
  await logAuditEvent({ actorId: profile.id, action: "al.event.updated", targetType: "al_event", targetId: id });
  if (event.listing_state === "listed" && after && after.listing_state !== "listed") {
    redirect(`${path}?notice=back_in_review`);
  }
  redirect(path);
}

export async function setEventStatus(formData: FormData): Promise<void> {
  const { profile } = await assertAudienceListeningContext();
  const id = field(formData, "event_id");
  const action = field(formData, "action") as EventAction;
  const path = eventPath(id);
  const event = await getEvent(id);
  if (!event) failWith(EVENTS_PATH, "That event no longer exists.");
  if (!availableEventActions(event.status).includes(action)) failWith(path, "That isn't possible from the event's current state.");

  const supabase = await createClient();
  const { error } = await supabase.from("al_events").update({ status: EVENT_ACTION_TARGET[action] }).eq("id", id);
  failIfError(error, path, "Could not change the event's status");
  await logAuditEvent({
    actorId: profile.id,
    action: `al.event.${action}`,
    targetType: "al_event",
    targetId: id,
    metadata: { from: event.status, to: EVENT_ACTION_TARGET[action] },
  });
  redirect(path);
}

export async function deleteEvent(formData: FormData): Promise<void> {
  const { profile } = await assertAudienceListeningContext();
  const id = field(formData, "event_id");
  const event = await getEvent(id);
  if (!event) redirect(EVENTS_PATH);
  if (!eventIsDeletable(event.status)) failWith(eventPath(id), "Cancel the event first. One that was scheduled is kept, not deleted.");
  await deleteOrFail((await createClient()).from("al_events").delete().eq("id", id).select("id"), eventPath(id), "Could not delete the event");
  await logAuditEvent({ actorId: profile.id, action: "al.event.deleted", targetType: "al_event", targetId: id, metadata: { title: event.title } });
  redirect(`/audience-listening/campaigns/${event.campaign_id}?tab=events`);
}

// Listing ------------------------------------------------------------------------------------------------

/**
 * Asking for review, withdrawing, approving, declining and taking down. Any staff member may ask or withdraw; approving, declining
 * and unlisting need a coordinator, and the database refuses them from anyone else whatever this does. Approval needs every item on
 * the checklist ticked; a decline needs the reason the organizer is told. Each decision is audited with who made it.
 */
export async function setListing(formData: FormData): Promise<void> {
  const id = field(formData, "event_id");
  const action = field(formData, "action") as ListingAction;
  const path = eventPath(id);
  const decides = action === "approve" || action === "decline" || action === "unlist";
  const { profile, isCoordinator } = decides ? await assertAudienceListeningCoordinator() : await assertAudienceListeningContext();

  const event = await getEvent(id);
  if (!event) failWith(EVENTS_PATH, "That event no longer exists.");
  if (!availableListingActions(event.listing_state, event.visibility, isCoordinator).includes(action)) {
    failWith(path, "That isn't possible from the event's current listing state.");
  }

  const patch: { listing_state: (typeof LISTING_ACTION_TARGET)[ListingAction]; listing_declined_reason?: string | null } = {
    listing_state: LISTING_ACTION_TARGET[action],
  };
  if (action === "approve") {
    const missing = missingListingChecks(formData.getAll("check").map(String));
    if (missing.length > 0) failWith(path, `Tick every item on the checklist before approving. Still open: ${missing.join("; ")}.`);
  }
  if (action === "decline") {
    const reason = field(formData, "reason");
    if (!reason) failWith(path, "Write the reason the organizer will be told.");
    if (reason.length > 1000) failWith(path, "The reason can be at most 1,000 characters.");
    patch.listing_declined_reason = reason;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("al_events").update(patch).eq("id", id);
  failIfError(error, path, "Could not change the listing");

  await logAuditEvent({
    actorId: profile.id,
    action: `al.event.listing_${action}`,
    targetType: "al_event",
    targetId: id,
    metadata: { from: event.listing_state, to: patch.listing_state, ...(action === "decline" ? { reason: patch.listing_declined_reason } : {}) },
  });
  redirect(path);
}

// Tables -------------------------------------------------------------------------------------------------

export async function addTables(formData: FormData): Promise<void> {
  await assertAudienceListeningContext();
  const id = field(formData, "event_id");
  const path = eventPath(id);
  const wanted = Math.min(MAX_TABLES, Math.max(1, optionalInt(formData, "count") ?? 1));

  const tables = await listTables(id);
  const used = tables.map((t) => t.number);
  const supabase = await createClient();
  for (let i = 0; i < wanted; i += 1) {
    const number = nextTableNumber(used);
    if (number == null) failWith(path, `An event can have at most ${MAX_TABLES} tables.`);
    used.push(number);
    const { error } = await supabase.from("al_tables").insert({ event_id: id, number });
    failIfError(error, path, "Could not add the table");
  }
  redirect(path);
}

export async function removeTable(formData: FormData): Promise<void> {
  const { profile } = await assertAudienceListeningContext();
  const eventId = field(formData, "event_id");
  const path = eventPath(eventId);
  const tableId = field(formData, "table_id");
  const table = (await listTables(eventId)).find((t) => t.id === tableId);
  if (!table) failWith(path, "That table no longer exists.");
  if (!tableIsRemovable(table.state)) failWith(path, "Only a table nobody has started can be removed. One that has recorded is kept.");
  await deleteOrFail((await createClient()).from("al_tables").delete().eq("id", tableId).eq("event_id", eventId).select("id"), path, "Could not remove the table");
  await logAuditEvent({ actorId: profile.id, action: "al.table.removed", targetType: "al_table", targetId: tableId, metadata: { number: table.number } });
  redirect(path);
}

export interface IssueLinksState {
  ok: boolean;
  error?: string;
  links?: { tableId: string; number: number; url: string; cardUrl: string | null }[];
}

/**
 * Makes a new single-use link for one table, or for every table that can still use one, and returns the addresses to the page that
 * asked so the QR codes and printed cards can be drawn. Only the SHA-256 hash is stored; the token exists in this response and on
 * the cards, and nowhere else (it is not logged and not in the audit row). A new link replaces the old one and clears the used mark,
 * so a lost phone's session stops working. A table that has ended is not given one.
 */
export async function issueTableLinks(_previous: IssueLinksState, formData: FormData): Promise<IssueLinksState> {
  const { profile } = await assertAudienceListeningContext();
  const eventId = field(formData, "event_id");
  const onlyTable = field(formData, "table_id");

  const origin = readSiteOrigin(process.env.WEBSITE_ORIGIN);
  if (!origin.ok) return { ok: false, error: origin.problem };

  const event = await getEvent(eventId);
  if (!event) return { ok: false, error: "That event no longer exists." };
  if (event.status === "cancelled" || event.status === "done") return { ok: false, error: "This event is over, so its tables are not given new links." };

  const tables = (await listTables(eventId)).filter((t) => (onlyTable ? t.id === onlyTable : true) && t.state !== "ended" && t.state !== "sent");
  if (tables.length === 0) return { ok: false, error: "There is no table to give a link to." };

  const supabase = await createClient();
  const issued: IssuedLink[] = [];
  for (const table of tables) {
    const link = issueTableLink(table, origin.origin, { withCard: !onlyTable });
    const { data, error } = await supabase
      .from("al_tables")
      .update({
        join_token_hash: link.hash,
        join_token_issued_at: new Date().toISOString(),
        join_token_used_at: null,
        ...(link.card ? { card_token_hash: link.card.hash } : {}),
      })
      .eq("id", table.id)
      .eq("event_id", eventId)
      .select("id");
    if (error || !data || data.length === 0) {
      console.error("Could not store a table link:", error);
      return { ok: false, error: `Could not save the link for table ${table.number}. Nothing was printed; try again.` };
    }
    issued.push(link);
  }

  // No token, hash or address in the record: only that links were made, and for which tables.
  await logAuditEvent({
    actorId: profile.id,
    action: "al.table.link_issued",
    targetType: "al_event",
    targetId: eventId,
    metadata: { tables: issued.map((l) => l.number) },
  });
  revalidatePath(eventPath(eventId));
  return { ok: true, links: issued.map(({ tableId, number, url, card }) => ({ tableId, number, url, cardUrl: card?.url ?? null })) };
}

export async function removeSeat(formData: FormData): Promise<void> {
  const { profile } = await assertAudienceListeningContext();
  const eventId = field(formData, "event_id");
  const path = eventPath(eventId);
  const seatId = field(formData, "seat_id");
  await deleteOrFail((await createClient()).from("al_seats").delete().eq("id", seatId).eq("event_id", eventId).select("id"), path, "Could not remove the seat");
  await logAuditEvent({ actorId: profile.id, action: "al.seat.removed", targetType: "al_event", targetId: eventId });
  redirect(path);
}
