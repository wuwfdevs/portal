"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertUnderwritingAccess } from "@/lib/underwriting/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import type { UwCopyApprovalStatus, UwCopyProductionStatus } from "@/lib/database.types";

const LIST_PATH = "/underwriting/copy";
const NEW_PATH = "/underwriting/copy/new";

function copyPath(id: string): string {
  return `${LIST_PATH}/${id}`;
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function optionalField(formData: FormData, name: string): string | null {
  const value = field(formData, name);
  return value === "" ? null : value;
}

export async function createCopy(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("uw_copy")
    .insert({
      script: optionalField(formData, "script"),
      cart_identifier: optionalField(formData, "cart_identifier"),
      effective_from: optionalField(formData, "effective_from") ?? undefined,
      effective_to: optionalField(formData, "effective_to"),
      created_by: profile.id,
    })
    .select("id")
    .single();
  failIfError(error, NEW_PATH, "Could not create the copy");
  if (!data) failWith(NEW_PATH, "Could not create the copy.");

  revalidatePath(LIST_PATH);
  redirect(copyPath(data.id));
}

/** Corrects a copy's own metadata in place — script, cart #, duration, effective dates. No approval workflow gate: see setCopyStatus below for that. */
export async function updateCopyDetails(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const id = field(formData, "copy_id");
  const path = copyPath(id);

  const durationRaw = optionalField(formData, "duration_seconds");
  const durationSeconds = durationRaw === null ? null : Number.parseInt(durationRaw, 10);
  if (durationSeconds !== null && (!Number.isFinite(durationSeconds) || durationSeconds <= 0)) {
    failWith(path, "Duration must be a whole number of seconds greater than zero.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("uw_copy")
    .update({
      script: optionalField(formData, "script"),
      cart_identifier: optionalField(formData, "cart_identifier"),
      duration_seconds: durationSeconds,
      effective_from: field(formData, "effective_from") || undefined,
      effective_to: optionalField(formData, "effective_to"),
    })
    .eq("id", id);
  failIfError(error, path, "Could not update this copy");

  revalidatePath(path);
  redirect(path);
}

const APPROVAL_STATUSES: UwCopyApprovalStatus[] = ["draft", "approved", "expired", "retired"];
const PRODUCTION_STATUSES: UwCopyProductionStatus[] = ["pending", "produced"];

export async function setCopyStatus(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const id = field(formData, "copy_id");
  const path = copyPath(id);
  const approvalStatus = field(formData, "approval_status") as UwCopyApprovalStatus;
  const productionStatus = field(formData, "production_status") as UwCopyProductionStatus;
  if (!APPROVAL_STATUSES.includes(approvalStatus)) failWith(path, "That is not a recognized approval status.");
  if (!PRODUCTION_STATUSES.includes(productionStatus)) {
    failWith(path, "That is not a recognized production status.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("uw_copy")
    .update({ approval_status: approvalStatus, production_status: productionStatus })
    .eq("id", id);
  failIfError(error, path, "Could not update the copy's status");

  revalidatePath(path);
  revalidatePath(LIST_PATH);
  redirect(path);
}

/** Records a storage path already uploaded client-side — see copy-audio-upload.tsx. */
export async function completeCopyAudioUpload(
  copyId: string,
  storagePath: string,
): Promise<{ error?: string }> {
  await assertUnderwritingAccess();
  const supabase = await createClient();

  const { error } = await supabase.from("uw_copy").update({ audio_object_path: storagePath }).eq("id", copyId);
  if (error) {
    console.error("Could not save uploaded copy audio", error);
    return { error: "Could not save the uploaded audio." };
  }

  revalidatePath(copyPath(copyId));
  return {};
}
