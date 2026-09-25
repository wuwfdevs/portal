"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertUnderwritingAccess } from "@/lib/underwriting/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";

const POOLS_PATH = "/underwriting/pools";

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function optionalField(formData: FormData, name: string): string | null {
  const value = field(formData, name);
  return value === "" ? null : value;
}

/**
 * Inventory pools are station data (docs/underwriting-traffic-redesign.md
 * §3): the names an insertion order sells by — "AM Drive", "Carpool" — and
 * the Log programs/windows each one actually means. Ordinary traffic-staff
 * work, no manager gate.
 */
export async function createInventoryPool(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();
  const name = field(formData, "name");
  if (name === "") failWith(POOLS_PATH, "Give the pool a name.");

  const supabase = await createClient();
  const { error } = await supabase.from("uw_inventory_pools").insert({
    name,
    description: optionalField(formData, "description"),
    created_by: profile.id,
  });
  failIfError(error, POOLS_PATH, "Could not create the pool");

  revalidatePath(POOLS_PATH);
  redirect(POOLS_PATH);
}

export async function setInventoryPoolActive(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const id = field(formData, "pool_id");
  const active = field(formData, "active") === "true";

  const supabase = await createClient();
  const { error } = await supabase.from("uw_inventory_pools").update({ active }).eq("id", id);
  failIfError(error, POOLS_PATH, "Could not update the pool");

  revalidatePath(POOLS_PATH);
  redirect(POOLS_PATH);
}

/** One more way a pool maps onto Log: an optional program, an optional station-local window, optional days. */
export async function addInventoryPoolTarget(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const poolId = field(formData, "pool_id");
  const programId = optionalField(formData, "program_id");
  const windowStart = optionalField(formData, "window_start");
  const windowEnd = optionalField(formData, "window_end");
  if ((windowStart === null) !== (windowEnd === null))
    failWith(POOLS_PATH, "Give both ends of the window, or neither.");
  if (windowStart !== null && windowEnd !== null && windowEnd <= windowStart) {
    failWith(POOLS_PATH, "The window must end after it starts.");
  }
  const days = formData
    .getAll("days_of_week")
    .map((value) => Number.parseInt(String(value), 10))
    .filter((d) => d >= 0 && d <= 6);

  const supabase = await createClient();
  const { error } = await supabase.from("uw_inventory_pool_targets").insert({
    pool_id: poolId,
    program_id: programId,
    window_start: windowStart,
    window_end: windowEnd,
    days_of_week: days.length === 0 ? null : days,
    notes: optionalField(formData, "notes"),
  });
  failIfError(error, POOLS_PATH, "Could not add the target");

  revalidatePath(POOLS_PATH);
  redirect(POOLS_PATH);
}

export async function removeInventoryPoolTarget(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const id = field(formData, "target_id");

  const supabase = await createClient();
  const { error } = await supabase.from("uw_inventory_pool_targets").delete().eq("id", id);
  failIfError(error, POOLS_PATH, "Could not remove the target");

  revalidatePath(POOLS_PATH);
  redirect(POOLS_PATH);
}
