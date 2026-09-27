"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertUnderwritingAccess } from "@/lib/underwriting/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import type { UwCopyApprovalStatus, UwCopyExecutionKind } from "@/lib/database.types";
import { estimateReadSeconds } from "@/lib/log/read-time";

const LIST_PATH = "/underwriting/copy";
const NEW_COPY_PATH = `${LIST_PATH}/new`;

function copyPath(id: string): string {
  return `${LIST_PATH}/${id}`;
}

function editCopyPath(id: string): string {
  return `${copyPath(id)}/edit`;
}

function contractPath(id: string): string {
  return `/underwriting/contracts/${id}`;
}

/**
 * Where a contract-scoped copy submit returns to: the setup wizard's copy
 * step (return_to=policy) or the contract page. A failure lands there too,
 * so the message renders on the form that raised it.
 */
function contractReturnPath(formData: FormData, contractId: string): string {
  return field(formData, "return_to") === "policy"
    ? `${contractPath(contractId)}/policy`
    : contractPath(contractId);
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function optionalField(formData: FormData, name: string): string | null {
  const value = field(formData, name);
  return value === "" ? null : value;
}

const EXECUTION_KINDS: UwCopyExecutionKind[] = ["live_read", "recorded"];

/**
 * A live read left without a duration gets its read-time estimate — the
 * same default the program-log import stores (lib/log/read-time.ts). A
 * recorded spot's length is the audio's, which no script can estimate.
 */
function defaultCopyDuration(
  executionKind: UwCopyExecutionKind,
  script: string | null,
): number | null {
  return executionKind === "live_read" ? estimateReadSeconds(script) : null;
}

export async function createCopy(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const contractId = optionalField(formData, "contract_id");
  // A failure returns to whichever form posted: the library's /new page, or
  // the contract's own copy step.
  const failPath = contractId ? contractReturnPath(formData, contractId) : NEW_COPY_PATH;
  const label = field(formData, "label");
  if (label === "") failWith(failPath, 'Give this copy a short label (e.g. "Message A").');
  const executionKind = field(formData, "execution_kind") as UwCopyExecutionKind;
  if (!EXECUTION_KINDS.includes(executionKind))
    failWith(failPath, "That is not a recognized execution kind.");

  const script = optionalField(formData, "script");
  const durationRaw = optionalField(formData, "duration_seconds");
  const durationSeconds = durationRaw === null ? null : Number.parseInt(durationRaw, 10);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("uw_copy")
    .insert({
      label,
      script,
      execution_kind: executionKind,
      cart_identifier: optionalField(formData, "cart_identifier"),
      duration_seconds:
        durationSeconds !== null && Number.isFinite(durationSeconds)
          ? durationSeconds
          : defaultCopyDuration(executionKind, script),
      effective_from: optionalField(formData, "effective_from") ?? undefined,
      effective_to: optionalField(formData, "effective_to"),
      created_by: profile.id,
    })
    .select("id")
    .single();
  failIfError(error, failPath, "Could not create the copy");
  if (!data) failWith(failPath, "Could not create the copy.");

  // Point 23 of the domain redesign: creating copy from a contract's own
  // screen links it to that contract in the same step, rather than forcing
  // a separate "create, then go link it" round trip.
  if (contractId) {
    const { error: linkError } = await supabase
      .from("uw_contract_copy")
      .insert({ contract_id: contractId, copy_id: data.id });
    failIfError(
      linkError,
      contractPath(contractId),
      "Copy created, but could not link it to this contract",
    );
    revalidatePath(contractPath(contractId));
    // The setup wizard's copy step posts return_to=policy to stay on it.
    redirect(contractReturnPath(formData, contractId));
  }

  revalidatePath(LIST_PATH);
  redirect(`${copyPath(data.id)}?saved=created`);
}

/** Corrects a copy's own metadata in place — label, script, cart #, duration, effective dates — from /copy/[id]/edit. No approval workflow gate: see setCopyStatus below for that. */
export async function updateCopyDetails(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const id = field(formData, "copy_id");
  const path = editCopyPath(id);

  const durationRaw = optionalField(formData, "duration_seconds");
  const durationSeconds = durationRaw === null ? null : Number.parseInt(durationRaw, 10);
  if (durationSeconds !== null && (!Number.isFinite(durationSeconds) || durationSeconds <= 0)) {
    failWith(path, "Duration must be a whole number of seconds greater than zero.");
  }

  const executionKind = field(formData, "execution_kind") as UwCopyExecutionKind;
  if (!EXECUTION_KINDS.includes(executionKind))
    failWith(path, "That is not a recognized execution kind.");

  const script = optionalField(formData, "script");
  const supabase = await createClient();
  const { error } = await supabase
    .from("uw_copy")
    .update({
      label: field(formData, "label") || undefined,
      script,
      execution_kind: executionKind,
      cart_identifier: optionalField(formData, "cart_identifier"),
      duration_seconds: durationSeconds ?? defaultCopyDuration(executionKind, script),
      effective_from: field(formData, "effective_from") || undefined,
      effective_to: optionalField(formData, "effective_to"),
    })
    .eq("id", id);
  failIfError(error, path, "Could not update this copy");

  revalidatePath(copyPath(id));
  revalidatePath(LIST_PATH);
  redirect(`${copyPath(id)}?saved=1`);
}

const APPROVAL_STATUSES: UwCopyApprovalStatus[] = ["draft", "approved", "expired", "retired"];

export async function setCopyStatus(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const id = field(formData, "copy_id");
  const path = copyPath(id);
  const approvalStatus = field(formData, "approval_status") as UwCopyApprovalStatus;
  if (!APPROVAL_STATUSES.includes(approvalStatus))
    failWith(path, "That is not a recognized approval status.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("uw_copy")
    .update({ approval_status: approvalStatus })
    .eq("id", id);
  failIfError(error, path, "Could not update the copy's status");

  revalidatePath(path);
  revalidatePath(LIST_PATH);
  redirect(path);
}
