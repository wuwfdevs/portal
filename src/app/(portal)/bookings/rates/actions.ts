"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import {
  assertBookingsAssetWriter,
  assertBookingsExecutive,
  assertBookingsFinance,
} from "@/lib/bookings/access";
import { logRateModelEvent } from "@/lib/bookings/events";
import { writeRateCardSnapshot } from "@/lib/bookings/rate-card-snapshot";
import { POOL_KEYS, isModelInputKey, type PoolKey } from "@/lib/bookings/rates";
import type {
  BkAssetBurden,
  BkAssetCondition,
  BkAssetFunding,
  BkAssumptionKind,
  BkAssumptionOwner,
  BkValidationState,
} from "@/lib/database.types";

import { RATES_PATH, ratesHref } from "@/lib/bookings/paths";

/** A copy of a row without its identity and timestamps, ready to insert under another version. */
function copyOf<T extends Record<string, unknown>>(
  row: T,
  versionId: string,
): Omit<T, "id" | "created_at" | "updated_at"> & { version_id: string } {
  const copy: Record<string, unknown> = { ...row, version_id: versionId };
  delete copy.id;
  delete copy.created_at;
  delete copy.updated_at;
  return copy as Omit<T, "id" | "created_at" | "updated_at"> & { version_id: string };
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function optionalField(formData: FormData, name: string): string | null {
  const value = field(formData, name);
  return value === "" ? null : value;
}

function numberField(formData: FormData, name: string, path: string, label: string): number {
  const raw = field(formData, name).replace(/[$,%\s]/g, "");
  if (raw === "") failWith(path, `${label} is required.`);
  const value = Number(raw);
  if (!Number.isFinite(value)) failWith(path, `${label} must be a number.`);
  return value;
}

function optionalNumberField(
  formData: FormData,
  name: string,
  path: string,
  label: string,
): number | null {
  const raw = field(formData, name).replace(/[$,%\s]/g, "");
  if (raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) failWith(path, `${label} must be a number.`);
  return value;
}

function revalidateRates(): void {
  revalidatePath(RATES_PATH);
  revalidatePath(`${RATES_PATH}/pools`);
  revalidatePath(`${RATES_PATH}/packages`);
  revalidatePath(`${RATES_PATH}/card`);
  revalidatePath(`${RATES_PATH}/changes`);
}

const OWNERS: readonly BkAssumptionOwner[] = ["finance", "director", "executive"];
const VALIDATION_STATES: readonly BkValidationState[] = ["pending", "validated", "accepted_as_is"];

// Versions ------------------------------------------------------------------------

export async function createVersion(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsFinance();
  const path = `${RATES_PATH}/versions/new`;
  const label = field(formData, "label");
  if (!label) failWith(path, "A version needs a label, such as v0.2.");
  const notes = optionalField(formData, "notes");
  const copyFrom = optionalField(formData, "copy_from");

  const supabase = await createClient();
  const { data: version, error } = await supabase
    .from("bk_rate_model_versions")
    .insert({ label, notes, created_by: profile.id })
    .select("id")
    .single();
  failIfError(error, path, "Could not create the version");
  const versionId = version!.id;

  if (copyFrom) {
    const [assumptions, pools, packages] = await Promise.all([
      supabase.from("bk_assumptions").select("*").eq("version_id", copyFrom),
      supabase.from("bk_resource_pools").select("*").eq("version_id", copyFrom),
      supabase.from("bk_service_packages").select("*").eq("version_id", copyFrom),
    ]);
    failIfError(assumptions.error, path, "Could not read the version to copy");
    failIfError(pools.error, path, "Could not read the version to copy");
    failIfError(packages.error, path, "Could not read the version to copy");

    if ((assumptions.data ?? []).length > 0) {
      const { error: copyError } = await supabase
        .from("bk_assumptions")
        .insert((assumptions.data ?? []).map((row) => copyOf(row, versionId)));
      failIfError(copyError, path, "Could not copy the assumptions");
    }
    if ((pools.data ?? []).length > 0) {
      const { error: copyError } = await supabase
        .from("bk_resource_pools")
        .insert((pools.data ?? []).map((row) => copyOf(row, versionId)));
      failIfError(copyError, path, "Could not copy the resource pools");
    }
    if ((packages.data ?? []).length > 0) {
      const { error: copyError } = await supabase
        .from("bk_service_packages")
        .insert((packages.data ?? []).map((row) => copyOf(row, versionId)));
      failIfError(copyError, path, "Could not copy the service packages");
    }
  }

  await logRateModelEvent({
    versionId,
    actorId: profile.id,
    kind: "version_created",
    note: copyFrom ? `Version ${label} created as a copy.` : `Version ${label} created empty.`,
    metadata: { copied_from: copyFrom },
  });
  revalidateRates();
  redirect(ratesHref("assumptions", versionId));
}

export async function submitVersion(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsFinance();
  const versionId = field(formData, "version_id");
  const path = ratesHref("assumptions", versionId);
  const supabase = await createClient();
  const { error } = await supabase
    .from("bk_rate_model_versions")
    .update({ status: "submitted" })
    .eq("id", versionId);
  failIfError(error, path, "Could not submit the version");
  await logRateModelEvent({
    versionId,
    actorId: profile.id,
    kind: "version_submitted",
    note: "Submitted to UWF Budget / Controller for validation.",
  });
  revalidateRates();
  redirect(path);
}

export async function reopenVersion(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsFinance();
  const versionId = field(formData, "version_id");
  const path = ratesHref("assumptions", versionId);
  const supabase = await createClient();
  const { error } = await supabase
    .from("bk_rate_model_versions")
    .update({ status: "draft" })
    .eq("id", versionId);
  failIfError(error, path, "Could not reopen the version");
  await logRateModelEvent({
    versionId,
    actorId: profile.id,
    kind: "version_reopened",
    note: "Reopened as a draft.",
  });
  revalidateRates();
  redirect(path);
}

export async function useVersionForEstimates(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsFinance();
  const versionId = field(formData, "version_id");
  const path = ratesHref("assumptions", versionId);
  const supabase = await createClient();
  const { data: version, error: readError } = await supabase
    .from("bk_rate_model_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle();
  failIfError(readError, path, "Could not read the version");
  if (!version) failWith(path, "That version no longer exists.");

  // Snapshot first: if the rows can't be priced, nothing changes.
  const snapshotError = await writeRateCardSnapshot(version);
  if (snapshotError) failWith(path, snapshotError);

  const { data, error } = await supabase.rpc("bk_set_version_in_use", { p_version_id: versionId });
  failIfError(error, path, "Could not put the version in use");
  if (data && "error" in data) {
    failWith(
      path,
      data.error === "superseded"
        ? "A superseded version can't be put back in use."
        : "Could not put the version in use.",
    );
  }

  await logRateModelEvent({
    versionId,
    actorId: profile.id,
    kind: "version_in_use",
    note: `Version ${version.label} is now in use for estimates${
      version.status === "adopted" ? "" : ", provisionally"
    }.`,
  });
  await logAuditEvent({
    actorId: profile.id,
    action: "bookings.rate_model.in_use",
    targetType: "bk_rate_model_version",
    targetId: versionId,
    metadata: { label: version.label, status: version.status },
  });
  revalidateRates();
  redirect(path);
}

export async function adoptVersion(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsExecutive();
  const versionId = field(formData, "version_id");
  const path = ratesHref("assumptions", versionId);
  const destinationIndex = optionalField(formData, "destination_index");
  const supabase = await createClient();
  const { data: version, error: readError } = await supabase
    .from("bk_rate_model_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle();
  failIfError(readError, path, "Could not read the version");
  if (!version) failWith(path, "That version no longer exists.");
  if (version.status !== "submitted") {
    failWith(path, "Only a submitted version can be adopted.");
  }

  const snapshotError = await writeRateCardSnapshot(version);
  if (snapshotError) failWith(path, snapshotError);

  const { data, error } = await supabase.rpc("bk_adopt_version", {
    p_version_id: versionId,
    p_destination_index: destinationIndex,
  });
  failIfError(error, path, "Could not adopt the version");
  if (data && "error" in data) failWith(path, "Could not adopt the version.");

  await logRateModelEvent({
    versionId,
    actorId: profile.id,
    kind: "version_adopted",
    note: `Version ${version.label} adopted${destinationIndex ? ` · recoveries to ${destinationIndex}` : ""}.`,
    metadata: { destination_index: destinationIndex },
  });
  await logAuditEvent({
    actorId: profile.id,
    action: "bookings.rate_model.adopted",
    targetType: "bk_rate_model_version",
    targetId: versionId,
    metadata: { label: version.label, destination_index: destinationIndex },
  });
  revalidateRates();
  redirect(path);
}

/** Re-record the card for the version in use, when its rows have moved since the last snapshot. */
export async function snapshotRateCard(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsFinance();
  const versionId = field(formData, "version_id");
  const path = ratesHref("card", versionId);
  const supabase = await createClient();
  const { data: version, error: readError } = await supabase
    .from("bk_rate_model_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle();
  failIfError(readError, path, "Could not read the version");
  if (!version) failWith(path, "That version no longer exists.");
  if (!version.in_use) failWith(path, "Only the version in use records a card for estimates.");

  const snapshotError = await writeRateCardSnapshot(version);
  if (snapshotError) failWith(path, snapshotError);
  await logRateModelEvent({
    versionId,
    actorId: profile.id,
    kind: "card_recorded",
    note: `Rate card for ${version.label} recorded for estimates.`,
  });
  revalidateRates();
  redirect(path);
}

// Assumptions ------------------------------------------------------------------------

async function assumptionLabel(id: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("bk_assumptions").select("label").eq("id", id).maybeSingle();
  return data?.label ?? "an assumption";
}

export async function createAssumption(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsFinance();
  const versionId = field(formData, "version_id");
  const path = ratesHref("assumptions", versionId, { new: "1" });
  const kind = field(formData, "kind") as BkAssumptionKind;
  if (!["shared_pool_line", "webcast_pool_line", "model_input"].includes(kind)) {
    failWith(path, "Choose what kind of input this is.");
  }
  const label = field(formData, "label");
  if (!label) failWith(path, "The input needs a name.");
  const value = numberField(formData, "value", path, "Value");
  const unit = field(formData, "unit");
  if (!unit) failWith(path, "The input needs a unit.");
  const owner = field(formData, "owner") as BkAssumptionOwner;
  if (!OWNERS.includes(owner)) failWith(path, "Choose who validates this input.");
  let key: string | null = null;
  if (kind === "model_input") {
    key = field(formData, "key");
    if (!isModelInputKey(key)) failWith(path, "Choose which model input this is.");
  }
  const section = field(formData, "section") === "sourced" ? "sourced" : "working";

  const supabase = await createClient();
  const { error } = await supabase.from("bk_assumptions").insert({
    version_id: versionId,
    section,
    kind,
    key,
    label,
    value,
    unit,
    basis: optionalField(formData, "basis"),
    source_url: optionalField(formData, "source_url"),
    notes: optionalField(formData, "notes"),
    owner,
    validation_needed: optionalField(formData, "validation_needed"),
    sort_order: 1000,
  });
  failIfError(error, path, "Could not add the input");
  await logRateModelEvent({
    versionId,
    actorId: profile.id,
    kind: "assumption_added",
    note: `Added "${label}" (${value} ${unit}).`,
  });
  revalidateRates();
  redirect(ratesHref("assumptions", versionId));
}

export async function updateAssumption(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsFinance();
  const id = field(formData, "id");
  const versionId = field(formData, "version_id");
  const path = ratesHref("assumptions", versionId, { edit: id });
  const label = field(formData, "label");
  if (!label) failWith(path, "The input needs a name.");
  const value = numberField(formData, "value", path, "Value");
  const unit = field(formData, "unit");
  if (!unit) failWith(path, "The input needs a unit.");
  const owner = field(formData, "owner") as BkAssumptionOwner;
  if (!OWNERS.includes(owner)) failWith(path, "Choose who validates this input.");

  const supabase = await createClient();
  const { data: before, error: readError } = await supabase
    .from("bk_assumptions")
    .select("value, unit, validation_state")
    .eq("id", id)
    .maybeSingle();
  failIfError(readError, path, "Could not read the input");
  const valueChanged = !before || Number(before.value) !== value || before.unit !== unit;

  const { error } = await supabase
    .from("bk_assumptions")
    .update({
      label,
      value,
      unit,
      basis: optionalField(formData, "basis"),
      source_url: optionalField(formData, "source_url"),
      notes: optionalField(formData, "notes"),
      owner,
      validation_needed: optionalField(formData, "validation_needed"),
      // A changed value needs validating again; a changed note doesn't.
      ...(valueChanged
        ? { validation_state: "pending" as const, validated_at: null, validated_by: null }
        : {}),
    })
    .eq("id", id);
  failIfError(error, path, "Could not save the input");
  await logRateModelEvent({
    versionId,
    actorId: profile.id,
    kind: "assumption_changed",
    note: valueChanged
      ? `Changed "${label}" from ${before?.value ?? "—"} ${before?.unit ?? ""} to ${value} ${unit}.`
      : `Edited the notes on "${label}".`,
  });
  revalidateRates();
  redirect(ratesHref("assumptions", versionId));
}

export async function deleteAssumption(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsFinance();
  const id = field(formData, "id");
  const versionId = field(formData, "version_id");
  const path = ratesHref("assumptions", versionId);
  const label = await assumptionLabel(id);
  const supabase = await createClient();
  const { error } = await supabase.from("bk_assumptions").delete().eq("id", id);
  failIfError(error, path, "Could not remove the input");
  await logRateModelEvent({
    versionId,
    actorId: profile.id,
    kind: "assumption_removed",
    note: `Removed "${label}".`,
  });
  revalidateRates();
  redirect(path);
}

export async function setAssumptionValidation(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsFinance();
  const id = field(formData, "id");
  const versionId = field(formData, "version_id");
  const path = ratesHref("assumptions", versionId);
  const state = field(formData, "state") as BkValidationState;
  if (!VALIDATION_STATES.includes(state)) failWith(path, "Choose a validation state.");
  const note = optionalField(formData, "note");
  if (state === "accepted_as_is" && !note) {
    failWith(
      ratesHref("assumptions", versionId, { accept: id }),
      "Accepting an input as is needs a note saying why.",
    );
  }
  const label = await assumptionLabel(id);
  const supabase = await createClient();
  const { error } = await supabase
    .from("bk_assumptions")
    .update({
      validation_state: state,
      validation_note: note,
      validated_at: state === "pending" ? null : new Date().toISOString(),
      validated_by: state === "pending" ? null : profile.id,
    })
    .eq("id", id);
  failIfError(error, path, "Could not record the validation");
  await logRateModelEvent({
    versionId,
    actorId: profile.id,
    kind: "assumption_validation",
    note:
      state === "pending"
        ? `"${label}" reopened for validation.`
        : `"${label}" ${state === "validated" ? "validated" : "accepted as is"}${note ? `: ${note}` : "."}`,
  });
  revalidateRates();
  redirect(path);
}

// Resource pools -----------------------------------------------------------------------

export async function updatePool(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsFinance();
  const id = field(formData, "id");
  const versionId = field(formData, "version_id");
  const path = ratesHref("pools", versionId, { edit: id });
  const sharePercent = numberField(formData, "allocation_percent", path, "Allocation");
  if (sharePercent < 0 || sharePercent > 100)
    failWith(path, "Allocation is a percentage from 0 to 100.");
  const units = numberField(formData, "available_units", path, "Available units");
  if (units <= 0) failWith(path, "Available units must be more than zero.");
  const unitLabel = field(formData, "unit_label");
  if (!unitLabel) failWith(path, "The pool needs a unit, such as half-day.");

  const supabase = await createClient();
  const { data: before, error: readError } = await supabase
    .from("bk_resource_pools")
    .select("pool, allocation_share, available_units, unit_label")
    .eq("id", id)
    .maybeSingle();
  failIfError(readError, path, "Could not read the pool");
  const share = sharePercent / 100;
  const changed =
    !before ||
    Number(before.allocation_share) !== share ||
    Number(before.available_units) !== units ||
    before.unit_label !== unitLabel;

  const { error } = await supabase
    .from("bk_resource_pools")
    .update({
      allocation_share: share,
      available_units: units,
      unit_label: unitLabel,
      basis: optionalField(formData, "basis"),
      validation_needed: optionalField(formData, "validation_needed"),
      ...(changed
        ? { validation_state: "pending" as const, validated_at: null, validated_by: null }
        : {}),
    })
    .eq("id", id);
  failIfError(error, path, "Could not save the pool");
  await logRateModelEvent({
    versionId,
    actorId: profile.id,
    kind: "pool_changed",
    note: `${before?.pool ?? "Pool"}: ${sharePercent}% of the shared pool, ${units} ${unitLabel}s a year.`,
  });
  revalidateRates();
  redirect(ratesHref("pools", versionId));
}

export async function setPoolValidation(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsFinance();
  const id = field(formData, "id");
  const versionId = field(formData, "version_id");
  const path = ratesHref("pools", versionId);
  const state = field(formData, "state") as BkValidationState;
  if (!VALIDATION_STATES.includes(state)) failWith(path, "Choose a validation state.");
  const note = optionalField(formData, "note");
  if (state === "accepted_as_is" && !note) {
    failWith(
      ratesHref("pools", versionId, { accept: id }),
      "Accepting a pool as is needs a note saying why.",
    );
  }
  const supabase = await createClient();
  const { data: pool } = await supabase
    .from("bk_resource_pools")
    .select("pool")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase
    .from("bk_resource_pools")
    .update({
      validation_state: state,
      validation_note: note,
      validated_at: state === "pending" ? null : new Date().toISOString(),
      validated_by: state === "pending" ? null : profile.id,
    })
    .eq("id", id);
  failIfError(error, path, "Could not record the validation");
  await logRateModelEvent({
    versionId,
    actorId: profile.id,
    kind: "pool_validation",
    note: `${pool?.pool ?? "Pool"} ${
      state === "pending"
        ? "reopened for validation"
        : state === "validated"
          ? "validated"
          : "accepted as is"
    }${note ? `: ${note}` : "."}`,
  });
  revalidateRates();
  redirect(path);
}

// Service packages ----------------------------------------------------------------------

function readPackageFields(formData: FormData, path: string) {
  const name = field(formData, "name");
  if (!name) failWith(path, "The package needs a name.");
  const unitLabel = field(formData, "unit_label");
  if (!unitLabel) failWith(path, "The package needs a unit, such as event or half-day.");
  const units: Record<PoolKey, number> = { studio: 0, field: 0, live: 0, edit: 0 };
  for (const pool of POOL_KEYS) {
    units[pool] = optionalNumberField(formData, `${pool}_units`, path, `${pool} units`) ?? 0;
  }
  const fields = {
    name,
    unit_label: unitLabel,
    professional_hours:
      optionalNumberField(formData, "professional_hours", path, "Professional hours") ?? 0,
    student_hours: optionalNumberField(formData, "student_hours", path, "Student hours") ?? 0,
    studio_units: units.studio,
    field_units: units.field,
    live_units: units.live,
    edit_hours: units.edit,
    webcast_ops_units:
      optionalNumberField(formData, "webcast_ops_units", path, "Webcast ops units") ?? 0,
    market_floor: optionalNumberField(formData, "market_floor", path, "Market floor") ?? 0,
    historical_reference: optionalField(formData, "historical_reference"),
    application_note: optionalField(formData, "application_note"),
    notes: optionalField(formData, "notes"),
  };
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "number" && value < 0)
      failWith(path, `${key.replace(/_/g, " ")} can't be negative.`);
  }
  return fields;
}

export async function createPackage(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsFinance();
  const versionId = field(formData, "version_id");
  const path = ratesHref("packages", versionId, { new: "1" });
  const fields = readPackageFields(formData, path);
  const supabase = await createClient();
  const { error } = await supabase
    .from("bk_service_packages")
    .insert({ ...fields, version_id: versionId, sort_order: 1000 });
  failIfError(error, path, "Could not add the package");
  await logRateModelEvent({
    versionId,
    actorId: profile.id,
    kind: "package_added",
    note: `Added package "${fields.name}" (${fields.unit_label}).`,
  });
  revalidateRates();
  redirect(ratesHref("packages", versionId));
}

export async function updatePackage(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsFinance();
  const id = field(formData, "id");
  const versionId = field(formData, "version_id");
  const path = ratesHref("packages", versionId, { edit: id });
  const fields = readPackageFields(formData, path);
  const supabase = await createClient();
  const { error } = await supabase.from("bk_service_packages").update(fields).eq("id", id);
  failIfError(error, path, "Could not save the package");
  await logRateModelEvent({
    versionId,
    actorId: profile.id,
    kind: "package_changed",
    note: `Edited package "${fields.name}" (${fields.unit_label}).`,
  });
  revalidateRates();
  redirect(ratesHref("packages", versionId));
}

export async function setPackageActive(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsFinance();
  const id = field(formData, "id");
  const versionId = field(formData, "version_id");
  const active = field(formData, "active") === "true";
  const path = ratesHref("packages", versionId);
  const supabase = await createClient();
  const { data: pkg } = await supabase
    .from("bk_service_packages")
    .select("name, unit_label")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.from("bk_service_packages").update({ active }).eq("id", id);
  failIfError(
    error,
    path,
    active ? "Could not restore the package" : "Could not retire the package",
  );
  await logRateModelEvent({
    versionId,
    actorId: profile.id,
    kind: active ? "package_restored" : "package_retired",
    note: `${active ? "Restored" : "Retired"} package "${pkg?.name ?? ""}" (${pkg?.unit_label ?? ""}).`,
  });
  revalidateRates();
  redirect(path);
}

// Assets ----------------------------------------------------------------------------------

const FUNDINGS: readonly BkAssetFunding[] = [
  "station",
  "foundation_gift",
  "grant_restricted",
  "uwf",
];
const BURDENS: readonly BkAssetBurden[] = ["low", "medium", "high"];
const CONDITIONS: readonly BkAssetCondition[] = ["good", "fair", "worn", "out_of_service"];

function readAssetFields(formData: FormData, path: string) {
  const name = field(formData, "name");
  if (!name) failWith(path, "The asset needs a name.");
  const pool = field(formData, "pool") as PoolKey;
  if (!POOL_KEYS.includes(pool)) failWith(path, "Choose the pool the asset belongs to.");
  const funding = field(formData, "funding") as BkAssetFunding;
  if (!FUNDINGS.includes(funding)) failWith(path, "Choose the funding source.");
  const burden = field(formData, "maintenance_burden") as BkAssetBurden;
  if (!BURDENS.includes(burden)) failWith(path, "Choose the maintenance burden.");
  const condition = field(formData, "condition") as BkAssetCondition;
  if (!CONDITIONS.includes(condition)) failWith(path, "Choose the condition.");
  const acquiredOn = optionalField(formData, "acquired_on");
  if (acquiredOn && !/^\d{4}-\d{2}-\d{2}$/.test(acquiredOn))
    failWith(path, "Acquired on must be a date.");
  return {
    name,
    tag: optionalField(formData, "tag"),
    pool,
    acquired_on: acquiredOn,
    acquisition_cost: optionalNumberField(formData, "acquisition_cost", path, "Acquisition cost"),
    annual_cost: optionalNumberField(formData, "annual_cost", path, "Annual cost"),
    funding,
    useful_life_years: optionalNumberField(formData, "useful_life_years", path, "Useful life"),
    restrictions: optionalField(formData, "restrictions"),
    maintenance_burden: burden,
    condition,
    notes: optionalField(formData, "notes"),
    active: condition !== "out_of_service",
  };
}

export async function createAsset(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsAssetWriter();
  const path = `${RATES_PATH}/assets/new`;
  const fields = readAssetFields(formData, path);
  const supabase = await createClient();
  const { error } = await supabase.from("bk_assets").insert({ ...fields, created_by: profile.id });
  failIfError(error, path, "Could not add the asset");
  await logRateModelEvent({
    versionId: null,
    actorId: profile.id,
    kind: "asset_added",
    note: `Added asset "${fields.name}" to the ${fields.pool} pool.`,
  });
  revalidatePath(`${RATES_PATH}/assets`);
  redirect(`${RATES_PATH}/assets`);
}

export async function updateAsset(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsAssetWriter();
  const id = field(formData, "id");
  const path = `${RATES_PATH}/assets/${id}/edit`;
  const fields = readAssetFields(formData, path);
  const supabase = await createClient();
  const { error } = await supabase.from("bk_assets").update(fields).eq("id", id);
  failIfError(error, path, "Could not save the asset");
  await logRateModelEvent({
    versionId: null,
    actorId: profile.id,
    kind: "asset_changed",
    note: `Edited asset "${fields.name}".`,
  });
  revalidatePath(`${RATES_PATH}/assets`);
  redirect(`${RATES_PATH}/assets`);
}
