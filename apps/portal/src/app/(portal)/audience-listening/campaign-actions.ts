"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { field, optionalField, optionalInt } from "@/lib/form-fields";
import { deleteOrFail, failIfError, failWith } from "@/lib/editorial/action-result";
import { logAuditEvent } from "@/lib/audit";
import { assertAudienceListeningContext, assertAudienceListeningCoordinator } from "@/lib/audience-listening/access";
import { generatePublicId } from "@/lib/audience-listening/public-id";
import { stationInputToUTC } from "@/lib/audience-listening/event-times";
import { reorderPositions } from "@/lib/audience-listening/query-state";
import {
  CAMPAIGN_ACTION_TARGET,
  availableCampaignActions,
  openingProblem,
  parseTagList,
  slugify,
  validateCampaignInput,
  validatePromptInput,
  type CampaignAction,
} from "@/lib/audience-listening/campaigns";
import { countPrompts, getCampaign, listPrompts } from "@/lib/audience-listening/campaign-queries";
import { UUID_RE } from "@/lib/form-fields";

const CAMPAIGNS_PATH = "/audience-listening/campaigns";

function campaignPath(id: string, tab?: string): string {
  return tab ? `${CAMPAIGNS_PATH}/${id}?tab=${tab}` : `${CAMPAIGNS_PATH}/${id}`;
}

/** A `datetime-local` value typed in the station's zone, as a timestamp; null if it was left blank. */
function stationTimestamp(formData: FormData, name: string, path: string, what: string): string | null {
  const raw = field(formData, name);
  if (!raw) return null;
  const iso = stationInputToUTC(raw);
  if (!iso) failWith(path, `${what} is not a date and time.`);
  return iso;
}

async function slugIsTaken(slug: string, exceptId?: string): Promise<boolean> {
  const supabase = await createClient();
  let query = supabase.from("al_campaigns").select("id", { count: "exact", head: true }).eq("slug", slug);
  if (exceptId) query = query.neq("id", exceptId);
  const { count, error } = await query;
  if (error) throw new Error(`Could not check the short name: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function createCampaign(formData: FormData): Promise<void> {
  const { profile } = await assertAudienceListeningContext();
  const newPath = `${CAMPAIGNS_PATH}/new`;

  const title = field(formData, "title");
  const question = field(formData, "question");
  const slug = field(formData, "slug") || slugify(title);
  const opensAt = stationTimestamp(formData, "opens_at", newPath, "The opening date");
  const closesAt = stationTimestamp(formData, "closes_at", newPath, "The closing date");
  const problem = validateCampaignInput({ title, question, slug, intro: field(formData, "intro"), opensAt, closesAt });
  if (problem) failWith(newPath, problem);
  if (await slugIsTaken(slug)) failWith(newPath, "Another campaign already uses that short name. Choose a different one.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("al_campaigns")
    .insert({
      public_id: generatePublicId(),
      slug,
      title,
      question,
      intro: field(formData, "intro"),
      owner_label: optionalField(formData, "owner_label"),
      opens_at: opensAt,
      closes_at: closesAt,
      owner_id: profile.id,
      created_by: profile.id,
    })
    .select("id")
    .single();
  failIfError(error, newPath, "Could not create the campaign");
  if (!data) failWith(newPath, "Could not create the campaign — no row was created.");

  await logAuditEvent({ actorId: profile.id, action: "al.campaign.created", targetType: "al_campaign", targetId: data.id, metadata: { title } });
  redirect(campaignPath(data.id, "prompts"));
}

export async function updateCampaign(formData: FormData): Promise<void> {
  const { profile } = await assertAudienceListeningContext();
  const id = field(formData, "campaign_id");
  const path = campaignPath(id, "settings");

  const title = field(formData, "title");
  const question = field(formData, "question");
  const slug = field(formData, "slug");
  const opensAt = stationTimestamp(formData, "opens_at", path, "The opening date");
  const closesAt = stationTimestamp(formData, "closes_at", path, "The closing date");
  const problem = validateCampaignInput({ title, question, slug, intro: field(formData, "intro"), opensAt, closesAt });
  if (problem) failWith(path, problem);
  if (await slugIsTaken(slug, id)) failWith(path, "Another campaign already uses that short name. Choose a different one.");

  const queryId = field(formData, "query_id");
  if (queryId && !UUID_RE.test(queryId)) failWith(path, "Choose a query from the list.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("al_campaigns")
    .update({
      title,
      question,
      slug,
      intro: field(formData, "intro"),
      owner_label: optionalField(formData, "owner_label"),
      internal_notes: optionalField(formData, "internal_notes"),
      opens_at: opensAt,
      closes_at: closesAt,
      query_id: queryId || null,
    })
    .eq("id", id);
  failIfError(error, path, "Could not save the campaign");

  await logAuditEvent({ actorId: profile.id, action: "al.campaign.updated", targetType: "al_campaign", targetId: id });
  redirect(path);
}

export async function setCampaignStatus(formData: FormData): Promise<void> {
  const { profile } = await assertAudienceListeningContext();
  const id = field(formData, "campaign_id");
  const action = field(formData, "action") as CampaignAction;
  const path = campaignPath(id);

  const campaign = await getCampaign(id);
  if (!campaign) failWith(CAMPAIGNS_PATH, "That campaign no longer exists.");
  if (!availableCampaignActions(campaign.status).includes(action)) {
    failWith(path, "That isn't possible from the campaign's current state.");
  }
  if (action === "open" || action === "reopen") {
    const problem = openingProblem({ promptCount: await countPrompts(id), closesAt: campaign.closes_at }, new Date());
    if (problem) failWith(path, problem);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("al_campaigns").update({ status: CAMPAIGN_ACTION_TARGET[action] }).eq("id", id);
  failIfError(error, path, "Could not change the campaign's status");

  await logAuditEvent({
    actorId: profile.id,
    action: `al.campaign.${action}`,
    targetType: "al_campaign",
    targetId: id,
    metadata: { from: campaign.status, to: CAMPAIGN_ACTION_TARGET[action] },
  });
  redirect(path);
}

export async function deleteCampaign(formData: FormData): Promise<void> {
  const { profile } = await assertAudienceListeningContext();
  const id = field(formData, "campaign_id");
  const path = campaignPath(id, "settings");
  // RLS lets a draft go; the foreign key from events keeps one with events. Say which, rather than "no permission".
  await deleteOrFail(
    (await createClient()).from("al_campaigns").delete().eq("id", id).select("id"),
    path,
    "Could not delete the campaign",
    "Only a draft campaign with no events can be deleted. Close and archive one that has run.",
  );
  await logAuditEvent({ actorId: profile.id, action: "al.campaign.deleted", targetType: "al_campaign", targetId: id });
  redirect(CAMPAIGNS_PATH);
}

// Prompts ------------------------------------------------------------------------------------------------

function promptFields(formData: FormData) {
  return {
    kind: field(formData, "kind"),
    text: field(formData, "text"),
    hint: optionalField(formData, "hint"),
    suggestedSeconds: optionalInt(formData, "suggested_seconds"),
  };
}

export async function addPrompt(formData: FormData): Promise<void> {
  await assertAudienceListeningContext();
  const campaignId = field(formData, "campaign_id");
  const path = campaignPath(campaignId, "prompts");
  const input = promptFields(formData);
  const problem = validatePromptInput(input);
  if (problem) failWith(path, problem);

  const existing = await listPrompts(campaignId);
  const supabase = await createClient();
  const { error } = await supabase.from("al_campaign_prompts").insert({
    campaign_id: campaignId,
    position: existing.length + 1,
    kind: input.kind as "intro" | "question" | "prompt",
    text: input.text,
    hint: input.hint,
    suggested_seconds: input.suggestedSeconds,
  });
  failIfError(error, path, "Could not add the prompt");
  redirect(path);
}

export async function updatePrompt(formData: FormData): Promise<void> {
  await assertAudienceListeningContext();
  const campaignId = field(formData, "campaign_id");
  const path = campaignPath(campaignId, "prompts");
  const input = promptFields(formData);
  const problem = validatePromptInput(input);
  if (problem) failWith(path, problem);

  const supabase = await createClient();
  const { error } = await supabase
    .from("al_campaign_prompts")
    .update({
      kind: input.kind as "intro" | "question" | "prompt",
      text: input.text,
      hint: input.hint,
      suggested_seconds: input.suggestedSeconds,
    })
    .eq("id", field(formData, "prompt_id"))
    .eq("campaign_id", campaignId);
  failIfError(error, path, "Could not save the prompt");
  redirect(path);
}

export async function movePrompt(campaignId: string, formData: FormData): Promise<void> {
  await assertAudienceListeningContext();
  const path = campaignPath(campaignId, "prompts");
  const direction = field(formData, "direction") === "up" ? "up" : "down";

  const prompts = await listPrompts(campaignId);
  const reordered = reorderPositions(prompts, field(formData, "prompt_id"), direction);
  const supabase = await createClient();
  for (const prompt of reordered) {
    const before = prompts.find((p) => p.id === prompt.id);
    if (before && before.position !== prompt.position) {
      const { error } = await supabase.from("al_campaign_prompts").update({ position: prompt.position }).eq("id", prompt.id);
      failIfError(error, path, "Could not reorder the prompts");
    }
  }
  redirect(path);
}

export async function deletePrompt(formData: FormData): Promise<void> {
  await assertAudienceListeningContext();
  const campaignId = field(formData, "campaign_id");
  const path = campaignPath(campaignId, "prompts");
  const supabase = await createClient();
  await deleteOrFail(
    supabase.from("al_campaign_prompts").delete().eq("id", field(formData, "prompt_id")).eq("campaign_id", campaignId).select("id"),
    path,
    "Could not remove the prompt",
  );
  // Close the gap, so positions stay 1..n.
  const remaining = await listPrompts(campaignId);
  for (const [index, prompt] of remaining.entries()) {
    if (prompt.position !== index + 1) {
      const { error } = await supabase.from("al_campaign_prompts").update({ position: index + 1 }).eq("id", prompt.id);
      failIfError(error, path, "Could not renumber the prompts");
    }
  }
  redirect(path);
}

// Tags ---------------------------------------------------------------------------------------------------

/** The vocabulary is saved as one list: what is typed is the set, in the order typed. */
export async function saveTags(formData: FormData): Promise<void> {
  await assertAudienceListeningContext();
  const campaignId = field(formData, "campaign_id");
  const path = campaignPath(campaignId, "prompts");
  const { tags, tooLong, tooMany } = parseTagList(field(formData, "tags"));
  if (tooLong.length > 0) failWith(path, `A tag can be at most 40 characters: "${tooLong[0]}" is longer. Nothing was saved.`);
  if (tooMany > 0) failWith(path, "A campaign can have at most 24 tags. Nothing was saved.");

  const supabase = await createClient();
  const existing = await supabase.from("al_campaign_tags").select("id, label").eq("campaign_id", campaignId);
  failIfError(existing.error, path, "Could not read the tags");
  const have = new Map((existing.data ?? []).map((t) => [t.label.trim().toLowerCase(), t.id]));
  const keep = new Set(tags.map((t) => t.toLowerCase()));

  const removeIds = [...have.entries()].filter(([label]) => !keep.has(label)).map(([, tagId]) => tagId);
  if (removeIds.length > 0) {
    const { error } = await supabase.from("al_campaign_tags").delete().in("id", removeIds);
    failIfError(error, path, "Could not remove tags");
  }
  for (const [index, label] of tags.entries()) {
    const tagId = have.get(label.toLowerCase());
    const { error } = tagId
      ? await supabase.from("al_campaign_tags").update({ label, position: index + 1 }).eq("id", tagId)
      : await supabase.from("al_campaign_tags").insert({ campaign_id: campaignId, label, position: index + 1 });
    failIfError(error, path, "Could not save the tags");
  }
  redirect(path);
}


// Consent wording ------------------------------------------------------------------------------------------

export const MAX_CONSENT_TEXT_LENGTH = 4000;

/**
 * Adds a new version of the group-consent wording. A coordinator only (the database says the same): it is what every table agrees to,
 * and it is settled with the University's counsel. A version is never edited, so a table's agreement always points at the exact words
 * its facilitator read.
 */
export async function addConsentText(formData: FormData): Promise<void> {
  const { profile } = await assertAudienceListeningCoordinator();
  const path = "/audience-listening/consent";
  const body = field(formData, "body");
  if (!body) failWith(path, "Write the words to be read aloud.");
  if (body.length > MAX_CONSENT_TEXT_LENGTH) failWith(path, `The wording can be at most ${MAX_CONSENT_TEXT_LENGTH} characters.`);

  const supabase = await createClient();
  const { error } = await supabase.from("al_consent_texts").insert({ body, created_by: profile.id });
  failIfError(error, path, "Could not save the wording");
  await logAuditEvent({ actorId: profile.id, action: "al.consent_text.added", targetType: "al_consent_text" });
  redirect(path);
}
