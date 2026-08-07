"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertToolAccess } from "@/lib/auth/authz";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import type { UwContractStatus, UwObligationStatus, UwQuantityPeriod, UwSponsorshipPosition } from "@/lib/database.types";

const LIST_PATH = "/underwriting/contracts";

function contractPath(id: string): string {
  return `${LIST_PATH}/${id}`;
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function optionalField(formData: FormData, name: string): string | null {
  const value = field(formData, name);
  return value === "" ? null : value;
}

export async function createContract(formData: FormData): Promise<void> {
  const { profile } = await assertToolAccess("underwriting");
  const underwriterName = field(formData, "underwriter_name");
  const contractIdentifier = field(formData, "contract_identifier");
  const effectiveFrom = field(formData, "effective_from");
  if (underwriterName === "" || contractIdentifier === "" || effectiveFrom === "") {
    failWith("/underwriting/contracts/new", "Give the contract an underwriter, identifier, and effective date.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("uw_contracts")
    .insert({
      underwriter_name: underwriterName,
      contract_identifier: contractIdentifier,
      agreement_document_url: optionalField(formData, "agreement_document_url"),
      effective_from: effectiveFrom,
      effective_to: optionalField(formData, "effective_to"),
      notes: optionalField(formData, "notes"),
      created_by: profile.id,
    })
    .select("id")
    .single();
  failIfError(error, "/underwriting/contracts/new", "Could not create the contract");
  if (!data) failWith("/underwriting/contracts/new", "Could not create the contract.");

  revalidatePath(LIST_PATH);
  redirect(contractPath(data.id));
}

const CONTRACT_STATUSES: UwContractStatus[] = ["draft", "active", "expired", "terminated"];

export async function setContractStatus(formData: FormData): Promise<void> {
  await assertToolAccess("underwriting");
  const id = field(formData, "contract_id");
  const path = contractPath(id);
  const status = field(formData, "status") as UwContractStatus;
  if (!CONTRACT_STATUSES.includes(status)) failWith(path, "That is not a recognized status.");

  const supabase = await createClient();
  const { error } = await supabase.from("uw_contracts").update({ status }).eq("id", id);
  failIfError(error, path, "Could not update the contract's status");

  revalidatePath(path);
  revalidatePath(LIST_PATH);
  redirect(path);
}

const QUANTITY_PERIODS: UwQuantityPeriod[] = ["weekly", "monthly", "campaign_total"];
const SPONSORSHIP_POSITIONS: UwSponsorshipPosition[] = ["opening", "closing", "mid"];

export async function addObligation(formData: FormData): Promise<void> {
  await assertToolAccess("underwriting");
  const contractId = field(formData, "contract_id");
  const path = contractPath(contractId);
  const description = field(formData, "description");
  if (description === "") failWith(path, "Describe what this obligation requires.");

  const quantityRequired = Number.parseInt(field(formData, "quantity_required"), 10);
  const durationSeconds = Number.parseInt(field(formData, "duration_seconds"), 10);
  if (!Number.isFinite(quantityRequired) || quantityRequired <= 0) {
    failWith(path, "Give the obligation a quantity greater than zero.");
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    failWith(path, "Give the obligation a duration greater than zero.");
  }

  const quantityPeriod = field(formData, "quantity_period") as UwQuantityPeriod;
  if (!QUANTITY_PERIODS.includes(quantityPeriod)) failWith(path, "That is not a recognized quantity period.");

  const sponsorshipPositionRaw = optionalField(formData, "sponsorship_position");
  const sponsorshipPosition =
    sponsorshipPositionRaw === null ? null : (sponsorshipPositionRaw as UwSponsorshipPosition);
  if (sponsorshipPosition !== null && !SPONSORSHIP_POSITIONS.includes(sponsorshipPosition)) {
    failWith(path, "That is not a recognized sponsorship position.");
  }

  const startDate = field(formData, "start_date");
  if (startDate === "") failWith(path, "Give the obligation a start date.");

  const eligibleProgramIds = field(formData, "eligible_program_ids")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");

  const supabase = await createClient();
  const { error } = await supabase.from("uw_placement_obligations").insert({
    contract_id: contractId,
    description,
    quantity_required: quantityRequired,
    quantity_period: quantityPeriod,
    duration_seconds: durationSeconds,
    eligible_program_ids: eligibleProgramIds,
    eligible_daypart: optionalField(formData, "eligible_daypart"),
    distribution_rule: optionalField(formData, "distribution_rule"),
    sponsorship_position: sponsorshipPosition,
    start_date: startDate,
    end_date: optionalField(formData, "end_date"),
  });
  failIfError(error, path, "Could not add the obligation");

  revalidatePath(path);
  redirect(path);
}

const OBLIGATION_STATUSES: UwObligationStatus[] = ["active", "fulfilled", "at_risk"];

export async function setObligationStatus(formData: FormData): Promise<void> {
  await assertToolAccess("underwriting");
  const obligationId = field(formData, "obligation_id");
  const contractId = field(formData, "contract_id");
  const path = contractPath(contractId);
  const status = field(formData, "status") as UwObligationStatus;
  if (!OBLIGATION_STATUSES.includes(status)) failWith(path, "That is not a recognized status.");

  const supabase = await createClient();
  const { error } = await supabase.from("uw_placement_obligations").update({ status }).eq("id", obligationId);
  failIfError(error, path, "Could not update the obligation's status");

  revalidatePath(path);
  redirect(path);
}

/** Links an existing piece of copy to this contract — the reverse of copy-actions.ts's own link form. */
export async function linkCopyToContract(formData: FormData): Promise<void> {
  await assertToolAccess("underwriting");
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
  await assertToolAccess("underwriting");
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
