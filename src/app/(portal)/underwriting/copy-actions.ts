"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertUnderwritingAccess } from "@/lib/underwriting/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import type { UwCopyApprovalStatus, UwCopyExecutionKind } from "@/lib/database.types";

const LIST_PATH = "/underwriting/copy";

function copyPath(id: string): string {
  return `${LIST_PATH}/${id}`;
}

function contractPath(id: string): string {
  return `/underwriting/contracts/${id}`;
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function optionalField(formData: FormData, name: string): string | null {
  const value = field(formData, name);
  return value === "" ? null : value;
}

const EXECUTION_KINDS: UwCopyExecutionKind[] = ["live_read", "recorded"];

export async function createCopy(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const label = field(formData, "label");
  if (label === "") failWith(LIST_PATH, "Give this copy a short label (e.g. \"Message A\").");
  const executionKind = field(formData, "execution_kind") as UwCopyExecutionKind;
  if (!EXECUTION_KINDS.includes(executionKind)) failWith(LIST_PATH, "That is not a recognized execution kind.");

  const durationRaw = optionalField(formData, "duration_seconds");
  const durationSeconds = durationRaw === null ? null : Number.parseInt(durationRaw, 10);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("uw_copy")
    .insert({
      label,
      script: optionalField(formData, "script"),
      execution_kind: executionKind,
      cart_identifier: optionalField(formData, "cart_identifier"),
      duration_seconds: durationSeconds !== null && Number.isFinite(durationSeconds) ? durationSeconds : null,
      effective_from: optionalField(formData, "effective_from") ?? undefined,
      effective_to: optionalField(formData, "effective_to"),
      created_by: profile.id,
    })
    .select("id")
    .single();
  failIfError(error, LIST_PATH, "Could not create the copy");
  if (!data) failWith(LIST_PATH, "Could not create the copy.");

  // Point 23 of the domain redesign: creating copy from a contract's own
  // screen links it to that contract in the same step, rather than forcing
  // a separate "create, then go link it" round trip.
  const contractId = optionalField(formData, "contract_id");
  if (contractId) {
    const { error: linkError } = await supabase
      .from("uw_contract_copy")
      .insert({ contract_id: contractId, copy_id: data.id });
    failIfError(linkError, contractPath(contractId), "Copy created, but could not link it to this contract");
    revalidatePath(contractPath(contractId));
    redirect(contractPath(contractId));
  }

  revalidatePath(LIST_PATH);
  redirect(copyPath(data.id));
}

/** Corrects a copy's own metadata in place — label, script, cart #, duration, effective dates. No approval workflow gate: see setCopyStatus below for that. */
export async function updateCopyDetails(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const id = field(formData, "copy_id");
  const path = copyPath(id);

  const durationRaw = optionalField(formData, "duration_seconds");
  const durationSeconds = durationRaw === null ? null : Number.parseInt(durationRaw, 10);
  if (durationSeconds !== null && (!Number.isFinite(durationSeconds) || durationSeconds <= 0)) {
    failWith(path, "Duration must be a whole number of seconds greater than zero.");
  }

  const executionKind = field(formData, "execution_kind") as UwCopyExecutionKind;
  if (!EXECUTION_KINDS.includes(executionKind)) failWith(path, "That is not a recognized execution kind.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("uw_copy")
    .update({
      label: field(formData, "label") || undefined,
      script: optionalField(formData, "script"),
      execution_kind: executionKind,
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

export async function setCopyStatus(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const id = field(formData, "copy_id");
  const path = copyPath(id);
  const approvalStatus = field(formData, "approval_status") as UwCopyApprovalStatus;
  if (!APPROVAL_STATUSES.includes(approvalStatus)) failWith(path, "That is not a recognized approval status.");

  const supabase = await createClient();
  const { error } = await supabase.from("uw_copy").update({ approval_status: approvalStatus }).eq("id", id);
  failIfError(error, path, "Could not update the copy's status");

  revalidatePath(path);
  revalidatePath(LIST_PATH);
  redirect(path);
}
