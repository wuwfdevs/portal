"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertUnderwritingAccess } from "@/lib/underwriting/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { logAuditEvent } from "@/lib/audit";
import { clearCredit } from "@/lib/underwriting/placement";
import { parseScheduleLineForm } from "@/lib/underwriting/schedule-line-form";
import { isValidDateISO } from "@/lib/underwriting/dates";
import { activateRevision } from "@/lib/underwriting/revisions";
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

// Industry categories ------------------------------------------------------

/** A typed industry for the competitive-adjacency rule (uw_industry_categories, 2026-09-25) — never free text on the underwriter. */
export async function createIndustryCategory(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const name = field(formData, "name");
  if (name === "") failWith(UNDERWRITERS_LIST_PATH, "Give the industry a name.");

  const supabase = await createClient();
  const { error } = await supabase.from("uw_industry_categories").insert({
    name,
    description: optionalField(formData, "description"),
    created_by: profile.id,
  });
  failIfError(error, UNDERWRITERS_LIST_PATH, "Could not add the industry");

  revalidatePath(UNDERWRITERS_LIST_PATH);
  redirect(UNDERWRITERS_LIST_PATH);
}

export async function setIndustryCategoryActive(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const id = field(formData, "category_id");
  const active = field(formData, "active") === "true";

  const supabase = await createClient();
  const { error } = await supabase.from("uw_industry_categories").update({ active }).eq("id", id);
  failIfError(error, UNDERWRITERS_LIST_PATH, "Could not update the industry");

  revalidatePath(UNDERWRITERS_LIST_PATH);
  redirect(UNDERWRITERS_LIST_PATH);
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
      category_id: optionalField(formData, "category_id"),
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
      category_id: optionalField(formData, "category_id"),
      notes: optionalField(formData, "notes"),
    })
    .eq("id", id);
  failIfError(error, path, "Could not update the underwriter");

  revalidatePath(path);
  revalidatePath(UNDERWRITERS_LIST_PATH);
  redirect(path);
}

// Contracts --------------------------------------------------------------------

/**
 * Creates the contract and its first revision, already current, so
 * schedule lines can be entered straight away — a contract always has
 * exactly one current revision from the moment it exists
 * (docs/underwriting-traffic-redesign.md §9).
 */
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

  const { error: revisionError } = await supabase.from("uw_contract_revisions").insert({
    contract_id: data.id,
    revision_label: "Original order",
    effective_from: effectiveFrom,
    received_at: stationTodayISO(),
    status: "current",
    activated_at: new Date().toISOString(),
    activated_by: profile.id,
    created_by: profile.id,
  });
  failIfError(
    revisionError,
    CONTRACTS_LIST_PATH,
    "Created the contract but not its first revision",
  );

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

// Revisions --------------------------------------------------------------------

/**
 * "Create revision from current" (brief §13 Phase D): a new draft carrying
 * copies of the current revision's active lines and their active buckets,
 * so a revised order is entered as edits to what already stands rather
 * than from scratch. Nothing schedules from a draft; activation below is
 * what makes it count.
 */
export async function createRevisionFromCurrent(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const path = contractPath(contractId);
  const effectiveFrom = optionalField(formData, "effective_from") ?? stationTodayISO();
  if (!isValidDateISO(effectiveFrom)) failWith(path, "Give the date the revision takes effect.");
  const receivedAt = optionalField(formData, "received_at");
  if (receivedAt !== null && !isValidDateISO(receivedAt))
    failWith(path, "The received date isn't a date.");

  const supabase = await createClient();
  const { data: existingDraft } = await supabase
    .from("uw_contract_revisions")
    .select("id")
    .eq("contract_id", contractId)
    .eq("status", "draft")
    .maybeSingle();
  if (existingDraft)
    failWith(path, "This contract already has a draft revision — activate or cancel it first.");

  const { data: current } = await supabase
    .from("uw_contract_revisions")
    .select("id")
    .eq("contract_id", contractId)
    .eq("status", "current")
    .maybeSingle();

  const { data: draft, error } = await supabase
    .from("uw_contract_revisions")
    .insert({
      contract_id: contractId,
      revision_label: optionalField(formData, "revision_label"),
      effective_from: effectiveFrom,
      received_at: receivedAt,
      notes: optionalField(formData, "notes"),
      supersedes_revision_id: current?.id ?? null,
      status: "draft",
      created_by: profile.id,
    })
    .select("id")
    .single();
  failIfError(error, path, "Could not create the revision");
  if (!draft) failWith(path, "Could not create the revision.");

  if (current && formData.get("copy_lines") === "on") {
    const { data: lines } = await supabase
      .from("uw_contract_schedule_lines")
      .select("*")
      .eq("revision_id", current.id)
      .eq("status", "active");
    for (const line of lines ?? []) {
      const { id: oldId, created_at: _createdAt, updated_at: _updatedAt, ...rest } = line;
      void _createdAt;
      void _updatedAt;
      const { data: copied, error: copyError } = await supabase
        .from("uw_contract_schedule_lines")
        .insert({ ...rest, revision_id: draft.id, created_by: profile.id })
        .select("id")
        .single();
      failIfError(copyError, path, "Created the revision but could not copy a line");
      if (!copied) continue;
      const { data: buckets } = await supabase
        .from("uw_demand_buckets")
        .select("period_start, period_end, quantity_required, source_label")
        .eq("schedule_line_id", oldId)
        .eq("status", "active");
      if (buckets && buckets.length > 0) {
        const { error: bucketError } = await supabase
          .from("uw_demand_buckets")
          .insert(buckets.map((bucket) => ({ ...bucket, schedule_line_id: copied.id })));
        failIfError(bucketError, path, "Created the revision but could not copy a line's demand");
      }
    }
  }

  revalidatePath(path);
  redirect(path);
}

/**
 * "Activate revision": the preview on the contract page names exactly
 * what changes; this applies it (lib/underwriting/revisions.ts) and audits
 * it — a revision rewrites a contract's future obligations, which is worth
 * a durable trace the way a termination is.
 */
export async function activateRevisionAction(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const revisionId = field(formData, "revision_id");
  const path = contractPath(contractId);

  const message = await activateRevision(revisionId, profile.id);
  if (message) failWith(path, message);

  await logAuditEvent({
    actorId: profile.id,
    action: "underwriting.contract.revision_activated",
    targetType: "uw_contract_revision",
    targetId: revisionId,
    metadata: { contract_id: contractId },
  });

  revalidatePath(path);
  revalidatePath("/underwriting/makegoods");
  redirect(path);
}

/** Discards a draft revision — nothing has scheduled from it, so nothing else changes; its lines and buckets stay attached to it as a record of what was considered. */
export async function cancelDraftRevision(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const revisionId = field(formData, "revision_id");
  const path = contractPath(contractId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("uw_contract_revisions")
    .update({ status: "cancelled" })
    .eq("id", revisionId)
    .eq("status", "draft");
  failIfError(error, path, "Could not cancel the draft revision");

  revalidatePath(path);
  redirect(path);
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
 * One traffic instruction from a signed insertion order: eligibility on
 * the line, quantities compiled into demand buckets
 * (docs/underwriting-traffic-redesign.md §9) — parsed and validated by
 * lib/underwriting/schedule-line-form.ts, written under the revision the
 * form named (the current one, or the draft being entered).
 */
export async function addScheduleLine(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const revisionId = field(formData, "revision_id");
  const path = contractPath(contractId);
  if (revisionId === "") failWith(path, "Choose which revision the line belongs to.");

  const parsed = parseScheduleLineForm({
    label: field(formData, "label"),
    entry_kind: field(formData, "entry_kind"),
    days_of_week: formData
      .getAll("days_of_week")
      .map((value) => Number.parseInt(String(value), 10)),
    count_per_day: field(formData, "count_per_day"),
    quantity: field(formData, "quantity"),
    interval_weeks: field(formData, "interval_weeks"),
    pool_id: field(formData, "pool_id"),
    program_id: field(formData, "program_id"),
    time_mode: field(formData, "time_mode"),
    window_start: field(formData, "window_start"),
    window_end: field(formData, "window_end"),
    preferred_time: field(formData, "preferred_time"),
    required_opportunity_key: field(formData, "required_opportunity_key"),
    max_per_day: field(formData, "max_per_day"),
    service_level: field(formData, "service_level"),
    duration_seconds: field(formData, "duration_seconds"),
    start_date: field(formData, "start_date"),
    end_date: field(formData, "end_date"),
    flight_id: field(formData, "flight_id"),
    stated_total: field(formData, "stated_total"),
    source_text: field(formData, "source_text"),
    makegood_policy_text: field(formData, "makegood_policy_text"),
    notes: field(formData, "notes"),
    dates_text: field(formData, "dates_text"),
    grid_first_monday: field(formData, "grid_first_monday"),
    grid_quantities: field(formData, "grid_quantities"),
  });
  if (!parsed.ok) failWith(path, parsed.error);

  const supabase = await createClient();
  const { data: revision } = await supabase
    .from("uw_contract_revisions")
    .select("id, status")
    .eq("id", revisionId)
    .eq("contract_id", contractId)
    .maybeSingle();
  if (!revision || (revision.status !== "current" && revision.status !== "draft"))
    failWith(path, "Lines can only be added to the current revision or a draft.");

  const { entry_spec, ...lineFields } = parsed.value.line;
  const { data, error } = await supabase
    .from("uw_contract_schedule_lines")
    .insert({
      ...lineFields,
      entry_spec,
      contract_id: contractId,
      revision_id: revisionId,
      created_by: profile.id,
    })
    .select("id")
    .single();
  failIfError(error, path, "Could not add the schedule line");
  if (!data) failWith(path, "Could not add the schedule line.");

  const { error: bucketError } = await supabase.from("uw_demand_buckets").insert(
    parsed.value.buckets.map((bucket) => ({
      schedule_line_id: data.id,
      period_start: bucket.periodStart,
      period_end: bucket.periodEnd,
      quantity_required: bucket.quantity,
      source_label: bucket.sourceLabel,
    })),
  );
  failIfError(bucketError, path, "Added the line, but could not save its demand");

  revalidatePath(path);
  redirect(`${path}#line-${data.id}`);
}

/**
 * Cancels a line from a date: buckets still open on or after it are
 * cancelled, and every active placement on or after it is cleared through
 * the same log_clear_underwriting_credit() an ordinary clear uses, so
 * nothing is left double-booked against a replacement line. Placements
 * before the date, and their broadcast events, stand. Returns a message on
 * failure, null on success.
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
  const { data: voidBuckets } = await supabase
    .from("uw_demand_buckets")
    .select("id")
    .eq("schedule_line_id", lineId)
    .eq("status", "active")
    .gte("period_end", from);
  const voidIds = (voidBuckets ?? []).map((bucket) => bucket.id);
  if (voidIds.length > 0) {
    const { error: bucketError } = await supabase
      .from("uw_demand_buckets")
      .update({ status: "cancelled" })
      .in("id", voidIds);
    if (bucketError) return `Could not cancel the line's demand: ${bucketError.message}`;
    // Makegoods still awaiting a slot for demand that no longer exists.
    await supabase
      .from("uw_makegoods")
      .update({ status: "cancelled" })
      .eq("schedule_line_id", lineId)
      .eq("status", "scheduled")
      .is("scheduled_placement_id", null)
      .in("demand_bucket_id", voidIds);
  }

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

/** Removes a line from a draft revision outright — nothing has scheduled from a draft, so there is no history to keep (RLS admits the delete only under a draft: 20260925170000). */
export async function removeDraftScheduleLine(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const lineId = field(formData, "schedule_line_id");
  const path = contractPath(contractId);

  const supabase = await createClient();
  const { error: bucketError } = await supabase
    .from("uw_demand_buckets")
    .delete()
    .eq("schedule_line_id", lineId);
  failIfError(bucketError, path, "Could not remove the line's demand");
  const { error } = await supabase.from("uw_contract_schedule_lines").delete().eq("id", lineId);
  failIfError(error, path, "Could not remove the schedule line");

  revalidatePath(path);
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
