"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertUnderwritingAccess } from "@/lib/underwriting/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { logAuditEvent } from "@/lib/audit";
import type { UwContractStatus } from "@/lib/database.types";

const CONTRACTS_LIST_PATH = "/underwriting/contracts";
const UNDERWRITERS_LIST_PATH = "/underwriting/underwriters";

function contractPath(id: string): string {
  return `${CONTRACTS_LIST_PATH}/${id}`;
}

function underwriterPath(id: string): string {
  return `${UNDERWRITERS_LIST_PATH}/${id}`;
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function optionalField(formData: FormData, name: string): string | null {
  const value = field(formData, name);
  return value === "" ? null : value;
}

// Underwriters ---------------------------------------------------------------

/** A durable underwriter/sponsor entity (point 17 of the domain redesign) — replaces free-text underwriter_name on the contract. */
export async function createUnderwriter(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const name = field(formData, "name");
  if (name === "") failWith(UNDERWRITERS_LIST_PATH, "Give the underwriter a name.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("uw_underwriters")
    .insert({
      name,
      mailing_address: optionalField(formData, "mailing_address"),
      contact_name: optionalField(formData, "contact_name"),
      email: optionalField(formData, "email"),
      phone: optionalField(formData, "phone"),
      category: optionalField(formData, "category"),
      notes: optionalField(formData, "notes"),
      created_by: profile.id,
    })
    .select("id")
    .single();
  failIfError(error, UNDERWRITERS_LIST_PATH, "Could not create the underwriter");
  if (!data) failWith(UNDERWRITERS_LIST_PATH, "Could not create the underwriter.");

  revalidatePath(UNDERWRITERS_LIST_PATH);
  redirect(underwriterPath(data.id));
}

export async function updateUnderwriter(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const id = field(formData, "underwriter_id");
  const path = underwriterPath(id);
  const name = field(formData, "name");
  if (name === "") failWith(path, "Give the underwriter a name.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("uw_underwriters")
    .update({
      name,
      mailing_address: optionalField(formData, "mailing_address"),
      contact_name: optionalField(formData, "contact_name"),
      email: optionalField(formData, "email"),
      phone: optionalField(formData, "phone"),
      category: optionalField(formData, "category"),
      notes: optionalField(formData, "notes"),
    })
    .eq("id", id);
  failIfError(error, path, "Could not update the underwriter");

  revalidatePath(path);
  revalidatePath(UNDERWRITERS_LIST_PATH);
  redirect(path);
}

// Contracts --------------------------------------------------------------------

export async function createContract(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const underwriterId = field(formData, "underwriter_id");
  const contractIdentifier = field(formData, "contract_identifier");
  const effectiveFrom = field(formData, "effective_from");
  if (underwriterId === "" || contractIdentifier === "" || effectiveFrom === "") {
    failWith(CONTRACTS_LIST_PATH, "Give the contract an underwriter, identifier, and effective date.");
  }

  const sponsorshipTotalRaw = optionalField(formData, "sponsorship_total");
  const sponsorshipTotal = sponsorshipTotalRaw === null ? null : Number.parseFloat(sponsorshipTotalRaw);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("uw_contracts")
    .insert({
      underwriter_id: underwriterId,
      contract_identifier: contractIdentifier,
      effective_from: effectiveFrom,
      effective_to: optionalField(formData, "effective_to"),
      affidavit_required: formData.get("affidavit_required") === "on",
      sponsorship_category: optionalField(formData, "sponsorship_category"),
      sponsorship_total: sponsorshipTotal !== null && Number.isFinite(sponsorshipTotal) ? sponsorshipTotal : null,
      preemption_policy: optionalField(formData, "preemption_policy"),
      notes: optionalField(formData, "notes"),
      created_by: profile.id,
    })
    .select("id")
    .single();
  failIfError(error, CONTRACTS_LIST_PATH, "Could not create the contract");
  if (!data) failWith(CONTRACTS_LIST_PATH, "Could not create the contract.");

  revalidatePath(CONTRACTS_LIST_PATH);
  redirect(contractPath(data.id));
}

const CONTRACT_STATUSES: UwContractStatus[] = ["draft", "active", "expired", "terminated"];

/** Terminating a contract is audited (docs/underwriting-design.md §6's four privileged actions) — every other status change here is ordinary traffic-staff work. */
export async function setContractStatus(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const id = field(formData, "contract_id");
  const path = contractPath(id);
  const status = field(formData, "status") as UwContractStatus;
  if (!CONTRACT_STATUSES.includes(status)) failWith(path, "That is not a recognized status.");

  const supabase = await createClient();

  // Only a genuine draft/active/expired -> terminated transition is the
  // privileged action — resubmitting this form while already terminated
  // (nothing changed) must not add a fresh audit row every time.
  const { data: existing } = await supabase.from("uw_contracts").select("status").eq("id", id).maybeSingle();
  const isNewTermination = status === "terminated" && existing?.status !== "terminated";

  const { error } = await supabase.from("uw_contracts").update({ status }).eq("id", id);
  failIfError(error, path, "Could not update the contract's status");

  if (isNewTermination) {
    await logAuditEvent({
      actorId: profile.id,
      action: "underwriting.contract.terminated",
      targetType: "uw_contract",
      targetId: id,
    });
  }

  revalidatePath(path);
  revalidatePath(CONTRACTS_LIST_PATH);
  redirect(path);
}

/** Records the executed agreement's storage path after a direct-to-Storage upload — see contract-document-upload.tsx and point 19 of the domain redesign. */
export async function completeContractDocumentUpload(contractId: string, storagePath: string): Promise<{ error?: string }> {
  await assertUnderwritingAccess();
  const supabase = await createClient();
  const { error } = await supabase
    .from("uw_contracts")
    .update({ agreement_document_path: storagePath })
    .eq("id", contractId);
  if (error) {
    console.error("Could not save uploaded contract document", error);
    return { error: "Could not save the uploaded document." };
  }
  revalidatePath(contractPath(contractId));
  return {};
}

export async function getContractDocumentDownloadUrl(contractId: string, storagePath: string): Promise<{ url?: string; error?: string }> {
  await assertUnderwritingAccess();
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("underwriting-documents")
    .createSignedUrl(storagePath, 300);
  if (error || !data) return { error: "Could not create a download link." };
  return { url: data.signedUrl };
}

// Schedule lines -----------------------------------------------------------

/**
 * A recurring contractual placement (point 20 of the domain redesign) —
 * replaces the old generic obligation shape with the real recurring
 * schedule a WUWF insertion order actually names: day(s) of week, target
 * time, duration, program, date range.
 */
export async function addScheduleLine(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const path = contractPath(contractId);

  const daysOfWeek = formData.getAll("days_of_week").map((value) => Number.parseInt(String(value), 10));
  if (daysOfWeek.length === 0) failWith(path, "Choose at least one day of the week.");

  const durationSeconds = Number.parseInt(field(formData, "duration_seconds"), 10);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    failWith(path, "Give the schedule line a duration greater than zero.");
  }

  const startDate = field(formData, "start_date");
  if (startDate === "") failWith(path, "Give the schedule line a start date.");

  const occurrenceOverrideRaw = optionalField(formData, "occurrence_count_override");
  const occurrenceOverride = occurrenceOverrideRaw === null ? null : Number.parseInt(occurrenceOverrideRaw, 10);

  const supabase = await createClient();
  const { error } = await supabase.from("uw_contract_schedule_lines").insert({
    contract_id: contractId,
    days_of_week: daysOfWeek,
    target_time: optionalField(formData, "target_time"),
    duration_seconds: durationSeconds,
    program_id: optionalField(formData, "program_id"),
    start_date: startDate,
    end_date: optionalField(formData, "end_date"),
    occurrence_count_override: occurrenceOverride !== null && Number.isFinite(occurrenceOverride) ? occurrenceOverride : null,
    makegood_policy: optionalField(formData, "makegood_policy"),
    notes: optionalField(formData, "notes"),
  });
  failIfError(error, path, "Could not add the schedule line");

  revalidatePath(path);
  redirect(path);
}

/** Links an existing piece of copy to this contract — the reverse of copy-actions.ts's own link form. */
export async function linkCopyToContract(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const copyId = field(formData, "copy_id");
  const path = contractPath(contractId);
  if (copyId === "") failWith(path, "Choose a piece of copy to link.");

  const supabase = await createClient();
  const { error } = await supabase.from("uw_contract_copy").insert({ contract_id: contractId, copy_id: copyId });
  failIfError(error, path, "Could not link that copy");

  revalidatePath(path);
  redirect(path);
}

export async function unlinkCopyFromContract(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const copyId = field(formData, "copy_id");
  const path = contractPath(contractId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("uw_contract_copy")
    .delete()
    .eq("contract_id", contractId)
    .eq("copy_id", copyId);
  failIfError(error, path, "Could not unlink that copy");

  revalidatePath(path);
  redirect(path);
}
