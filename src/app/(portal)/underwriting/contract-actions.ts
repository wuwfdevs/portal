"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertUnderwritingAccess } from "@/lib/underwriting/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { logAuditEvent } from "@/lib/audit";
import { clearCredit } from "@/lib/underwriting/placement";
import { parseScheduleLineForm } from "@/lib/underwriting/schedule-line-form";
import { isValidDateISO } from "@/lib/underwriting/demand";
import { stationTodayISO } from "@/lib/log/timezone";
import type { UwContractStatus, UwSeparationPolicy } from "@/lib/database.types";

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

function optionalInt(formData: FormData, name: string): number | null {
  const raw = optionalField(formData, name);
  if (raw === null) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
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
    failWith(
      CONTRACTS_LIST_PATH,
      "Give the contract an underwriter, identifier, and effective date.",
    );
  }

  const sponsorshipTotalRaw = optionalField(formData, "sponsorship_total");
  const sponsorshipTotal =
    sponsorshipTotalRaw === null ? null : Number.parseFloat(sponsorshipTotalRaw);

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
      sponsorship_total:
        sponsorshipTotal !== null && Number.isFinite(sponsorshipTotal) ? sponsorshipTotal : null,
      stated_total_spots: optionalInt(formData, "stated_total_spots"),
      preemption_policy: optionalField(formData, "preemption_policy"),
      makegood_requires_agency_approval: formData.get("makegood_requires_agency_approval") === "on",
      separation_source_text: optionalField(formData, "separation_source_text"),
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
  const { data: existing } = await supabase
    .from("uw_contracts")
    .select("status")
    .eq("id", id)
    .maybeSingle();
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

const SEPARATION_POLICIES: UwSeparationPolicy[] = ["unspecified", "none", "min_minutes"];

/**
 * The traffic policy an order states, on the contract (docs/underwriting-
 * traffic-redesign.md §3): the printed total to validate lines against,
 * whether makegoods need the agency's approval, and the separation
 * instruction — kept verbatim in separation_source_text, and only turned
 * into an enforceable policy by a staff decision here (the brief's "store
 * as unresolved source text and require a staff policy choice").
 */
export async function updateContractPolicy(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const id = field(formData, "contract_id");
  const path = contractPath(id);

  const separationPolicy = field(formData, "separation_policy") as UwSeparationPolicy;
  if (!SEPARATION_POLICIES.includes(separationPolicy))
    failWith(path, "That is not a recognized separation policy.");
  const separationMinutes =
    separationPolicy === "min_minutes" ? optionalInt(formData, "separation_minutes") : null;
  if (separationPolicy === "min_minutes" && (separationMinutes == null || separationMinutes <= 0)) {
    failWith(path, "Give the minimum number of minutes between this contract's credits.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("uw_contracts")
    .update({
      stated_total_spots: optionalInt(formData, "stated_total_spots"),
      makegood_requires_agency_approval: formData.get("makegood_requires_agency_approval") === "on",
      separation_source_text: optionalField(formData, "separation_source_text"),
      separation_policy: separationPolicy,
      separation_minutes: separationMinutes,
      preemption_policy: optionalField(formData, "preemption_policy"),
    })
    .eq("id", id);
  failIfError(error, path, "Could not update the contract's traffic policy");

  revalidatePath(path);
  redirect(path);
}

/** Records the executed agreement's storage path after a direct-to-Storage upload — see contract-document-upload.tsx and point 19 of the domain redesign. */
export async function completeContractDocumentUpload(
  contractId: string,
  storagePath: string,
): Promise<{ error?: string }> {
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

export async function getContractDocumentDownloadUrl(
  contractId: string,
  storagePath: string,
): Promise<{ url?: string; error?: string }> {
  await assertUnderwritingAccess();
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("underwriting-documents")
    .createSignedUrl(storagePath, 300);
  if (error || !data) return { error: "Could not create a download link." };
  return { url: data.signedUrl };
}

// Flights ----------------------------------------------------------------------

/** An event or production under a contract that groups schedule lines and scopes copy (docs/underwriting-traffic-redesign.md §3). */
export async function createFlight(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const path = contractPath(contractId);
  const name = field(formData, "name");
  const startDate = field(formData, "start_date");
  const endDate = field(formData, "end_date");
  if (name === "" || !isValidDateISO(startDate) || !isValidDateISO(endDate))
    failWith(path, "Give the flight a name and its dates.");
  if (endDate < startDate) failWith(path, "The flight must end on or after it starts.");

  const supabase = await createClient();
  const { error } = await supabase.from("uw_contract_flights").insert({
    contract_id: contractId,
    name,
    start_date: startDate,
    end_date: endDate,
    notes: optionalField(formData, "notes"),
    created_by: profile.id,
  });
  failIfError(error, path, "Could not create the flight");

  revalidatePath(path);
  redirect(path);
}

/**
 * Cancels a flight and, through cancelScheduleLineFrom(), every active line
 * in it from the given date — the Symphony's cancelled gala, replaced by a
 * new flight the staffer then adds.
 */
export async function cancelFlight(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const flightId = field(formData, "flight_id");
  const path = contractPath(contractId);
  const from = optionalField(formData, "cancelled_from") ?? stationTodayISO();
  if (!isValidDateISO(from)) failWith(path, "Give the date the cancellation takes effect.");

  const supabase = await createClient();
  const { data: lines } = await supabase
    .from("uw_contract_schedule_lines")
    .select("id")
    .eq("flight_id", flightId)
    .eq("status", "active");
  for (const line of lines ?? []) {
    const message = await cancelScheduleLineFrom(line.id, from, profile.id);
    if (message) failWith(path, message);
  }

  const { error } = await supabase
    .from("uw_contract_flights")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: profile.id,
    })
    .eq("id", flightId);
  failIfError(error, path, "Could not cancel the flight");

  revalidatePath(path);
  redirect(path);
}

// Schedule lines -----------------------------------------------------------

/**
 * One traffic instruction from a signed insertion order, in one of the four
 * typed shapes (docs/underwriting-traffic-redesign.md §3) — parsed and
 * validated by lib/underwriting/schedule-line-form.ts, then written as the
 * line plus its allocations (explicit dates / week grid).
 */
export async function addScheduleLine(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const path = contractPath(contractId);

  const parsed = parseScheduleLineForm({
    label: field(formData, "label"),
    rule_kind: field(formData, "rule_kind"),
    days_of_week: formData
      .getAll("days_of_week")
      .map((value) => Number.parseInt(String(value), 10)),
    count_per_day: field(formData, "count_per_day"),
    quantity_per_week: field(formData, "quantity_per_week"),
    max_per_day: field(formData, "max_per_day"),
    pool_id: field(formData, "pool_id"),
    program_id: field(formData, "program_id"),
    window_start: field(formData, "window_start"),
    window_end: field(formData, "window_end"),
    target_time: field(formData, "target_time"),
    duration_seconds: field(formData, "duration_seconds"),
    start_date: field(formData, "start_date"),
    end_date: field(formData, "end_date"),
    flight_id: field(formData, "flight_id"),
    is_bonus: formData.get("is_bonus") === "on",
    stated_total: field(formData, "stated_total"),
    source_text: field(formData, "source_text"),
    notes: field(formData, "notes"),
    allocations_text: field(formData, "allocations_text"),
    grid_first_monday: field(formData, "grid_first_monday"),
    grid_quantities: field(formData, "grid_quantities"),
  });
  if (!parsed.ok) failWith(path, parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("uw_contract_schedule_lines")
    .insert({ ...parsed.value.line, contract_id: contractId, created_by: profile.id })
    .select("id")
    .single();
  failIfError(error, path, "Could not add the schedule line");
  if (!data) failWith(path, "Could not add the schedule line.");

  if (parsed.value.allocations.length > 0) {
    const { error: allocationError } = await supabase.from("uw_schedule_allocations").insert(
      parsed.value.allocations.map((allocation) => ({
        ...allocation,
        schedule_line_id: data.id,
      })),
    );
    failIfError(allocationError, path, "Added the line, but could not save its dates");
  }

  revalidatePath(path);
  redirect(`${path}#line-${data.id}`);
}

/**
 * Cancels a line from a date: demand on or after it is void, and every
 * active placement on or after it is cleared through the same
 * log_clear_underwriting_credit() an ordinary clear uses, so nothing is left
 * double-booked against a replacement line (brief acceptance scenario 11).
 * Placements before the date, and their broadcast events, stand. Returns a
 * message on failure, null on success.
 */
async function cancelScheduleLineFrom(
  lineId: string,
  from: string,
  actorId: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data: placements } = await supabase
    .from("uw_scheduled_placements")
    .select("id")
    .eq("schedule_line_id", lineId)
    .neq("status", "superseded")
    .gte("placement_date", from);
  for (const placement of placements ?? []) {
    const result = await clearCredit(placement.id);
    if (!result.ok) return `Could not clear a future placement: ${result.message}`;
  }
  // Makegoods still awaiting a slot for demand that no longer exists.
  await supabase
    .from("uw_makegoods")
    .update({ status: "cancelled" })
    .eq("schedule_line_id", lineId)
    .eq("status", "scheduled")
    .is("scheduled_placement_id", null)
    .gte("demand_period_start", from);

  const { error } = await supabase
    .from("uw_contract_schedule_lines")
    .update({
      status: "cancelled",
      cancelled_from: from,
      cancelled_at: new Date().toISOString(),
      cancelled_by: actorId,
    })
    .eq("id", lineId);
  return error ? `Could not cancel the schedule line: ${error.message}` : null;
}

export async function cancelScheduleLine(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const lineId = field(formData, "schedule_line_id");
  const path = contractPath(contractId);
  const from = optionalField(formData, "cancelled_from") ?? stationTodayISO();
  if (!isValidDateISO(from)) failWith(path, "Give the date the cancellation takes effect.");

  const message = await cancelScheduleLineFrom(lineId, from, profile.id);
  if (message) failWith(path, message);

  revalidatePath(path);
  revalidatePath("/underwriting/makegoods");
  redirect(path);
}

/** Links an existing piece of copy to this contract — optionally scoped to one flight (a script that names a specific show). */
export async function linkCopyToContract(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const copyId = field(formData, "copy_id");
  const path = contractPath(contractId);
  if (copyId === "") failWith(path, "Choose a piece of copy to link.");

  const supabase = await createClient();
  const { error } = await supabase.from("uw_contract_copy").insert({
    contract_id: contractId,
    copy_id: copyId,
    flight_id: optionalField(formData, "flight_id"),
  });
  failIfError(error, path, "Could not link that copy");

  revalidatePath(path);
  redirect(path);
}

/** Changes which flight a linked copy serves (or makes it contract-wide again). */
export async function setCopyFlight(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const copyId = field(formData, "copy_id");
  const path = contractPath(contractId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("uw_contract_copy")
    .update({ flight_id: optionalField(formData, "flight_id") })
    .eq("contract_id", contractId)
    .eq("copy_id", copyId);
  failIfError(error, path, "Could not change that copy's flight");

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
