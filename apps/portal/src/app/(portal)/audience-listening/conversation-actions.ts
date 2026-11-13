"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { field, optionalInt } from "@/lib/form-fields";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { logAuditEvent } from "@/lib/audit";
import { assertAudienceListeningContext, assertAudienceListeningCoordinator } from "@/lib/audience-listening/access";
import { AUDIENCE_LISTENING_MEDIA_BUCKET } from "@/lib/audience-listening/media";
import { canUseTool } from "@/lib/auth/authz";
import { sendConversationToSourcework } from "@/lib/audience-listening/conversation-handoff";
import { getEvent, listConversations, listTables } from "@/lib/audience-listening/campaign-queries";
import { needsAfterLink } from "@/lib/audience-listening/after-link";
import { sendAfterLink } from "@/lib/audience-listening/after-link-send";

function tablePath(eventId: string, tableId: string, query = ""): string {
  return `/audience-listening/events/${eventId}/tables/${tableId}${query}`;
}

/** Sends a complete recording to Sourcework as the staff member. Slow (it joins the segments), so the page that posts here raises maxDuration. */
export async function sendConversation(formData: FormData): Promise<void> {
  const { profile } = await assertAudienceListeningContext();
  const eventId = field(formData, "event_id");
  const tableId = field(formData, "table_id");
  const conversationId = field(formData, "conversation_id");
  const path = tablePath(eventId, tableId);

  const result = await sendConversationToSourcework(conversationId);
  if (!result.ok) failWith(path, result.error);
  await logAuditEvent({
    actorId: profile.id,
    action: "al.conversation.sent_to_sourcework",
    targetType: "al_conversation",
    targetId: conversationId,
    metadata: { project_id: result.projectId, source_id: result.sourceId },
  });
  revalidatePath(path);
  redirect(`${path}?notice=sent`);
}

// Contact cards -------------------------------------------------------------------------------------------

export async function markCardContacted(formData: FormData): Promise<void> {
  const { profile } = await assertAudienceListeningContext();
  const path = tablePath(field(formData, "event_id"), field(formData, "table_id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("al_contact_cards")
    .update({ contacted_at: new Date().toISOString(), contacted_by: profile.id })
    .eq("id", field(formData, "card_id"))
    .is("contacted_at", null);
  failIfError(error, path, "Could not record the contact");
  await logAuditEvent({ actorId: profile.id, action: "al.contact_card.contacted", targetType: "al_contact_card", targetId: field(formData, "card_id") });
  redirect(path);
}

/** Using a person's name in published work. The database refuses it unless they said it was fine and a reviewer has already contacted them. */
export async function approveCardName(formData: FormData): Promise<void> {
  const { profile } = await assertAudienceListeningContext();
  const path = tablePath(field(formData, "event_id"), field(formData, "table_id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("al_contact_cards")
    .update({ name_approved_at: new Date().toISOString() })
    .eq("id", field(formData, "card_id"))
    .is("name_approved_at", null);
  failIfError(error, path, "Could not approve the name");
  await logAuditEvent({ actorId: profile.id, action: "al.contact_card.name_approved", targetType: "al_contact_card", targetId: field(formData, "card_id") });
  redirect(path);
}

export async function deleteContactCard(formData: FormData): Promise<void> {
  const { profile } = await assertAudienceListeningContext();
  const path = tablePath(field(formData, "event_id"), field(formData, "table_id"));
  const supabase = await createClient();
  const { data, error } = await supabase.from("al_contact_cards").delete().eq("id", field(formData, "card_id")).select("id");
  failIfError(error, path, "Could not delete the card");
  if (!data || data.length === 0) failWith(path, "That card no longer exists.");
  await logAuditEvent({ actorId: profile.id, action: "al.contact_card.deleted", targetType: "al_contact_card", targetId: field(formData, "card_id") });
  redirect(path);
}

// Tonight -------------------------------------------------------------------------------------------------

/** The console checking in. What lets a table's phone say "help is coming" instead of "we've flagged this". Quiet on failure: it is a heartbeat. */
export async function touchConsole(eventId: string): Promise<boolean> {
  await assertAudienceListeningContext();
  const supabase = await createClient();
  const { error } = await supabase.from("al_events").update({ console_seen_at: new Date().toISOString() }).eq("id", eventId);
  if (error) console.error("Could not record the console's check-in:", error);
  return !error;
}

export async function callLastFive(formData: FormData): Promise<void> {
  const { profile } = await assertAudienceListeningContext();
  const eventId = field(formData, "event_id");
  const path = `/audience-listening/events/${eventId}/tonight`;
  const event = await getEvent(eventId);
  if (!event) failWith("/audience-listening/events", "That event no longer exists.");
  const supabase = await createClient();
  const { error } = await supabase.from("al_events").update({ last_call_at: event.last_call_at ?? new Date().toISOString() }).eq("id", eventId);
  failIfError(error, path, "Could not call the last five minutes");
  await logAuditEvent({ actorId: profile.id, action: "al.event.last_call", targetType: "al_event", targetId: eventId });
  redirect(path);
}

export async function setRoomPrompt(formData: FormData): Promise<void> {
  await assertAudienceListeningContext();
  const eventId = field(formData, "event_id");
  const path = `/audience-listening/events/${eventId}/tonight`;
  const position = optionalInt(formData, "position");
  if (position == null || position < 1) failWith(path, "Choose a prompt.");
  const supabase = await createClient();
  const { error } = await supabase.from("al_events").update({ current_prompt_position: position }).eq("id", eventId);
  failIfError(error, path, "Could not move the room to that prompt");
  redirect(path);
}

export async function clearHelpRequest(formData: FormData): Promise<void> {
  await assertAudienceListeningContext();
  const eventId = field(formData, "event_id");
  const path = `/audience-listening/events/${eventId}/tonight`;
  const supabase = await createClient();
  const { error } = await supabase.from("al_tables").update({ help_requested_at: null }).eq("id", field(formData, "table_id")).eq("event_id", eventId);
  failIfError(error, path, "Could not clear the request");
  redirect(path);
}

// Retention -----------------------------------------------------------------------------------------------

/**
 * Runs the 30-day purge: the database function deletes what is due and returns the storage paths; the audio goes after. Coordinators
 * only (the function checks too). The admin client is used here for one thing only, removing the objects the function named: staff have
 * no delete right on the bucket, and the paths come from the function, never from the page.
 */
export async function runPurge(): Promise<void> {
  const { profile } = await assertAudienceListeningCoordinator();
  const path = "/audience-listening/purge";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("al_purge_run");
  failIfError(error, path, "Could not run the purge");

  const paths = (data?.storage_paths ?? []).filter((p): p is string => typeof p === "string");
  let removedAudio = 0;
  if (paths.length > 0) {
    const { error: removeError } = await createAdminClient().storage.from(AUDIENCE_LISTENING_MEDIA_BUCKET).remove(paths);
    if (removeError) {
      console.error(`Listening purge: ${paths.length} audio object(s) could not be removed:`, removeError.message);
      failWith(path, `The records were deleted, but ${paths.length} audio file(s) could not be removed (${removeError.message}). Tell an administrator: their names are in the server log.`);
    }
    removedAudio = paths.length;
  }
  await logAuditEvent({
    actorId: profile.id,
    action: "al.purge.run",
    targetType: "al_purge",
    metadata: { submissions: data?.submissions ?? 0, conversations: data?.conversations ?? 0, audio_files: removedAudio, facilitator_emails: data?.emails ?? 0 },
  });
  redirect(`${path}?done=${data?.submissions ?? 0}-${data?.conversations ?? 0}-${removedAudio}-${data?.emails ?? 0}`);
}

// The facilitator's after-page link --------------------------------------------------------------------------

export interface AfterLinkState {
  ok: boolean;
  message?: string;
  error?: string;
  /** The link itself, only when the email could not be sent, so a staff member can hand it over. */
  url?: string;
}

/** Emails one table's facilitator a new after-page link. A new link replaces the last, so an earlier email stops working. */
export async function emailFacilitatorLink(_previous: AfterLinkState, formData: FormData): Promise<AfterLinkState> {
  const { profile } = await assertAudienceListeningContext();
  const eventId = field(formData, "event_id");
  const tableId = field(formData, "table_id");
  const result = await sendAfterLink(eventId, tableId);
  if (!result.ok) return { ok: false, error: result.error, ...(result.url ? { url: result.url } : {}) };
  // No address, token or link in the record: only that one was sent, and for which table.
  await logAuditEvent({ actorId: profile.id, action: "al.table.after_link_sent", targetType: "al_table", targetId: tableId });
  revalidatePath(tablePath(eventId, tableId));
  return { ok: true, message: "The link was emailed to the facilitator." };
}

/**
 * Emails every facilitator at an event who has an email, a conversation not yet sent to the station and no link yet. Nothing sends on
 * its own: there is no scheduler, so this is the button staff press once transcripts are ready. A failure for one table does not stop
 * the rest; the count of each comes back on the event page.
 */
export async function emailPendingFacilitatorLinks(formData: FormData): Promise<void> {
  const { profile } = await assertAudienceListeningContext();
  const eventId = field(formData, "event_id");
  const path = `/audience-listening/events/${eventId}`;
  const [tables, conversations] = await Promise.all([listTables(eventId), listConversations(eventId)]);
  let sent = 0;
  let failed = 0;
  for (const table of tables) {
    const conversation = conversations.find((c) => c.table_id === table.id) ?? null;
    if (!needsAfterLink(table, conversation)) continue;
    const result = await sendAfterLink(eventId, table.id);
    if (result.ok) sent += 1;
    else failed += 1;
  }
  await logAuditEvent({ actorId: profile.id, action: "al.event.after_links_sent", targetType: "al_event", targetId: eventId, metadata: { sent, failed } });
  revalidatePath(path);
  redirect(`${path}?links_sent=${sent}&links_failed=${failed}`);
}

// Marked lines as Sourcework excerpts -----------------------------------------------------------------------

/**
 * Turns the lines a facilitator marked into Sourcework excerpts, made as the staff member who pressed this (Sourcework records who made
 * an excerpt). The scheduled run does the same as the campaign's owner once a transcript is ready; this is for doing it now. The
 * database function is service-role only, so the admin client calls it, after the staff member's own access to both tools is checked.
 */
export async function makeExcerptsFromMarks(formData: FormData): Promise<void> {
  const { profile } = await assertAudienceListeningContext();
  const eventId = field(formData, "event_id");
  const tableId = field(formData, "table_id");
  const conversationId = field(formData, "conversation_id");
  const path = tablePath(eventId, tableId);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await canUseTool(user, "transcription"))) {
    failWith(path, "Making excerpts needs Sourcework, and either it is switched off or you do not have access to it. Ask an administrator.");
  }
  // The conversation must be one this person can see, and belong to the table on the page.
  const { data: conversation, error: readError } = await supabase.from("al_conversations").select("id").eq("id", conversationId).eq("table_id", tableId).maybeSingle();
  failIfError(readError, path, "Could not read the conversation");
  if (!conversation) failWith(path, "That conversation no longer exists.");
  const { data: made, error } = await createAdminClient().rpc("al_create_excerpts_from_highlights", { p_conversation_id: conversationId, p_created_by: profile.id });
  failIfError(error, path, "Could not make the excerpts");
  await logAuditEvent({ actorId: profile.id, action: "al.conversation.excerpts_made", targetType: "al_conversation", targetId: conversationId, metadata: { excerpts: made ?? 0 } });
  revalidatePath(path);
  redirect(`${path}?notice=excerpts-${made ?? 0}`);
}
