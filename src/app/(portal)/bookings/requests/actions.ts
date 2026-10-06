"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { assertBookingsAccess, assertBookingsScheduler } from "@/lib/bookings/access";
import { repriceProject } from "@/lib/bookings/estimate";
import { logProjectEvent } from "@/lib/bookings/events";
import {
  BOOKINGS_PATH,
  CALENDAR_PATH,
  REQUESTS_PATH,
  requestEditHref,
  requestHref,
} from "@/lib/bookings/paths";
import { estimateMargin, estimateTotals, legacyRateDelta, priceLine } from "@/lib/bookings/pricing";
import {
  DISPOSITION_LABEL,
  STAGE_LABEL,
  validateDispositionInput,
  validateRequestForm,
  type RequestFormValues,
} from "@/lib/bookings/projects";
import { getPricingContext } from "@/lib/bookings/queries";
import { tentativeExpiry } from "@/lib/bookings/scheduling";
import type {
  BkAirtimeHonoredIn,
  BkAirtimeTreatment,
  BkEditorialReview,
  BkEstimateLineKind,
  BkPartnerKind,
  BkPricingTreatment,
  BkProjectDisposition,
  BkRequested,
} from "@/lib/database.types";
import { isValidDateISO } from "@/lib/log/week-layout";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function optionalField(formData: FormData, name: string): string | null {
  const value = field(formData, name);
  return value === "" ? null : value;
}

function projectIdField(formData: FormData): string {
  const id = field(formData, "project_id");
  if (!UUID.test(id)) failWith(REQUESTS_PATH, "That request could not be found.");
  return id;
}

function numberField(formData: FormData, name: string, path: string, label: string): number {
  const raw = field(formData, name).replace(/[$,%\s]/g, "");
  if (raw === "") failWith(path, `${label} is required.`);
  const value = Number(raw);
  if (!Number.isFinite(value)) failWith(path, `${label} must be a number.`);
  return value;
}

function revalidateRequests(projectId?: string): void {
  revalidatePath(BOOKINGS_PATH);
  revalidatePath(REQUESTS_PATH);
  revalidatePath(CALENDAR_PATH);
  if (projectId) revalidatePath(requestHref(projectId));
}

/** Re-derive and reprice after a write; a failure bounces to the project page with the reason. */
async function repriceOrFail(projectId: string, path: string): Promise<void> {
  const result = await repriceProject(projectId);
  if (!result.ok) failWith(path, result.error);
}

// The request --------------------------------------------------------------------------------------

function requestValues(formData: FormData): RequestFormValues {
  return {
    title: field(formData, "title"),
    description: field(formData, "description"),
    requested: field(formData, "requested"),
    partnerId: field(formData, "partner_id"),
    newPartnerName: field(formData, "new_partner_name"),
    newPartnerKind: field(formData, "new_partner_kind"),
    eventStartsOn: field(formData, "event_starts_on"),
    eventEndsOn: field(formData, "event_ends_on"),
    deliverablesDueOn: field(formData, "deliverables_due_on"),
    location: field(formData, "location"),
    contactName: field(formData, "contact_name"),
    contactEmail: field(formData, "contact_email"),
    contactPhone: field(formData, "contact_phone"),
    fundingIndex: field(formData, "funding_index"),
    editorialReview: field(formData, "editorial_review"),
    qualifiesStrategic: field(formData, "qualifies_strategic"),
  };
}

/** The partner the form named: an existing one, or a new row from the inline fields. */
async function resolvePartner(
  values: RequestFormValues,
  actorId: string,
  path: string,
): Promise<string> {
  const supabase = await createClient();
  if (values.partnerId) {
    if (!UUID.test(values.partnerId)) failWith(path, "Choose the partner.");
    return values.partnerId;
  }
  const { data, error } = await supabase
    .from("bk_partners")
    .insert({
      name: values.newPartnerName.trim(),
      kind: values.newPartnerKind as BkPartnerKind,
      contact_name: values.contactName || null,
      contact_email: values.contactEmail || null,
      contact_phone: values.contactPhone || null,
      default_funding_index: values.fundingIndex || null,
      created_by: actorId,
    })
    .select("id")
    .single();
  if (error?.code === "23505") {
    failWith(
      path,
      `A partner named "${values.newPartnerName.trim()}" is already on file; choose it instead.`,
    );
  }
  failIfError(error, path, "Could not add the partner");
  if (!data) failWith(path, "Could not add the partner.");
  return data.id;
}

function projectColumns(values: RequestFormValues, actorId: string) {
  return {
    title: values.title.trim(),
    description: values.description || null,
    requested: values.requested as BkRequested,
    event_starts_on: values.eventStartsOn || null,
    event_ends_on: values.eventEndsOn || null,
    deliverables_due_on: values.deliverablesDueOn || null,
    location: values.location || null,
    contact_name: values.contactName || null,
    contact_email: values.contactEmail || null,
    contact_phone: values.contactPhone || null,
    funding_index: values.fundingIndex || null,
    editorial_review: values.editorialReview as BkEditorialReview,
    qualifies_strategic:
      values.qualifiesStrategic === "" ? null : values.qualifiesStrategic === "yes",
    qualification_by: values.qualifiesStrategic === "" ? null : actorId,
  };
}

export async function createRequest(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsScheduler();
  const path = `${REQUESTS_PATH}/new`;
  const values = requestValues(formData);
  const problem = validateRequestForm(values);
  if (problem) failWith(path, problem);
  const partnerId = await resolvePartner(values, profile.id, path);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bk_projects")
    .insert({
      partner_id: partnerId,
      ...projectColumns(values, profile.id),
      source: "staff",
      owner_id: profile.id,
      created_by: profile.id,
    })
    .select("id")
    .single();
  failIfError(error, path, "Could not create the request");
  if (!data) failWith(path, "Could not create the request.");

  await logProjectEvent({
    projectId: data.id,
    actorId: profile.id,
    kind: "created",
    note: "Request entered by staff.",
  });
  revalidateRequests(data.id);
  redirect(requestHref(data.id, { saved: "created" }));
}

export async function updateRequest(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsScheduler();
  const projectId = projectIdField(formData);
  const path = requestEditHref(projectId);
  const values = requestValues(formData);
  const problem = validateRequestForm(values);
  if (problem) failWith(path, problem);
  const partnerId = await resolvePartner(values, profile.id, path);

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("bk_projects")
    .select("qualifies_strategic, partner_id")
    .eq("id", projectId)
    .maybeSingle();
  const columns = projectColumns(values, profile.id);
  const { error } = await supabase
    .from("bk_projects")
    .update({
      partner_id: partnerId,
      ...columns,
      // Keep who recorded the judgment when it hasn't changed.
      qualification_by:
        before && before.qualifies_strategic === columns.qualifies_strategic
          ? undefined
          : columns.qualification_by,
    })
    .eq("id", projectId);
  failIfError(error, path, "Could not save the request");

  await logProjectEvent({ projectId, actorId: profile.id, kind: "edited", note: "Scope edited." });
  // A changed partner or judgment can change the treatment.
  if (
    before &&
    (before.partner_id !== partnerId || before.qualifies_strategic !== columns.qualifies_strategic)
  ) {
    const { data: priced } = await supabase
      .from("bk_projects")
      .select("priced_as")
      .eq("id", projectId)
      .maybeSingle();
    if (priced?.priced_as) await repriceOrFail(projectId, requestHref(projectId));
  }
  revalidateRequests(projectId);
  redirect(requestHref(projectId, { saved: "1" }));
}

export async function assignOwner(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsAccess();
  const projectId = projectIdField(formData);
  const path = requestHref(projectId);
  const ownerId = optionalField(formData, "owner_id");
  if (ownerId && !UUID.test(ownerId)) failWith(path, "Choose an owner.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("bk_projects")
    .update({ owner_id: ownerId })
    .eq("id", projectId);
  failIfError(error, path, "Could not change the owner");
  await logProjectEvent({
    projectId,
    actorId: profile.id,
    kind: "owner_changed",
    note: ownerId ? "Owner changed." : "Unassigned.",
    metadata: { owner_id: ownerId },
  });
  revalidateRequests(projectId);
  redirect(path);
}

export async function addNote(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsAccess();
  const projectId = projectIdField(formData);
  const path = requestHref(projectId);
  const note = field(formData, "note");
  if (!note) failWith(path, "Write something before adding a note.");
  await logProjectEvent({ projectId, actorId: profile.id, kind: "note", note });
  revalidateRequests(projectId);
  redirect(path);
}

// Pricing ---------------------------------------------------------------------------------------------

const TREATMENTS: readonly BkPricingTreatment[] = ["strategic", "incremental", "external"];

/**
 * The lead's pricing control: "derived" re-derives from the facts; a
 * treatment overrides it. An override onto the reserve (strategic) is the
 * executive's — bk_guard_project() refuses it for anyone else — and every
 * override is audited (§2.2).
 */
export async function setPricing(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsScheduler();
  const projectId = projectIdField(formData);
  const path = requestHref(projectId);
  const choice = field(formData, "treatment");
  const supabase = await createClient();
  if (choice === "derived") {
    const { error } = await supabase
      .from("bk_projects")
      .update({ pricing_overridden_by: null })
      .eq("id", projectId);
    failIfError(error, path, "Could not change the pricing");
    await repriceOrFail(projectId, path);
    await logProjectEvent({
      projectId,
      actorId: profile.id,
      kind: "pricing",
      note: "Pricing follows the derived treatment again.",
    });
  } else {
    if (!TREATMENTS.includes(choice as BkPricingTreatment)) failWith(path, "Choose a treatment.");
    const treatment = choice as BkPricingTreatment;
    const reason = field(formData, "reason");
    if (!reason) failWith(path, "Say why the derived treatment is being changed.");
    const { error } = await supabase
      .from("bk_projects")
      .update({
        priced_as: treatment,
        pricing_reason: `Changed by hand: ${reason}`,
        pricing_overridden_by: profile.id,
      })
      .eq("id", projectId);
    failIfError(error, path, "Could not change the pricing");
    await repriceOrFail(projectId, path);
    await logProjectEvent({
      projectId,
      actorId: profile.id,
      kind: "pricing",
      note: `Priced as ${treatment} by hand: ${reason}`,
      metadata: { treatment },
    });
    await logAuditEvent({
      actorId: profile.id,
      action: "bookings.project.pricing_overridden",
      targetType: "bk_project",
      targetId: projectId,
      metadata: { treatment, reason },
    });
  }
  revalidateRequests(projectId);
  redirect(path);
}

// Estimate lines ---------------------------------------------------------------------------------

const LINE_KINDS: readonly BkEstimateLineKind[] = ["package", "labor", "expense"];

export async function addEstimateLine(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsScheduler();
  const projectId = projectIdField(formData);
  const path = requestHref(projectId, { new: "line" });
  const kind = field(formData, "kind") as BkEstimateLineKind;
  if (!LINE_KINDS.includes(kind)) failWith(path, "Choose what the line is.");
  const quantity = numberField(formData, "quantity", path, "The quantity");
  if (quantity <= 0) failWith(path, "The quantity must be more than zero.");

  const supabase = await createClient();
  const { data: project, error: projectError } = await supabase
    .from("bk_projects")
    .select("rate_model_version_id, priced_as, agreement_id")
    .eq("id", projectId)
    .maybeSingle();
  failIfError(projectError, path, "Could not read the request");
  if (!project) failWith(path, "That request no longer exists.");
  const context = await getPricingContext(project.rate_model_version_id);
  if (!context) {
    failWith(
      path,
      "No rate card is recorded for estimates. Finance records one on the Rates tab (Rate card → Record for estimates).",
    );
  }

  let row: {
    kind: BkEstimateLineKind;
    package_id: string | null;
    labor_class_id: string | null;
    label: string;
    unit_label: string;
    quantity: number;
    unit_rate: number;
    labor_hours: Record<string, number>;
    resource_units: Record<string, number>;
  };
  if (kind === "package") {
    const packageId = field(formData, "package_id");
    const pkg = context.packages.find((p) => p.id === packageId);
    if (!pkg) failWith(path, "Choose a service package.");
    // A bespoke package is offered only to requests under its agreement (slice 5).
    if (pkg.agreement_id !== null && pkg.agreement_id !== project.agreement_id) {
      failWith(path, "That package is scoped to an agreement this request is not under.");
    }
    row = {
      kind,
      package_id: pkg.id,
      labor_class_id: null,
      label: `${pkg.name} (${pkg.unit_label})`,
      unit_label: pkg.unit_label,
      quantity,
      unit_rate: 0,
      labor_hours: Object.fromEntries(pkg.labor.map((l) => [l.labor_class_id, l.hours])),
      resource_units: Object.fromEntries(pkg.resources.map((r) => [r.pool_id, r.units])),
    };
  } else if (kind === "labor") {
    const classId = field(formData, "labor_class_id");
    const cls = context.classes.find((c) => c.id === classId);
    if (!cls) failWith(path, "Choose a labor class.");
    row = {
      kind,
      package_id: null,
      labor_class_id: cls.id,
      label: `${cls.name} hours`,
      unit_label: "hour",
      quantity,
      unit_rate: 0,
      labor_hours: { [cls.id]: 1 },
      resource_units: {},
    };
  } else {
    const label = field(formData, "label");
    if (!label) failWith(path, "Describe the expense.");
    const cost = numberField(formData, "unit_cost", path, "The cost");
    if (cost < 0) failWith(path, "The cost can't be negative.");
    row = {
      kind,
      package_id: null,
      labor_class_id: null,
      label,
      unit_label: "each",
      quantity,
      unit_rate: cost,
      labor_hours: {},
      resource_units: {},
    };
  }

  // Price under the current treatment (incremental until the project is derived below).
  const priced = priceLine(
    row,
    project.priced_as ?? "incremental",
    context.card,
    context.classes,
    context.assessmentShare,
  );
  if (!priced.ok) failWith(path, priced.error);

  const { data: last } = await supabase
    .from("bk_estimate_lines")
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("bk_estimate_lines").insert({
    project_id: projectId,
    ...row,
    ...priced.price,
    notes: optionalField(formData, "notes"),
    sort_order: (last?.sort_order ?? 0) + 10,
  });
  failIfError(error, path, "Could not add the line");

  await repriceOrFail(projectId, requestHref(projectId));
  await logProjectEvent({
    projectId,
    actorId: profile.id,
    kind: "line_added",
    note: `Added ${row.label} × ${quantity}.`,
  });
  revalidateRequests(projectId);
  redirect(requestHref(projectId));
}

export async function updateEstimateLine(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsScheduler();
  const projectId = projectIdField(formData);
  const lineId = field(formData, "line_id");
  const path = requestHref(projectId, { line: lineId });
  const quantity = numberField(formData, "quantity", path, "The quantity");
  if (quantity <= 0) failWith(path, "The quantity must be more than zero.");
  const supabase = await createClient();
  const { data: line } = await supabase
    .from("bk_estimate_lines")
    .select("kind, label")
    .eq("id", lineId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!line) failWith(path, "That line no longer exists.");
  const update: { quantity: number; notes: string | null; label?: string; unit_rate?: number } = {
    quantity,
    notes: optionalField(formData, "notes"),
  };
  if (line.kind === "expense") {
    const label = field(formData, "label");
    if (!label) failWith(path, "Describe the expense.");
    const cost = numberField(formData, "unit_cost", path, "The cost");
    if (cost < 0) failWith(path, "The cost can't be negative.");
    update.label = label;
    // The typed cost is the rate repriceProject() grosses up for an external project.
    update.unit_rate = cost;
  }
  const { error } = await supabase.from("bk_estimate_lines").update(update).eq("id", lineId);
  failIfError(error, path, "Could not save the line");
  await repriceOrFail(projectId, requestHref(projectId));
  await logProjectEvent({
    projectId,
    actorId: profile.id,
    kind: "line_changed",
    note: `Changed ${line.label}: × ${quantity}.`,
  });
  revalidateRequests(projectId);
  redirect(requestHref(projectId));
}

export async function removeEstimateLine(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsScheduler();
  const projectId = projectIdField(formData);
  const lineId = field(formData, "line_id");
  const path = requestHref(projectId);
  const supabase = await createClient();
  const { data: line } = await supabase
    .from("bk_estimate_lines")
    .select("label")
    .eq("id", lineId)
    .maybeSingle();
  const { error } = await supabase
    .from("bk_estimate_lines")
    .delete()
    .eq("id", lineId)
    .eq("project_id", projectId);
  failIfError(error, path, "Could not remove the line");
  await repriceOrFail(projectId, path);
  await logProjectEvent({
    projectId,
    actorId: profile.id,
    kind: "line_removed",
    note: `Removed ${line?.label ?? "a line"}.`,
  });
  revalidateRequests(projectId);
  redirect(path);
}

// Dates --------------------------------------------------------------------------------------------------

/** The `hours_<classId>` inputs the date form carries. */
function laborFields(
  formData: FormData,
  path: string,
): { labor_class_id: string; hours: number }[] {
  const rows: { labor_class_id: string; hours: number }[] = [];
  for (const key of formData.keys()) {
    if (!key.startsWith("hours_")) continue;
    const id = key.slice("hours_".length);
    if (!UUID.test(id)) continue;
    const raw = field(formData, key);
    if (raw === "") continue;
    const hours = Number(raw);
    if (!Number.isFinite(hours) || hours < 0)
      failWith(path, "Hours must be a number, zero or more.");
    if (hours > 0) rows.push({ labor_class_id: id, hours });
  }
  return rows;
}

/**
 * A date the estimate will hold: written as a `planned` booking, which takes
 * nothing until the estimate is sent (the screen runs the rule for it and
 * shows the refusal). bk_send_estimate() makes it a tentative hold.
 */
export async function addPlannedDate(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsScheduler();
  const projectId = projectIdField(formData);
  const path = requestHref(projectId, { new: "date" });
  const planId = field(formData, "plan_id");
  if (!UUID.test(planId)) failWith(path, "There is no active term plan to book into.");
  const poolId = field(formData, "pool_id");
  if (!UUID.test(poolId)) failWith(path, "Choose a pool.");
  const date = field(formData, "date");
  if (!isValidDateISO(date)) failWith(path, "The date must be a date.");
  const listed = field(formData, "window");
  let start: string;
  let end: string;
  if (listed && listed !== "custom") {
    [start = "", end = ""] = listed.split("-");
    if (!TIME.test(start) || !TIME.test(end)) failWith(path, "Choose a window.");
  } else {
    start = field(formData, "window_start").slice(0, 5);
    end = field(formData, "window_end").slice(0, 5);
    if (!TIME.test(start) || !TIME.test(end) || end <= start) {
      failWith(path, "The window needs a start before its end, as 08:00 and 12:00.");
    }
  }
  const labor = laborFields(formData, path);

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("bk_projects")
    .select("title, priced_as, partner_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) failWith(path, "That request no longer exists.");
  const { data: partner } = await supabase
    .from("bk_partners")
    .select("name")
    .eq("id", project.partner_id)
    .maybeSingle();

  const { error } = await supabase.rpc("bk_create_booking", {
    p_booking: {
      plan_id: planId,
      project_id: projectId,
      pool_id: poolId,
      date,
      window_start: start,
      window_end: end,
      treatment: project.priced_as ?? "incremental",
      status: "planned",
      label: `${partner?.name ?? "Partner"}: ${project.title}`,
      notes: optionalField(formData, "notes"),
    },
    p_labor: labor,
  });
  failIfError(error, path, "Could not add the date");
  await logProjectEvent({
    projectId,
    actorId: profile.id,
    kind: "date_added",
    note: `Planned ${date}, ${start}–${end}.`,
  });
  revalidateRequests(projectId);
  redirect(requestHref(projectId));
}

/** Remove a planned date, or release a hold the estimate placed. */
export async function removeDate(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsScheduler();
  const projectId = projectIdField(formData);
  const bookingId = field(formData, "booking_id");
  const path = requestHref(projectId);
  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bk_bookings")
    .select("status, date")
    .eq("id", bookingId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!booking) failWith(path, "That date no longer exists.");
  if (booking.status === "planned") {
    const { error } = await supabase.from("bk_bookings").delete().eq("id", bookingId);
    failIfError(error, path, "Could not remove the date");
    await logProjectEvent({
      projectId,
      actorId: profile.id,
      kind: "date_removed",
      note: `Removed ${booking.date}.`,
    });
  } else {
    const { error } = await supabase
      .from("bk_bookings")
      .update({ status: "released" })
      .eq("id", bookingId);
    failIfError(error, path, "Could not release the date");
    await logProjectEvent({
      projectId,
      actorId: profile.id,
      kind: "date_released",
      note: `Released ${booking.date}.`,
    });
  }
  // A reserved block the date came from is the partner's again (slice 5).
  const { error: detachError } = await supabase
    .from("bk_reserved_blocks")
    .update({ project_id: null, booking_id: null })
    .eq("booking_id", bookingId);
  failIfError(detachError, path, "Could not hand the reserved block back");
  revalidateRequests(projectId);
  redirect(path);
}

// Agreements and reserved blocks (slice 5) -----------------------------------------------------------

/** Put the project under one of its partner's active agreements, or take it out; the treatment is re-derived (§2.2). */
export async function setProjectAgreement(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsScheduler();
  const projectId = projectIdField(formData);
  const path = requestHref(projectId);
  const agreementId = optionalField(formData, "agreement_id");
  if (agreementId && !UUID.test(agreementId)) failWith(path, "Choose an agreement.");
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("bk_projects")
    .select("partner_id, agreement_id, priced_as")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) failWith(path, "That request no longer exists.");
  let label: string | null = null;
  if (agreementId) {
    const { data: agreement } = await supabase
      .from("bk_agreements")
      .select("label, status, partner_id")
      .eq("id", agreementId)
      .maybeSingle();
    if (!agreement || agreement.partner_id !== project.partner_id)
      failWith(path, "That agreement belongs to another partner.");
    if (agreement.status !== "active")
      failWith(path, "Only an approved, active agreement prices a request.");
    label = agreement.label;
  }
  if ((project.agreement_id ?? null) === agreementId) redirect(path);
  // bk_guard_project() refuses another partner's agreement however this is written.
  const { error } = await supabase
    .from("bk_projects")
    .update({ agreement_id: agreementId })
    .eq("id", projectId);
  failIfError(error, path, "Could not change the agreement");
  if (project.priced_as) await repriceOrFail(projectId, path);
  await logProjectEvent({
    projectId,
    actorId: profile.id,
    kind: "agreement",
    note: label ? `Under the agreement "${label}".` : "No longer under an agreement.",
    metadata: { agreement_id: agreementId },
  });
  revalidateRequests(projectId);
  redirect(path);
}

const ATTACH_ERRORS: Record<string, string> = {
  not_found: "That reserved block no longer exists.",
  released: "That block was released.",
  taken: "Another request already took that block.",
  agreement_not_active: "The agreement is not active, so its blocks reserve nothing yet.",
  past_deadline: "That block is past its release deadline and no longer held.",
  project_not_found: "That request no longer exists.",
  closed: "This request is closed; reopen it first.",
  other_partner: "That block is held for another partner.",
  wrong_stage: "A delivered or settled request takes no more dates.",
  other_agreement: "This request is under a different agreement.",
  no_plan: "No active term plan covers that date, so it can't be booked.",
};

/**
 * Attach one of the agreement's reserved blocks to the project (§3E): the
 * block takes the project and the project gets a date on the block's window
 * — planned, held or confirmed to match where the estimate stands — in one
 * transaction (bk_attach_reserved_block()).
 */
export async function attachReservedBlock(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsScheduler();
  const projectId = projectIdField(formData);
  const path = requestHref(projectId, { new: "block" });
  const blockId = field(formData, "block_id");
  if (!UUID.test(blockId)) failWith(path, "Choose a reserved block.");
  const labor = laborFields(formData, path);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bk_attach_reserved_block", {
    p_block_id: blockId,
    p_project_id: projectId,
    p_labor: labor,
  });
  failIfError(error, path, "Could not use the reserved block");
  if (data && "error" in data) failWith(path, ATTACH_ERRORS[data.error] ?? data.error);
  const status = data && "status" in data ? data.status : "planned";
  await logProjectEvent({
    projectId,
    actorId: profile.id,
    kind: "block_attached",
    note: `Took a reserved block under the agreement (${status}).`,
    metadata: { block_id: blockId, status },
  });
  revalidateRequests(projectId);
  revalidatePath(CALENDAR_PATH);
  redirect(requestHref(projectId));
}

// Stages --------------------------------------------------------------------------------------------------

const SEND_ERRORS: Record<string, string> = {
  not_found: "That request no longer exists.",
  closed: "This request is closed; reopen it first.",
  wrong_stage: "The estimate can only be sent from Request or Estimate.",
  nothing_to_send: "Add an estimate line or an airtime commitment first.",
  not_priced: "Price the estimate first.",
};

/** Send the estimate: every planned date becomes a 14-day tentative hold, all or none (§6.4). */
export async function sendEstimate(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsScheduler();
  const projectId = projectIdField(formData);
  const path = requestHref(projectId);
  const expiresAt = tentativeExpiry(new Date().toISOString());
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bk_send_estimate", {
    p_project_id: projectId,
    p_expires_at: expiresAt,
  });
  failIfError(error, path, "Could not send the estimate");
  if (data && "error" in data) failWith(path, SEND_ERRORS[data.error] ?? data.error);
  const held = data && "held" in data ? data.held : 0;
  await logProjectEvent({
    projectId,
    actorId: profile.id,
    kind: "estimate_sent",
    note: `Estimate sent; ${held} date${held === 1 ? "" : "s"} held tentatively for 14 days.`,
    metadata: { expires_at: expiresAt, held },
  });
  await logAuditEvent({
    actorId: profile.id,
    action: "bookings.project.estimate_sent",
    targetType: "bk_project",
    targetId: projectId,
    metadata: { expires_at: expiresAt, held },
  });
  revalidateRequests(projectId);
  redirect(requestHref(projectId, { saved: "sent" }));
}

const APPROVE_ERRORS: Record<string, string> = {
  not_found: "That request no longer exists.",
  closed: "This request is closed; reopen it first.",
  wrong_stage: "Only a sent estimate can be approved.",
};

/** The partner approved: holds are confirmed, the project is booked, and the legacy-rate delta is recorded. */
export async function approveEstimate(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsScheduler();
  const projectId = projectIdField(formData);
  const path = requestHref(projectId);
  const supabase = await createClient();
  const { data: lines } = await supabase
    .from("bk_estimate_lines")
    .select("*")
    .eq("project_id", projectId);
  const delta = legacyRateDelta(
    (lines ?? []).map((l) => ({ ...l, labor_hours: l.labor_hours ?? {} })),
  );
  const { data, error } = await supabase.rpc("bk_approve_estimate", {
    p_project_id: projectId,
    p_legacy_rate_delta: delta,
  });
  failIfError(error, path, "Could not book the project");
  if (data && "error" in data) failWith(path, APPROVE_ERRORS[data.error] ?? data.error);
  const confirmed = data && "confirmed" in data ? data.confirmed : 0;
  await logProjectEvent({
    projectId,
    actorId: profile.id,
    kind: "estimate_approved",
    note: `Estimate approved; ${confirmed} date${confirmed === 1 ? "" : "s"} confirmed.`,
    metadata: { confirmed, legacy_rate_delta: delta },
  });
  await logAuditEvent({
    actorId: profile.id,
    action: "bookings.project.estimate_approved",
    targetType: "bk_project",
    targetId: projectId,
    metadata: { confirmed, legacy_rate_delta: delta },
  });
  revalidateRequests(projectId);
  redirect(requestHref(projectId, { saved: "booked" }));
}

export async function markDelivered(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsScheduler();
  const projectId = projectIdField(formData);
  const path = requestHref(projectId);
  const supabase = await createClient();
  const { error } = await supabase
    .from("bk_projects")
    .update({ stage: "delivered" })
    .eq("id", projectId)
    .eq("stage", "booked")
    .is("disposition", null);
  failIfError(error, path, "Could not mark the project delivered");
  await logProjectEvent({
    projectId,
    actorId: profile.id,
    kind: "delivered",
    note: `Moved to ${STAGE_LABEL.delivered}.`,
  });
  await logAuditEvent({
    actorId: profile.id,
    action: "bookings.project.delivered",
    targetType: "bk_project",
    targetId: projectId,
  });
  revalidateRequests(projectId);
  redirect(requestHref(projectId, { saved: "delivered" }));
}

// Dispositions -------------------------------------------------------------------------------------

const DISPOSITION_ERRORS: Record<string, string> = {
  reason_required: "Give a reason.",
  not_found: "That request no longer exists.",
  wrong_stage: "A delivered or settled project is not closed this way.",
};

/**
 * Defer, decline or withdraw: every hold is released and the stage reached
 * is kept (§2.3). Declining an external project for capacity records its
 * estimate's margin as foregone (§8).
 */
export async function setDisposition(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsScheduler();
  const projectId = projectIdField(formData);
  const path = requestHref(projectId);
  const disposition = field(formData, "disposition");
  const reason = field(formData, "reason");
  const problem = validateDispositionInput(disposition, reason);
  if (problem) failWith(path, problem);

  const supabase = await createClient();
  let marginForegone: number | null = null;
  if (disposition === "declined" && formData.get("for_capacity") === "on") {
    const [{ data: project }, { data: lines }] = await Promise.all([
      supabase
        .from("bk_projects")
        .select("priced_as, rate_model_version_id")
        .eq("id", projectId)
        .maybeSingle(),
      supabase.from("bk_estimate_lines").select("*").eq("project_id", projectId),
    ]);
    if (project?.priced_as === "external") {
      const context = await getPricingContext(project.rate_model_version_id);
      const total = estimateTotals(
        (lines ?? []).map((l) => ({ ...l, labor_hours: l.labor_hours ?? {} })),
      ).total;
      marginForegone = estimateMargin(total, context?.externalMarginShare ?? 0);
    }
  }

  const { data, error } = await supabase.rpc("bk_set_project_disposition", {
    p_project_id: projectId,
    p_disposition: disposition as BkProjectDisposition,
    p_reason: reason,
    p_margin_foregone: marginForegone,
  });
  failIfError(error, path, "Could not close the request");
  if (data && "error" in data) failWith(path, DISPOSITION_ERRORS[data.error] ?? data.error);
  const released = data && "released" in data ? data.released : 0;
  await logProjectEvent({
    projectId,
    actorId: profile.id,
    kind: "disposition",
    note: `${DISPOSITION_LABEL[disposition as BkProjectDisposition]}: ${reason}${
      released > 0 ? ` (${released} hold${released === 1 ? "" : "s"} released)` : ""
    }`,
    metadata: { disposition, released, margin_foregone: marginForegone },
  });
  await logAuditEvent({
    actorId: profile.id,
    action: "bookings.project.disposition",
    targetType: "bk_project",
    targetId: projectId,
    metadata: { disposition, released, margin_foregone: marginForegone },
  });
  revalidateRequests(projectId);
  redirect(path);
}

/** Reopen a closed request at the stage it reached; its released holds are not revived — plan the dates again. */
export async function reopenProject(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsScheduler();
  const projectId = projectIdField(formData);
  const path = requestHref(projectId);
  const supabase = await createClient();
  const { error } = await supabase
    .from("bk_projects")
    .update({
      disposition: null,
      disposition_reason: null,
      disposition_by: null,
      disposition_at: null,
    })
    .eq("id", projectId);
  failIfError(error, path, "Could not reopen the request");
  await logProjectEvent({ projectId, actorId: profile.id, kind: "reopened", note: "Reopened." });
  revalidateRequests(projectId);
  redirect(path);
}

// Airtime commitments --------------------------------------------------------------------------------

const AIRTIME_TREATMENTS: readonly BkAirtimeTreatment[] = ["contributed", "paid"];
const HONORED_IN: readonly BkAirtimeHonoredIn[] = ["pending", "traffic", "on_air"];

function commitmentFields(formData: FormData, path: string) {
  const airings = numberField(formData, "airings_per_week", path, "Airings a week");
  if (!Number.isInteger(airings) || airings <= 0)
    failWith(path, "Airings a week is a whole number, at least 1.");
  const seconds = numberField(formData, "seconds", path, "The length");
  if (!Number.isInteger(seconds) || seconds <= 0)
    failWith(path, "The length is a whole number of seconds.");
  const startsOn = field(formData, "starts_on");
  if (!isValidDateISO(startsOn)) failWith(path, "The first air date must be a date.");
  const endsOn = optionalField(formData, "ends_on");
  if (endsOn && (!isValidDateISO(endsOn) || endsOn < startsOn)) {
    failWith(path, "The last air date must be a date on or after the first.");
  }
  const treatment = field(formData, "treatment") as BkAirtimeTreatment;
  if (!AIRTIME_TREATMENTS.includes(treatment))
    failWith(path, "Say whether the airtime is contributed or paid.");
  const honoredIn = (field(formData, "honored_in") || "pending") as BkAirtimeHonoredIn;
  if (!HONORED_IN.includes(honoredIn)) failWith(path, "Say where the airtime is honored.");
  const externalRef = optionalField(formData, "external_ref");
  if (honoredIn !== "pending" && (!externalRef || !UUID.test(externalRef))) {
    failWith(
      path,
      "Paste the Traffic contract's or the On Air pin's id to say where it is honored.",
    );
  }
  return {
    airings_per_week: airings,
    seconds,
    starts_on: startsOn,
    ends_on: endsOn,
    treatment,
    honored_in: honoredIn,
    external_ref: honoredIn === "pending" ? null : externalRef,
    notes: optionalField(formData, "notes"),
  };
}

export async function addCommitment(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsScheduler();
  const projectId = projectIdField(formData);
  const path = requestHref(projectId, { new: "airtime" });
  const values = commitmentFields(formData, path);
  const supabase = await createClient();
  const { error } = await supabase
    .from("bk_airtime_commitments")
    .insert({ project_id: projectId, ...values });
  failIfError(error, path, "Could not add the airtime commitment");
  await logProjectEvent({
    projectId,
    actorId: profile.id,
    kind: "commitment_added",
    note: `Airtime: ${values.airings_per_week} × ${values.seconds}s a week from ${values.starts_on}, ${values.treatment}.`,
  });
  revalidateRequests(projectId);
  redirect(requestHref(projectId));
}

export async function updateCommitment(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsScheduler();
  const projectId = projectIdField(formData);
  const commitmentId = field(formData, "commitment_id");
  const path = requestHref(projectId, { airtime: commitmentId });
  const values = commitmentFields(formData, path);
  const supabase = await createClient();
  const { error } = await supabase
    .from("bk_airtime_commitments")
    .update(values)
    .eq("id", commitmentId)
    .eq("project_id", projectId);
  failIfError(error, path, "Could not save the airtime commitment");
  await logProjectEvent({
    projectId,
    actorId: profile.id,
    kind: "commitment_changed",
    note: `Airtime: ${values.airings_per_week} × ${values.seconds}s a week, ${values.treatment}, honored in ${values.honored_in}.`,
  });
  revalidateRequests(projectId);
  redirect(requestHref(projectId));
}

export async function removeCommitment(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsScheduler();
  const projectId = projectIdField(formData);
  const commitmentId = field(formData, "commitment_id");
  const path = requestHref(projectId);
  const supabase = await createClient();
  const { error } = await supabase
    .from("bk_airtime_commitments")
    .delete()
    .eq("id", commitmentId)
    .eq("project_id", projectId);
  failIfError(error, path, "Could not remove the airtime commitment");
  await logProjectEvent({
    projectId,
    actorId: profile.id,
    kind: "commitment_removed",
    note: "Airtime commitment removed.",
  });
  revalidateRequests(projectId);
  redirect(path);
}
