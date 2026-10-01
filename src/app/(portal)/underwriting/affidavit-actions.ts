"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertUnderwritingAccess } from "@/lib/underwriting/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { logAuditEvent } from "@/lib/audit";
import { createHash } from "node:crypto";
import {
  findAffidavitEvidence,
  getAffidavitDetail,
  getAffidavitMonth,
} from "@/lib/underwriting/queries";
import { monthOf, signingQueue } from "@/lib/underwriting/affidavit-month";
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

type GenerateResult = { ok: true; id: string } | { ok: false; message: string };

/**
 * Workflow G: assembles every broadcast event behind this contract's
 * placements in the given period (lib/underwriting/queries.ts's
 * findAffidavitEvidence) into a new draft uw_affidavits row plus its
 * uw_affidavit_line_items — the durable evidence link §17 requires.
 * Regenerating for the same contract/period is allowed (it's how a
 * correction gets picked up) and produces a new, separately versioned
 * affidavit rather than overwriting the previous one. Shared by the
 * one-at-a-time form and the month list's "Generate all".
 */
async function generateOne(
  profileId: string,
  contractId: string,
  periodStart: string,
  periodEnd: string,
): Promise<GenerateResult> {
  if (contractId === "" || periodStart === "" || periodEnd === "") {
    return { ok: false, message: "Choose a contract and a campaign period." };
  }
  if (periodEnd < periodStart) {
    return { ok: false, message: "The campaign period's end date can't be before its start date." };
  }

  const supabase = await createClient();
  const { data: contract, error: contractError } = await supabase
    .from("uw_contracts")
    .select("contract_identifier")
    .eq("id", contractId)
    .maybeSingle();
  if (contractError)
    return { ok: false, message: `Could not read the contract: ${contractError.message}` };
  if (!contract) return { ok: false, message: "That contract no longer exists." };

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
      generated_by: profileId,
      report_identifier: reportIdentifier,
    })
    .select("id")
    .single();
  if (error || !affidavit) {
    return {
      ok: false,
      message: `Could not generate the affidavit${error ? `: ${error.message}` : "."}`,
    };
  }

  if (evidence.length > 0) {
    const { error: lineItemsError } = await supabase.from("uw_affidavit_line_items").insert(
      evidence.map((item) => ({
        affidavit_id: affidavit.id,
        log_broadcast_event_id: item.broadcastEvent.id,
        scheduled_placement_id: item.placement.id,
      })),
    );
    if (lineItemsError) {
      return {
        ok: false,
        message: `Generated the affidavit, but could not attach its evidence: ${lineItemsError.message}`,
      };
    }
  }

  revalidatePath(`/underwriting/contracts/${contractId}`);
  return { ok: true, id: affidavit.id };
}

export async function generateAffidavit(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const periodStart = field(formData, "campaign_period_start");
  const periodEnd = field(formData, "campaign_period_end");
  // A failure returns to the form with what was entered, so an error never
  // costs the contract picked (or prefilled from the contract page).
  const newPath = newAffidavitHref({ contractId, start: periodStart, end: periodEnd });

  const result = await generateOne(profile.id, contractId, periodStart, periodEnd);
  if (!result.ok) failWith(newPath, result.message);

  revalidatePath(LIST_PATH);
  redirect(affidavitPath(result.id));
}

/**
 * The month list's batch generate: one draft per selected row, each
 * `<contract id>|<period start>|<period end>`, in turn. A row that fails
 * doesn't stop the rest; the page says which ones did. Generating is
 * ordinary member work — only signing is restricted.
 */
export async function generateAffidavitsForMonth(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const month = field(formData, "month");
  const listPath = `${LIST_PATH}?month=${encodeURIComponent(month)}`;
  const rows = formData
    .getAll("row")
    .map((value) => String(value).split("|"))
    .filter((parts): parts is [string, string, string] => parts.length === 3);
  if (rows.length === 0) failWith(listPath, "Nothing selected to generate.");

  const failures: string[] = [];
  for (const [contractId, periodStart, periodEnd] of rows) {
    const result = await generateOne(profile.id, contractId, periodStart, periodEnd);
    if (!result.ok) failures.push(result.message);
  }

  revalidatePath(LIST_PATH);
  if (failures.length > 0) {
    failWith(
      listPath,
      `${rows.length - failures.length} of ${rows.length} generated. ${failures.join(" ")}`,
    );
  }
  redirect(listPath);
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

  // "Sign and open next": the next draft in this month's order, or back to
  // the month once none are left.
  if (field(formData, "then") === "next") {
    const month = monthOf(affidavit.campaign_period_end);
    const queue = signingQueue((await getAffidavitMonth(month)).rows);
    const next = queue.find((other) => other !== id);
    redirect(next ? `${affidavitPath(next)}?signing=1` : `${LIST_PATH}?month=${month}&signed=1`);
  }
  redirect(path);
}
