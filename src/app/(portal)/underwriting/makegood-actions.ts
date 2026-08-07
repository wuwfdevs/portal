"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertUnderwritingAccess } from "@/lib/underwriting/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { logAuditEvent } from "@/lib/audit";
import { clearCredit, placeCredit } from "@/lib/underwriting/placement";

const LIST_PATH = "/underwriting/makegoods";

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function exceptionPath(id: string): string {
  return `/underwriting/exceptions/${id}`;
}

/** Creates a bare makegood record against an exception — no slot yet, see lib/underwriting/makegoods.ts on why that's a valid state. Picking a slot happens on the makegoods list page (Workflow F's own screen), not here. */
export async function createMakegood(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const exceptionId = field(formData, "exception_id");
  const path = exceptionPath(exceptionId);

  const supabase = await createClient();
  const { data: exception } = await supabase
    .from("uw_exceptions")
    .select("obligation_id")
    .eq("id", exceptionId)
    .maybeSingle();
  if (!exception) failWith(path, "That exception no longer exists.");

  const { error } = await supabase.from("uw_makegoods").insert({
    exception_id: exceptionId,
    obligation_id: exception.obligation_id,
    created_by: profile.id,
  });
  failIfError(error, path, "Could not create a makegood record");

  revalidatePath(path);
  revalidatePath(LIST_PATH);
  redirect(path);
}

/**
 * Picks the slot for a makegood already created against an exception — the
 * same eligibility check as any other placement (§3F), via the identical
 * log_place_underwriting_credit() RPC the contract page's "Place a credit"
 * form calls. Unlike that form, this also records scheduled_placement_id/
 * scheduled_for on the makegood row itself, and — same as placeCreditAction
 * — only audits the override when the placement actually needed one.
 */
export async function scheduleMakegoodAction(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const makegoodId = field(formData, "makegood_id");
  const obligationId = field(formData, "obligation_id");
  const rundownItemId = field(formData, "rundown_item_id");
  const copyId = field(formData, "copy_id");
  const overrideReason = field(formData, "override_reason");

  if (rundownItemId === "" || copyId === "") failWith(LIST_PATH, "Choose an open slot and a copy to place.");

  const result = await placeCredit({
    rundownItemId,
    obligationId,
    copyId,
    overrideReason: overrideReason || undefined,
  });
  if (!result.ok) failWith(LIST_PATH, result.message);

  const supabase = await createClient();
  const { data: placement } = await supabase
    .from("uw_scheduled_placements")
    .select("scheduled_at, override_reason")
    .eq("id", result.placementId)
    .maybeSingle();

  const { error } = await supabase
    .from("uw_makegoods")
    .update({ scheduled_placement_id: result.placementId, scheduled_for: placement?.scheduled_at ?? null })
    .eq("id", makegoodId);
  failIfError(error, LIST_PATH, "Placed the credit, but could not record it against this makegood");

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
  redirect(LIST_PATH);
}

/** Cancels a makegood — freeing its slot (if one was chosen) the same way clearing an ordinary placement does. Best-effort on the clear: an already-cleared or missing placement shouldn't block marking the makegood itself cancelled. */
export async function cancelMakegoodAction(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const id = field(formData, "makegood_id");

  const supabase = await createClient();
  const { data: makegood } = await supabase
    .from("uw_makegoods")
    .select("status, scheduled_placement_id")
    .eq("id", id)
    .maybeSingle();
  if (!makegood) failWith(LIST_PATH, "That makegood no longer exists.");
  if (makegood.status !== "scheduled") failWith(LIST_PATH, "Only a scheduled makegood can be cancelled.");

  if (makegood.scheduled_placement_id) {
    await clearCredit(makegood.scheduled_placement_id);
  }

  const { error } = await supabase.from("uw_makegoods").update({ status: "cancelled" }).eq("id", id);
  failIfError(error, LIST_PATH, "Could not cancel this makegood");

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}
