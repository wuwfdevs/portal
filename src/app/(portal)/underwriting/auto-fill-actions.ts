"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertUnderwritingAccess } from "@/lib/underwriting/access";
import { failWith } from "@/lib/editorial/action-result";
import { logAuditEvent } from "@/lib/audit";
import {
  autoFillActiveScheduleLines,
  autoFillContractScheduleLines,
  autoFillScheduleLine,
  type AutoFillResult,
} from "@/lib/underwriting/auto-fill";
import { getContract, getContractDetail, getScheduleLine } from "@/lib/underwriting/queries";

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

const SKIP_REASON_LABEL: Record<AutoFillResult["skipped"][number]["reason"], string> = {
  same_underwriter_adjacent: "would have run the same underwriter back to back",
  same_category_adjacent: "would have run the same industry back to back",
  no_eligible_copy: "had no eligible copy to place",
};

function summarizeAutoFill(result: AutoFillResult): string {
  const parts: string[] = [];
  if (result.rundownsGeneratedCount > 0) {
    parts.push(
      `generated ${result.rundownsGeneratedCount} rundown${result.rundownsGeneratedCount === 1 ? "" : "s"} to place into`,
    );
  }
  if (result.placedCount > 0) {
    parts.push(`placed ${result.placedCount} credit${result.placedCount === 1 ? "" : "s"}`);
  }
  if (result.makegoodsResolvedCount > 0) {
    parts.push(`${result.makegoodsResolvedCount} of those resolved a makegood awaiting a slot`);
  }
  if (result.unschedulableAirDates.length > 0) {
    parts.push(
      `${result.unschedulableAirDates.length} date${result.unschedulableAirDates.length === 1 ? "" : "s"} have no Log schedule entry, clock version, or underwriting-eligible local opportunity to generate a rundown against`,
    );
  }
  const skipCounts = new Map<string, number>();
  for (const skip of result.skipped) {
    skipCounts.set(skip.reason, (skipCounts.get(skip.reason) ?? 0) + 1);
  }
  for (const [reason, count] of skipCounts) {
    parts.push(`${count} break${count === 1 ? "" : "s"} skipped — ${SKIP_REASON_LABEL[reason as keyof typeof SKIP_REASON_LABEL]}`);
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
  if (result.placedCount > 0 || result.rundownsGeneratedCount > 0) {
    await logAuditEvent({
      actorId: profile.id,
      action: "underwriting.schedule_line.auto_filled",
      targetType: "uw_contract_schedule_line",
      targetId: scheduleLineId,
      metadata: {
        placed_count: result.placedCount,
        makegoods_resolved_count: result.makegoodsResolvedCount,
        rundowns_generated_count: result.rundownsGeneratedCount,
      },
    });
  }

  revalidatePath(path);
  revalidatePath("/underwriting/makegoods");
  redirect(`${path}?notice=${encodeURIComponent(summarizeAutoFill(result))}`);
}

/**
 * Contract-wide version — every schedule line under this one contract, one
 * click. The middle ground between the per-line button above and the
 * dashboard's every-active-contract sweep, for a traffic staffer working a
 * single renewal who doesn't want to click "Auto-fill remaining" once per
 * line.
 */
export async function autoFillContractAction(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const path = `/underwriting/contracts/${contractId}`;

  const contract = await getContractDetail(contractId);
  if (!contract) failWith(path, "That contract no longer exists.");
  if (contract.status !== "active") failWith(path, "Auto-fill only works for an active contract.");

  const { perLine, totals } = await autoFillContractScheduleLines(contract.scheduleLines);
  for (const { scheduleLine, result } of perLine) {
    if (result.placedCount === 0 && result.rundownsGeneratedCount === 0) continue;
    await logAuditEvent({
      actorId: profile.id,
      action: "underwriting.schedule_line.auto_filled",
      targetType: "uw_contract_schedule_line",
      targetId: scheduleLine.id,
      metadata: {
        placed_count: result.placedCount,
        makegoods_resolved_count: result.makegoodsResolvedCount,
        rundowns_generated_count: result.rundownsGeneratedCount,
      },
    });
  }

  revalidatePath(path);
  revalidatePath("/underwriting/makegoods");
  redirect(`${path}?notice=${encodeURIComponent(summarizeAutoFill(totals))}`);
}

/** Dashboard-wide version — every schedule line under every active contract, one click (Workflow D). */
export async function autoFillAllAction(): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const path = "/underwriting";

  const { perLine, totals } = await autoFillActiveScheduleLines();
  for (const { scheduleLine, result } of perLine) {
    if (result.placedCount === 0 && result.rundownsGeneratedCount === 0) continue;
    await logAuditEvent({
      actorId: profile.id,
      action: "underwriting.schedule_line.auto_filled",
      targetType: "uw_contract_schedule_line",
      targetId: scheduleLine.id,
      metadata: {
        placed_count: result.placedCount,
        makegoods_resolved_count: result.makegoodsResolvedCount,
        rundowns_generated_count: result.rundownsGeneratedCount,
      },
    });
  }

  revalidatePath(path);
  revalidatePath("/underwriting/contracts");
  revalidatePath("/underwriting/makegoods");
  redirect(`${path}?notice=${encodeURIComponent(summarizeAutoFill(totals))}`);
}
