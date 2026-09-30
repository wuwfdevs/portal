"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertUnderwritingAccess } from "@/lib/underwriting/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { logAuditEvent } from "@/lib/audit";
import { createHash } from "node:crypto";
import { findAffidavitEvidence, getAffidavitDetail } from "@/lib/underwriting/queries";
import {
  buildReportIdentifier,
  certifiedAffidavitObjectPath,
  newAffidavitHref,
} from "@/lib/underwriting/affidavits";
import { renderAffidavitPdf } from "@/lib/underwriting/affidavit-pdf";
import { affidavitPdfProps } from "@/lib/underwriting/affidavit-pdf-props";

const LIST_PATH = "/underwriting/affidavits";
const DOCUMENTS_BUCKET = "underwriting-documents";

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
  // A failure returns to the form with what was entered, so an error never
  // costs the contract picked (or prefilled from the contract page).
  const newPath = newAffidavitHref({ contractId, start: periodStart, end: periodEnd });

  if (contractId === "" || periodStart === "" || periodEnd === "") {
    failWith(newPath, "Choose a contract and a campaign period.");
  }
  if (periodEnd < periodStart) {
    failWith(newPath, "The campaign period's end date can't be before its start date.");
  }

  const supabase = await createClient();
  const { data: contract } = await supabase
    .from("uw_contracts")
    .select("contract_identifier")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract) failWith(newPath, "That contract no longer exists.");

  const evidence = await findAffidavitEvidence(contractId, periodStart, periodEnd);

  const { count } = await supabase
    .from("uw_affidavits")
    .select("id", { count: "exact", head: true })
    .eq("contract_id", contractId)
    .eq("campaign_period_start", periodStart)
    .eq("campaign_period_end", periodEnd);
  const reportIdentifier = buildReportIdentifier(
    // An internal report id, not an order number: a contract without one
    // falls back to the start of its own id.
    contract.contract_identifier ?? contractId.slice(0, 8),
    periodStart,
    periodEnd,
    count ?? 0,
  );

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
  failIfError(error, newPath, "Could not generate the affidavit");
  if (!affidavit) failWith(newPath, "Could not generate the affidavit.");

  if (evidence.length > 0) {
    const { error: lineItemsError } = await supabase.from("uw_affidavit_line_items").insert(
      evidence.map((item) => ({
        affidavit_id: affidavit.id,
        log_broadcast_event_id: item.broadcastEvent.id,
        scheduled_placement_id: item.placement.id,
      })),
    );
    failIfError(
      lineItemsError,
      newPath,
      "Generated the affidavit, but could not attach its evidence",
    );
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`/underwriting/contracts/${contractId}`);
  redirect(affidavitPath(affidavit.id));
}

/**
 * One of docs/underwriting-design.md §6's four privileged actions. Renders
 * the client-facing PDF with the manager's name, title and date on the
 * signature line, stores it in underwriting-documents, then marks the row
 * certified with the document's path and SHA-256 in the same update — so a
 * certified affidavit always has the exact file the client receives.
 * uw_guard_affidavit_certification() is the real boundary: it refuses a
 * non-manager, and freezes the row once certified. The isManager check here
 * only avoids storing a file for an update that would be refused.
 */
export async function certifyAffidavit(formData: FormData): Promise<void> {
  const { profile, isManager } = await assertUnderwritingAccess();
  const id = field(formData, "affidavit_id");
  const title = field(formData, "certifying_staff_title");
  const path = affidavitPath(id);

  if (!isManager) failWith(path, "Only an underwriting manager can certify an affidavit.");
  if (title === "") failWith(path, "Enter your title — it prints on the signature line.");

  const affidavit = await getAffidavitDetail(id);
  if (!affidavit) failWith(LIST_PATH, "That affidavit no longer exists.");
  if (affidavit.status === "certified") failWith(path, "This affidavit is already certified.");

  const certifiedAt = new Date().toISOString();
  const pdf = await renderAffidavitPdf(
    affidavitPdfProps(affidavit, {
      certified: true,
      certifierName: profile.display_name,
      certifierTitle: title,
      certifiedAt,
    }),
  );
  const sha256 = createHash("sha256").update(pdf).digest("hex");
  const objectPath = certifiedAffidavitObjectPath(id);

  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(objectPath, pdf, { contentType: "application/pdf", upsert: true });
  if (uploadError) {
    console.error("Could not store the certified affidavit", uploadError);
    failWith(path, `Could not store the certified document: ${uploadError.message}`);
  }

  const { data: updated, error } = await supabase
    .from("uw_affidavits")
    .update({
      status: "certified",
      certifying_staff_id: profile.id,
      certifying_staff_title: title,
      certification_text: affidavit.document.certificationSentence,
      certified_at: certifiedAt,
      certified_document_path: objectPath,
      certified_document_sha256: sha256,
    })
    .eq("id", id)
    .eq("status", "draft")
    .select("id");
  failIfError(error, path, "Could not certify this affidavit — only an underwriting manager can");
  if (!updated || updated.length === 0) failWith(path, "This affidavit is already certified.");

  await logAuditEvent({
    actorId: profile.id,
    action: "underwriting.affidavit.certified",
    targetType: "uw_affidavit",
    targetId: id,
    metadata: { document_sha256: sha256, announcements: affidavit.document.airedCount },
  });

  revalidatePath(path);
  revalidatePath(LIST_PATH);
  revalidatePath(`/underwriting/contracts/${affidavit.contract_id}`);
  redirect(path);
}
