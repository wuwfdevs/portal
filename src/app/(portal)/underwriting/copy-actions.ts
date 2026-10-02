"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertUnderwritingAccess } from "@/lib/underwriting/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import type { UwCopyApprovalStatus, UwCopyExecutionKind } from "@/lib/database.types";
import { estimateReadSeconds } from "@/lib/log/read-time";
import { rebalanceRotationForCopy } from "@/lib/underwriting/rotation-rebalance";
import { isPortalAssignedCut, normalizeDadCut } from "@/lib/underwriting/dad-cut";
import { playsRecording } from "@/lib/underwriting/legacy-copy";

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
 * step (return_to=copy) or the contract page's Copy tab. A failure lands
 * there too, with the card that raised it reopened (`?new=1`,
 * `?edit=<id>`), so the message renders on the form that raised it.
 */
function contractReturnPath(formData: FormData, contractId: string): string {
  return field(formData, "return_to") === "copy"
    ? `${contractPath(contractId)}/copy`
    : `${contractPath(contractId)}?tab=copy`;
}

function withQuery(path: string, query: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${query}`;
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

/**
 * What the copy form's "In DAD" fieldset asks to store in uw_copy.dad_cut.
 * `{ write: false }` leaves the column alone; `{ write: true, cut: null }`
 * clears it, which the uw_copy_assign_dad_cut trigger answers with the next
 * Portal cut (20261002120100); a string is stored as typed or picked.
 *   * New recording, nothing typed: on create, the trigger assigns one; on
 *     edit, a Portal cut stays, and a picked spot is swapped for a new cut.
 *   * New recording, typed: that cut, normalized.
 *   * Existing DAD spot: the picked cut. Nothing picked is an error, except
 *     copy that plays a spot nobody has picked yet, which stays as it is.
 */
function resolveDadCut(
  formData: FormData,
  script: string | null,
  currentCut: string | null,
): { write: false } | { write: true; cut: string | null } | { error: string } {
  const source = field(formData, "dad_cut_source");
  const typed = field(formData, "dad_cut");
  if (source === "existing") {
    if (typed === "") {
      if (currentCut === null && script !== null && playsRecording(script)) return { write: false };
      return { error: "Pick the DAD spot this message plays, or choose New recording." };
    }
    const cut = normalizeDadCut(typed);
    if (cut === null) return { error: "That isn't a DAD cut number." };
    return { write: true, cut };
  }
  if (typed !== "") {
    const cut = normalizeDadCut(typed);
    if (cut === null)
      return { error: "A DAD cut is five digits, with an A for a Portal cut (00013A)." };
    return { write: true, cut };
  }
  if (currentCut !== null && isPortalAssignedCut(currentCut)) return { write: false };
  return currentCut === null ? { write: false } : { write: true, cut: null };
}

/** A unique-index clash on uw_copy_dad_cut_key reads as a sentence, not a Postgres error. */
function dadCutClash(error: { code?: string; message: string } | null): boolean {
  return error?.code === "23505" && error.message.includes("uw_copy_dad_cut_key");
}

export async function createCopy(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const contractId = optionalField(formData, "contract_id");
  // A failure returns to whichever form posted: the library's /new page, or
  // the contract's own inline "New message" card.
  const failPath = contractId
    ? withQuery(contractReturnPath(formData, contractId), "new=1")
    : NEW_COPY_PATH;
  const label = field(formData, "label");
  if (label === "") failWith(failPath, 'Give this copy a short label (e.g. "Message A").');
  const executionKind = field(formData, "execution_kind") as UwCopyExecutionKind;
  if (!EXECUTION_KINDS.includes(executionKind))
    failWith(failPath, "That is not a recognized execution kind.");

  const script = optionalField(formData, "script");
  const durationRaw = optionalField(formData, "duration_seconds");
  const durationSeconds = durationRaw === null ? null : Number.parseInt(durationRaw, 10);
  const dadCut = resolveDadCut(formData, script, null);
  if ("error" in dadCut) failWith(failPath, dadCut.error);

  const supabase = await createClient();
  // From a contract's own screen the message is attributed to that
  // contract's underwriter directly (uw_copy.underwriter_id, the same
  // column the program-log import fills), so the "link existing" picker
  // can list the underwriter's copy before any placement exists; and
  // "Approved — ready to place" skips the draft round trip for wording the
  // sponsor has already signed off (docs/underwriting-traffic-redesign.md
  // §13).
  const contract = contractId
    ? (
        await supabase
          .from("uw_contracts")
          .select("underwriter_id, effective_from")
          .eq("id", contractId)
          .maybeSingle()
      ).data
    : null;
  if (contractId && !contract) failWith(failPath, "That contract no longer exists.");
  const approveNow = contractId !== null && formData.get("approve_now") === "on";
  const { data, error } = await supabase
    .from("uw_copy")
    .insert({
      label,
      script,
      execution_kind: executionKind,
      ...(dadCut.write ? { dad_cut: dadCut.cut } : {}),
      duration_seconds:
        durationSeconds !== null && Number.isFinite(durationSeconds)
          ? durationSeconds
          : defaultCopyDuration(executionKind, script),
      effective_from:
        optionalField(formData, "effective_from") ?? contract?.effective_from ?? undefined,
      effective_to: optionalField(formData, "effective_to"),
      approval_status: approveNow ? "approved" : "draft",
      underwriter_id: contract?.underwriter_id ?? null,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (dadCutClash(error)) failWith(failPath, "That DAD cut already belongs to another message.");
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
    if (approveNow) await rebalanceRotationForCopy(data.id, profile.id);
    revalidatePath(contractPath(contractId));
    revalidatePath(LIST_PATH);
    redirect(contractReturnPath(formData, contractId));
  }

  revalidatePath(LIST_PATH);
  redirect(`${copyPath(data.id)}?saved=created`);
}

/**
 * Corrects a copy's own metadata in place — label, script, DAD cut,
 * duration, effective dates — from /copy/[id]/edit, or from the in-place
 * edit card on a contract's copy step or Copy tab (contract_id +
 * return_to). No approval workflow gate: see setCopyStatus below for that.
 * The row is shared by every contract it's linked to, so each of them
 * re-sequences afterwards.
 */
export async function updateCopyDetails(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const id = field(formData, "copy_id");
  const contractId = optionalField(formData, "contract_id");
  const path = contractId
    ? withQuery(contractReturnPath(formData, contractId), `edit=${id}`)
    : editCopyPath(id);

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
  const current = (await supabase.from("uw_copy").select("dad_cut").eq("id", id).maybeSingle())
    .data;
  if (!current) failWith(path, "That copy no longer exists.");
  const dadCut = resolveDadCut(formData, script, current.dad_cut);
  if ("error" in dadCut) failWith(path, dadCut.error);
  const { error } = await supabase
    .from("uw_copy")
    .update({
      label: field(formData, "label") || undefined,
      script,
      execution_kind: executionKind,
      ...(dadCut.write ? { dad_cut: dadCut.cut } : {}),
      duration_seconds: durationSeconds ?? defaultCopyDuration(executionKind, script),
      effective_from: field(formData, "effective_from") || undefined,
      effective_to: optionalField(formData, "effective_to"),
    })
    .eq("id", id);
  if (dadCutClash(error)) failWith(path, "That DAD cut already belongs to another message.");
  failIfError(error, path, "Could not update this copy");
  await rebalanceRotationForCopy(id, profile.id);

  revalidatePath(copyPath(id));
  revalidatePath(LIST_PATH);
  if (contractId) {
    revalidatePath(contractPath(contractId));
    redirect(contractReturnPath(formData, contractId));
  }
  redirect(`${copyPath(id)}?saved=1`);
}

const APPROVAL_STATUSES: UwCopyApprovalStatus[] = ["draft", "approved", "expired", "retired"];

/**
 * The approval gate — from the copy library's detail page, or from a
 * message card's Approve button / "Change status…" on a contract's copy
 * step or Copy tab (contract_id + return_to). A status change alters
 * which messages the rotation may use, so every linked contract
 * re-sequences its future placements.
 */
export async function setCopyStatus(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const id = field(formData, "copy_id");
  const contractId = optionalField(formData, "contract_id");
  const path = contractId ? contractReturnPath(formData, contractId) : copyPath(id);
  const approvalStatus = field(formData, "approval_status") as UwCopyApprovalStatus;
  if (!APPROVAL_STATUSES.includes(approvalStatus))
    failWith(path, "That is not a recognized approval status.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("uw_copy")
    .update({ approval_status: approvalStatus })
    .eq("id", id);
  failIfError(error, path, "Could not update the copy's status");
  await rebalanceRotationForCopy(id, profile.id);

  revalidatePath(copyPath(id));
  revalidatePath(LIST_PATH);
  if (contractId) revalidatePath(contractPath(contractId));
  redirect(path);
}
