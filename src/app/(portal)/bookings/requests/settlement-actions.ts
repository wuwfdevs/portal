"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { assertBookingsFinance } from "@/lib/bookings/access";
import { logProjectEvent } from "@/lib/bookings/events";
import { BOOKINGS_PATH, REQUESTS_PATH, requestHref } from "@/lib/bookings/paths";
import { unitCostsFromRows } from "@/lib/bookings/pricing";
import { formatDollars } from "@/lib/bookings/rates";
import { getPricingContext } from "@/lib/bookings/queries";
import {
  draftSettlement,
  settlementColumns,
  validatePosting,
  type SettlementLine,
} from "@/lib/bookings/settlements";

// Settlement at actual cost (docs/bookings-design.md §21). Finance drafts it from the
// hours production confirmed and posts it with a journal entry number; posting settles
// the project. The figures come from lib/bookings/settlements.ts — SQL only checks them.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function projectIdField(formData: FormData): string {
  const id = field(formData, "project_id");
  if (!UUID.test(id)) failWith(REQUESTS_PATH, "That request could not be found.");
  return id;
}

function revalidate(projectId: string): void {
  revalidatePath(BOOKINGS_PATH);
  revalidatePath(REQUESTS_PATH);
  revalidatePath(requestHref(projectId));
  revalidatePath(`${BOOKINGS_PATH}/report`);
}

const POST_ERRORS: Record<string, string> = {
  journal_entry_required: "Enter the journal entry number to post.",
  funding_index_required: "A recharge names the funding index it is charged to.",
  already_posted: "That settlement is already posted.",
  not_found: "That settlement no longer exists.",
  wrong_stage: "Only a delivered project can be settled.",
};

/**
 * Draft the settlement, or redraft it from the latest confirmed hours and the actual
 * expenses typed here. A posted settlement is final; redrafting is refused.
 */
export async function draftSettlementAction(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsFinance();
  const projectId = projectIdField(formData);
  const path = requestHref(projectId);
  const supabase = await createClient();

  const [{ data: project }, { data: lines }, { data: used }, { data: existing }] =
    await Promise.all([
      supabase.from("bk_projects").select("*").eq("id", projectId).maybeSingle(),
      supabase
        .from("bk_estimate_lines")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order"),
      supabase.from("bk_hours_used").select("*").eq("project_id", projectId),
      supabase.from("bk_settlements").select("*").eq("project_id", projectId).maybeSingle(),
    ]);
  if (!project || project.stage !== "delivered" || project.disposition !== null) {
    failWith(path, "A settlement is drafted for a delivered project.");
  }
  if (existing?.status === "posted") failWith(path, "That settlement is already posted.");
  const { data: partner } = await supabase
    .from("bk_partners")
    .select("kind, default_funding_index")
    .eq("id", project.partner_id)
    .maybeSingle();
  if (!partner) failWith(path, "That request's partner could not be found.");
  const pricing = await getPricingContext(project.rate_model_version_id);
  if (!pricing || pricing.unitCosts.length === 0) {
    failWith(
      path,
      "The rate card this project was priced on has no unit costs recorded; record it again on the Rates tab before settling.",
    );
  }

  const expenseActuals: Record<string, number> = {};
  for (const line of lines ?? []) {
    if (line.kind !== "expense") continue;
    const raw = field(formData, `expense_${line.id}`).replace(/[$,\s]/g, "");
    if (raw === "") continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      failWith(path, `${line.label}'s actual cost must be a number, zero or more.`);
    }
    expenseActuals[line.id] = value;
  }

  const settlementLines: SettlementLine[] = (lines ?? []).map((l) => ({
    id: l.id,
    kind: l.kind,
    package_id: l.package_id,
    label: l.label,
    quantity: Number(l.quantity),
    amount: Number(l.amount),
    direct_cost: l.direct_cost === null ? null : Number(l.direct_cost),
    labor_hours: l.labor_hours ?? {},
    resource_units: l.resource_units ?? {},
    recipe_labor_hours: l.recipe_labor_hours,
    recipe_resource_units: l.recipe_resource_units,
  }));
  const result = draftSettlement({
    partnerKind: partner.kind,
    treatment: project.priced_as,
    lines: settlementLines,
    confirmed: (used ?? []).map((row) => ({
      kind: row.kind,
      id: (row.kind === "labor" ? row.labor_class_id : row.pool_id) ?? "",
      planned: Number(row.planned),
      used: Number(row.used),
    })),
    unitCosts: unitCostsFromRows(pricing.unitCosts),
    assessmentShare: pricing.assessmentShare,
    expenseActuals,
    estimatedFullCost:
      project.full_economic_cost === null ? null : Number(project.full_economic_cost),
    estimatedContribution:
      project.wuwf_contribution === null ? null : Number(project.wuwf_contribution),
  });
  if (!result.ok) failWith(path, result.error);

  const fundingIndex =
    field(formData, "funding_index") ||
    existing?.funding_index ||
    project.funding_index ||
    partner.default_funding_index ||
    null;
  const columns = settlementColumns(result.figures, {
    expenseActuals,
    estimatedFullCost:
      project.full_economic_cost === null ? null : Number(project.full_economic_cost),
    estimatedContribution:
      project.wuwf_contribution === null ? null : Number(project.wuwf_contribution),
    rateModelVersionId: project.rate_model_version_id,
    fundingIndex,
    notes: field(formData, "notes") || null,
  });
  if (existing) {
    const { error } = await supabase
      .from("bk_settlements")
      .update({ ...columns, drafted_by: profile.id, drafted_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("status", "drafted");
    failIfError(error, path, "Could not update the settlement");
  } else {
    const { error } = await supabase
      .from("bk_settlements")
      .insert({ project_id: projectId, drafted_by: profile.id, ...columns });
    failIfError(error, path, "Could not draft the settlement");
  }
  await logProjectEvent({
    projectId,
    actorId: profile.id,
    kind: "settlement_drafted",
    note: `Settlement drafted: ${formatDollars(result.figures.amount, { cents: true })} at actual cost.`,
    metadata: { amount: result.figures.amount, full_cost: result.figures.fullCost },
  });
  revalidate(projectId);
  redirect(requestHref(projectId, { saved: "settlement" }));
}

/** Post the drafted settlement under its journal entry number and settle the project. Finance only. */
export async function postSettlementAction(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsFinance();
  const projectId = projectIdField(formData);
  const path = requestHref(projectId);
  const supabase = await createClient();
  const { data: settlement } = await supabase
    .from("bk_settlements")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!settlement) failWith(path, "Draft the settlement first.");
  const journal = field(formData, "journal_entry_number");
  const fundingIndex = field(formData, "funding_index") || settlement.funding_index || "";
  const problem = validatePosting(settlement.kind, journal, fundingIndex);
  if (problem) failWith(path, problem);

  const { data, error } = await supabase.rpc("bk_post_settlement", {
    p_settlement_id: settlement.id,
    p_journal_entry_number: journal,
    p_funding_index: fundingIndex || null,
  });
  failIfError(error, path, "Could not post the settlement");
  if (data && "error" in data) failWith(path, POST_ERRORS[data.error] ?? data.error);

  const metadata = {
    settlement_id: settlement.id,
    kind: settlement.kind,
    amount: Number(settlement.amount),
    journal_entry_number: journal,
  };
  await logProjectEvent({
    projectId,
    actorId: profile.id,
    kind: "settled",
    note: `Settled: ${formatDollars(Number(settlement.amount), { cents: true })} ${
      settlement.kind === "recharge" ? "recharged" : "invoiced"
    }, journal entry ${journal}.`,
    metadata,
  });
  await logAuditEvent({
    actorId: profile.id,
    action: "bookings.settlement.posted",
    targetType: "bk_project",
    targetId: projectId,
    metadata,
  });
  revalidate(projectId);
  redirect(requestHref(projectId, { saved: "settled" }));
}
