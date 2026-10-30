"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertUnderwritingAccess } from "@/lib/underwriting/access";
import { deleteOrFail, failIfError, failWith } from "@/lib/editorial/action-result";
import { logAuditEvent } from "@/lib/audit";
import { clearCredit } from "@/lib/underwriting/placement";
import {
  parseScheduleLineForm,
  type ScheduleLineFormValues,
} from "@/lib/underwriting/schedule-line-form";
import { canRewriteScheduleLine } from "@/lib/underwriting/line-mutability";
import { insertScheduleLineWithBuckets } from "@/lib/underwriting/schedule-line-writes";
import { createDraftContractWithRevision } from "@/lib/underwriting/contract-writes";
import {
  describePoolReachability,
  poolReachability,
  type LineReachLike,
} from "@/lib/underwriting/pool-targets";
import { isValidDateISO } from "@/lib/dates";
import { activateRevision } from "@/lib/underwriting/revisions";
import { rebalanceContractRotation } from "@/lib/underwriting/rotation-rebalance";
import { MAX_ROTATION_WEIGHT } from "@/lib/underwriting/rotation";
import { stationTodayISO } from "@/lib/log/timezone";
import { pathIsUnder } from "@/lib/storage-paths";
import { signedUrl } from "@/lib/storage-sign";
import type { UwContractStatus, UwSeparationPolicy } from "@/lib/database.types";
import { field, isUuid, optionalField, optionalInt } from "@/lib/form-fields";

const CONTRACTS_LIST_PATH = "/underwriting/contracts";
const UNDERWRITERS_LIST_PATH = "/underwriting/underwriters";

const NEW_CONTRACT_PATH = "/underwriting/contracts/new";

function contractPath(id: string): string {
  return `${CONTRACTS_LIST_PATH}/${id}`;
}

function underwriterPath(id: string): string {
  return `${UNDERWRITERS_LIST_PATH}/${id}`;
}

const WIZARD_STEPS = new Set(["order", "schedule", "copy", "policy"]);

/** The contract page, or the setup step (order | schedule | copy | policy) a wizard form named in return_to. */
function returnPath(formData: FormData, contractId: string): string {
  const step = field(formData, "return_to");
  return WIZARD_STEPS.has(step) ? `${contractPath(contractId)}/${step}` : contractPath(contractId);
}

/** Where a copy-linking form returns: the setup wizard's copy step, or the contract page's Copy tab (docs/underwriting-traffic-redesign.md §13). */
function copyReturnPath(formData: FormData, contractId: string): string {
  return field(formData, "return_to") === "copy"
    ? `${contractPath(contractId)}/copy`
    : `${contractPath(contractId)}?tab=copy`;
}

// Industry categories ------------------------------------------------------

const INDUSTRIES_PATH = "/underwriting/setup/industries";
/** The industries list with its inline create row open — where a create failure lands so its message renders in the row. */
const NEW_INDUSTRY_PATH = `${INDUSTRIES_PATH}?new=1`;

/** A typed industry for the competitive-adjacency rule (uw_industry_categories, 2026-09-25) — never free text on the underwriter. */
export async function createIndustryCategory(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const name = field(formData, "name");
  if (name === "") failWith(NEW_INDUSTRY_PATH, "Give the industry a name.");

  const supabase = await createClient();
  const { error } = await supabase.from("uw_industry_categories").insert({
    name,
    description: optionalField(formData, "description"),
    created_by: profile.id,
  });
  if (error?.code === "23505") {
    failWith(NEW_INDUSTRY_PATH, "An industry with this name already exists.");
  }
  failIfError(error, NEW_INDUSTRY_PATH, "Could not add the industry");

  revalidatePath(INDUSTRIES_PATH);
  revalidatePath(UNDERWRITERS_LIST_PATH);
  redirect(INDUSTRIES_PATH);
}

export async function setIndustryCategoryActive(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const id = field(formData, "category_id");
  const active = field(formData, "active") === "true";

  const supabase = await createClient();
  const { error } = await supabase.from("uw_industry_categories").update({ active }).eq("id", id);
  failIfError(error, INDUSTRIES_PATH, "Could not update the industry");

  revalidatePath(INDUSTRIES_PATH);
  revalidatePath(UNDERWRITERS_LIST_PATH);
  redirect(INDUSTRIES_PATH);
}

// Underwriters ---------------------------------------------------------------

const NEW_UNDERWRITER_PATH = `${UNDERWRITERS_LIST_PATH}/new`;

function editUnderwriterPath(id: string): string {
  return `${underwriterPath(id)}/edit`;
}

/** A durable underwriter/sponsor entity (point 17 of the domain redesign) — replaces free-text underwriter_name on the contract. Created on its own page; a validation failure returns to that page. */
export async function createUnderwriter(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const name = field(formData, "name");
  if (name === "") failWith(NEW_UNDERWRITER_PATH, "Give the underwriter a name.");

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
  failIfError(error, NEW_UNDERWRITER_PATH, "Could not create the underwriter");
  if (!data) failWith(NEW_UNDERWRITER_PATH, "Could not create the underwriter.");

  revalidatePath(UNDERWRITERS_LIST_PATH);
  redirect(`${underwriterPath(data.id)}?saved=created`);
}

/** Edits share the create form at /underwriting/underwriters/[id]/edit; a validation failure returns there, success lands on the detail page. */
export async function updateUnderwriter(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const id = field(formData, "underwriter_id");
  const path = underwriterPath(id);
  const editPath = editUnderwriterPath(id);
  const name = field(formData, "name");
  if (name === "") failWith(editPath, "Give the underwriter a name.");

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
  failIfError(error, editPath, "Could not update the underwriter");

  revalidatePath(path);
  revalidatePath(UNDERWRITERS_LIST_PATH);
  redirect(`${path}?saved=1`);
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
  // Optional: an order that prints no number has none (2026-09-30).
  const contractIdentifier = optionalField(formData, "contract_identifier");
  const effectiveFrom = field(formData, "effective_from");
  if (underwriterId === "" || effectiveFrom === "") {
    failWith(NEW_CONTRACT_PATH, "Give the contract an underwriter and an effective date.");
  }

  const sponsorshipTotalRaw = optionalField(formData, "sponsorship_total");
  const sponsorshipTotal =
    sponsorshipTotalRaw === null ? null : Number.parseFloat(sponsorshipTotalRaw);

  const supabase = await createClient();
  const created = await createDraftContractWithRevision(supabase, profile.id, {
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
    account_rep: optionalField(formData, "account_rep"),
  });
  if (!created.ok) failWith(NEW_CONTRACT_PATH, created.error);

  // A new contract is a draft: the next step is its schedule (the wizard's
  // step 2), not the contract page.
  revalidatePath(CONTRACTS_LIST_PATH);
  redirect(`${contractPath(created.id)}/schedule`);
}

/**
 * Permanently deletes a draft contract (docs/underwriting-traffic-
 * redesign.md §11.5). A draft has nothing scheduled from it —
 * log_place_underwriting_credit() refuses a non-active contract — so the
 * cascade removes only its own setup (revisions, lines and buckets,
 * flights, copy links); the library copy stays, and the attached agreement
 * is removed from storage best-effort. The status is checked here as well
 * as by the delete policy (20260927150000): a delete RLS refuses matches
 * zero rows with no error. A contract that ran is terminated, never
 * deleted. Returns a plain result for the two-step confirm control.
 */
export async function deleteContract(contractId: string): Promise<{ error?: string }> {
  const { profile } = await assertUnderwritingAccess();
  const supabase = await createClient();
  const { data: contract, error: readError } = await supabase
    .from("uw_contracts")
    .select("id, status, contract_identifier, underwriter_id, agreement_document_path")
    .eq("id", contractId)
    .maybeSingle();
  if (readError) {
    console.error("Could not read the contract to delete", readError);
    return { error: "Could not read this contract." };
  }
  if (!contract) return { error: "This contract no longer exists." };
  if (contract.status !== "draft")
    return { error: "Only a draft can be deleted. A contract that has run is terminated instead." };

  const { data: deleted, error } = await supabase
    .from("uw_contracts")
    .delete()
    .eq("id", contractId)
    .eq("status", "draft")
    .select("id");
  if (error) {
    console.error("Could not delete the contract", error);
    return { error: `Could not delete this draft: ${error.message}` };
  }
  if (!deleted || deleted.length === 0) return { error: "This draft could not be deleted." };

  if (contract.agreement_document_path) {
    const { error: storageError } = await supabase.storage
      .from("underwriting-documents")
      .remove([contract.agreement_document_path]);
    if (storageError)
      console.error("Deleted the draft but could not remove its agreement document", storageError);
  }

  await logAuditEvent({
    actorId: profile.id,
    action: "underwriting.contract.deleted",
    targetType: "uw_contract",
    targetId: contractId,
    metadata: {
      contract_identifier: contract.contract_identifier,
      underwriter_id: contract.underwriter_id,
      agreement_document_path: contract.agreement_document_path,
    },
  });

  revalidatePath(CONTRACTS_LIST_PATH);
  return {};
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
  const { data: existing, error: existingError } = await supabase
    .from("uw_contracts")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  failIfError(existingError, path, "Could not read the contract");
  const isNewTermination = status === "terminated" && existing?.status !== "terminated";
  // Activation is the approval step — the moment a contract's lines start
  // scheduling — so it gets a durable trace naming who did it, the same
  // way a termination does (2026-09-25, after comparing against
  // RadioTraffic's approval trail). Not one of §6's privileged actions:
  // any traffic member may activate, and the same person who created the
  // contract may.
  const isNewActivation = status === "active" && existing?.status !== "active";

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
  if (isNewActivation) {
    await logAuditEvent({
      actorId: profile.id,
      action: "underwriting.contract.activated",
      targetType: "uw_contract",
      targetId: id,
      metadata: { previous_status: existing?.status ?? null },
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
  // The wizard's policy step returns to itself; the contract page's
  // Agreement tab returns to the tab, and a failure reopens its edit form.
  const fromWizard = WIZARD_STEPS.has(field(formData, "return_to"));
  const path = fromWizard ? returnPath(formData, id) : `${contractPath(id)}?tab=agreement`;
  const failPath = fromWizard ? path : `${path}&edit=policy`;

  const separationPolicy = field(formData, "separation_policy") as UwSeparationPolicy;
  if (!SEPARATION_POLICIES.includes(separationPolicy))
    failWith(failPath, "That is not a recognized separation policy.");
  const separationMinutes =
    separationPolicy === "min_minutes" ? optionalInt(formData, "separation_minutes") : null;
  if (separationPolicy === "min_minutes" && (separationMinutes == null || separationMinutes <= 0)) {
    failWith(failPath, "Give the minimum number of minutes between this contract's credits.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("uw_contracts")
    .update({
      stated_total_spots: optionalInt(formData, "stated_total_spots"),
      affidavit_required: formData.get("affidavit_required") === "on",
      makegood_requires_agency_approval: formData.get("makegood_requires_agency_approval") === "on",
      separation_source_text: optionalField(formData, "separation_source_text"),
      separation_policy: separationPolicy,
      separation_minutes: separationMinutes,
      preemption_policy: optionalField(formData, "preemption_policy"),
    })
    .eq("id", id);
  failIfError(error, failPath, "Could not update the contract's traffic policy");

  revalidatePath(contractPath(id));
  revalidatePath(path);
  redirect(path);
}

/**
 * The order's own facts (setup step 1, editable afterwards from the
 * contract page): identifier, run dates, sponsorship total and category,
 * notes. Never the traffic policy (updateContractPolicy) or the status.
 */
export async function updateContractOrder(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const id = field(formData, "contract_id");
  const path = returnPath(formData, id);
  const contractIdentifier = optionalField(formData, "contract_identifier");
  const effectiveFrom = field(formData, "effective_from");
  if (!isValidDateISO(effectiveFrom)) failWith(path, "Give the contract a start date.");
  const effectiveTo = optionalField(formData, "effective_to");
  if (effectiveTo !== null && (!isValidDateISO(effectiveTo) || effectiveTo < effectiveFrom))
    failWith(path, "The contract must end on or after it starts.");
  const sponsorshipTotalRaw = optionalField(formData, "sponsorship_total");
  const sponsorshipTotal =
    sponsorshipTotalRaw === null ? null : Number.parseFloat(sponsorshipTotalRaw);

  const supabase = await createClient();
  const { error } = await supabase
    .from("uw_contracts")
    .update({
      contract_identifier: contractIdentifier,
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
      sponsorship_total:
        sponsorshipTotal !== null && Number.isFinite(sponsorshipTotal) ? sponsorshipTotal : null,
      sponsorship_category: optionalField(formData, "sponsorship_category"),
      account_rep: optionalField(formData, "account_rep"),
      notes: optionalField(formData, "notes"),
    })
    .eq("id", id);
  failIfError(error, path, "Could not update the order details");

  revalidatePath(contractPath(id));
  revalidatePath(CONTRACTS_LIST_PATH);
  redirect(field(formData, "return_to") === "order" ? `${contractPath(id)}/schedule` : path);
}

/** Records the executed agreement's storage path after a direct-to-Storage upload — see contract-document-upload.tsx and point 19 of the domain redesign. */
export async function completeContractDocumentUpload(
  contractId: string,
  storagePath: string,
): Promise<{ error?: string }> {
  await assertUnderwritingAccess();
  if (!isUuid(contractId) || !pathIsUnder(contractId, storagePath)) {
    return { error: "That document does not belong to this contract." };
  }
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
  if (!isUuid(contractId) || !pathIsUnder(contractId, storagePath)) {
    return { error: "That document does not belong to this contract." };
  }
  const url = await signedUrl("underwriting-documents", storagePath, { ttlSeconds: 300 });
  if (!url) return { error: "Could not create a download link." };
  return { url };
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
  // A failure reopens the Schedule tab's "Revise the schedule" form.
  const path = `${contractPath(contractId)}?revise=1`;
  const effectiveFrom = optionalField(formData, "effective_from") ?? stationTodayISO();
  if (!isValidDateISO(effectiveFrom)) failWith(path, "Give the date the revision takes effect.");
  const receivedAt = optionalField(formData, "received_at");
  if (receivedAt !== null && !isValidDateISO(receivedAt))
    failWith(path, "The received date isn't a date.");

  const supabase = await createClient();
  const { data: existingDraft, error: existingDraftError } = await supabase
    .from("uw_contract_revisions")
    .select("id")
    .eq("contract_id", contractId)
    .eq("status", "draft")
    .maybeSingle();
  failIfError(existingDraftError, path, "Could not read the contract's revisions");
  if (existingDraft)
    failWith(path, "This contract already has a draft revision — activate or cancel it first.");

  const { data: current, error: currentError } = await supabase
    .from("uw_contract_revisions")
    .select("id")
    .eq("contract_id", contractId)
    .eq("status", "current")
    .maybeSingle();
  failIfError(currentError, path, "Could not read the current revision");

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
    const { data: lines, error: linesError } = await supabase
      .from("uw_contract_schedule_lines")
      .select("*")
      .eq("revision_id", current.id)
      .eq("status", "active");
    failIfError(linesError, path, "Created the revision but could not read its lines to copy");
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
      const { data: buckets, error: bucketsError } = await supabase
        .from("uw_demand_buckets")
        .select("period_start, period_end, quantity_required, source_label")
        .eq("schedule_line_id", oldId)
        .eq("status", "active");
      failIfError(bucketsError, path, "Created the revision but could not read a line's demand");
      if (buckets && buckets.length > 0) {
        const { error: bucketError } = await supabase
          .from("uw_demand_buckets")
          .insert(buckets.map((bucket) => ({ ...bucket, schedule_line_id: copied.id })));
        failIfError(bucketError, path, "Created the revision but could not copy a line's demand");
      }
    }
  }

  revalidatePath(contractPath(contractId));
  redirect(contractPath(contractId));
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
  if (message) failWith(`${path}?activate=1`, message);
  // The activation cleared placements from its effective date; whatever
  // remains ahead of it re-sequences.
  await rebalanceContractRotation(contractId, profile.id);

  await logAuditEvent({
    actorId: profile.id,
    action: "underwriting.contract.revision_activated",
    targetType: "uw_contract_revision",
    targetId: revisionId,
    metadata: { contract_id: contractId },
  });

  revalidatePath(path);
  revalidatePath("/underwriting/exceptions");
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
  redirect(`${path}#flights`);
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
  const { data: lines, error: linesError } = await supabase
    .from("uw_contract_schedule_lines")
    .select("id")
    .eq("flight_id", flightId)
    .eq("status", "active");
  failIfError(linesError, path, "Could not read the flight's lines");
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
  await rebalanceContractRotation(contractId, profile.id);

  revalidatePath(path);
  redirect(`${path}#flights`);
}

// Schedule lines -----------------------------------------------------------

/**
 * One traffic instruction from a signed insertion order: eligibility on
 * the line, quantities compiled into demand buckets
 * (docs/underwriting-traffic-redesign.md §9) — parsed and validated by
 * lib/underwriting/schedule-line-form.ts, written under the revision the
 * form named (the current one, or the draft being entered).
 */
/** The editor's posted fields as the parser's values — shared by add and update. */
function scheduleLineValuesFromForm(formData: FormData): ScheduleLineFormValues {
  // Structured entries (2026-09-25): one row per explicit date, one
  // quantity per Monday for a week grid — see schedule-line-form.ts.
  const explicitDates = formData.getAll("explicit_date").map((date, index) => ({
    date: String(date).trim(),
    quantity: String(formData.getAll("explicit_quantity")[index] ?? "").trim(),
  }));
  const weekGrid = [...formData.entries()]
    .filter(([key]) => key.startsWith("week_quantity:"))
    .map(([key, value]) => ({
      week_start: key.slice("week_quantity:".length),
      quantity: String(value).trim(),
    }));
  return {
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
    explicit_dates: explicitDates,
    week_grid: weekGrid,
  };
}

/**
 * A line naming both a pool and a program is their intersection
 * (log_place_underwriting_credit() checks each in turn), so a program the
 * pool's targets never cover could be saved but never placed. The editor
 * only offers the pool's programs; this is the same rule for a post that
 * bypassed it.
 */
/**
 * A line naming a pool must be one the pool can serve: its program (the
 * intersection rule, 2026-09-27), and — since the same day's Carpool
 * incident, docs/underwriting-traffic-redesign.md §11.6 — at least one of
 * its days and its time. A pool with no targets yet is unfinished rather
 * than wrong and is not refused here; the dashboard and auto-fill say so.
 */
async function requirePoolReachesLine(
  supabase: Awaited<ReturnType<typeof createClient>>,
  line: LineReachLike & { pool_id: string | null },
  path: string,
): Promise<void> {
  if (!line.pool_id) return;
  const [{ data: targets, error }, { data: pool, error: poolError }] = await Promise.all([
    supabase
      .from("uw_inventory_pool_targets")
      .select("program_id, window_start, window_end, days_of_week")
      .eq("pool_id", line.pool_id),
    supabase.from("uw_inventory_pools").select("name").eq("id", line.pool_id).maybeSingle(),
  ]);
  failIfError(error, path, "Could not read the pool's targets");
  failIfError(poolError, path, "Could not read the pool");
  const reach = poolReachability(targets ?? [], line);
  if (reach.kind !== "unreachable") return;
  failWith(path, describePoolReachability(reach, pool?.name ?? "chosen", line)!);
}

export async function addScheduleLine(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const revisionId = field(formData, "revision_id");
  // The wizard's schedule step posts return_to=schedule so the staffer stays
  // on it ("Add and start another"); the contract page posts nothing.
  const returnTo = field(formData, "return_to") === "schedule" ? "schedule" : null;
  const path = returnTo ? `${contractPath(contractId)}/schedule` : contractPath(contractId);
  if (revisionId === "") failWith(path, "Choose which revision the line belongs to.");

  const parsed = parseScheduleLineForm(scheduleLineValuesFromForm(formData));
  if (!parsed.ok) failWith(path, parsed.error);

  const supabase = await createClient();
  const { data: revision, error: revisionError } = await supabase
    .from("uw_contract_revisions")
    .select("id, status")
    .eq("id", revisionId)
    .eq("contract_id", contractId)
    .maybeSingle();
  failIfError(revisionError, path, "Could not read the revision");
  if (!revision || (revision.status !== "current" && revision.status !== "draft"))
    failWith(path, "Lines can only be added to the current revision or a draft.");
  await requirePoolReachesLine(supabase, parsed.value.line, path);

  const inserted = await insertScheduleLineWithBuckets(
    supabase,
    { contractId, revisionId, createdBy: profile.id },
    parsed.value,
  );
  if (!inserted.ok) failWith(path, inserted.error);

  revalidatePath(path);
  redirect(`${path}#line-${inserted.id}`);
}

/**
 * The line, if it may still be rewritten (edited in place or removed
 * outright): under a draft revision, or on a draft contract, with no
 * placement referencing it — lib/underwriting/line-mutability.ts. Checked
 * here as well as by RLS because a delete RLS refuses matches zero rows
 * with no error, which would otherwise redirect as if it had succeeded.
 */
async function requireRewritableLine(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lineId: string,
  contractId: string,
  path: string,
): Promise<{ id: string; revision_id: string }> {
  const { data: line, error } = await supabase
    .from("uw_contract_schedule_lines")
    .select("id, revision_id, contract_id")
    .eq("id", lineId)
    .eq("contract_id", contractId)
    .maybeSingle();
  failIfError(error, path, "Could not read the schedule line");
  if (!line) failWith(path, "That schedule line no longer exists.");

  const [revisionResult, contractResult, placementsResult] = await Promise.all([
    supabase.from("uw_contract_revisions").select("status").eq("id", line.revision_id).single(),
    supabase.from("uw_contracts").select("status").eq("id", line.contract_id).single(),
    supabase
      .from("uw_scheduled_placements")
      .select("id", { count: "exact", head: true })
      .eq("schedule_line_id", line.id)
      .neq("status", "superseded"),
  ]);
  failIfError(revisionResult.error, path, "Could not read the line's revision");
  failIfError(contractResult.error, path, "Could not read the line's contract");
  failIfError(placementsResult.error, path, "Could not read the line's placements");
  if (
    !canRewriteScheduleLine({
      contractStatus: contractResult.data?.status ?? "",
      revisionStatus: revisionResult.data?.status ?? "",
      placementCount: placementsResult.count ?? 0,
    })
  )
    failWith(
      path,
      "This line has scheduled credits behind it. Cancel it from a date and enter the correction as a new line.",
    );
  return { id: line.id, revision_id: line.revision_id };
}

/**
 * Rewrites a line in place (2026-09-27): the same parse as addScheduleLine,
 * the row updated and its demand buckets replaced. Only for a line nothing
 * has scheduled from — requireRewritableLine() — so there is no history
 * to keep; a line with placements is cancelled from a date instead. The
 * revision is never changed by an edit.
 */
export async function updateScheduleLine(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const lineId = field(formData, "schedule_line_id");
  const path = returnPath(formData, contractId);
  const editPath = `${contractPath(contractId)}/lines/${lineId}/edit?return_to=${encodeURIComponent(field(formData, "return_to"))}`;

  const parsed = parseScheduleLineForm(scheduleLineValuesFromForm(formData));
  if (!parsed.ok) failWith(editPath, parsed.error);

  const supabase = await createClient();
  await requireRewritableLine(supabase, lineId, contractId, editPath);
  await requirePoolReachesLine(supabase, parsed.value.line, editPath);

  const { entry_spec, ...lineFields } = parsed.value.line;
  const { error } = await supabase
    .from("uw_contract_schedule_lines")
    .update({ ...lineFields, entry_spec })
    .eq("id", lineId);
  failIfError(error, editPath, "Could not save the schedule line");

  // Idempotent: replace-all, so zero existing rows is fine.
  const { error: clearError } = await supabase
    .from("uw_demand_buckets")
    .delete()
    .eq("schedule_line_id", lineId);
  failIfError(clearError, editPath, "Saved the line, but could not replace its demand");
  const { error: bucketError } = await supabase.from("uw_demand_buckets").insert(
    parsed.value.buckets.map((bucket) => ({
      schedule_line_id: lineId,
      period_start: bucket.periodStart,
      period_end: bucket.periodEnd,
      quantity_required: bucket.quantity,
      source_label: bucket.sourceLabel,
    })),
  );
  failIfError(bucketError, editPath, "Saved the line, but could not save its demand");

  revalidatePath(path);
  redirect(`${path}#line-${lineId}`);
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
  const { data: placements, error: placementsError } = await supabase
    .from("uw_scheduled_placements")
    .select("id")
    .eq("schedule_line_id", lineId)
    .neq("status", "superseded")
    .gte("placement_date", from);
  if (placementsError)
    return `Could not read the line's future placements: ${placementsError.message}`;
  for (const placement of placements ?? []) {
    const result = await clearCredit(placement.id);
    if (!result.ok) return `Could not clear a future placement: ${result.message}`;
  }
  const { data: voidBuckets, error: voidBucketsError } = await supabase
    .from("uw_demand_buckets")
    .select("id")
    .eq("schedule_line_id", lineId)
    .eq("status", "active")
    .gte("period_end", from);
  if (voidBucketsError) return `Could not read the line's demand: ${voidBucketsError.message}`;
  const voidIds = (voidBuckets ?? []).map((bucket) => bucket.id);
  if (voidIds.length > 0) {
    const { error: bucketError } = await supabase
      .from("uw_demand_buckets")
      .update({ status: "cancelled" })
      .in("id", voidIds);
    if (bucketError) return `Could not cancel the line's demand: ${bucketError.message}`;
    // Makegoods still awaiting a slot for demand that no longer exists.
    const { error: makegoodError } = await supabase
      .from("uw_makegoods")
      .update({ status: "cancelled" })
      .eq("schedule_line_id", lineId)
      .eq("status", "scheduled")
      .is("scheduled_placement_id", null)
      .in("demand_bucket_id", voidIds);
    if (makegoodError)
      return `Could not cancel the line's open makegoods: ${makegoodError.message}`;
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
  // A failure renders inside the line's own card (`?line=`), not at the top of the page.
  const failPath = `${path}?line=${lineId}`;
  const from = optionalField(formData, "cancelled_from") ?? stationTodayISO();
  if (!isValidDateISO(from)) failWith(failPath, "Give the date the cancellation takes effect.");

  const message = await cancelScheduleLineFrom(lineId, from, profile.id);
  if (message) failWith(failPath, message);
  await rebalanceContractRotation(contractId, profile.id);

  revalidatePath(path);
  revalidatePath("/underwriting/exceptions");
  redirect(path);
}

/** Removes a line outright — under a draft revision or on a draft contract, nothing has scheduled from it, so there is no history to keep (RLS admits the delete only then: 20260925170000, 20260927130000). */
export async function removeDraftScheduleLine(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const lineId = field(formData, "schedule_line_id");
  const path = returnPath(formData, contractId);
  // From the contract page a failure renders inside the line's card; the schedule step has no per-line card.
  const failPath = path === contractPath(contractId) ? `${path}?line=${lineId}` : path;

  const supabase = await createClient();
  await requireRewritableLine(supabase, lineId, contractId, failPath);
  // Idempotent: a line with no demand rows yet is still removable.
  const { error: bucketError } = await supabase
    .from("uw_demand_buckets")
    .delete()
    .eq("schedule_line_id", lineId);
  failIfError(bucketError, failPath, "Could not remove the line's demand");
  await deleteOrFail(
    supabase.from("uw_contract_schedule_lines").delete().eq("id", lineId).select("id"),
    failPath,
    "Could not remove the schedule line",
  );

  revalidatePath(path);
  redirect(path);
}

/** Links an existing piece of copy to this contract — optionally scoped to one flight (a script that names a specific show). */
export async function linkCopyToContract(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const copyId = field(formData, "copy_id");
  const path = copyReturnPath(formData, contractId);
  // A failure lands back on the open link card so its message renders there.
  const failPath = `${path}${path.includes("?") ? "&" : "?"}link=1`;
  if (copyId === "") failWith(failPath, "Choose a message to link.");

  const flightId = optionalField(formData, "flight_id");
  const scheduleLineId = optionalField(formData, "schedule_line_id");
  if (flightId && scheduleLineId)
    failWith(
      failPath,
      "Choose a flight or one line, not both — a line already belongs to its flight.",
    );

  const supabase = await createClient();
  const { error } = await supabase.from("uw_contract_copy").insert({
    contract_id: contractId,
    copy_id: copyId,
    flight_id: flightId,
    schedule_line_id: scheduleLineId,
  });
  if (error?.code === "23505")
    failWith(failPath, "That message is already linked to this contract.");
  failIfError(error, failPath, "Could not link that copy");
  await rebalanceContractRotation(contractId, profile.id);

  revalidatePath(contractPath(contractId));
  redirect(path);
}

/** Changes which flight a linked copy serves (or makes it contract-wide again). */
export async function setCopyFlight(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const copyId = field(formData, "copy_id");
  const path = copyReturnPath(formData, contractId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("uw_contract_copy")
    .update({ flight_id: optionalField(formData, "flight_id") })
    .eq("contract_id", contractId)
    .eq("copy_id", copyId);
  failIfError(error, path, "Could not change that copy's flight");
  await rebalanceContractRotation(contractId, profile.id);

  revalidatePath(contractPath(contractId));
  redirect(path);
}

/**
 * Dedicates a linked message to one schedule line, or returns it to every
 * line (docs/underwriting-traffic-redesign.md §16): the order gives this
 * message to one line ("For Carpool: #1"), and that line then takes only
 * its dedicated copy. The database refuses a line from another contract.
 */
export async function setCopyLine(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const copyId = field(formData, "copy_id");
  const path = copyReturnPath(formData, contractId);
  const scheduleLineId = optionalField(formData, "schedule_line_id");

  const supabase = await createClient();
  const { error } = await supabase
    .from("uw_contract_copy")
    .update(
      scheduleLineId
        ? { schedule_line_id: scheduleLineId, flight_id: null }
        : { schedule_line_id: null },
    )
    .eq("contract_id", contractId)
    .eq("copy_id", copyId);
  failIfError(error, path, "Could not change which line that copy serves");
  await rebalanceContractRotation(contractId, profile.id);

  revalidatePath(contractPath(contractId));
  redirect(path);
}

/**
 * Sets how often a linked message airs relative to the others in its
 * rotation group (docs/underwriting-traffic-redesign.md §13.2): equal
 * weights are the plain cycle, 2 against 1 airs it twice as often. Weights
 * are per contract — the same message on another order keeps its own.
 */
export async function setCopyWeight(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const copyId = field(formData, "copy_id");
  const path = copyReturnPath(formData, contractId);

  const weight = Number(field(formData, "weight"));
  if (!Number.isInteger(weight) || weight < 1 || weight > MAX_ROTATION_WEIGHT)
    failWith(path, `A weight is a whole number from 1 to ${MAX_ROTATION_WEIGHT}.`);

  const supabase = await createClient();
  const { data: before, error: readError } = await supabase
    .from("uw_contract_copy")
    .select("weight")
    .eq("contract_id", contractId)
    .eq("copy_id", copyId)
    .maybeSingle();
  failIfError(readError, path, "Could not read that copy's weight");
  if (!before) failWith(path, "That message isn't linked to this contract.");

  const { error } = await supabase
    .from("uw_contract_copy")
    .update({ weight })
    .eq("contract_id", contractId)
    .eq("copy_id", copyId);
  failIfError(error, path, "Could not change that copy's weight");

  if (before.weight !== weight) {
    await logAuditEvent({
      actorId: profile.id,
      action: "underwriting.contract.copy_weight_changed",
      targetType: "uw_contract",
      targetId: contractId,
      metadata: { copy_id: copyId, from: before.weight, to: weight },
    });
    await rebalanceContractRotation(contractId, profile.id);
  }

  revalidatePath(contractPath(contractId));
  redirect(path);
}

export async function unlinkCopyFromContract(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const copyId = field(formData, "copy_id");
  const path = copyReturnPath(formData, contractId);

  const supabase = await createClient();
  await deleteOrFail(
    supabase
      .from("uw_contract_copy")
      .delete()
      .eq("contract_id", contractId)
      .eq("copy_id", copyId)
      .select("copy_id"),
    path,
    "Could not unlink that copy",
  );
  // Placements already carrying the unlinked message keep it (the walk never
  // clears a placement); everything else re-sequences without it.
  await rebalanceContractRotation(contractId, profile.id);

  revalidatePath(contractPath(contractId));
  redirect(path);
}
