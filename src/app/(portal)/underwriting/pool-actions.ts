"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertUnderwritingAccess } from "@/lib/underwriting/access";
import { collectTargetRows, parseTarget } from "@/lib/underwriting/pool-targets";
import { deleteOrFail, failIfError, failWith } from "@/lib/editorial/action-result";
import { field, optionalField } from "@/lib/form-fields";

const POOLS_PATH = "/underwriting/setup/pools";
/** The list with the inline "New pool" card open — where a create failure lands so its message renders inside the card. */
const NEW_POOL_PATH = `${POOLS_PATH}?new=1`;

/** Postgres unique_violation — the case-insensitive name index (20260927120000). */
const UNIQUE_VIOLATION = "23505";

/**
 * Inventory pools are station data (docs/underwriting-traffic-redesign.md
 * §3): the names an insertion order sells by — "AM Drive", "Carpool" — and
 * the Log programs/windows each one actually means. Ordinary traffic-staff
 * work, no manager gate. The pool and the targets entered with it are
 * written by one RPC (uw_create_inventory_pool), so a target that fails
 * never leaves a half-made pool behind.
 */
export async function createInventoryPool(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const name = field(formData, "name");
  if (name === "") failWith(`${NEW_POOL_PATH}&field=name`, "Give the pool a name.");

  const rows = collectTargetRows(formData);
  if (!rows.ok) failWith(`${NEW_POOL_PATH}&field=targets`, rows.message);

  const supabase = await createClient();
  const { error } = await supabase.rpc("uw_create_inventory_pool", {
    p_name: name,
    p_description: optionalField(formData, "description"),
    p_targets: rows.targets,
  });
  if (error?.code === UNIQUE_VIOLATION) {
    failWith(`${NEW_POOL_PATH}&field=name`, "A pool with this name already exists.");
  }
  failIfError(error, NEW_POOL_PATH, "Could not create the pool");

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

/** One more way an existing pool maps onto Log: an optional program, an optional station-local window, optional days. */
export async function addInventoryPoolTarget(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const poolId = field(formData, "pool_id");
  const parsed = parseTarget(formData, "");
  if (parsed.kind === "error") failWith(POOLS_PATH, parsed.message);
  // A deliberately blank target on an existing pool is the all-null "any
  // marked opportunity, any program" mapping (Total Program Rotation) — only
  // the create card's untouched starter row is skipped, not this.
  const target =
    parsed.kind === "blank"
      ? { program_id: null, window_start: null, window_end: null, days_of_week: null, notes: null }
      : parsed.target;

  const supabase = await createClient();
  const { error } = await supabase
    .from("uw_inventory_pool_targets")
    .insert({ pool_id: poolId, ...target });
  failIfError(error, POOLS_PATH, "Could not add the target");

  revalidatePath(POOLS_PATH);
  redirect(POOLS_PATH);
}

export async function removeInventoryPoolTarget(formData: FormData): Promise<void> {
  await assertUnderwritingAccess();
  const id = field(formData, "target_id");

  const supabase = await createClient();
  await deleteOrFail(
    supabase.from("uw_inventory_pool_targets").delete().eq("id", id).select("id"),
    POOLS_PATH,
    "Could not remove the target",
  );

  revalidatePath(POOLS_PATH);
  redirect(POOLS_PATH);
}
