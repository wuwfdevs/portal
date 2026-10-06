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
import { isModelInputKey } from "@/lib/bookings/rates";
import { parseWindowLines } from "@/lib/bookings/scheduling";
import type {
  BkAssetBurden,
  BkAssetCondition,
  BkAssetFunding,
  BkAssumptionKind,
  BkAssumptionOwner,
  BkPayBasis,
  BkPoolCosting,
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidField(formData: FormData, name: string, path: string, label: string): string {
  const value = field(formData, name);
  if (!UUID.test(value)) failWith(path, `Choose ${label}.`);
  return value;
}

function revalidateRates(): void {
  revalidatePath(RATES_PATH);
  revalidatePath(`${RATES_PATH}/labor`);
  revalidatePath(`${RATES_PATH}/pools`);
  revalidatePath(`${RATES_PATH}/packages`);
  revalidatePath(`${RATES_PATH}/card`);
  revalidatePath(`${RATES_PATH}/setup`);
  revalidatePath(`${RATES_PATH}/changes`);
}

const OWNERS: readonly BkAssumptionOwner[] = ["finance", "director", "executive"];
const VALIDATION_STATES: readonly BkValidationState[] = ["pending", "validated", "accepted_as_is"];

/** The validation fields a change of value resets. */
function resetValidation(changed: boolean) {
  return changed
    ? { validation_state: "pending" as const, validated_at: null, validated_by: null }
    : {};
}

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
    const [assumptions, laborRates, pools, packages] = await Promise.all([
      supabase.from("bk_assumptions").select("*").eq("version_id", copyFrom),
      supabase.from("bk_labor_rates").select("*").eq("version_id", copyFrom),
      supabase.from("bk_resource_pools").select("*").eq("version_id", copyFrom),
      supabase.from("bk_service_packages").select("*").eq("version_id", copyFrom),
    ]);
    for (const read of [assumptions, laborRates, pools, packages]) {
      failIfError(read.error, path, "Could not read the version to copy");
    }
    if ((assumptions.data ?? []).length > 0) {
      const { error: copyError } = await supabase
        .from("bk_assumptions")
        .insert((assumptions.data ?? []).map((row) => copyOf(row, versionId)));
      failIfError(copyError, path, "Could not copy the assumptions");
    }
    if ((laborRates.data ?? []).length > 0) {
      const { error: copyError } = await supabase
        .from("bk_labor_rates")
        .insert((laborRates.data ?? []).map((row) => copyOf(row, versionId)));
      failIfError(copyError, path, "Could not copy the labor figures");
    }
    if ((pools.data ?? []).length > 0) {
      const { error: copyError } = await supabase
        .from("bk_resource_pools")
        .insert((pools.data ?? []).map((row) => copyOf(row, versionId)));
      failIfError(copyError, path, "Could not copy the resource pools");
    }
    const packageIds = (packages.data ?? []).map((pkg) => pkg.id);
    if (packageIds.length > 0) {
      const [labor, resources] = await Promise.all([
        supabase.from("bk_package_labor").select("*").in("package_id", packageIds),
        supabase.from("bk_package_resources").select("*").in("package_id", packageIds),
      ]);
      failIfError(labor.error, path, "Could not read the packages to copy");
      failIfError(resources.error, path, "Could not read the packages to copy");
      for (const pkg of packages.data ?? []) {
        const { data, error: saveError } = await supabase.rpc("bk_save_package", {
          p_package: { ...copyOf(pkg, versionId), id: "" },
          p_labor: (labor.data ?? [])
            .filter((row) => row.package_id === pkg.id)
            .map((row) => ({ labor_class_id: row.labor_class_id, hours: row.hours })),
          p_resources: (resources.data ?? [])
            .filter((row) => row.package_id === pkg.id)
            .map((row) => ({ pool_id: row.pool_id, units: row.units })),
        });
        failIfError(saveError, path, "Could not copy the service packages");
        if (data && "error" in data) failWith(path, "Could not copy the service packages.");
      }
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
  const destination = optionalField(formData, "destination_index");
  const supabase = await createClient();
  const { data: version, error: readError } = await supabase
    .from("bk_rate_model_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle();
  failIfError(readError, path, "Could not read the version");
  if (!version) failWith(path, "That version no longer exists.");

  const snapshotError = await writeRateCardSnapshot(version);
  if (snapshotError) failWith(path, snapshotError);

  const { data, error } = await supabase.rpc("bk_adopt_version", {
    p_version_id: versionId,
    p_destination_index: destination,
  });
  failIfError(error, path, "Could not adopt the version");
  if (data && "error" in data) {
    failWith(
      path,
      data.error === "not_submitted"
        ? "Only a submitted version can be adopted."
        : "Could not adopt the version.",
    );
  }
  await logRateModelEvent({
    versionId,
    actorId: profile.id,
    kind: "version_adopted",
    note: `Version ${version.label} adopted${destination ? ` · recoveries to ${destination}` : ""}.`,
  });
  await logAuditEvent({
    actorId: profile.id,
    action: "bookings.rate_model.adopted",
    targetType: "bk_rate_model_version",
    targetId: versionId,
    metadata: { label: version.label, destination_index: destination },
  });
  revalidateRates();
  redirect(path);
}

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

// Assumptions ---------------------------------------------------------------------------

async function assumptionLabel(id: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("bk_assumptions").select("label").eq("id", id).maybeSingle();
  return data?.label ?? "an assumption";
}

/** A line's home: "" is the shared pool, else an own-lines pool's id. */
function poolLineTarget(formData: FormData, path: string): string | null {
  const value = field(formData, "pool_id");
  if (value === "" || value === "shared") return null;
  if (!UUID.test(value)) failWith(path, "Choose which pool the line belongs to.");
  return value;
}

export async function createAssumption(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsFinance();
  const versionId = field(formData, "version_id");
  const path = ratesHref("assumptions", versionId, { new: "1" });
  const kind = field(formData, "kind") as BkAssumptionKind;
  if (!["pool_line", "model_input"].includes(kind)) {
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
  let poolId: string | null = null;
  if (kind === "model_input") {
    key = field(formData, "key");
    if (!isModelInputKey(key)) failWith(path, "Choose which model input this is.");
  } else {
    poolId = poolLineTarget(formData, path);
  }
  const section = field(formData, "section") === "sourced" ? "sourced" : "working";

  const supabase = await createClient();
  const { error } = await supabase.from("bk_assumptions").insert({
    version_id: versionId,
    section,
    kind,
    key,
    pool_id: poolId,
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
      ...resetValidation(valueChanged),
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

/** One validation action for assumptions, labor figures and pool figures, told apart by `table`. */
async function setValidation(
  formData: FormData,
  table: "bk_assumptions" | "bk_labor_rates" | "bk_resource_pools",
  section: "assumptions" | "labor" | "pools",
  describe: (id: string) => Promise<string>,
): Promise<void> {
  const { profile } = await assertBookingsFinance();
  const id = field(formData, "id");
  const versionId = field(formData, "version_id");
  const path = ratesHref(section, versionId);
  const state = field(formData, "state") as BkValidationState;
  if (!VALIDATION_STATES.includes(state)) failWith(path, "Choose a validation state.");
  const note = optionalField(formData, "note");
  if (state === "accepted_as_is" && !note) {
    failWith(
      ratesHref(section, versionId, { accept: id }),
      "Accepting an input as is needs a note saying why.",
    );
  }
  const label = await describe(id);
  const supabase = await createClient();
  const { error } = await supabase
    .from(table)
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
    kind: `${section}_validation`,
    note:
      state === "pending"
        ? `"${label}" reopened for validation.`
        : `"${label}" ${state === "validated" ? "validated" : "accepted as is"}${note ? `: ${note}` : "."}`,
  });
  revalidateRates();
  redirect(path);
}

export async function setAssumptionValidation(formData: FormData): Promise<void> {
  await setValidation(formData, "bk_assumptions", "assumptions", assumptionLabel);
}

// Labor figures ---------------------------------------------------------------------------

async function laborRateLabel(id: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bk_labor_rates")
    .select("labor_class_id")
    .eq("id", id)
    .maybeSingle();
  if (!data) return "a labor class";
  const { data: cls } = await supabase
    .from("bk_labor_classes")
    .select("name")
    .eq("id", data.labor_class_id)
    .maybeSingle();
  return cls?.name ?? "a labor class";
}

/** Create or update a class's figures on a version (`?edit=<classId>`). */
export async function saveLaborRate(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsFinance();
  const versionId = field(formData, "version_id");
  const classId = uuidField(
    formData,
    "labor_class_id",
    ratesHref("labor", versionId),
    "a labor class",
  );
  const path = ratesHref("labor", versionId, { edit: classId });
  const supabase = await createClient();
  const { data: cls, error: classError } = await supabase
    .from("bk_labor_classes")
    .select("name, pay_basis")
    .eq("id", classId)
    .maybeSingle();
  failIfError(classError, path, "Could not read the labor class");
  if (!cls) failWith(path, "That labor class no longer exists.");

  const loadPercent = numberField(formData, "load_percent", path, "The load");
  if (loadPercent < 0) failWith(path, "The load can't be negative.");
  const externalRate = numberField(formData, "external_rate", path, "The external planning rate");
  if (externalRate < 0) failWith(path, "The external rate can't be negative.");
  let annualSalary: number | null = null;
  let paidHours: number | null = null;
  let hourlyWage: number | null = null;
  if (cls.pay_basis === "salaried") {
    annualSalary = numberField(formData, "annual_salary", path, "The annual salary");
    paidHours = numberField(formData, "paid_hours", path, "Annual paid hours");
    if (annualSalary < 0) failWith(path, "The salary can't be negative.");
    if (paidHours <= 0) failWith(path, "Paid hours must be more than zero.");
  } else {
    hourlyWage = numberField(formData, "hourly_wage", path, "The hourly wage");
    if (hourlyWage < 0) failWith(path, "The wage can't be negative.");
  }
  const values = {
    annual_salary: annualSalary,
    hourly_wage: hourlyWage,
    load_share: loadPercent / 100,
    paid_hours: paidHours,
    external_rate: externalRate,
    basis: optionalField(formData, "basis"),
    validation_needed: optionalField(formData, "validation_needed"),
  };

  const { data: before, error: readError } = await supabase
    .from("bk_labor_rates")
    .select("id, annual_salary, hourly_wage, load_share, paid_hours, external_rate")
    .eq("version_id", versionId)
    .eq("labor_class_id", classId)
    .maybeSingle();
  failIfError(readError, path, "Could not read the labor figures");
  const changed =
    !before ||
    Number(before.annual_salary ?? -1) !== (annualSalary ?? -1) ||
    Number(before.hourly_wage ?? -1) !== (hourlyWage ?? -1) ||
    Number(before.load_share) !== values.load_share ||
    Number(before.paid_hours ?? -1) !== (paidHours ?? -1) ||
    Number(before.external_rate) !== externalRate;

  const { error } = before
    ? await supabase
        .from("bk_labor_rates")
        .update({ ...values, ...resetValidation(changed) })
        .eq("id", before.id)
    : await supabase
        .from("bk_labor_rates")
        .insert({ ...values, version_id: versionId, labor_class_id: classId });
  failIfError(error, path, "Could not save the labor figures");
  await logRateModelEvent({
    versionId,
    actorId: profile.id,
    kind: "labor_changed",
    note:
      cls.pay_basis === "salaried"
        ? `${cls.name}: $${annualSalary} salary, ${loadPercent}% load, ${paidHours} paid hours, $${externalRate}/hr external.`
        : `${cls.name}: $${hourlyWage}/hr wage, ${loadPercent}% load, $${externalRate}/hr external.`,
  });
  revalidateRates();
  redirect(ratesHref("labor", versionId));
}

export async function setLaborRateValidation(formData: FormData): Promise<void> {
  await setValidation(formData, "bk_labor_rates", "labor", laborRateLabel);
}

// Resource pool figures -------------------------------------------------------------------

async function poolRowLabel(id: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bk_resource_pools")
    .select("pool_id")
    .eq("id", id)
    .maybeSingle();
  if (!data) return "a pool";
  const { data: pool } = await supabase
    .from("bk_pools")
    .select("name")
    .eq("id", data.pool_id)
    .maybeSingle();
  return pool?.name ?? "a pool";
}

/** Create or update a pool's figures on a version (`?edit=<poolId>`). */
export async function savePoolFigures(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsFinance();
  const versionId = field(formData, "version_id");
  const poolId = uuidField(formData, "pool_id", ratesHref("pools", versionId), "a pool");
  const path = ratesHref("pools", versionId, { edit: poolId });
  const supabase = await createClient();
  const { data: pool, error: poolError } = await supabase
    .from("bk_pools")
    .select("name, costing, unit_label")
    .eq("id", poolId)
    .maybeSingle();
  failIfError(poolError, path, "Could not read the pool");
  if (!pool) failWith(path, "That pool no longer exists.");

  let share: number | null = null;
  if (pool.costing === "allocated") {
    const sharePercent = numberField(formData, "allocation_percent", path, "Allocation");
    if (sharePercent < 0 || sharePercent > 100) {
      failWith(path, "Allocation is a percentage from 0 to 100.");
    }
    share = sharePercent / 100;
  }
  const units = numberField(formData, "available_units", path, "Available units");
  if (units <= 0) failWith(path, "Available units must be more than zero.");
  const values = {
    allocation_share: share,
    available_units: units,
    basis: optionalField(formData, "basis"),
    validation_needed: optionalField(formData, "validation_needed"),
  };

  const { data: before, error: readError } = await supabase
    .from("bk_resource_pools")
    .select("id, allocation_share, available_units")
    .eq("version_id", versionId)
    .eq("pool_id", poolId)
    .maybeSingle();
  failIfError(readError, path, "Could not read the pool figures");
  const changed =
    !before ||
    Number(before.allocation_share ?? -1) !== (share ?? -1) ||
    Number(before.available_units) !== units;

  const { error } = before
    ? await supabase
        .from("bk_resource_pools")
        .update({ ...values, ...resetValidation(changed) })
        .eq("id", before.id)
    : await supabase
        .from("bk_resource_pools")
        .insert({ ...values, version_id: versionId, pool_id: poolId });
  failIfError(error, path, "Could not save the pool figures");
  await logRateModelEvent({
    versionId,
    actorId: profile.id,
    kind: "pool_changed",
    note: `${pool.name}: ${share === null ? "own budget lines" : `${share * 100}% of the shared pool`}, ${units} ${pool.unit_label}s a year.`,
  });
  revalidateRates();
  redirect(ratesHref("pools", versionId));
}

export async function setPoolValidation(formData: FormData): Promise<void> {
  await setValidation(formData, "bk_resource_pools", "pools", poolRowLabel);
}

// Service packages ----------------------------------------------------------------------

/** The package form: fixed fields plus `labor_<classId>` hours and `pool_<poolId>` units. */
function readPackageForm(formData: FormData, path: string) {
  const name = field(formData, "name");
  if (!name) failWith(path, "The package needs a name.");
  const unitLabel = field(formData, "unit_label");
  if (!unitLabel) failWith(path, "The package needs a unit, such as event or half-day.");
  const marketFloor = optionalNumberField(formData, "market_floor", path, "Market floor") ?? 0;
  if (marketFloor < 0) failWith(path, "The market floor can't be negative.");
  const labor: { labor_class_id: string; hours: number }[] = [];
  const resources: { pool_id: string; units: number }[] = [];
  for (const key of formData.keys()) {
    if (key.startsWith("labor_")) {
      const id = key.slice("labor_".length);
      if (!UUID.test(id)) continue;
      const hours = optionalNumberField(formData, key, path, "Hours") ?? 0;
      if (hours < 0) failWith(path, "Hours can't be negative.");
      labor.push({ labor_class_id: id, hours });
    } else if (key.startsWith("pool_")) {
      const id = key.slice("pool_".length);
      if (!UUID.test(id)) continue;
      const units = optionalNumberField(formData, key, path, "Units") ?? 0;
      if (units < 0) failWith(path, "Units can't be negative.");
      resources.push({ pool_id: id, units });
    }
  }
  return {
    pkg: {
      name,
      unit_label: unitLabel,
      market_floor: marketFloor,
      historical_reference: optionalField(formData, "historical_reference"),
      application_note: optionalField(formData, "application_note"),
      notes: optionalField(formData, "notes"),
    },
    labor,
    resources,
  };
}

export async function createPackage(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsFinance();
  const versionId = field(formData, "version_id");
  const path = ratesHref("packages", versionId, { new: "1" });
  const { pkg, labor, resources } = readPackageForm(formData, path);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bk_save_package", {
    p_package: { ...pkg, version_id: versionId, sort_order: 1000 },
    p_labor: labor,
    p_resources: resources,
  });
  failIfError(error, path, "Could not add the package");
  if (data && "error" in data) failWith(path, "Could not add the package.");
  await logRateModelEvent({
    versionId,
    actorId: profile.id,
    kind: "package_added",
    note: `Added package "${pkg.name}" (${pkg.unit_label}).`,
  });
  revalidateRates();
  redirect(ratesHref("packages", versionId));
}

export async function updatePackage(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsFinance();
  const id = field(formData, "id");
  const versionId = field(formData, "version_id");
  const path = ratesHref("packages", versionId, { edit: id });
  const { pkg, labor, resources } = readPackageForm(formData, path);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bk_save_package", {
    p_package: { ...pkg, id, version_id: versionId },
    p_labor: labor,
    p_resources: resources,
  });
  failIfError(error, path, "Could not save the package");
  if (data && "error" in data) failWith(path, "That package no longer exists.");
  await logRateModelEvent({
    versionId,
    actorId: profile.id,
    kind: "package_changed",
    note: `Edited package "${pkg.name}" (${pkg.unit_label}).`,
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

// Setup: the labor class and pool catalogs -----------------------------------------------
// Finance or the director keeps them (the same pair that keeps assets).

const KEY_SHAPE = /^[a-z][a-z0-9_]*$/;

function keyFrom(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "k$1");
}

export async function createLaborClass(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsAssetWriter();
  const path = `${RATES_PATH}/setup?new=class`;
  const name = field(formData, "name");
  if (!name) failWith(path, "The labor class needs a name.");
  const payBasis = field(formData, "pay_basis") as BkPayBasis;
  if (!["salaried", "hourly"].includes(payBasis)) failWith(path, "Choose how the class is paid.");
  const key = keyFrom(name);
  if (!KEY_SHAPE.test(key)) failWith(path, "The name needs at least one letter.");
  const supabase = await createClient();
  const { error } = await supabase.from("bk_labor_classes").insert({
    key,
    name,
    pay_basis: payBasis,
    charged_in_strategic: field(formData, "charged_in_strategic") === "on",
    sort_order: 1000,
  });
  if (error?.code === "23505") failWith(path, "A labor class with that name already exists.");
  failIfError(error, path, "Could not add the labor class");
  await logRateModelEvent({
    versionId: null,
    actorId: profile.id,
    kind: "labor_class_added",
    note: `Added labor class "${name}" (${payBasis}). Each version needs its pay figures.`,
  });
  revalidateRates();
  redirect(`${RATES_PATH}/setup`);
}

export async function updateLaborClass(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsAssetWriter();
  const id = field(formData, "id");
  const path = `${RATES_PATH}/setup?edit_class=${id}`;
  const name = field(formData, "name");
  if (!name) failWith(path, "The labor class needs a name.");
  const payBasis = field(formData, "pay_basis") as BkPayBasis;
  if (!["salaried", "hourly"].includes(payBasis)) failWith(path, "Choose how the class is paid.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("bk_labor_classes")
    .update({
      name,
      pay_basis: payBasis,
      charged_in_strategic: field(formData, "charged_in_strategic") === "on",
      active: field(formData, "active") === "on",
    })
    .eq("id", id);
  failIfError(error, path, "Could not save the labor class");
  await logRateModelEvent({
    versionId: null,
    actorId: profile.id,
    kind: "labor_class_changed",
    note: `Edited labor class "${name}".`,
  });
  revalidateRates();
  redirect(`${RATES_PATH}/setup`);
}

export async function createPool(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsAssetWriter();
  const path = `${RATES_PATH}/setup?new=pool`;
  const name = field(formData, "name");
  if (!name) failWith(path, "The pool needs a name.");
  const unitLabel = field(formData, "unit_label");
  if (!unitLabel) failWith(path, "The pool needs a unit (half-day, day, hour, event).");
  const costing = field(formData, "costing") as BkPoolCosting;
  if (!["allocated", "own_lines"].includes(costing))
    failWith(path, "Choose how the pool is costed.");
  const windows = parseWindowLines(field(formData, "windows"));
  if (!windows.ok) failWith(path, windows.error);
  const key = keyFrom(name);
  if (!KEY_SHAPE.test(key)) failWith(path, "The name needs at least one letter.");
  const supabase = await createClient();
  const { error } = await supabase.from("bk_pools").insert({
    key,
    name,
    unit_label: unitLabel,
    costing,
    default_windows: windows.windows,
    sort_order: 1000,
  });
  if (error?.code === "23505") failWith(path, "A pool with that name already exists.");
  failIfError(error, path, "Could not add the pool");
  await logRateModelEvent({
    versionId: null,
    actorId: profile.id,
    kind: "pool_added",
    note: `Added pool "${name}" (${unitLabel}s, ${costing === "allocated" ? "a share of the shared pool" : "its own budget lines"}). Each version needs its figures.`,
  });
  revalidateRates();
  redirect(`${RATES_PATH}/setup`);
}

export async function updatePoolCatalog(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsAssetWriter();
  const id = field(formData, "id");
  const path = `${RATES_PATH}/setup?edit_pool=${id}`;
  const name = field(formData, "name");
  if (!name) failWith(path, "The pool needs a name.");
  const unitLabel = field(formData, "unit_label");
  if (!unitLabel) failWith(path, "The pool needs a unit (half-day, day, hour, event).");
  const costing = field(formData, "costing") as BkPoolCosting;
  if (!["allocated", "own_lines"].includes(costing))
    failWith(path, "Choose how the pool is costed.");
  const windows = parseWindowLines(field(formData, "windows"));
  if (!windows.ok) failWith(path, windows.error);
  const supabase = await createClient();
  const { error } = await supabase
    .from("bk_pools")
    .update({
      name,
      unit_label: unitLabel,
      costing,
      default_windows: windows.windows,
      active: field(formData, "active") === "on",
    })
    .eq("id", id);
  failIfError(error, path, "Could not save the pool");
  await logRateModelEvent({
    versionId: null,
    actorId: profile.id,
    kind: "pool_catalog_changed",
    note: `Edited pool "${name}".`,
  });
  revalidateRates();
  redirect(`${RATES_PATH}/setup`);
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
  const poolId = uuidField(formData, "pool_id", path, "the pool the asset belongs to");
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
    pool_id: poolId,
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
    note: `Added asset "${fields.name}".`,
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
