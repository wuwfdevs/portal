"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertUnderwritingAccess } from "@/lib/underwriting/access";
import { failWith } from "@/lib/editorial/action-result";
import { clearCredit, placeCredit } from "@/lib/underwriting/placement";

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
 */
export async function placeCreditAction(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const obligationId = field(formData, "obligation_id");
  const rundownItemId = field(formData, "rundown_item_id");
  const copyId = field(formData, "copy_id");
  const overrideReason = field(formData, "override_reason");
  const path = contractPath(contractId);

  if (rundownItemId === "" || copyId === "") failWith(path, "Choose an open slot and a copy to place.");

  const result = await placeCredit({
    rundownItemId,
    obligationId,
    copyId,
    overrideReason: overrideReason || undefined,
  });
  if (!result.ok) failWith(path, result.message);

  revalidatePath(path);
  redirect(path);
}

export async function clearCreditAction(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const contractId = field(formData, "contract_id");
  const placementId = field(formData, "placement_id");
  const path = contractPath(contractId);

  const result = await clearCredit(placementId);
  if (!result.ok) failWith(path, result.message);

  revalidatePath(path);
  redirect(path);
}
