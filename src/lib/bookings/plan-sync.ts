import "server-only";
import { createClient } from "@/lib/supabase/server";
import { calendarStateFrom } from "./estimate";
import { buildBookingPlan, type BookingPlan, type PlanLine } from "./booking-plan";
import { logProjectEvent } from "./events";
import { getActivePlan, getPlanCalendar } from "./queries";
import { toHHMM } from "./scheduling";

export type SyncResult =
  | { status: "skipped"; reason: SkipReason }
  | { status: "planned"; bookings: number; warnings: string[] }
  | { status: "exception"; plan: Extract<BookingPlan, { ok: false }> };

export type SkipReason =
  | "closed"
  | "past_request_stage"
  | "manual_dates"
  | "no_event_date"
  | "no_production"
  | "no_lines"
  | "reserved_blocks"
  | "no_term"
  | "not_found";

/**
 * Keep a project's planned dates in step with its package lines and event date
 * (docs/bookings-design.md §18.2). Only a request in the system's hands is
 * touched: still at the Request stage, in auto mode, with no reserved block
 * attached. The project's planned bookings are replaced wholesale by the new
 * plan; when the plan is an exception nothing is written and the stale planned
 * dates are removed — the project page reads the exception from the same plan.
 * Held and confirmed dates are never touched here.
 */
export async function syncBookingPlan(projectId: string, actorId: string): Promise<SyncResult> {
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("bk_projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return { status: "skipped", reason: "not_found" };
  if (project.disposition !== null) return { status: "skipped", reason: "closed" };
  if (project.stage !== "request") return { status: "skipped", reason: "past_request_stage" };
  if (project.dates_mode !== "auto") return { status: "skipped", reason: "manual_dates" };
  if (project.requested === "airtime") return { status: "skipped", reason: "no_production" };
  if (!project.event_starts_on) return { status: "skipped", reason: "no_event_date" };

  const [{ data: lines }, { data: blocks }, { data: partner }, plan] = await Promise.all([
    supabase.from("bk_estimate_lines").select("*").eq("project_id", projectId),
    supabase.from("bk_reserved_blocks").select("id").eq("project_id", projectId).limit(1),
    supabase.from("bk_partners").select("name").eq("id", project.partner_id).maybeSingle(),
    getActivePlan(),
  ]);
  if ((blocks ?? []).length > 0) return { status: "skipped", reason: "reserved_blocks" };
  const planLines: PlanLine[] = (lines ?? []).map((line) => ({
    quantity: Number(line.quantity),
    labor_hours: line.labor_hours ?? {},
    resource_units: line.resource_units ?? {},
  }));
  if (planLines.length === 0) return { status: "skipped", reason: "no_lines" };
  if (!plan) return { status: "skipped", reason: "no_term" };

  const calendar = await getPlanCalendar(plan);
  const state = calendarStateFrom(calendar, new Date().toISOString());
  const result = buildBookingPlan(
    {
      date: project.event_starts_on,
      window:
        project.event_window_start && project.event_window_end
          ? { start: toHHMM(project.event_window_start), end: toHHMM(project.event_window_end) }
          : null,
      lines: planLines,
      treatment: project.priced_as ?? "incremental",
      partnerId: project.partner_id,
    },
    state,
  );

  // Replace the project's planned dates; they take nothing, so this is safe to redo.
  const { error: clearError } = await supabase
    .from("bk_bookings")
    .delete()
    .eq("project_id", projectId)
    .eq("status", "planned");
  if (clearError) throw new Error(`Could not clear the planned dates: ${clearError.message}`);

  if (!result.ok) {
    await logProjectEvent({
      projectId,
      actorId,
      kind: "dates_exception",
      note: result.message,
    });
    return { status: "exception", plan: result };
  }

  for (const booking of result.bookings) {
    const { error } = await supabase.rpc("bk_create_booking", {
      p_booking: {
        plan_id: plan.id,
        project_id: projectId,
        pool_id: booking.pool_id,
        date: booking.date,
        window_start: booking.window_start,
        window_end: booking.window_end,
        treatment: project.priced_as ?? "incremental",
        status: "planned",
        label: `${partner?.name ?? "Partner"}: ${project.title}`,
      },
      p_labor: Object.entries(booking.hours).map(([labor_class_id, hours]) => ({
        labor_class_id,
        hours,
      })),
    });
    if (error) throw new Error(`Could not plan the dates: ${error.message}`);
  }
  if (result.bookings.length > 0) {
    await logProjectEvent({
      projectId,
      actorId,
      kind: "dates_planned",
      note: `Dates planned for ${project.event_starts_on}.`,
    });
  }
  return { status: "planned", bookings: result.bookings.length, warnings: result.warnings };
}
