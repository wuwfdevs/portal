"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertUnderwritingAccess } from "@/lib/underwriting/access";
import { failWith } from "@/lib/editorial/action-result";
import { logAuditEvent } from "@/lib/audit";
import { autoFillActiveScheduleLines, autoFillScheduleLine, type AutoFillResult } from "@/lib/underwriting/auto-fill";
import { getContract, getScheduleLine } from "@/lib/underwriting/queries";

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function summarizeAutoFill(result: AutoFillResult): string {
  const parts: string[] = [];
  if (result.placedCount > 0) {
    parts.push(`placed ${result.placedCount} credit${result.placedCount === 1 ? "" : "s"}`);
  }
  if (result.makegoodsResolvedCount > 0) {
    parts.push(`${result.makegoodsResolvedCount} of those resolved a makegood awaiting a slot`);
  }
  if (result.skippedBreakIds.length > 0) {
    parts.push(
      `${result.skippedBreakIds.length} open break${result.skippedBreakIds.length === 1 ? "" : "s"} had no eligible copy to place`,
    );
  }
  if (result.demandExceedsSupply) {
    parts.push("more are still needed than there's inventory for right now");
  }
  if (result.errors.length > 0) {
    parts.push(
      `${result.errors.length} placement attempt${result.errors.length === 1 ? "" : "s"} failed (${result.errors[0]})`,
    );
  }
  if (parts.length === 0) return "Nothing to auto-fill right now — already caught up.";
  return `Auto-fill: ${parts.join("; ")}.`;
}

/**
 * Runs the rules-based scheduler for one schedule line
 * (docs/underwriting-design.md §7) — the same log_place_underwriting_credit()
 * path the manual form below uses. Awaiting-slot makegoods for this line are
 * drained first (lib/underwriting/auto-fill-plan.ts).
 */
export async function autoFillScheduleLineAction(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const scheduleLineId = field(formData, "schedule_line_id");
  const path = `/underwriting/contracts/${contractId}`;

  const contract = await getContract(contractId);
  if (!contract) failWith(path, "That contract no longer exists.");
  if (contract.status !== "active") failWith(path, "Auto-fill only works for an active contract.");

  const scheduleLine = await getScheduleLine(scheduleLineId);
  if (!scheduleLine) failWith(path, "That schedule line no longer exists.");

  const result = await autoFillScheduleLine(scheduleLine);
  if (result.placedCount > 0) {
    await logAuditEvent({
      actorId: profile.id,
      action: "underwriting.schedule_line.auto_filled",
      targetType: "uw_contract_schedule_line",
      targetId: scheduleLineId,
      metadata: { placed_count: result.placedCount, makegoods_resolved_count: result.makegoodsResolvedCount },
    });
  }

  revalidatePath(path);
  revalidatePath("/underwriting/makegoods");
  redirect(`${path}?notice=${encodeURIComponent(summarizeAutoFill(result))}`);
}

/** Dashboard-wide version — every schedule line under every active contract, one click (Workflow D). */
export async function autoFillAllAction(): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const path = "/underwriting";

  const { perLine, totals } = await autoFillActiveScheduleLines();
  for (const { scheduleLine, result } of perLine) {
    if (result.placedCount === 0) continue;
    await logAuditEvent({
      actorId: profile.id,
      action: "underwriting.schedule_line.auto_filled",
      targetType: "uw_contract_schedule_line",
      targetId: scheduleLine.id,
      metadata: { placed_count: result.placedCount, makegoods_resolved_count: result.makegoodsResolvedCount },
    });
  }

  revalidatePath(path);
  revalidatePath("/underwriting/contracts");
  revalidatePath("/underwriting/makegoods");
  redirect(`${path}?notice=${encodeURIComponent(summarizeAutoFill(totals))}`);
}
