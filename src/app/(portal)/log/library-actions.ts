"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertLogAccess } from "@/lib/log/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import type { LogApprovalStatus, LogComponentType, LogContentType } from "@/lib/database.types";

const LIST_PATH = "/log/library";
const NEW_PATH = "/log/library/new";

function detailPath(id: string): string {
  return `${LIST_PATH}/${id}`;
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function optionalField(formData: FormData, name: string): string | null {
  const value = field(formData, name);
  return value === "" ? null : value;
}

function optionalInt(formData: FormData, name: string): number | null {
  const value = optionalField(formData, name);
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitTags(formData: FormData, name: string): string[] {
  return field(formData, name)
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
}

const CONTENT_TYPES: LogContentType[] = [
  "news",
  "station_promo",
  "program_promo",
  "membership_message",
  "university_announcement",
  "psa",
  "legal_id",
  "interview_feature",
  "host_created",
];

export async function createContentItem(formData: FormData): Promise<void> {
  const { profile } = await assertLogAccess();
  const title = field(formData, "title");
  if (title === "") failWith(NEW_PATH, "Give the item a title.");
  const contentType = field(formData, "content_type") as LogContentType;
  if (!CONTENT_TYPES.includes(contentType)) failWith(NEW_PATH, "That is not a recognized content type.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("log_content_items")
    .insert({
      content_type: contentType,
      title,
      script: optionalField(formData, "script"),
      summary: optionalField(formData, "summary"),
      expected_duration_seconds: optionalInt(formData, "expected_duration_seconds"),
      effective_from: optionalField(formData, "effective_from") ?? undefined,
      effective_to: optionalField(formData, "effective_to"),
      owner_id: profile.id,
      eligible_program_ids: formData.getAll("eligible_program_ids").map(String),
      priority: optionalInt(formData, "priority"),
      frequency_guidance: optionalField(formData, "frequency_guidance"),
      reusable: formData.get("reusable") === "on",
      geography_tags: splitTags(formData, "geography_tags"),
      subject_tags: splitTags(formData, "subject_tags"),
      community_issue_tags: splitTags(formData, "community_issue_tags"),
      reporter_or_editor: optionalField(formData, "reporter_or_editor"),
      dad_cart_number: optionalField(formData, "dad_cart_number"),
      created_by: profile.id,
    })
    .select("id")
    .single();
  failIfError(error, NEW_PATH, "Could not create the content item");
  if (!data) failWith(NEW_PATH, "Could not create the content item.");

  revalidatePath(LIST_PATH);
  redirect(detailPath(data.id));
}

const APPROVAL_STATUSES: LogApprovalStatus[] = ["draft", "approved", "retired"];

export async function setApprovalStatus(formData: FormData): Promise<void> {
  await assertLogAccess();
  const id = field(formData, "content_item_id");
  const path = detailPath(id);
  const status = field(formData, "approval_status") as LogApprovalStatus;
  if (!APPROVAL_STATUSES.includes(status)) failWith(path, "That is not a recognized status.");

  const supabase = await createClient();
  const { error } = await supabase.from("log_content_items").update({ approval_status: status }).eq("id", id);
  failIfError(error, path, "Could not update the status");

  revalidatePath(path);
  revalidatePath(LIST_PATH);
  redirect(path);
}

const COMPONENT_TYPES: LogComponentType[] = ["live_intro", "recorded_audio", "live_outro", "optional_tag"];

export async function addComponent(formData: FormData): Promise<void> {
  await assertLogAccess();
  const contentItemId = field(formData, "content_item_id");
  const path = detailPath(contentItemId);
  const componentType = field(formData, "component_type") as LogComponentType;
  if (!COMPONENT_TYPES.includes(componentType)) failWith(path, "That is not a recognized component type.");
  const sequence = Number.parseInt(field(formData, "sequence"), 10);
  const durationSeconds = Number.parseInt(field(formData, "duration_seconds"), 10);
  if (!Number.isFinite(sequence) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    failWith(path, "Give the component a sequence and a duration greater than zero.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("log_content_components").insert({
    content_item_id: contentItemId,
    component_type: componentType,
    sequence,
    duration_seconds: durationSeconds,
    required: formData.get("required") === "on",
    script: optionalField(formData, "script"),
    dad_cart_number: optionalField(formData, "dad_cart_number"),
  });
  failIfError(error, path, "Could not add the component");

  revalidatePath(path);
  redirect(path);
}

/**
 * Updates a content item's own ENCO/DAD cart reference in place — ENCO/DAD
 * is WUWF's playback system of record (CLAUDE.md's "Log domain redesign"
 * note); the portal never stores or plays the audio itself.
 */
export async function setItemDadCartNumber(formData: FormData): Promise<void> {
  await assertLogAccess();
  const id = field(formData, "content_item_id");
  const path = detailPath(id);

  const supabase = await createClient();
  const { error } = await supabase
    .from("log_content_items")
    .update({ dad_cart_number: optionalField(formData, "dad_cart_number") })
    .eq("id", id);
  failIfError(error, path, "Could not update the DAD cart reference");

  revalidatePath(path);
  redirect(path);
}
