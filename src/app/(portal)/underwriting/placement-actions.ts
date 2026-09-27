"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertUnderwritingAccess } from "@/lib/underwriting/access";
import { failWith } from "@/lib/editorial/action-result";
import { logAuditEvent } from "@/lib/audit";
import { clearCredit, placeCredit } from "@/lib/underwriting/placement";
import {
  rebalanceContractRotation,
  resolveCopyForBreak,
} from "@/lib/underwriting/rotation-rebalance";

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function contractPath(id: string): string {
  return `/underwriting/contracts/${id}`;
}

/**
 * Places a credit — the UI's own path, not the underwriting.credit.schedule
 * capability's. Unlike the capability, this supports the override reason:
 * §6.3's "explicit override" is a judgment call made by a person on this
 * screen, checked for real by log_place_underwriting_credit() (only a
 * manager's override_reason is actually honored — a non-manager submitting
 * one just gets 'override_requires_manager' back).
 *
 * The message is the rotation's pick unless the form names one
 * (docs/underwriting-traffic-redesign.md §13): with copy_id blank, the
 * next message in the contract's cycle for that break is used. A
 * hand-picked approved message is a starting point the rotation may later
 * re-sequence; only an override pins.
 */
export async function placeCreditAction(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const scheduleLineId = field(formData, "schedule_line_id");
  const breakId = field(formData, "break_id");
  const overrideReason = field(formData, "override_reason");
  const path = contractPath(contractId);

  if (breakId === "") failWith(path, "Choose an open break to place into.");
  const copyId =
    (await resolveCopyForBreak(scheduleLineId, breakId, field(formData, "copy_id") || null)) ?? "";
  if (copyId === "")
    failWith(
      path,
      "No linked message is approved, in date, and short enough for that break — choose one, or approve a message on the Copy tab.",
    );

  const result = await placeCredit({
    breakId,
    scheduleLineId,
    copyId,
    overrideReason: overrideReason || undefined,
  });
  if (!result.ok) failWith(path, result.message);
  await rebalanceContractRotation(contractId, profile.id);

  // log_place_underwriting_credit() only actually honors override_reason
  // when the copy needed one — read back whether it was really used rather
  // than trusting "the form had text in it," so this stays accurate to
  // docs/underwriting-design.md §6's "overriding expired/unapproved copy
  // into a placement" as one of the four privileged, audited actions.
  const supabase = await createClient();
  const { data: placement } = await supabase
    .from("uw_scheduled_placements")
    .select("override_reason")
    .eq("id", result.placementId)
    .maybeSingle();
  if (placement?.override_reason) {
    await logAuditEvent({
      actorId: profile.id,
      action: "underwriting.placement.override",
      targetType: "uw_scheduled_placement",
      targetId: result.placementId,
      metadata: { override_reason: placement.override_reason },
    });
  }

  revalidatePath(path);
  redirect(path);
}

export async function clearCreditAction(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const placementId = field(formData, "placement_id");
  const path = contractPath(contractId);

  const result = await clearCredit(placementId);
  if (!result.ok) failWith(path, result.message);
  await rebalanceContractRotation(contractId, profile.id);

  revalidatePath(path);
  redirect(path);
}
