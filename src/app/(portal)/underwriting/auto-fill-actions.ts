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
import type { UnplaceableReason } from "@/lib/underwriting/inventory-selection";
import { CAPACITY_CONFLICT_LABEL } from "@/lib/underwriting/bump-plan";

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

const UNPLACEABLE_LABEL: Record<UnplaceableReason, string> = {
  no_inventory: "no eligible break exists yet",
  no_eligible_copy: "no linked copy is approved, in date, and short enough",
  adjacency: "every break would run the same underwriter or industry back to back",
  separation: "every break is too close to another of this contract's credits",
  day_cap: "the day already has as many credits as the order allows",
  already_in_break: "the only breaks left already hold this contract",
};

function summarizeAutoFill(result: AutoFillResult): string {
  if (result.skippedReason) return `Auto-fill skipped: ${result.skippedReason}`;
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
    parts.push(`${result.makegoodsResolvedCount} of those scheduled a makegood`);
  }
  if (result.unschedulableAirDates.length > 0) {
    parts.push(
      `${result.unschedulableAirDates.length} date${result.unschedulableAirDates.length === 1 ? "" : "s"} have no Log schedule entry, clock version, or underwriting-eligible local opportunity to generate a rundown against`,
    );
  }
  if (result.bumps.length > 0) {
    parts.push(
      `moved ${result.bumps.length} movable credit${result.bumps.length === 1 ? "" : "s"} to seat a fixed-position one`,
    );
  }
  const counts = new Map<UnplaceableReason, number>();
  for (const unit of result.unplaceable) counts.set(unit.why, (counts.get(unit.why) ?? 0) + 1);
  for (const [why, count] of counts) {
    parts.push(`${count} unit${count === 1 ? "" : "s"} still unplaced — ${UNPLACEABLE_LABEL[why]}`);
  }
  for (const conflict of result.capacityConflicts) {
    parts.push(
      `capacity conflict: a fixed-position credit could not be seated — ${CAPACITY_CONFLICT_LABEL[conflict.reason]}`,
    );
  }
  if (result.errors.length > 0) {
    parts.push(
      `${result.errors.length} placement attempt${result.errors.length === 1 ? "" : "s"} failed (${result.errors[0]})`,
    );
  }
  if (parts.length === 0)
    return "Nothing to auto-fill right now — every open period is already scheduled in full.";
  return `Auto-fill: ${parts.join("; ")}.`;
}

/** One audit row per bump (docs/underwriting-traffic-redesign.md §10): the moved placement, where it went, and the line seated in its room. */
async function auditBumps(actorId: string, result: AutoFillResult): Promise<void> {
  for (const bump of result.bumps) {
    await logAuditEvent({
      actorId,
      action: "underwriting.credit.bumped",
      targetType: "uw_scheduled_placement",
      targetId: bump.placementId,
      metadata: {
        new_placement_id: bump.newPlacementId,
        moved_schedule_line_id: bump.movedScheduleLineId,
        from_break_id: bump.fromBreakId,
        to_break_id: bump.toBreakId,
        seated_schedule_line_id: bump.seatedScheduleLineId,
        seated_placement_id: bump.seatedPlacementId,
      },
    });
  }
}

/**
 * Runs the scheduler for one schedule line (docs/underwriting-traffic-
 * redesign.md §4) — the same log_place_underwriting_credit() path the
 * manual form uses. Makegoods awaiting a slot for this line drain first.
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

  const result = await autoFillScheduleLine(scheduleLine, { contract });
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
        bump_count: result.bumps.length,
      },
    });
  }
  await auditBumps(profile.id, result);

  revalidatePath(path);
  revalidatePath("/underwriting/makegoods");
  redirect(`${path}?notice=${encodeURIComponent(summarizeAutoFill(result))}`);
}

/** Contract-wide version — every active schedule line under this one contract, one click. */
export async function autoFillContractAction(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const path = `/underwriting/contracts/${contractId}`;

  const contract = await getContractDetail(contractId);
  if (!contract) failWith(path, "That contract no longer exists.");
  if (contract.status !== "active") failWith(path, "Auto-fill only works for an active contract.");

  const { perLine, totals } = await autoFillContractScheduleLines(
    contract,
    contract.scheduleLines.filter((line) => line.status === "active"),
  );
  for (const { scheduleLine, result } of perLine) {
    await auditBumps(profile.id, result);
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
        bump_count: result.bumps.length,
      },
    });
  }

  revalidatePath(path);
  revalidatePath("/underwriting/makegoods");
  redirect(`${path}?notice=${encodeURIComponent(summarizeAutoFill(totals))}`);
}

/** Dashboard-wide version — every active schedule line under every active contract, one click (Workflow D). */
export async function autoFillAllAction(): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const path = "/underwriting";

  const { perLine, totals } = await autoFillActiveScheduleLines();
  for (const { scheduleLine, result } of perLine) {
    await auditBumps(profile.id, result);
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
        bump_count: result.bumps.length,
      },
    });
  }

  revalidatePath(path);
  revalidatePath("/underwriting/contracts");
  revalidatePath("/underwriting/makegoods");
  redirect(`${path}?notice=${encodeURIComponent(summarizeAutoFill(totals))}`);
}
