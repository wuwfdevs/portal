"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertUnderwritingAccess } from "@/lib/underwriting/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { logAuditEvent } from "@/lib/audit";
import { findAffidavitEvidence } from "@/lib/underwriting/queries";
import { buildReportIdentifier } from "@/lib/underwriting/affidavits";

const LIST_PATH = "/underwriting/affidavits";
const NEW_PATH = "/underwriting/affidavits/new";

function affidavitPath(id: string): string {
  return `${LIST_PATH}/${id}`;
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/**
 * Workflow G: assembles every broadcast event behind this contract's
 * placements in the given period (lib/underwriting/queries.ts's
 * findAffidavitEvidence) into a new draft uw_affidavits row plus its
 * uw_affidavit_line_items — the durable evidence link §17 requires.
 * Regenerating for the same contract/period is allowed (it's how a
 * correction gets picked up) and produces a new, separately versioned
 * affidavit rather than overwriting the previous one.
 */
export async function generateAffidavit(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const periodStart = field(formData, "campaign_period_start");
  const periodEnd = field(formData, "campaign_period_end");

  if (contractId === "" || periodStart === "" || periodEnd === "") {
    failWith(NEW_PATH, "Choose a contract and a campaign period.");
  }
  if (periodEnd < periodStart) {
    failWith(NEW_PATH, "The campaign period's end date can't be before its start date.");
  }

  const supabase = await createClient();
  const { data: contract } = await supabase
    .from("uw_contracts")
    .select("contract_identifier")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract) failWith(NEW_PATH, "That contract no longer exists.");

  const evidence = await findAffidavitEvidence(contractId, periodStart, periodEnd);

  const { count } = await supabase
    .from("uw_affidavits")
    .select("id", { count: "exact", head: true })
    .eq("contract_id", contractId)
    .eq("campaign_period_start", periodStart)
    .eq("campaign_period_end", periodEnd);
  const reportIdentifier = buildReportIdentifier(contract.contract_identifier, periodStart, periodEnd, count ?? 0);

  const { data: affidavit, error } = await supabase
    .from("uw_affidavits")
    .insert({
      contract_id: contractId,
      campaign_period_start: periodStart,
      campaign_period_end: periodEnd,
      generated_by: profile.id,
      report_identifier: reportIdentifier,
    })
    .select("id")
    .single();
  failIfError(error, NEW_PATH, "Could not generate the affidavit");
  if (!affidavit) failWith(NEW_PATH, "Could not generate the affidavit.");

  if (evidence.length > 0) {
    const { error: lineItemsError } = await supabase.from("uw_affidavit_line_items").insert(
      evidence.map((item) => ({
        affidavit_id: affidavit.id,
        log_broadcast_event_id: item.broadcastEvent.id,
        scheduled_placement_id: item.placement.id,
      })),
    );
    failIfError(lineItemsError, NEW_PATH, "Generated the affidavit, but could not attach its evidence");
  }

  revalidatePath(LIST_PATH);
  redirect(affidavitPath(affidavit.id));
}

/**
 * One of docs/underwriting-design.md §6's four privileged actions —
 * uw_guard_affidavit_certification() (the migration's before-update
 * trigger) is what actually stops a non-manager, not this action, so the
 * boundary holds no matter how this table is ever written.
 */
export async function certifyAffidavit(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const id = field(formData, "affidavit_id");
  const certificationText = field(formData, "certification_text");
  const path = affidavitPath(id);

  if (certificationText === "") failWith(path, "Enter certification language before certifying.");

  const supabase = await createClient();

  const { data: existing } = await supabase.from("uw_affidavits").select("status").eq("id", id).maybeSingle();
  const isNewCertification = existing?.status !== "certified";

  const { error } = await supabase
    .from("uw_affidavits")
    .update({
      status: "certified",
      certifying_staff_id: profile.id,
      certification_text: certificationText,
    })
    .eq("id", id);
  failIfError(error, path, "Could not certify this affidavit — only an underwriting manager can");

  if (isNewCertification) {
    await logAuditEvent({
      actorId: profile.id,
      action: "underwriting.affidavit.certified",
      targetType: "uw_affidavit",
      targetId: id,
    });
  }

  revalidatePath(path);
  revalidatePath(LIST_PATH);
  redirect(path);
}
