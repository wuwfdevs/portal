"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { assertBookingsDirector, assertBookingsScheduler } from "@/lib/bookings/access";
import { CALENDAR_PATH, PLAN_PATH, calendarHref, withQuery } from "@/lib/bookings/paths";
import { POOL_KEYS, type PoolKey } from "@/lib/bookings/rates";
import {
  DEFAULT_UNIT_LABEL,
  DEFAULT_WINDOWS,
  parseWindowLines,
  tentativeExpiry,
} from "@/lib/bookings/scheduling";
import type { BkHoldKind, BkPricingTreatment, BkTermPlanStatus } from "@/lib/database.types";
import { isValidDateISO } from "@/lib/log/week-layout";

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

function dateField(formData: FormData, name: string, path: string, label: string): string {
  const value = field(formData, name);
  if (!isValidDateISO(value)) failWith(path, `${label} must be a date.`);
  return value;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function timeField(formData: FormData, name: string, path: string, label: string): string {
  const value = field(formData, name).slice(0, 5);
  if (!TIME.test(value)) failWith(path, `${label} must be a time such as 08:00.`);
  return value;
}

function poolField(formData: FormData, name: string, path: string): PoolKey {
  const value = field(formData, name);
  if (!(POOL_KEYS as readonly string[]).includes(value)) failWith(path, "Choose a resource pool.");
  return value as PoolKey;
}

/** The pool and window a booking or hold form chose: a listed window ("08:00-12:00") or custom times. */
function windowFields(formData: FormData, path: string): { start: string; end: string } {
  const listed = field(formData, "window");
  if (listed && listed !== "custom") {
    const [start = "", end = ""] = listed.split("-");
    if (!TIME.test(start) || !TIME.test(end)) failWith(path, "Choose a window.");
    return { start, end };
  }
  const start = timeField(formData, "window_start", path, "The start time");
  const end = timeField(formData, "window_end", path, "The end time");
  if (end <= start) failWith(path, "The window must end after it starts.");
  return { start, end };
}

function revalidateCalendar(): void {
  revalidatePath(CALENDAR_PATH);
  revalidatePath(PLAN_PATH);
}

/** The calendar screen a form came from, so a write lands back where it was made. */
function returnTo(formData: FormData, fallback: string): string {
  const value = field(formData, "return_to");
  return value.startsWith(CALENDAR_PATH) ? value : fallback;
}

// Term plans ---------------------------------------------------------------------------------------

const PLAN_STATUSES: readonly BkTermPlanStatus[] = ["draft", "active", "closed"];

function planFields(formData: FormData, path: string) {
  const label = field(formData, "label");
  if (!label) failWith(path, "The term needs a label.");
  const startsOn = dateField(formData, "starts_on", path, "The first day");
  const endsOn = dateField(formData, "ends_on", path, "The last day");
  if (endsOn < startsOn) failWith(path, "The term must end after it starts.");
  const net = numberField(formData, "net_professional_hours", path, "Net professional hours");
  if (net < 0) failWith(path, "Net professional hours can't be negative.");
  const reservePercent = numberField(formData, "reserve_percent", path, "The reserve share");
  if (reservePercent < 0 || reservePercent > 100) {
    failWith(path, "The reserve share is a percentage between 0 and 100.");
  }
  const airtime = numberField(
    formData,
    "airtime_contributed_minutes_per_week",
    path,
    "Contributed airtime minutes a week",
  );
  if (airtime < 0 || !Number.isInteger(airtime)) {
    failWith(path, "Contributed airtime is a whole number of minutes a week.");
  }
  const leadHours = numberField(formData, "lead_hours_per_day", path, "The lead's hours a day");
  if (leadHours <= 0 || leadHours > 24)
    failWith(path, "The lead's hours a day must be between 0 and 24.");
  return {
    label,
    starts_on: startsOn,
    ends_on: endsOn,
    net_professional_hours: net,
    reserve_share: reservePercent / 100,
    airtime_contributed_minutes_per_week: airtime,
    lead_hours_per_day: leadHours,
    notes: optionalField(formData, "notes"),
  };
}

export async function createPlan(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsDirector();
  const path = withQuery(PLAN_PATH, { new: "1" });
  const values = planFields(formData, path);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bk_term_plans")
    .insert({ ...values, created_by: profile.id })
    .select("id")
    .single();
  failIfError(error, path, "Could not create the term plan");
  if (!data) failWith(path, "Could not create the term plan.");

  // Every plan starts with the four pools and their default windows; the
  // director sets the units.
  const { error: resourceError } = await supabase.from("bk_term_resources").insert(
    POOL_KEYS.map((pool) => ({
      plan_id: data.id,
      pool,
      available_units: 0,
      unit_label: DEFAULT_UNIT_LABEL[pool],
      windows: DEFAULT_WINDOWS[pool],
    })),
  );
  failIfError(
    resourceError,
    withQuery(PLAN_PATH, { plan: data.id }),
    "Could not add the plan's resources",
  );

  revalidateCalendar();
  redirect(withQuery(PLAN_PATH, { plan: data.id }));
}

export async function updatePlan(formData: FormData): Promise<void> {
  await assertBookingsDirector();
  const planId = field(formData, "plan_id");
  const path = withQuery(PLAN_PATH, { plan: planId });
  const values = planFields(formData, path);
  const supabase = await createClient();
  const { error } = await supabase.from("bk_term_plans").update(values).eq("id", planId);
  failIfError(error, path, "Could not save the term plan");
  revalidateCalendar();
  redirect(path);
}

export async function setPlanStatus(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsDirector();
  const planId = field(formData, "plan_id");
  const status = field(formData, "status") as BkTermPlanStatus;
  const path = withQuery(PLAN_PATH, { plan: planId });
  if (!PLAN_STATUSES.includes(status)) failWith(path, "Choose a status.");
  const supabase = await createClient();
  const { data: before, error: readError } = await supabase
    .from("bk_term_plans")
    .select("id, label, status")
    .eq("id", planId)
    .maybeSingle();
  failIfError(readError, path, "Could not read the term plan");
  if (!before) failWith(path, "That term plan no longer exists.");
  if (before.status === status) redirect(path);

  const { error } = await supabase.from("bk_term_plans").update({ status }).eq("id", planId);
  if (error?.code === "23505") {
    failWith(path, "Another term plan is already active. Close it first.");
  }
  failIfError(error, path, "Could not change the term plan's status");
  if (status === "active") {
    await logAuditEvent({
      actorId: profile.id,
      action: "bookings.term_plan.activated",
      targetType: "bk_term_plan",
      targetId: planId,
      metadata: { label: before.label },
    });
  }
  revalidateCalendar();
  redirect(path);
}

// Resources -----------------------------------------------------------------------------------------

export async function updateResource(formData: FormData): Promise<void> {
  await assertBookingsDirector();
  const planId = field(formData, "plan_id");
  const pool = poolField(formData, "pool", withQuery(PLAN_PATH, { plan: planId }));
  const path = withQuery(PLAN_PATH, { plan: planId, edit: pool });
  const units = numberField(formData, "available_units", path, "Available units");
  if (units < 0) failWith(path, "Available units can't be negative.");
  const unitLabel = field(formData, "unit_label");
  if (!unitLabel) failWith(path, "Name the unit (half-days, days, hours).");
  const parsed = parseWindowLines(field(formData, "windows"));
  if (!parsed.ok) failWith(path, parsed.error);
  const windows = parsed.windows;
  if (windows.length === 0) failWith(path, "A resource needs at least one window.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("bk_term_resources")
    .upsert(
      { plan_id: planId, pool, available_units: units, unit_label: unitLabel, windows },
      { onConflict: "plan_id,pool" },
    );
  failIfError(error, path, "Could not save the resource");
  revalidateCalendar();
  redirect(withQuery(PLAN_PATH, { plan: planId }));
}

// Blackouts and holds ------------------------------------------------------------------------------

export async function createBlackout(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsDirector();
  const planId = field(formData, "plan_id");
  const back = returnTo(formData, calendarHref({ plan: planId }));
  const path = withQuery(back, { new: "blackout" });
  const startsOn = dateField(formData, "starts_on", path, "The first day");
  const endsOn = dateField(formData, "ends_on", path, "The last day");
  if (endsOn < startsOn) failWith(path, "The blackout must end after it starts.");
  const reason = field(formData, "reason");
  if (!reason) failWith(path, "Give the blackout a reason.");
  const pools = formData
    .getAll("pools")
    .map(String)
    .filter((value): value is PoolKey => (POOL_KEYS as readonly string[]).includes(value));
  const supabase = await createClient();
  const { error } = await supabase.from("bk_blackouts").insert({
    plan_id: planId,
    starts_on: startsOn,
    ends_on: endsOn,
    pools: pools.length === 0 || pools.length === POOL_KEYS.length ? null : pools,
    reason,
    created_by: profile.id,
  });
  failIfError(error, path, "Could not add the blackout");
  revalidateCalendar();
  redirect(back);
}

export async function deleteBlackout(formData: FormData): Promise<void> {
  await assertBookingsDirector();
  const id = field(formData, "id");
  const back = returnTo(formData, CALENDAR_PATH);
  const supabase = await createClient();
  const { error } = await supabase.from("bk_blackouts").delete().eq("id", id);
  failIfError(error, back, "Could not remove the blackout");
  revalidateCalendar();
  redirect(back);
}

const HOLD_KINDS: readonly BkHoldKind[] = ["core", "maintenance"];

export async function createHold(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsDirector();
  const planId = field(formData, "plan_id");
  const back = returnTo(formData, calendarHref({ plan: planId }));
  const path = withQuery(back, { new: "hold" });
  const poolValue = field(formData, "pool");
  const pool = poolValue === "" || poolValue === "none" ? null : poolField(formData, "pool", path);
  const date = dateField(formData, "date", path, "The date");
  const { start, end } = windowFields(formData, path);
  const hours = numberField(formData, "professional_hours", path, "The lead's hours");
  if (hours < 0) failWith(path, "The lead's hours can't be negative.");
  const kind = field(formData, "kind") as BkHoldKind;
  if (!HOLD_KINDS.includes(kind)) failWith(path, "Choose what the hold is for.");
  const label = field(formData, "label");
  if (!label) failWith(path, "Give the hold a label.");
  const supabase = await createClient();
  const { error } = await supabase.from("bk_holds").insert({
    plan_id: planId,
    pool,
    date,
    window_start: start,
    window_end: end,
    professional_hours: hours,
    kind,
    label,
    created_by: profile.id,
  });
  failIfError(error, path, "Could not add the hold");
  revalidateCalendar();
  redirect(back);
}

export async function deleteHold(formData: FormData): Promise<void> {
  await assertBookingsDirector();
  const id = field(formData, "id");
  const back = returnTo(formData, CALENDAR_PATH);
  const supabase = await createClient();
  const { error } = await supabase.from("bk_holds").delete().eq("id", id);
  failIfError(error, back, "Could not remove the hold");
  revalidateCalendar();
  redirect(back);
}

// Bookings -------------------------------------------------------------------------------------------

const TREATMENTS: readonly BkPricingTreatment[] = ["strategic", "incremental", "external"];

/**
 * A booking made from the calendar itself (slice 3's estimates place theirs
 * through the project). The rule runs in bk_booking_allowed(); a refusal
 * comes back as the trigger's own sentence. Only the executive may write an
 * exception reason, and that is audited.
 */
export async function createBooking(formData: FormData): Promise<void> {
  const context = await assertBookingsScheduler();
  const planId = field(formData, "plan_id");
  const back = returnTo(formData, calendarHref({ plan: planId }));
  const path = withQuery(back, { new: "booking" });
  const pool = poolField(formData, "pool", path);
  const date = dateField(formData, "date", path, "The date");
  const { start, end } = windowFields(formData, path);
  const hours = numberField(formData, "professional_hours", path, "Professional hours");
  if (hours < 0) failWith(path, "Professional hours can't be negative.");
  const treatment = field(formData, "treatment") as BkPricingTreatment;
  if (!TREATMENTS.includes(treatment)) failWith(path, "Choose how the booking is priced.");
  const confirmed = field(formData, "status") === "confirmed";
  const label = field(formData, "label");
  if (!label) failWith(path, "Give the booking a label (the partner or the work).");
  const exceptionReason = optionalField(formData, "exception_reason");
  if (exceptionReason && !context.isExecutive) {
    failWith(path, "Only the Executive Director can record a booking-rule exception.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bk_bookings")
    .insert({
      plan_id: planId,
      pool,
      date,
      window_start: start,
      window_end: end,
      professional_hours: hours,
      treatment,
      status: confirmed ? "confirmed" : "tentative",
      expires_at: confirmed ? null : tentativeExpiry(new Date().toISOString()),
      label,
      notes: optionalField(formData, "notes"),
      exception_reason: exceptionReason,
      exception_by: exceptionReason ? context.profile.id : null,
      created_by: context.profile.id,
    })
    .select("id")
    .single();
  failIfError(error, path, "Could not book the window");
  if (data && exceptionReason) {
    await logAuditEvent({
      actorId: context.profile.id,
      action: "bookings.booking.exception",
      targetType: "bk_booking",
      targetId: data.id,
      metadata: { pool, date, window: `${start}-${end}`, reason: exceptionReason },
    });
  }
  revalidateCalendar();
  redirect(back);
}

export async function confirmBooking(formData: FormData): Promise<void> {
  await assertBookingsScheduler();
  const id = field(formData, "id");
  const back = returnTo(formData, CALENDAR_PATH);
  const supabase = await createClient();
  const { error } = await supabase
    .from("bk_bookings")
    .update({ status: "confirmed", expires_at: null })
    .eq("id", id)
    .neq("status", "released");
  failIfError(error, back, "Could not confirm the booking");
  revalidateCalendar();
  redirect(back);
}

export async function releaseBooking(formData: FormData): Promise<void> {
  await assertBookingsScheduler();
  const id = field(formData, "id");
  const back = returnTo(formData, CALENDAR_PATH);
  const supabase = await createClient();
  const { error } = await supabase.from("bk_bookings").update({ status: "released" }).eq("id", id);
  failIfError(error, back, "Could not release the booking");
  revalidateCalendar();
  redirect(back);
}
