import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { pageRange } from "@/lib/pagination";
import type { Database } from "@/lib/database.types";
import type { ClosedWeeklyWindow, UnderwritingHourChange } from "./underwriting-hours";

/**
 * Reads for the hours closed to underwriting (lib/log/underwriting-hours.ts).
 * Log members and Underwriting members can read both tables
 * (20261005130000) — Traffic's auto-fill, bumping and dashboard need them
 * to keep automation out of closed hours.
 */

export type LogUnderwritingClosedWeeklyRow =
  Database["public"]["Tables"]["log_underwriting_closed_weekly"]["Row"];
export type LogUnderwritingHourChangeRow =
  Database["public"]["Tables"]["log_underwriting_hour_changes"]["Row"];

export function toClosedWindow(row: LogUnderwritingClosedWeeklyRow): ClosedWeeklyWindow {
  return {
    id: row.id,
    daysOfWeek: row.days_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    active: row.active,
  };
}

export function toHourChange(row: LogUnderwritingHourChangeRow): UnderwritingHourChange {
  return {
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    mode: row.mode,
    active: row.active,
  };
}

export interface UnderwritingHours {
  weekly: ClosedWeeklyWindow[];
  changes: UnderwritingHourChange[];
  /** Each change's reason, by id — what the week view labels a change with. */
  reasons: Map<string, string | null>;
}

/** Every active weekly closed window and one-time change — what isClosedToUnderwriting() needs. */
export async function loadUnderwritingHours(): Promise<UnderwritingHours> {
  const supabase = await createClient();
  const [weekly, changes] = await Promise.all([
    supabase.from("log_underwriting_closed_weekly").select("*").eq("active", true),
    supabase.from("log_underwriting_hour_changes").select("*").eq("active", true),
  ]);
  const changeRows = unwrapRead(changes, "the underwriting hours' one-time changes") ?? [];
  return {
    weekly: (unwrapRead(weekly, "the underwriting hours") ?? []).map(toClosedWindow),
    changes: changeRows.map(toHourChange),
    reasons: new Map(changeRows.map((row) => [row.id, row.reason])),
  };
}

/** The weekly closed windows for the screen's table, earliest start first. */
export async function listClosedWindows(): Promise<LogUnderwritingClosedWeeklyRow[]> {
  const supabase = await createClient();
  return (
    unwrapRead(
      await supabase
        .from("log_underwriting_closed_weekly")
        .select("*")
        .eq("active", true)
        .order("start_time")
        .order("effective_from"),
      "the underwriting hours",
    ) ?? []
  );
}

export const UNDERWRITING_HOUR_CHANGES_PAGE_SIZE = 20;

/** One page of one-time changes: upcoming (not yet over, soonest first) or past (most recent first). */
export async function listUnderwritingHourChanges(
  scope: "upcoming" | "past",
  page: number,
  nowISO: string,
): Promise<{ rows: LogUnderwritingHourChangeRow[]; total: number }> {
  const supabase = await createClient();
  const { from, to } = pageRange(page, UNDERWRITING_HOUR_CHANGES_PAGE_SIZE);
  let query = supabase
    .from("log_underwriting_hour_changes")
    .select("*", { count: "exact" })
    .eq("active", true);
  query =
    scope === "upcoming"
      ? query.gt("ends_at", nowISO).order("starts_at", { ascending: true })
      : query.lte("ends_at", nowISO).order("starts_at", { ascending: false });
  const result = await query.range(from, to);
  return {
    rows: unwrapRead(result, "the underwriting hours' one-time changes") ?? [],
    total: result.count ?? 0,
  };
}

/** How many active changes are upcoming and past — the filter chips' counts. */
export async function countUnderwritingHourChanges(
  nowISO: string,
): Promise<{ upcoming: number; past: number }> {
  const supabase = await createClient();
  const [upcoming, past] = await Promise.all([
    supabase
      .from("log_underwriting_hour_changes")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .gt("ends_at", nowISO),
    supabase
      .from("log_underwriting_hour_changes")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .lte("ends_at", nowISO),
  ]);
  unwrapRead(upcoming, "the underwriting hours' one-time changes");
  unwrapRead(past, "the underwriting hours' one-time changes");
  return { upcoming: upcoming.count ?? 0, past: past.count ?? 0 };
}
