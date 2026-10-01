"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertUnderwritingAccess } from "@/lib/underwriting/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { logAuditEvent } from "@/lib/audit";
import { clearCredit, placeCredit } from "@/lib/underwriting/placement";
import {
  rebalanceContractRotation,
  resolveCopyForBreak,
} from "@/lib/underwriting/rotation-rebalance";
import { getScheduleLine } from "@/lib/underwriting/queries";

const LIST_PATH = "/underwriting/exceptions";

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function exceptionPath(id: string): string {
  return `/underwriting/exceptions/${id}`;
}

/**
 * Creates a bare makegood record against an exception — no slot yet, see
 * lib/underwriting/makegoods.ts on why that's a valid state. It carries the
 * missed placement's demand bucket, so the replacement airing is
 * attributed to the bucket the order missed rather than counted as a new
 * unit (docs/underwriting-traffic-redesign.md §3). Picking a break happens
 * through auto-fill or the exception page's own picker, not here.
 */
export async function createMakegood(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const exceptionId = field(formData, "exception_id");
  const path = exceptionPath(exceptionId);

  const supabase = await createClient();
  const { data: exception } = await supabase
    .from("uw_exceptions")
    .select("schedule_line_id, scheduled_placement_id")
    .eq("id", exceptionId)
    .maybeSingle();
  if (!exception) failWith(path, "That exception no longer exists.");

  const { data: placement } = exception.scheduled_placement_id
    ? await supabase
        .from("uw_scheduled_placements")
        .select("demand_bucket_id")
        .eq("id", exception.scheduled_placement_id)
        .maybeSingle()
    : { data: null };

  const { error } = await supabase.from("uw_makegoods").insert({
    exception_id: exceptionId,
    schedule_line_id: exception.schedule_line_id,
    demand_bucket_id: placement?.demand_bucket_id ?? null,
    created_by: profile.id,
  });
  failIfError(error, path, "Could not create a makegood record");

  // Creating a makegood is the decision; record it unless one already is.
  const { error: decisionError } = await supabase
    .from("uw_exceptions")
    .update({ resolution_action: "schedule_makegood" })
    .eq("id", exceptionId)
    .is("resolution_action", null);
  failIfError(decisionError, path, "Could not record the decision");

  revalidatePath(path);
  revalidatePath(LIST_PATH);
  redirect(path);
}

/**
 * Picks the slot for a makegood already created against an exception — the
 * same eligibility check as any other placement (§3F), via the identical
 * log_place_underwriting_credit() RPC the contract page's "Place a credit"
 * form calls, which links the makegood in the same transaction and refuses
 * one still waiting on agency approval. Same as placeCreditAction, only
 * audits the override when the placement actually needed one.
 */
export async function scheduleMakegoodAction(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const makegoodId = field(formData, "makegood_id");
  const path = exceptionPath(field(formData, "exception_id"));
  const scheduleLineId = field(formData, "schedule_line_id");
  const breakId = field(formData, "break_id");
  const overrideReason = field(formData, "override_reason");

  if (breakId === "") failWith(path, "Choose an open break to place into.");
  // Rotation decides the message unless the form named one — same rule as
  // placeCreditAction.
  const copyId =
    (await resolveCopyForBreak(scheduleLineId, breakId, field(formData, "copy_id") || null)) ?? "";
  if (copyId === "")
    failWith(
      path,
      "No linked message is approved, in date, and short enough for that break — choose one, or approve a message on the contract's Copy tab.",
    );

  const result = await placeCredit({
    breakId,
    scheduleLineId,
    copyId,
    overrideReason: overrideReason || undefined,
    makegoodId,
  });
  if (!result.ok) failWith(path, result.message);
  const line = await getScheduleLine(scheduleLineId);
  if (line) await rebalanceContractRotation(line.contract_id, profile.id);

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
      metadata: { override_reason: placement.override_reason, makegood_id: makegoodId },
    });
  }

  revalidatePath(LIST_PATH);
  revalidatePath(path);
  redirect(path);
}

/** Cancels a makegood — freeing its slot (if one was chosen) the same way clearing an ordinary placement does. Best-effort on the clear: an already-cleared or missing placement shouldn't block marking the makegood itself cancelled. */
export async function cancelMakegoodAction(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const id = field(formData, "makegood_id");
  const path = exceptionPath(field(formData, "exception_id"));

  const supabase = await createClient();
  const { data: makegood } = await supabase
    .from("uw_makegoods")
    .select("status, scheduled_placement_id")
    .eq("id", id)
    .maybeSingle();
  if (!makegood) failWith(path, "That makegood no longer exists.");
  if (makegood.status !== "scheduled")
    failWith(path, "Only a scheduled makegood can be cancelled.");

  if (makegood.scheduled_placement_id) {
    await clearCredit(makegood.scheduled_placement_id);
  }

  const { error } = await supabase
    .from("uw_makegoods")
    .update({ status: "cancelled" })
    .eq("id", id);
  failIfError(error, path, "Could not cancel this makegood");

  revalidatePath(LIST_PATH);
  revalidatePath(path);
  redirect(path);
}
